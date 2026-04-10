import { Router, Request, Response } from 'express';
import { eq, and, desc, asc, isNull, isNotNull, lte, gte, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { memberships, membershipWaitlist, users, fundContributions, editorialPieces, earningsLedger } from '../db/schema';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { TIER_AMOUNTS, STRIPE_PAYABLE_TIERS } from '../lib/membership';

// ─── Memberships router ───────────────────────────────────────────────────────

export const membershipsRouter = Router();

// POST /api/memberships/payment-intent
membershipsRouter.post('/payment-intent', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { tier } = req.body;

  if (!tier || !(tier in TIER_AMOUNTS)) {
    res.status(400).json({ error: 'invalid_tier' });
    return;
  }

  if (!STRIPE_PAYABLE_TIERS.includes(tier)) {
    res.status(409).json({ error: 'contact_us', message: 'Please contact us to arrange payment for this tier.' });
    return;
  }

  try {
    // Check user doesn't already have an active or pending membership
    const [existing] = await db
      .select({ id: memberships.id, status: memberships.status })
      .from(memberships)
      .where(and(eq(memberships.user_id, userId), sql`status IN ('active', 'pending')`))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: existing.status === 'active' ? 'already_active' : 'payment_in_progress' });
      return;
    }

    const amount_cents = TIER_AMOUNTS[tier];

    const pi = await stripe.paymentIntents.create(
      {
        amount: amount_cents,
        currency: 'cad',
        metadata: { type: 'membership', tier, user_id: String(userId) },
      },
      { idempotencyKey: `membership-${userId}-${tier}` },
    );

    await db.insert(memberships).values({
      user_id: userId,
      tier: tier as any,
      status: 'pending',
      amount_cents,
      stripe_payment_intent_id: pi.id,
    }).onConflictDoNothing();

    res.json({ client_secret: pi.client_secret, tier, amount_cents });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/memberships/me
membershipsRouter.get('/me', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;

  try {
    const [membership] = await db
      .select({
        tier: memberships.tier,
        status: memberships.status,
        started_at: memberships.started_at,
        renews_at: memberships.renews_at,
        amount_cents: memberships.amount_cents,
      })
      .from(memberships)
      .where(and(eq(memberships.user_id, userId), eq(memberships.status, 'active')))
      .limit(1);

    const [balance] = await db
      .select({
        available: sql<number>`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::integer`,
      })
      .from(earningsLedger)
      .where(eq(earningsLedger.user_id, userId));

    res.json({
      membership: membership ?? null,
      fund: { balance_cents: balance?.available ?? 0 },
    });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/memberships/me/fund-history
membershipsRouter.get('/me/fund-history', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;

  try {
    // Contributions received
    const contributions = await db
      .select({
        amount_cents: fundContributions.amount_cents,
        from_display_name: users.display_name,
        note: fundContributions.note,
        created_at: fundContributions.created_at,
        from_user_id: fundContributions.from_user_id,
      })
      .from(fundContributions)
      .leftJoin(users, eq(fundContributions.from_user_id, users.id))
      .where(eq(fundContributions.to_user_id, userId));

    const contributionEvents = contributions.map((c) => ({
      type: 'contribution' as const,
      amount_cents: c.amount_cents,
      from_display_name: c.from_user_id === null ? 'Anonymous' : (c.from_display_name ?? 'Anonymous'),
      note: c.note ?? null,
      created_at: c.created_at,
    }));

    // Editorial commissions
    const pieces = await db
      .select({
        amount_cents: editorialPieces.commission_cents,
        piece_title: editorialPieces.title,
        created_at: editorialPieces.published_at,
      })
      .from(editorialPieces)
      .where(
        and(
          eq(editorialPieces.author_user_id, userId),
          isNotNull(editorialPieces.commission_cents),
          eq(editorialPieces.status, 'published'),
        ),
      );

    const commissionEvents = pieces.map((p) => ({
      type: 'commission' as const,
      amount_cents: p.amount_cents as number,
      piece_title: p.piece_title,
      created_at: p.created_at,
    }));

    // Merge, sort by date desc, limit 50
    const all = [...contributionEvents, ...commissionEvents]
      .sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db_ = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db_ - da;
      })
      .slice(0, 50);

    res.json(all);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/memberships/renew
membershipsRouter.post('/renew', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;

  try {
    // Find active or expired membership
    const [existing] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.user_id, userId),
          or(eq(memberships.status, 'active'), eq(memberships.status, 'expired')),
        ),
      )
      .orderBy(desc(memberships.created_at))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'no_membership' });
      return;
    }

    const tier = existing.tier;
    if (!STRIPE_PAYABLE_TIERS.includes(tier)) {
      res.status(409).json({ error: 'contact_us', message: 'Please contact us to arrange renewal for this tier.' });
      return;
    }

    const full_amount_cents = TIER_AMOUNTS[tier];

    // Check available earnings balance
    const [balance] = await db
      .select({
        available: sql<number>`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::integer`,
      })
      .from(earningsLedger)
      .where(eq(earningsLedger.user_id, userId));

    const available = balance?.available ?? 0;
    const credit_applied = Math.min(available, full_amount_cents);
    const charge_amount = full_amount_cents - credit_applied;

    // If earnings fully cover the renewal, activate directly without a payment
    if (charge_amount === 0) {
      const now = new Date();
      const renews = new Date(now);
      renews.setFullYear(renews.getFullYear() + 1);

      const covered = await db.transaction(async (tx) => {
        // Lock earnings rows to prevent concurrent renewal races
        const [locked] = await tx.execute<{ available: number }>(sql`
          SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::integer AS available
          FROM earnings_ledger WHERE user_id = ${userId} FOR UPDATE
        `);
        const lockedAvailable = Number((locked as any).available ?? 0);
        if (lockedAvailable < full_amount_cents) return false;

        await tx.insert(earningsLedger).values({
          user_id: userId,
          amount_cents: credit_applied,
          type: 'debit',
          description: `Applied to ${tier} membership renewal`,
        });

        await tx.update(memberships).set({
          status: 'active',
          started_at: now,
          renews_at: renews,
        }).where(and(
          eq(memberships.id, existing.id),
          or(eq(memberships.status, 'active'), eq(memberships.status, 'expired')),
        ));

        return true;
      });

      if (!covered) {
        res.status(402).json({ error: 'insufficient_balance' });
        return;
      }

      res.json({ ok: true, credit_applied, charge_amount: 0, fully_covered: true });
      return;
    }

    const pi = await stripe.paymentIntents.create({
      amount: charge_amount,
      currency: 'cad',
      metadata: {
        type: 'membership_renewal',
        tier,
        user_id: String(userId),
        credit_applied_cents: String(credit_applied),
        full_amount_cents: String(full_amount_cents),
      },
    });

    await db.insert(memberships).values({
      user_id: userId,
      tier: tier as any,
      status: 'pending',
      amount_cents: full_amount_cents,
      stripe_payment_intent_id: pi.id,
    });

    res.json({ client_secret: pi.client_secret, tier, amount_cents: charge_amount, credit_applied, full_amount_cents });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/memberships/waitlist
