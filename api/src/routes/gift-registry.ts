import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS gift_registry (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  variety_id integer NOT NULL,
  variety_name text,
  added_at timestamptz DEFAULT now(),
  UNIQUE(user_id, variety_id)
)`).catch(() => {});

// GET /api/gift-registry — return user's registry items ordered by added_at desc
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT * FROM gift_registry
      WHERE user_id = ${userId}
      ORDER BY added_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/gift-registry — add item, ON CONFLICT DO NOTHING
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { variety_id, variety_name } = req.body;
  if (!variety_id) { res.status(400).json({ error: 'variety_id required' }); return; }
  try {
    await db.execute(sql`
      INSERT INTO gift_registry (user_id, variety_id, variety_name)
      VALUES (${userId}, ${variety_id}, ${variety_name ?? null})
      ON CONFLICT DO NOTHING
    `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/gift-registry/:id — delete where id = :id AND user_id = userId
router.delete('/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    await db.execute(sql`
      DELETE FROM gift_registry WHERE id = ${id} AND user_id = ${userId}
    `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
