import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS variety_seasons (
  id serial PRIMARY KEY,
  variety_id integer NOT NULL REFERENCES varieties(id),
  available_from date NOT NULL,
  available_until date NOT NULL,
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  notes text,
  UNIQUE(variety_id, year)
)`).catch(() => {});

// GET /api/seasons — public
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT vs.*, v.name AS variety_name, v.source_farm AS farm, v.description
      FROM variety_seasons vs
      JOIN varieties v ON v.id = vs.variety_id
      WHERE vs.year >= EXTRACT(YEAR FROM now())::int
      ORDER BY vs.available_from ASC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/seasons — admin only
router.post('/', async (req: Request, res: Response) => {
  const adminKey = req.headers['x-admin-key'] as string | undefined;
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    res.status(403).json({ error: 'admin_only' }); return;
  }
  const { variety_id, available_from, available_until, year, notes } = req.body;
  if (!variety_id || !available_from || !available_until) {
    res.status(400).json({ error: 'variety_id, available_from, available_until required' }); return;
  }
  try {
    const result = await db.execute(sql`
      INSERT INTO variety_seasons (variety_id, available_from, available_until, year, notes)
      VALUES (${variety_id}, ${available_from}, ${available_until}, ${year ?? new Date().getFullYear()}, ${notes ?? null})
      ON CONFLICT (variety_id, year) DO UPDATE SET available_from=EXCLUDED.available_from, available_until=EXCLUDED.available_until, notes=EXCLUDED.notes
      RETURNING *
    `);
    res.status(201).json(((result as any).rows ?? result)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
