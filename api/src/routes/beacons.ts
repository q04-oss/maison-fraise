import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { beacons, businesses, users, messages } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

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

// POST /api/admin/beacons — register a beacon to a business (operator only)
router.post('/admin', requireUser, async (req: Request, res: Response) => {
  const { business_id, uuid, major, minor, name } = req.body;
  if (!business_id || !uuid) {
    res.status(400).json({ error: 'business_id and uuid required' });
    return;
  }
  try {
    const [beacon] = await db
      .insert(beacons)
      .values({ business_id, uuid: uuid.toUpperCase(), major: major ?? 1, minor: minor ?? 1, name: name ?? null })
      .returning();
    res.json(beacon);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/beacons/:id — deactivate a beacon
router.delete('/admin/:id', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    await db.update(beacons).set({ active: false }).where(eq(beacons.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
