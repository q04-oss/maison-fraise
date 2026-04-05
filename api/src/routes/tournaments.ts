import { Router, Request, Response } from 'express';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  tournaments, tournamentEntries, tournamentDecks, cardPlayEvents, creatorEarnings,
  contentTokens, users,
} from '../db/schema';
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

// GET /api/tournaments/mine — tournaments created by the current user (all statuses)
// Must be before /:id to avoid shadowing.
router.get('/mine', requireUser, async (req: any, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.created_by, req.userId))
      .orderBy(desc(tournaments.created_at));

    const enriched = await Promise.all(
      rows.map(async (t) => {
        const [{ count }] = await db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(tournamentEntries)
          .where(and(
            eq(tournamentEntries.tournament_id, t.id),
            eq(tournamentEntries.status, 'paid'),
          ));
        return { ...t, entry_count: count ?? 0 };
      }),
    );

    res.json(enriched);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/tournaments/earnings/me — creator's lifetime earnings ledger
// Must be before /:id so Express doesn't match "earnings" as an id.
router.get('/earnings/me', requireUser, async (req: any, res: Response) => {
  try {
    const rows = await db
      .select({
        id: creatorEarnings.id,
        tournament_id: creatorEarnings.tournament_id,
        content_token_id: creatorEarnings.content_token_id,
        source: creatorEarnings.source,
        amount_cents: creatorEarnings.amount_cents,
        paid_out: creatorEarnings.paid_out,
        created_at: creatorEarnings.created_at,
        tournament_name: tournaments.name,
      })
      .from(creatorEarnings)
      .leftJoin(tournaments, eq(tournaments.id, creatorEarnings.tournament_id))
      .where(eq(creatorEarnings.creator_user_id, req.userId))
      .orderBy(desc(creatorEarnings.created_at));

    const total_cents = rows.reduce((sum, r) => sum + r.amount_cents, 0);
    const pending_cents = rows.filter(r => !r.paid_out).reduce((sum, r) => sum + r.amount_cents, 0);

    res.json({ earnings: rows, total_cents, pending_cents });
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
  const { name, description, entry_fee_cents, max_entries, starts_at, ends_at,
          platform_cut_bps, creator_play_pool_bps, creator_win_bonus_bps } = req.body;

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
        creator_play_pool_bps: creator_play_pool_bps ?? 1500,
        creator_win_bonus_bps: creator_win_bonus_bps ?? 500,
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
      // Unique constraint on (tournament_id, user_id) — concurrent request beat us
      if (txErr?.code === '23505') { res.status(409).json({ error: 'already_entered' }); return; }
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

// PATCH /api/tournaments/:id/status — operator advances tournament status
// Valid transitions: open → in_progress, in_progress → closed
router.patch('/:id/status', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { status } = req.body;
  const VALID_TRANSITIONS: Record<string, string> = {
    open: 'in_progress',
    in_progress: 'closed',
  };

  if (!status || !Object.values(VALID_TRANSITIONS).includes(status)) {
    res.status(400).json({ error: 'status must be in_progress or closed' });
    return;
  }

  try {
    const [me] = await db.select({ is_operator: users.is_operator })
      .from(users).where(eq(users.id, req.userId));
    if (!me?.is_operator) { res.status(403).json({ error: 'operators_only' }); return; }

    const [tournament] = await db.select({ created_by: tournaments.created_by })
      .from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) { res.status(404).json({ error: 'not_found' }); return; }
    if (tournament.created_by !== req.userId) { res.status(403).json({ error: 'not_your_tournament' }); return; }

    // Only allow the defined forward transitions — no skipping, no reversing
    const expectedPrev = Object.keys(VALID_TRANSITIONS).find(k => VALID_TRANSITIONS[k] === status);
    const [updated] = await db.update(tournaments)
      .set({ status })
      .where(and(eq(tournaments.id, id), sql`${tournaments.status} = ${expectedPrev}`))
      .returning({ id: tournaments.id, status: tournaments.status });

    if (!updated) {
      res.status(409).json({ error: 'invalid_transition' });
      return;
    }

    res.json({ ok: true, status: updated.status });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/tournaments/:id/deck — register or update the user's deck
router.post('/:id/deck', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { content_token_ids } = req.body;
  if (!Array.isArray(content_token_ids) || content_token_ids.length === 0) {
    res.status(400).json({ error: 'content_token_ids array required' });
    return;
  }

  try {
    const [tournament] = await db.select({ id: tournaments.id, status: tournaments.status })
      .from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) { res.status(404).json({ error: 'not_found' }); return; }
    if (!['open', 'in_progress'].includes(tournament.status)) {
      res.status(409).json({ error: 'tournament_closed' });
      return;
    }

    // User must be a paid entrant
    const [entry] = await db.select({ id: tournamentEntries.id })
      .from(tournamentEntries)
      .where(and(
        eq(tournamentEntries.tournament_id, id),
        eq(tournamentEntries.user_id, req.userId),
        eq(tournamentEntries.status, 'paid'),
      ));
    if (!entry) { res.status(403).json({ error: 'not_entered' }); return; }

    // Verify caller owns all the tokens
    const ownedTokens = await db.select({ id: contentTokens.id })
      .from(contentTokens)
      .where(eq(contentTokens.current_owner_id, req.userId));
    const ownedIds = new Set(ownedTokens.map(t => t.id));
    if (!content_token_ids.every((tid: number) => ownedIds.has(tid))) {
      res.status(403).json({ error: 'token_not_owned' });
      return;
    }

    // Atomic upsert — unique constraint on (tournament_id, user_id) makes this safe
    await db.insert(tournamentDecks)
      .values({ tournament_id: id, user_id: req.userId, content_token_ids })
      .onConflictDoUpdate({
        target: [tournamentDecks.tournament_id, tournamentDecks.user_id],
        set: { content_token_ids },
      });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/tournaments/:id/entry — check if caller has a paid entry
router.get('/:id/entry', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [entry] = await db.select({ id: tournamentEntries.id })
      .from(tournamentEntries)
      .where(and(
        eq(tournamentEntries.tournament_id, id),
        eq(tournamentEntries.user_id, req.userId),
        eq(tournamentEntries.status, 'paid'),
      ));
    res.json({ entered: !!entry });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/tournaments/:id/deck — get caller's registered deck
router.get('/:id/deck', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [deck] = await db.select()
      .from(tournamentDecks)
      .where(and(eq(tournamentDecks.tournament_id, id), eq(tournamentDecks.user_id, req.userId)));

    res.json(deck ?? null);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/tournaments/:id/play — record an NFC card play during the tournament
router.post('/:id/play', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { content_token_id } = req.body;
  if (!content_token_id) { res.status(400).json({ error: 'content_token_id required' }); return; }

  try {
    const [tournament] = await db.select({ id: tournaments.id, status: tournaments.status })
      .from(tournaments).where(eq(tournaments.id, id));
    if (!tournament) { res.status(404).json({ error: 'not_found' }); return; }
    if (tournament.status !== 'in_progress') {
      res.status(409).json({ error: 'tournament_not_in_progress' });
      return;
    }

    // Caller must be a paid entrant
    const [entry] = await db.select({ id: tournamentEntries.id })
      .from(tournamentEntries)
      .where(and(
        eq(tournamentEntries.tournament_id, id),
        eq(tournamentEntries.user_id, req.userId),
        eq(tournamentEntries.status, 'paid'),
      ));
    if (!entry) { res.status(403).json({ error: 'not_entered' }); return; }

    // The token must exist in the caller's registered deck
    const [deck] = await db.select({ content_token_ids: tournamentDecks.content_token_ids })
      .from(tournamentDecks)
      .where(and(eq(tournamentDecks.tournament_id, id), eq(tournamentDecks.user_id, req.userId)));

    const tokenIds = (deck?.content_token_ids ?? []) as number[];
    if (!tokenIds.includes(content_token_id)) {
      res.status(403).json({ error: 'token_not_in_deck' });
      return;
    }

    // Fetch creator to record who earns from this play
    const [token] = await db.select({ creator_user_id: contentTokens.creator_user_id })
      .from(contentTokens).where(eq(contentTokens.id, content_token_id));
    if (!token) { res.status(404).json({ error: 'token_not_found' }); return; }

    await db.insert(cardPlayEvents).values({
      tournament_id: id,
      player_user_id: req.userId,
      content_token_id,
    });

    res.json({ ok: true, creator_user_id: token.creator_user_id });
  } catch {
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

    // Pre-flight checks outside the transaction (non-locking reads are fine here)
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (tournament && tournament.created_by !== req.userId) {
      res.status(403).json({ error: 'not_your_tournament' }); return;
    }
    if (!tournament) { res.status(404).json({ error: 'not_found' }); return; }

    const [entry] = await db
      .select()
      .from(tournamentEntries)
      .where(and(
        eq(tournamentEntries.tournament_id, id),
        eq(tournamentEntries.user_id, winner_user_id),
        eq(tournamentEntries.status, 'paid'),
      ));
    if (!entry) { res.status(400).json({ error: 'winner_not_an_entrant' }); return; }

    const pool = tournament.prize_pool_cents;
    const cutCents          = Math.round(pool * (tournament.platform_cut_bps / 10000));
    const playPoolCents     = Math.round(pool * (tournament.creator_play_pool_bps / 10000));
    const winBonusPoolCents = Math.round(pool * (tournament.creator_win_bonus_bps / 10000));
    const payoutCents       = pool - cutCents - playPoolCents - winBonusPoolCents;

    // ── Fetch data for earnings calculation (outside tx, read-only) ───────────
    const plays = await db
      .select({ content_token_id: cardPlayEvents.content_token_id })
      .from(cardPlayEvents)
      .where(eq(cardPlayEvents.tournament_id, id));

    const playCountByToken: Record<number, number> = {};
    for (const p of plays) {
      playCountByToken[p.content_token_id] = (playCountByToken[p.content_token_id] ?? 0) + 1;
    }
    const totalPlays = plays.length;

    let playRows: typeof creatorEarnings.$inferInsert[] = [];
    if (totalPlays > 0) {
      const uniqueTokenIds = Object.keys(playCountByToken).map(Number);
      const tokenCreators = await db
        .select({ id: contentTokens.id, creator_user_id: contentTokens.creator_user_id })
        .from(contentTokens)
        .where(inArray(contentTokens.id, uniqueTokenIds));

      const creatorByToken: Record<number, number> = {};
      for (const tc of tokenCreators) creatorByToken[tc.id] = tc.creator_user_id;

      // Build (tokenId, rawCents) pairs first, then fix rounding so sum == playPoolCents exactly.
      const playPairs: { tokenId: number; creatorId: number; cents: number }[] = [];
      for (const [tokenIdStr, count] of Object.entries(playCountByToken)) {
        const tokenId = Number(tokenIdStr);
        const creatorId = creatorByToken[tokenId];
        if (!creatorId) continue;
        playPairs.push({ tokenId, creatorId, cents: Math.round((count / totalPlays) * playPoolCents) });
      }
      // Distribute rounding remainder to first entry so no cent is lost
      const distributed = playPairs.reduce((s, p) => s + p.cents, 0);
      if (playPairs.length > 0) playPairs[0].cents += playPoolCents - distributed;

      playRows = playPairs.map(({ tokenId, creatorId, cents }) => ({
        creator_user_id: creatorId,
        tournament_id: id,
        content_token_id: tokenId,
        source: 'card_play' as const,
        amount_cents: cents,
      }));
    }

    let winBonusRows: typeof creatorEarnings.$inferInsert[] = [];
    if (winBonusPoolCents > 0) {
      const [winnerDeck] = await db
        .select({ content_token_ids: tournamentDecks.content_token_ids })
        .from(tournamentDecks)
        .where(and(
          eq(tournamentDecks.tournament_id, id),
          eq(tournamentDecks.user_id, winner_user_id),
        ));

      if (winnerDeck) {
        const deckTokenIds = winnerDeck.content_token_ids as number[];
        if (deckTokenIds.length > 0) {
          const deckTokenCreators = await db
            .select({ id: contentTokens.id, creator_user_id: contentTokens.creator_user_id })
            .from(contentTokens)
            .where(inArray(contentTokens.id, deckTokenIds));

          const uniqueCreatorIds = [...new Set(deckTokenCreators.map(t => t.creator_user_id))];
          if (uniqueCreatorIds.length > 0) {
            const perCreator = Math.floor(winBonusPoolCents / uniqueCreatorIds.length);
            winBonusRows = uniqueCreatorIds.map((creatorId, i) => ({
              creator_user_id: creatorId,
              tournament_id: id,
              content_token_id: null,
              source: 'win_bonus' as const,
              amount_cents: i === 0 ? perCreator + (winBonusPoolCents % uniqueCreatorIds.length) : perCreator,
            }));
          }
        }
      }
    }

    // ── Atomic commit: flip status + insert all earnings in one transaction ───
    // The UPDATE's WHERE clause is the idempotency guard — only one concurrent
    // call can flip status away from non-paid_out. If 0 rows are updated,
    // a concurrent call already won; we abort without inserting earnings.
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .update(tournaments)
        .set({ status: 'paid_out', winner_user_id, winner_payout_cents: payoutCents })
        .where(and(eq(tournaments.id, id), sql`${tournaments.status} != 'paid_out'`))
        .returning({ id: tournaments.id });

      if (!locked) throw Object.assign(new Error('already_paid_out'), { status: 409 });

      if (playRows.length > 0) await tx.insert(creatorEarnings).values(playRows);
      if (winBonusRows.length > 0) await tx.insert(creatorEarnings).values(winBonusRows);
    });

    // Notify winner (outside transaction — non-critical, fire-and-forget)
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

    res.json({
      ok: true,
      payout_cents: payoutCents,
      platform_cut_cents: cutCents,
      play_pool_cents: playPoolCents,
      win_bonus_pool_cents: winBonusPoolCents,
    });
  } catch (err: any) {
    if (err?.status) { res.status(err.status).json({ error: err.message }); return; }
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