membershipsRouter.post('/waitlist', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { tier, message } = req.body;

  if (!tier || !(tier in TIER_AMOUNTS)) {
    res.status(400).json({ error: 'invalid_tier' });
    return;
  }

  if (STRIPE_PAYABLE_TIERS.includes(tier)) {
    res.status(400).json({ error: 'not_waitlist_tier', message: 'This tier can be purchased directly.' });
    return;
  }

  try {
    // Upsert: one entry per user per tier
    const existing = await db
      .select({ id: membershipWaitlist.id })
      .from(membershipWaitlist)
      .where(and(eq(membershipWaitlist.user_id, userId), eq(membershipWaitlist.tier, tier as any)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(membershipWaitlist)
        .set({ message: message ?? null })
        .where(eq(membershipWaitlist.id, existing[0].id));
    } else {
      await db.insert(membershipWaitlist).values({
        user_id: userId,
        tier: tier as any,
        message: message ?? null,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Members router (public — GET /api/members) ───────────────────────────────

export const membersRouter = Router();

membersRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        user_id: memberships.user_id,
        display_name: users.display_name,
        tier: memberships.tier,
        started_at: memberships.started_at,
      })
      .from(memberships)
      .leftJoin(users, eq(memberships.user_id, users.id))
      .where(eq(memberships.status, 'active'))
      .orderBy(desc(memberships.tier), asc(memberships.started_at));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Fund router ──────────────────────────────────────────────────────────────

export const fundRouter = Router();

// POST /api/fund/contribute/:userId
fundRouter.post('/contribute/:userId', async (req: Request, res: Response) => {
  const toUserId = parseInt(req.params.userId, 10);
  if (isNaN(toUserId)) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }

  const { amount_cents, note, anonymous } = req.body;

  if (!amount_cents || typeof amount_cents !== 'number' || amount_cents < 100) {
    res.status(400).json({ error: 'minimum_amount', message: 'Minimum contribution is $1 (100 cents).' });
    return;
  }

  // Determine from_user_id from auth header if present (optional auth)
  let fromUserId: number | null = null;
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) {
    const { verifyToken } = await import('../lib/auth');
    const payload = verifyToken(auth.slice(7));
    if (payload) fromUserId = payload.userId;
  }

  const isAnonymous = anonymous === true;

  try {
    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      metadata: {
        type: 'fund_contribution',
        to_user_id: String(toUserId),
        from_user_id: isAnonymous ? '' : (fromUserId !== null ? String(fromUserId) : ''),
        note: note ?? '',
      },
    });

    res.json({ client_secret: pi.client_secret });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/fund/:userId/contributors
fundRouter.get('/:userId/contributors', async (req: Request, res: Response) => {
  const toUserId = parseInt(req.params.userId, 10);
  if (isNaN(toUserId)) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }

  try {
    const rows = await db
      .select({
        from_display_name: users.display_name,
        amount_cents: fundContributions.amount_cents,
        note: fundContributions.note,
        created_at: fundContributions.created_at,
        from_user_id: fundContributions.from_user_id,
      })
      .from(fundContributions)
      .leftJoin(users, eq(fundContributions.from_user_id, users.id))
      .where(eq(fundContributions.to_user_id, toUserId))
      .orderBy(desc(fundContributions.created_at))
      .limit(20);

    const result = rows.map((r) => ({
      from_display_name: r.from_user_id === null ? 'Anonymous' : (r.from_display_name ?? 'Anonymous'),
      amount_cents: r.amount_cents,
      note: r.note ?? null,
      created_at: r.created_at,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});
