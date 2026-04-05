import { Router, Request, Response } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { tournaments, tournamentEntries, users } from '../db/schema';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { sendPushNotification } from '../lib/push';

const router = Router();

// GET /api/tournaments — list open/in_progress tournaments
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(tournaments)
      .where(sql`${tournaments.status} IN ('open', 'in_progress')`)
      .orderBy(desc(tournaments.created_at));

    const enriched = await Promise.all(
      rows.map(async (t) => {
        const entryCount = await db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(tournamentEntries)
          .where(
            and(
              eq(tournamentEntries.tournament_id, t.id),
              eq(tournamentEntries.status, 'paid'),
            ),
          );
        return { ...t, entry_count: entryCount[0]?.count ?? 0 };
      }),
    );

    res.json(enriched);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/tournaments/:id — tournament detail + entries
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) { res.status(404).json({ error: 'not_found' }); return; }

    const entries = await db
      .select()
      .from(tournamentEntries)
      .where(
        and(
          eq(tournamentEntries.tournament_id, id),
          eq(tournamentEntries.status, 'paid'),
        ),
      );

    const enrichedEntries = await Promise.all(
      entries.map(async (e) => {
        const [user] = await db
          .select({ display_name: users.display_name, email: users.email })
          .from(users)
          .where(eq(users.id, e.user_id));
        return {
          id: e.id,
          user_id: e.user_id,
          display_name: user?.display_name ?? user?.email?.split('@')[0] ?? 'unknown',
          entered_at: e.entered_at,
        };
      }),
    );

    res.json({ ...tournament, entries: enrichedEntries });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/tournaments — create tournament (operator only, identified by is_operator flag)
router.post('/', requireUser, async (req: any, res: Response) => {
  const { name, description, entry_fee_cents, max_entries, starts_at, ends_at, platform_cut_bps } = req.body;

  if (!name || !entry_fee_cents || entry_fee_cents < 100) {
    res.status(400).json({ error: 'name and entry_fee_cents (min 100) required' });
    return;
  }

  try {
    const [me] = await db
      .select({ is_operator: users.is_operator })
      .from(users)
      .where(eq(users.id, req.userId));

    if (!me?.is_operator) {
      res.status(403).json({ error: 'operators_only' });
      return;
    }

    const [tournament] = await db
      .insert(tournaments)
      .values({
        name,
        description: description ?? null,
        entry_fee_cents,
        platform_cut_bps: platform_cut_bps ?? 1000,
        max_entries: max_entries ?? null,
        starts_at: starts_at ? new Date(starts_at) : null,
        ends_at: ends_at ? new Date(ends_at) : null,
        created_by: req.userId,
      })
      .returning();

    res.status(201).json(tournament);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/tournaments/:id/enter — create a payment intent to enter
router.post('/:id/enter', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) { res.status(404).json({ error: 'not_found' }); return; }
    if (tournament.status !== 'open') {
      res.status(409).json({ error: 'tournament_not_open' });
      return;
    }

    // Idempotent — return existing entry (paid or pending) if one exists
    const [existingEntry] = await db
      .select()
      .from(tournamentEntries)
      .where(
        and(
          eq(tournamentEntries.tournament_id, id),
          eq(tournamentEntries.user_id, req.userId),
        ),
      );

    if (existingEntry?.status === 'paid') {
      res.status(409).json({ error: 'already_entered' });
      return;
    }
    if (existingEntry?.status === 'pending' && existingEntry.stripe_client_secret) {
      res.json({
        entry_id: existingEntry.id,
        client_secret: existingEntry.stripe_client_secret,
        amount_cents: existingEntry.amount_cents,
      });
      return;
    }

    // Create the Stripe PI before inserting the entry row
    const pi = await stripe.paymentIntents.create({
      amount: tournament.entry_fee_cents,
      currency: 'cad',
      metadata: {
        type: 'tournament_entry',
        tournament_id: String(id),
        user_id: String(req.userId),
      },
    });

    // Enforce max_entries atomically inside a transaction: count paid entries
    // with a lock so concurrent requests cannot both pass the check.
    let entry: typeof tournamentEntries.$inferSelect;
    try {
      [entry] = await db.transaction(async (tx) => {
        if (tournament.max_entries) {
          const [countRow] = await tx
            .select({ count: sql<number>`cast(count(*) as int)` })
            .from(tournamentEntries)
            .where(
              and(
                eq(tournamentEntries.tournament_id, id),
                eq(tournamentEntries.status, 'paid'),
              ),
            )
            .for('update');
          if ((countRow?.count ?? 0) >= tournament.max_entries) {
            throw Object.assign(new Error('tournament_full'), { status: 409 });
          }
        }

        return tx
          .insert(tournamentEntries)
          .values({
            tournament_id: id,
            user_id: req.userId,
            stripe_payment_intent_id: pi.id,
            stripe_client_secret: pi.client_secret!,
            amount_cents: tournament.entry_fee_cents,
            status: 'pending',
          })
          .returning();
      });
    } catch (txErr: any) {
      // Cancel the PI so no orphaned payment intent is left open
      await stripe.paymentIntents.cancel(pi.id).catch(() => {});
      if (txErr?.status) { res.status(txErr.status).json({ error: txErr.message }); return; }
      throw txErr;
    }

    res.status(201).json({
      entry_id: entry.id,
      client_secret: pi.client_secret,
      amount_cents: tournament.entry_fee_cents,
    });
  } catch (err: any) {
    if (err?.status) { res.status(err.status).json({ error: err.message }); return; }
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/tournaments/:id/winner — declare winner (operator only)
router.post('/:id/winner', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { winner_user_id } = req.body;
  if (!winner_user_id) {
    res.status(400).json({ error: 'winner_user_id required' });
    return;
  }

  try {
    const [me] = await db
      .select({ is_operator: users.is_operator })
      .from(users)
      .where(eq(users.id, req.userId));
    if (!me?.is_operator) { res.status(403).json({ error: 'operators_only' }); return; }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) { res.status(404).json({ error: 'not_found' }); return; }
    if (tournament.status === 'paid_out') {
      res.status(409).json({ error: 'already_paid_out' });
      return;
    }

    // Confirm winner is a paid entrant
    const [entry] = await db
      .select()
      .from(tournamentEntries)
      .where(
        and(
          eq(tournamentEntries.tournament_id, id),
          eq(tournamentEntries.user_id, winner_user_id),
          eq(tournamentEntries.status, 'paid'),
        ),
      );
    if (!entry) {
      res.status(400).json({ error: 'winner_not_an_entrant' });
      return;
    }

    const cutCents = Math.round(tournament.prize_pool_cents * (tournament.platform_cut_bps / 10000));
    const payoutCents = tournament.prize_pool_cents - cutCents;

    await db
      .update(tournaments)
      .set({
        status: 'paid_out',
        winner_user_id,
        winner_payout_cents: payoutCents,
      })
      .where(eq(tournaments.id, id));

    // Notify winner
    const [winner] = await db
      .select({ push_token: users.push_token, display_name: users.display_name })
      .from(users)
      .where(eq(users.id, winner_user_id));

    if (winner?.push_token) {
      sendPushNotification(winner.push_token, {
        title: 'You won!',
        body: `You won the ${tournament.name} tournament — CA$${(payoutCents / 100).toFixed(2)} prize.`,
        data: { screen: 'tournaments', tournament_id: id },
      }).catch(() => {});
    }

    res.json({ ok: true, payout_cents: payoutCents, platform_cut_cents: cutCents });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
