import { Router, Request, Response } from 'express';
import { eq, sql, asc } from 'drizzle-orm';
import { db } from '../db';
import { varieties } from '../db/schema';
import { logger } from '../lib/logger';
import { requireUser } from '../lib/auth';

// Self-healing: ensure social_tier enum exists (added after initial migration)
db.execute(sql`DO $$ BEGIN CREATE TYPE social_tier AS ENUM('standard', 'reserve', 'estate'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`).catch(() => {});
db.execute(sql`ALTER TABLE varieties ADD COLUMN IF NOT EXISTS social_tier social_tier`).catch(() => {});
db.execute(sql`ALTER TABLE varieties ADD COLUMN IF NOT EXISTS time_credits_days integer NOT NULL DEFAULT 30`).catch(() => {});

const router = Router();

// GET /api/varieties/passport — literal before parameterized
router.get('/passport', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT v.id, v.name, v.source_farm, v.harvest_date, MIN(o.created_at) AS first_tried
      FROM orders o
      JOIN varieties v ON v.id = o.variety_id
      JOIN users u ON u.apple_user_id = o.apple_id
      WHERE u.id = ${userId} AND o.status = 'collected'
      GROUP BY v.id, v.name, v.source_farm, v.harvest_date
      ORDER BY first_tried ASC
    `);
    const list = (rows as any).rows ?? rows;
    res.json({ varieties: list, total: list.length });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const vars = await db.select().from(varieties).where(eq(varieties.active, true)).orderBy(asc(varieties.sort_order), asc(varieties.id));

    const ratings = await db.execute<{ variety_id: number; avg_rating: number; rating_count: number }>(sql`
      SELECT variety_id,
        ROUND(AVG(rating)::numeric, 1)::float as avg_rating,
        COUNT(*)::int as rating_count
      FROM orders
      WHERE rating IS NOT NULL AND variety_id IS NOT NULL
      GROUP BY variety_id
    `);
    const ratingRows = (ratings as any).rows ?? ratings;
    const ratingMap = Object.fromEntries(
      (ratingRows as any[]).map(r => [r.variety_id, { avg_rating: r.avg_rating, rating_count: r.rating_count }])
    );
    const result = vars.map(v => ({ ...v, ...(ratingMap[v.id] ?? { avg_rating: null, rating_count: 0 }) }));

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    res.json(result);
  } catch (err) {
    logger.error('varieties error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
