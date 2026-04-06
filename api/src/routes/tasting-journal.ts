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

// GET /api/tasting-journal/word-cloud/:varietyId — word frequency from tasting notes
router.get('/word-cloud/:varietyId', async (req: Request, res: Response) => {
  const varietyId = parseInt(req.params.varietyId, 10);
  if (isNaN(varietyId)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const STOP_WORDS = new Set([
    'this','that','very','with','have','from','they','been','were','when',
    'what','also','more','like','than','just','into','over','some','such',
    'only','then','most','well','good','great','nice',
  ]);

  try {
    const rows = await db.execute(sql`
      SELECT tasting_notes, rating FROM tasting_journal
      WHERE variety_id = ${varietyId} AND tasting_notes IS NOT NULL
      LIMIT 200
    `);
    const data = (rows as any).rows ?? rows;
    const freq: Record<string, number> = {};
    for (const row of data as any[]) {
      const words = (row.tasting_notes as string)
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length >= 4 && !STOP_WORDS.has(w));
      for (const word of words) {
        freq[word] = (freq[word] ?? 0) + 1;
      }
    }
    const top30 = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word, count]) => ({ word, count }));
    res.json(top30);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/tasting-journal/personal-best-flavor — returns flavor profile of the user's highest-rated variety
router.get('/personal-best-flavor', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const rows = await db.execute(sql`
      SELECT tasting_journal.variety_id, tasting_journal.rating,
        variety_profiles.sweetness, variety_profiles.acidity, variety_profiles.aroma,
        variety_profiles.texture, variety_profiles.intensity
      FROM tasting_journal
      LEFT JOIN variety_profiles ON variety_profiles.variety_id = tasting_journal.variety_id
      WHERE tasting_journal.user_id = ${userId} AND tasting_journal.rating IS NOT NULL
      ORDER BY tasting_journal.rating DESC
      LIMIT 1
    `);
    const data = (rows as any).rows ?? rows;
    const row = (data as any[])[0] ?? null;
    if (!row) { res.json(null); return; }
    if (row.sweetness == null && row.acidity == null && row.aroma == null && row.texture == null && row.intensity == null) {
      res.json(null); return;
    }
    res.json({
      sweetness: row.sweetness,
      acidity: row.acidity,
      aroma: row.aroma,
      texture: row.texture,
      intensity: row.intensity,
    });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
