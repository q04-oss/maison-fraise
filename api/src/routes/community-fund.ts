import { Router, Request, Response } from 'express';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { communityFund, communityFundContributions, communityPopupInterest, users, businesses } from '../db/schema';
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

// POST /api/community-fund/interest — operator expresses interest in doing a community popup
router.post('/interest', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const { concept, note, business_id } = req.body;
  try {
    // One active entry per user — if already pending, update it
    const [existing] = await db
      .select({ id: communityPopupInterest.id })
      .from(communityPopupInterest)
      .where(eq(communityPopupInterest.user_id, user_id))
      .orderBy(desc(communityPopupInterest.created_at))
      .limit(1);

    if (existing) {
      await db.update(communityPopupInterest)
        .set({ concept: concept ?? null, note: note ?? null, business_id: business_id ?? null, status: 'pending' })
        .where(eq(communityPopupInterest.id, existing.id));
      res.json({ updated: true });
      return;
    }

    await db.insert(communityPopupInterest).values({
      user_id,
      business_id: business_id ?? null,
      concept: concept ?? null,
      note: note ?? null,
      status: 'pending',
    });
    res.status(201).json({ created: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/community-fund/my-interest — check if current user has expressed interest
router.get('/my-interest', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const [row] = await db
      .select({ id: communityPopupInterest.id, concept: communityPopupInterest.concept, note: communityPopupInterest.note, status: communityPopupInterest.status, created_at: communityPopupInterest.created_at })
      .from(communityPopupInterest)
      .where(eq(communityPopupInterest.user_id, user_id))
      .orderBy(desc(communityPopupInterest.created_at))
      .limit(1);
    res.json(row ?? null);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/community-fund/interest-queue — admin, lists all pending operator interest
router.get('/interest-queue', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const [me] = await db.select({ is_admin: users.is_admin }).from(users).where(eq(users.id, user_id)).limit(1);
    if (!me?.is_admin) { res.status(403).json({ error: 'Forbidden' }); return; }

    const rows = await db
      .select({
        id: communityPopupInterest.id,
        user_id: communityPopupInterest.user_id,
        user_name: sql<string>`(SELECT name FROM users WHERE id = ${communityPopupInterest.user_id})`,
        user_email: sql<string>`(SELECT email FROM users WHERE id = ${communityPopupInterest.user_id})`,
        business_id: communityPopupInterest.business_id,
        business_name: sql<string | null>`(SELECT name FROM businesses WHERE id = ${communityPopupInterest.business_id})`,
        concept: communityPopupInterest.concept,
        note: communityPopupInterest.note,
        status: communityPopupInterest.status,
        created_at: communityPopupInterest.created_at,
      })
      .from(communityPopupInterest)
      .orderBy(desc(communityPopupInterest.created_at));

    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/community-fund/interest/:id — admin, update status (contacted / done)
router.patch('/interest/:id', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (!['pending', 'contacted', 'done'].includes(status)) { res.status(400).json({ error: 'Invalid status' }); return; }
  try {
    const [me] = await db.select({ is_admin: users.is_admin }).from(users).where(eq(users.id, user_id)).limit(1);
    if (!me?.is_admin) { res.status(403).json({ error: 'Forbidden' }); return; }
    await db.update(communityPopupInterest).set({ status }).where(eq(communityPopupInterest.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
