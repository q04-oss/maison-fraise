import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS standing_order_tiers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  quantity_per_delivery integer NOT NULL DEFAULT 1,
  price_cents integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
)`).then(async () => {
  const existing = await db.execute(sql`SELECT COUNT(*)::int AS c FROM standing_order_tiers`);
  const count = ((existing as any).rows ?? existing)[0]?.c ?? 0;
  if (count === 0) {
    await db.execute(sql`
      INSERT INTO standing_order_tiers (name, description, quantity_per_delivery, price_cents, sort_order)
      VALUES
        ('Standard', 'One basket per pickup', 1, 29500, 1),
        ('Double', 'Two baskets per pickup', 2, 54900, 2),
        ('Collector', 'Four baskets per pickup', 4, 99900, 3)
    `);
  }
}).catch(() => {});

// GET /api/tiers
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM standing_order_tiers WHERE active = true ORDER BY sort_order ASC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
