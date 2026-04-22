import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { beacons, businesses, users, messages } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

// ─── Boot-time migration ──────────────────────────────────────────────────────
db.execute(sql`
  CREATE TABLE IF NOT EXISTS user_business_visits (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    beacon_uuid text NOT NULL,
    visited_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_ubv_user_business ON user_business_visits (user_id, business_id)
`).catch(() => {});

// ─── Visit tracking ───────────────────────────────────────────────────────────

// POST /api/beacons/visit — record a beacon-validated visit
// Rate-limited to one visit per business per 6 hours to prevent gaming
router.post('/visit', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { business_id, beacon_uuid } = req.body;
  if (!business_id || !beacon_uuid) {
    res.status(400).json({ error: 'business_id and beacon_uuid required' }); return;
  }
  try {
    // Check cooldown — one visit per business per 6h
    const recent = await db.execute(sql`
      SELECT id FROM user_business_visits
      WHERE user_id = ${userId} AND business_id = ${business_id}
        AND visited_at > NOW() - INTERVAL '6 hours'
      LIMIT 1
    `);
    if (((recent as any).rows ?? recent)[0]) {
      // Already visited within cooldown — return current count without inserting
      const countRows = await db.execute(sql`
        SELECT COUNT(*)::int AS visit_count FROM user_business_visits
        WHERE user_id = ${userId} AND business_id = ${business_id}
      `);
      const visit_count = (((countRows as any).rows ?? countRows)[0] as any)?.visit_count ?? 0;
      res.json({ ok: true, visit_count, recorded: false });
      return;
    }

    await db.execute(sql`
      INSERT INTO user_business_visits (user_id, business_id, beacon_uuid)
      VALUES (${userId}, ${business_id}, ${beacon_uuid})
    `);

    const countRows = await db.execute(sql`
      SELECT COUNT(*)::int AS visit_count FROM user_business_visits
      WHERE user_id = ${userId} AND business_id = ${business_id}
    `);
    const visit_count = (((countRows as any).rows ?? countRows)[0] as any)?.visit_count ?? 0;
    res.json({ ok: true, visit_count, recorded: true });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/beacons/visits/mine — all my visit counts per business
router.get('/visits/mine', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db.execute(sql`
      SELECT business_id, COUNT(*)::int AS visit_count
      FROM user_business_visits
      WHERE user_id = ${userId}
      GROUP BY business_id
    `);
    res.json((rows as any).rows ?? rows);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/beacons/visits/:businessId — my visit count for a specific business
router.get('/visits/:businessId', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS visit_count FROM user_business_visits
      WHERE user_id = ${userId} AND business_id = ${businessId}
    `);
    const visit_count = (((rows as any).rows ?? rows)[0] as any)?.visit_count ?? 0;
    res.json({ visit_count });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// ─── Beacon registry ──────────────────────────────────────────────────────────

// GET /api/beacons/mine — operator's own beacons (requires is_shop)
router.get('/mine', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const [operator] = await db.select({ business_id: users.business_id, is_shop: users.is_shop }).from(users).where(eq(users.id, userId));
    if (!operator?.is_shop || !operator.business_id) {
      res.status(403).json({ error: 'not_an_operator' }); return;
    }
    const rows = await db
      .select({ id: beacons.id, uuid: beacons.uuid, major: beacons.major, minor: beacons.minor, name: beacons.name, active: beacons.active })
      .from(beacons)
      .where(eq(beacons.business_id, operator.business_id));
    res.json(rows);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/beacons — public list of active beacon UUIDs with business info
// App fetches this on launch and caches it for background monitoring
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        uuid: beacons.uuid,
        major: beacons.major,
        minor: beacons.minor,
        business_id: beacons.business_id,
        business_name: businesses.name,
      })
      .from(beacons)
      .leftJoin(businesses, eq(beacons.business_id, businesses.id))
      .where(eq(beacons.active, true));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/beacons/shop/:businessId — get the shop user id for a business
// Used when a beacon is detected to open the right chat thread
router.get('/shop/:businessId', requireUser, async (req: Request, res: Response) => {
  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [shopUser] = await db
      .select({ id: users.id, display_name: users.display_name, user_code: users.user_code })
      .from(users)
      .where(eq(users.business_id, businessId));
    if (!shopUser) { res.status(404).json({ error: 'No shop user for this business' }); return; }
    res.json(shopUser);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/beacons/admin — register a beacon to the operator's business
router.post('/admin', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { uuid, major, minor, name } = req.body;
  if (!uuid) { res.status(400).json({ error: 'uuid required' }); return; }
  try {
    const [operator] = await db.select({ business_id: users.business_id, is_shop: users.is_shop }).from(users).where(eq(users.id, userId));
    if (!operator?.is_shop || !operator.business_id) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const [beacon] = await db
      .insert(beacons)
      .values({ business_id: operator.business_id, uuid: uuid.toUpperCase(), major: major ?? 1, minor: minor ?? 1, name: name ?? null })
      .returning();
    res.json(beacon);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/beacons/:id — deactivate a beacon
router.delete('/admin/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [beacon] = await db.select({ business_id: beacons.business_id }).from(beacons).where(eq(beacons.id, id));
    if (!beacon) { res.status(404).json({ error: 'Beacon not found' }); return; }
    const [operator] = await db.select({ business_id: users.business_id, is_shop: users.is_shop }).from(users).where(eq(users.id, userId));
    if (!operator?.is_shop || operator.business_id !== beacon.business_id) {
      res.status(403).json({ error: 'Not authorized for this business' });
      return;
    }
    await db.update(beacons).set({ active: false }).where(eq(beacons.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

// @final-audit
