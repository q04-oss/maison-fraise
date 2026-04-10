import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { batchPreferences, varieties, locations } from '../db/schema';

const router = Router();

const requireAuth = async (req: Request, res: Response): Promise<number | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader) { res.status(401).json({ error: 'unauthorized' }); return null; }
  try {
    const token = authHeader.replace('Bearer ', '');
    const { verifyToken } = await import('../lib/auth');
    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'unauthorized' }); return null; }
    return payload.userId;
  } catch { res.status(401).json({ error: 'unauthorized' }); return null; }
};

// GET /api/batch-preferences — user's preferences
router.get('/', async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const rows = await db
      .select({
        id: batchPreferences.id,
        variety_id: batchPreferences.variety_id,
        variety_name: varieties.name,
        chocolate: batchPreferences.chocolate,
        finish: batchPreferences.finish,
        quantity: batchPreferences.quantity,
        location_id: batchPreferences.location_id,
        location_name: locations.name,
        status: batchPreferences.status,
        created_at: batchPreferences.created_at,
      })
      .from(batchPreferences)
      .innerJoin(varieties, eq(batchPreferences.variety_id, varieties.id))
      .innerJoin(locations, eq(batchPreferences.location_id, locations.id))
      .where(eq(batchPreferences.user_id, userId));
    res.json(rows);
  } catch { res.status(500).json({ error: 'internal' }); }
});

// POST /api/batch-preferences — create or update preference for a variety+location
router.post('/', async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { variety_id, chocolate, finish, quantity, location_id } = req.body;
  if (!variety_id || !chocolate || !finish || !quantity || !location_id) {
    res.status(400).json({ error: 'missing fields' }); return;
  }
  try {
    const [existing] = await db
      .select({ id: batchPreferences.id })
      .from(batchPreferences)
      .where(and(
        eq(batchPreferences.user_id, userId),
        eq(batchPreferences.variety_id, variety_id),
        eq(batchPreferences.location_id, location_id),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await db.update(batchPreferences)
        .set({ chocolate, finish, quantity, status: 'active' })
        .where(eq(batchPreferences.id, existing.id))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(batchPreferences)
        .values({ user_id: userId, variety_id, chocolate, finish, quantity, location_id })
        .returning();
      res.json(created);
    }
  } catch { res.status(500).json({ error: 'internal' }); }
});

// PATCH /api/batch-preferences/:id — toggle status
router.patch('/:id', async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!['active', 'paused'].includes(status)) { res.status(400).json({ error: 'invalid status' }); return; }
  try {
    const [row] = await db.update(batchPreferences)
      .set({ status })
      .where(and(eq(batchPreferences.id, id), eq(batchPreferences.user_id, userId)))
      .returning();
    if (!row) { res.status(404).json({ error: 'not found' }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: 'internal' }); }
});

// DELETE /api/batch-preferences/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const id = parseInt(req.params.id);
  try {
    await db.delete(batchPreferences)
      .where(and(eq(batchPreferences.id, id), eq(batchPreferences.user_id, userId)));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal' }); }
});

export default router;
