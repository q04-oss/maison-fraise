import { Router, Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { communityFund, communityFundContributions, users } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

// GET /api/community-fund — public, returns current fund state
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [fund] = await db.select().from(communityFund).where(eq(communityFund.id, 1));
    if (!fund) { res.json({ balance_cents: 0, threshold_cents: 50000, total_raised_cents: 0, popup_count: 0 }); return; }
    res.json({
      balance_cents: fund.balance_cents,
      threshold_cents: fund.threshold_cents,
      total_raised_cents: fund.total_raised_cents,
      popup_count: fund.popup_count,
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/community-fund/my-contributions — authenticated, returns user's total
router.get('/my-contributions', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const rows = await db
      .select({ amount_cents: communityFundContributions.amount_cents, created_at: communityFundContributions.created_at, order_type: communityFundContributions.order_type })
      .from(communityFundContributions)
      .where(eq(communityFundContributions.user_id, user_id))
      .orderBy(desc(communityFundContributions.created_at));
    const total_cents = rows.reduce((sum, r) => sum + r.amount_cents, 0);
    res.json({ total_cents, contributions: rows });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
