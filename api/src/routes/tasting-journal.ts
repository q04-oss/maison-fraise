import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS tasting_journal (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  variety_id integer NOT NULL REFERENCES varieties(id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, variety_id)
)`).catch(() => {});

// GET /api/tasting-journal — returns current user's journal entries
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const rows = await db.execute(sql`
      SELECT tj.id, tj.variety_id, v.name AS variety_name, tj.rating, tj.notes, tj.created_at
      FROM tasting_journal tj
      JOIN varieties v ON v.id = tj.variety_id
      WHERE tj.user_id = ${userId}
      ORDER BY tj.created_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/tasting-journal — upsert a journal entry
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { variety_id, rating, notes } = req.body;
  if (!variety_id || !rating) { res.status(400).json({ error: 'variety_id and rating are required' }); return; }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'rating must be an integer between 1 and 5' }); return;
  }
  try {
    const result = await db.execute(sql`
      INSERT INTO tasting_journal (user_id, variety_id, rating, notes, created_at)
      VALUES (${userId}, ${variety_id}, ${rating}, ${notes ?? null}, now())
      ON CONFLICT (user_id, variety_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        notes = EXCLUDED.notes,
        created_at = now()
      RETURNING *
    `);
    res.json(((result as any).rows ?? result)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
