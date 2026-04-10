import { Router, Response } from 'express';
import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../db';
import { earningsLedger, users } from '../db/schema';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';

const router = Router();

const CONNECT_RETURN_URL = process.env.CONNECT_RETURN_URL ?? 'fraise://connect-return';
const CONNECT_REFRESH_URL = process.env.CONNECT_REFRESH_URL ?? 'fraise://connect-refresh';

// GET /api/payouts/balance — user's available balance (credits minus debits)
router.get('/balance', requireUser, async (req: any, res: Response) => {
  try {
    const [row] = await db
      .select({
        available: sql<number>`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::integer`,
      })
      .from(earningsLedger)
      .where(eq(earningsLedger.user_id, req.userId));
    res.json({ available_cents: row?.available ?? 0 });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/payouts/history — user's full ledger
router.get('/history', requireUser, async (req: any, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(earningsLedger)
      .where(eq(earningsLedger.user_id, req.userId))
      .orderBy(desc(earningsLedger.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/payouts/connect/status
router.get('/connect/status', requireUser, async (req: any, res: Response) => {
  try {
    const [user] = await db
      .select({
        stripe_connect_account_id: users.stripe_connect_account_id,
        stripe_connect_onboarded: users.stripe_connect_onboarded,
      })
      .from(users)
      .where(eq(users.id, req.userId));

    if (!user?.stripe_connect_account_id) {
      res.json({ status: 'not_connected' });
      return;
    }

    // If not yet marked onboarded, check live with Stripe
    if (!user.stripe_connect_onboarded) {
      const account = await stripe.accounts.retrieve(user.stripe_connect_account_id);
      if (account.payouts_enabled) {
        await db
          .update(users)
          .set({ stripe_connect_onboarded: true })
          .where(eq(users.id, req.userId));
        res.json({ status: 'active' });
        return;
      }
      res.json({ status: 'pending' });
      return;
    }

    res.json({ status: 'active' });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/payouts/connect — create Express account and return onboarding URL
router.post('/connect', requireUser, async (req: any, res: Response) => {
  try {
    const [user] = await db
      .select({
        stripe_connect_account_id: users.stripe_connect_account_id,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, req.userId));

    let accountId = user?.stripe_connect_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'CA',
        email: user?.email ?? undefined,
        capabilities: { transfers: { requested: true } },
      });
      accountId = account.id;
      await db
        .update(users)
        .set({ stripe_connect_account_id: accountId })
        .where(eq(users.id, req.userId));
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: CONNECT_REFRESH_URL,
      return_url: CONNECT_RETURN_URL,
      type: 'account_onboarding',
    });

    res.json({ url: link.url });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/payouts/connect/refresh — regenerate onboarding link
router.post('/connect/refresh', requireUser, async (req: any, res: Response) => {
  try {
    const [user] = await db
      .select({ stripe_connect_account_id: users.stripe_connect_account_id })
      .from(users)
      .where(eq(users.id, req.userId));

    if (!user?.stripe_connect_account_id) {
      res.status(400).json({ error: 'no_connect_account' });
      return;
    }

    const link = await stripe.accountLinks.create({
      account: user.stripe_connect_account_id,
      refresh_url: CONNECT_REFRESH_URL,
      return_url: CONNECT_RETURN_URL,
      type: 'account_onboarding',
    });

    res.json({ url: link.url });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/payouts/payout — transfer available balance to connected bank account
router.post('/payout', requireUser, async (req: any, res: Response) => {
  try {
    const [user] = await db
      .select({
        stripe_connect_account_id: users.stripe_connect_account_id,
        stripe_connect_onboarded: users.stripe_connect_onboarded,
      })
      .from(users)
      .where(eq(users.id, req.userId));

    if (!user?.stripe_connect_account_id || !user.stripe_connect_onboarded) {
      res.status(400).json({ error: 'bank_account_not_connected' });
      return;
    }

    const [balanceRow] = await db
      .select({
        available: sql<number>`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::integer`,
      })
      .from(earningsLedger)
      .where(eq(earningsLedger.user_id, req.userId));

    const available = balanceRow?.available ?? 0;
    if (available <= 0) {
      res.status(400).json({ error: 'no_balance' });
      return;
    }

    const transfer = await stripe.transfers.create({
      amount: available,
      currency: 'cad',
      destination: user.stripe_connect_account_id,
      description: `Venture earnings payout — user ${req.userId}`,
    });

    await db.insert(earningsLedger).values({
      user_id: req.userId,
      amount_cents: available,
      type: 'debit',
      description: 'Payout to bank account',
      stripe_transfer_id: transfer.id,
    });

    res.json({ ok: true, transferred_cents: available, transfer_id: transfer.id });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
