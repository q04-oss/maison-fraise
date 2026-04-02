import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { varieties } from '../db/schema';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const vars = await db.select().from(varieties).where(eq(varieties.active, true));

    const ratings = await db.execute<{ variety_id: number; avg_rating: number; rating_count: number }>(sql`
      SELECT variety_id,
        ROUND(AVG(rating)::numeric, 1)::float as avg_rating,
        COUNT(*)::int as rating_count
      FROM orders
      WHERE rating IS NOT NULL AND variety_id IS NOT NULL
      GROUP BY variety_id
    `);
    const ratingMap = Object.fromEntries(
      (ratings as any[]).map(r => [r.variety_id, { avg_rating: r.avg_rating, rating_count: r.rating_count }])
    );
    const result = vars.map(v => ({ ...v, ...(ratingMap[v.id] ?? { avg_rating: null, rating_count: 0 }) }));

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
