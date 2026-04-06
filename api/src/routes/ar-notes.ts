import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS ar_notes (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  lat numeric(9,6) NOT NULL,
  lng numeric(9,6) NOT NULL,
  body text NOT NULL,
  color text NOT NULL DEFAULT 'amber',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
)`).catch(() => {});

// GET /api/ar-notes/nearby?lat=&lng=&radius_m=
router.get('/nearby', requireUser, async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radius = parseFloat((req.query.radius_m as string) ?? '200') || 200;
  if (isNaN(lat) || isNaN(lng)) { res.status(400).json({ error: 'lat and lng are required' }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT * FROM ar_notes
      WHERE (6371000 * acos(cos(radians(${lat})) * cos(radians(lat)) * cos(radians(lng) - radians(${lng})) + sin(radians(${lat})) * sin(radians(lat)))) <= ${radius}
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY created_at DESC
      LIMIT 20
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/ar-notes
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { lat, lng, body, color, expires_in_hours } = req.body;
  if (!lat || !lng || !body) { res.status(400).json({ error: 'lat, lng, and body are required' }); return; }
  if (typeof body !== 'string' || body.length > 200) { res.status(400).json({ error: 'body max 200 chars' }); return; }
  try {
    const noteColor = color ?? 'amber';
    let result;
    if (expires_in_hours != null) {
      result = await db.execute(sql`
        INSERT INTO ar_notes (user_id, lat, lng, body, color, expires_at)
        VALUES (${userId}, ${lat}, ${lng}, ${body}, ${noteColor}, now() + (${expires_in_hours} || ' hours')::interval)
        RETURNING *
      `);
    } else {
      result = await db.execute(sql`
        INSERT INTO ar_notes (user_id, lat, lng, body, color)
        VALUES (${userId}, ${lat}, ${lng}, ${body}, ${noteColor})
        RETURNING *
      `);
    }
    res.status(201).json(((result as any).rows ?? result)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/ar-notes/:id
router.delete('/:id', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    const result = await db.execute(sql`
      DELETE FROM ar_notes WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `);
    const row = ((result as any).rows ?? result)[0];
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
