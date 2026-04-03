import { Router, Request, Response } from 'express';
import { eq, asc, and, sql, lt, gte } from 'drizzle-orm';
import { db } from '../db';
import { businesses, portraits, businessVisits, employmentContracts, users } from '../db/schema';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';
import { requireUser } from '../lib/auth';

const router = Router();

// GET /api/businesses
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(businesses);
    const contracts = await db
      .select({
        business_id: employmentContracts.business_id,
        display_name: users.display_name,
        email: users.email,
      })
      .from(employmentContracts)
      .innerJoin(users, eq(employmentContracts.user_id, users.id))
      .where(eq(employmentContracts.status, 'active'));

    const placedByBiz = new Map(contracts.map(c => [
      c.business_id,
      c.display_name ?? c.email.split('@')[0],
    ]));

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    res.json(rows.map(b => ({
      ...b,
      lat: b.latitude ? parseFloat(String(b.latitude)) : null,
      lng: b.longitude ? parseFloat(String(b.longitude)) : null,
      placed_user_name: placedByBiz.get(b.id) ?? null,
    })));
  } catch (err) {
    logger.error('[businesses] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/businesses/:id
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id));
    if (!business) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }
    res.json({
      ...business,
      lat: business.latitude ? parseFloat(String(business.latitude)) : null,
      lng: business.longitude ? parseFloat(String(business.longitude)) : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/businesses/:id/portraits
router.get('/:id/portraits', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(portraits)
      .where(eq(portraits.business_id, id))
      .orderBy(asc(portraits.sort_order), asc(portraits.created_at));

    res.json(rows.map(p => ({
      id: p.id,
      url: p.image_url,
      season: p.season,
      subject_name: p.subject_name,
      campaign_title: p.campaign_title,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/businesses/:id/visits — contracted user logs a member visit (POS seed)
router.post('/:id/visits', requireUser, async (req: Request, res: Response) => {
  const business_id = parseInt(req.params.id, 10);
  const contracted_user_id: number = (req as any).userId;
  const { visitor_user_id } = req.body;
  if (isNaN(business_id)) {
    res.status(400).json({ error: 'Invalid business id' });
    return;
  }
  try {
    // Verify this user has an active contract at this business
    const [contract] = await db
      .select()
      .from(employmentContracts)
      .where(and(
        eq(employmentContracts.business_id, business_id),
        eq(employmentContracts.user_id, contracted_user_id),
        eq(employmentContracts.status, 'active'),
      ));
    if (!contract) {
      res.status(403).json({ error: 'No active contract at this business' });
      return;
    }
    const [visit] = await db.insert(businessVisits).values({
      business_id,
      contracted_user_id,
      visitor_user_id: visitor_user_id ?? null,
    }).returning();
    res.status(201).json(visit);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/businesses/:id/visits/count — visit count for a business
router.get('/:id/visits/count', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [row] = await db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(businessVisits)
      .where(eq(businessVisits.business_id, id));
    res.json({ visit_count: row?.total ?? 0 });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/businesses/:id/placed-user — who is currently on contract here
router.get('/:id/placed-user', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const rows = await db
      .select({
        user_id: employmentContracts.user_id,
        display_name: users.display_name,
        email: users.email,
        ends_at: employmentContracts.ends_at,
      })
      .from(employmentContracts)
      .innerJoin(users, eq(employmentContracts.user_id, users.id))
      .where(and(eq(employmentContracts.business_id, id), eq(employmentContracts.status, 'active')));

    if (!rows[0]) { res.json(null); return; }
    const r = rows[0];
    res.json({
      user_id: r.user_id,
      display_name: r.display_name ?? r.email.split('@')[0],
      ends_at: r.ends_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/businesses/:id/popup-stats — next upcoming popup + past popup count at this partner venue
router.get('/:id/popup-stats', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const now = new Date();

    const allPopups = await db
      .select()
      .from(businesses)
      .where(and(
        eq(businesses.partner_business_id, id),
        eq(businesses.type, 'popup'),
      ));

    const upcoming = allPopups
      .filter(p => p.starts_at && p.starts_at >= now)
      .sort((a, b) => (a.starts_at?.getTime() ?? 0) - (b.starts_at?.getTime() ?? 0));

    const pastCount = allPopups.filter(p => !p.starts_at || p.starts_at < now).length;

    const next = upcoming[0] ?? null;

    res.json({
      next_popup: next ? {
        id: next.id,
        name: next.name,
        starts_at: next.starts_at,
        ends_at: next.ends_at,
        capacity: next.capacity,
        entrance_fee_cents: next.entrance_fee_cents,
        is_audition: next.is_audition,
        neighbourhood: next.neighbourhood,
        lat: next.latitude ? parseFloat(String(next.latitude)) : null,
        lng: next.longitude ? parseFloat(String(next.longitude)) : null,
      } : null,
      past_popup_count: pastCount,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/businesses/:id/placed-history — users who have completed contracts here
router.get('/:id/placed-history', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const rows = await db
      .select({
        user_id: employmentContracts.user_id,
        display_name: users.display_name,
        email: users.email,
        starts_at: employmentContracts.starts_at,
        ends_at: employmentContracts.ends_at,
      })
      .from(employmentContracts)
      .innerJoin(users, eq(employmentContracts.user_id, users.id))
      .where(and(eq(employmentContracts.business_id, id), eq(employmentContracts.status, 'completed')));

    res.json(rows.map(r => ({
      user_id: r.user_id,
      display_name: r.display_name ?? r.email.split('@')[0],
      starts_at: r.starts_at,
      ends_at: r.ends_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/businesses/:id/tip — Stripe tip for placed user
router.post('/:id/tip', async (req: Request, res: Response) => {
  const business_id = parseInt(req.params.id, 10);
  const { amount_cents } = req.body;
  if (isNaN(business_id) || !amount_cents || amount_cents < 100) {
    res.status(400).json({ error: 'amount_cents (min 100) is required' });
    return;
  }
  try {
    const [contract] = await db
      .select()
      .from(employmentContracts)
      .where(and(eq(employmentContracts.business_id, business_id), eq(employmentContracts.status, 'active')));
    if (!contract) {
      res.status(404).json({ error: 'No placed user at this business' });
      return;
    }
    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      metadata: { type: 'tip', business_id: String(business_id), contracted_user_id: String(contract.user_id) },
    });
    res.json({ client_secret: pi.client_secret });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
