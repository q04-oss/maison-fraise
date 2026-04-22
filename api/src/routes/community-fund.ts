import { Router, Request, Response, NextFunction } from 'express';
import { eq, desc, sql, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { communityFund, communityFundContributions, communityPopupInterest, communityEvents, users } from '../db/schema';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';

const router = Router();

function requirePin(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers['x-admin-pin'];
  if (!pin || pin !== process.env.ADMIN_PIN) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }
  next();
}

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

// GET /api/community-fund/events — public, past community meals
router.get('/events', async (_req: Request, res: Response) => {
  try {
    const events = await db
      .select()
      .from(communityEvents)
      .orderBy(desc(communityEvents.event_date));
    res.json(events);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/community-fund/complete-event — admin marks an event done
router.post('/complete-event', requirePin, async (req: Request, res: Response) => {
  const { event_date, operator_names, people_fed, location, description, photo_url } = req.body;
  if (!event_date || !operator_names) {
    res.status(400).json({ error: 'event_date and operator_names required' }); return;
  }
  try {

    const [fund] = await db.select().from(communityFund).where(eq(communityFund.id, 1));
    if (!fund) { res.status(500).json({ error: 'Fund not initialised' }); return; }

    // Record the event
    await db.insert(communityEvents).values({
      event_date,
      operator_names,
      people_fed: people_fed ?? 0,
      location: location ?? null,
      description: description ?? null,
      photo_url: photo_url ?? null,
      fund_raised_cents: fund.balance_cents,
    });

    // Reset balance, increment popup_count
    await db.update(communityFund)
      .set({
        balance_cents: 0,
        popup_count: sql`popup_count + 1`,
        updated_at: new Date(),
      })
      .where(eq(communityFund.id, 1));

    // Push to all users who contributed
    const contributors = await db
      .select({ push_token: users.push_token })
      .from(communityFundContributions)
      .innerJoin(users, eq(communityFundContributions.user_id, users.id))
      .where(isNotNull(users.push_token));

    const uniqueTokens = [...new Set(contributors.map(c => c.push_token).filter(Boolean) as string[])];
    const peopleFedStr = people_fed ? `${people_fed} people fed` : 'community meal done';
    await Promise.allSettled(uniqueTokens.map(token =>
      sendPushNotification(token, {
        title: 'Community meal happened',
        body: `${peopleFedStr} · ${operator_names}. Your $2 made it real.`,
        data: { screen: 'community-fund' },
      })
    ));

    res.json({ ok: true, pushed: uniqueTokens.length });
  } catch (err) {
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
router.get('/interest-queue', requirePin, async (req: Request, res: Response) => {
  try {

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
router.patch('/interest/:id', requirePin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (!['pending', 'contacted', 'done'].includes(status)) { res.status(400).json({ error: 'Invalid status' }); return; }
  try {
    await db.update(communityPopupInterest).set({ status }).where(eq(communityPopupInterest.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
