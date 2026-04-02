import { Router, Request, Response } from 'express';
import { eq, asc, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { businesses, portraits, businessVisits, employmentContracts, users } from '../db/schema';

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

    res.json(rows.map(b => ({
      ...b,
      lat: b.latitude ? parseFloat(String(b.latitude)) : null,
      lng: b.longitude ? parseFloat(String(b.longitude)) : null,
      placed_user_name: placedByBiz.get(b.id) ?? null,
    })));
  } catch (err) {
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
router.post('/:id/visits', async (req: Request, res: Response) => {
  const business_id = parseInt(req.params.id, 10);
  const { contracted_user_id, visitor_user_id } = req.body;
  if (isNaN(business_id) || !contracted_user_id) {
    res.status(400).json({ error: 'contracted_user_id is required' });
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

export default router;
