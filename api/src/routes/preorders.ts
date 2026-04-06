import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS preorders (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  variety_id integer REFERENCES varieties(id),
  variety_name_requested text,
  quantity integer NOT NULL DEFAULT 1,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz
)`).catch(() => {});

// GET /api/preorders
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT p.*, v.name AS variety_name, v.source_farm AS farm
      FROM preorders p
      LEFT JOIN varieties v ON v.id = p.variety_id
      WHERE p.user_id = ${userId}
      ORDER BY p.created_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/preorders
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { variety_id, variety_name_requested, quantity = 1, notes } = req.body;
  if (!variety_id && !variety_name_requested) {
    res.status(400).json({ error: 'variety_id or variety_name_requested required' }); return;
  }
  try {
    const result = await db.execute(sql`
      INSERT INTO preorders (user_id, variety_id, variety_name_requested, quantity, notes)
      VALUES (${userId}, ${variety_id ?? null}, ${variety_name_requested ?? null}, ${quantity}, ${notes ?? null})
      RETURNING *
    `);
    res.status(201).json(((result as any).rows ?? result)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/preorders/:id
router.delete('/:id', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    await db.execute(sql`
      UPDATE preorders SET status='cancelled'
      WHERE id=${id} AND user_id=${userId} AND status='pending'
    `);
    res.json({ cancelled: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
