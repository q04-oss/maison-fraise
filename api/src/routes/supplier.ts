import { Router, Request, Response, NextFunction } from 'express';
import { lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { varieties } from '../db/schema';

const router = Router();

function requirePin(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers['x-supplier-pin'];
  if (!pin || pin !== process.env.SUPPLIER_PIN) {
    res.status(401).json({ error: 'Invalid or missing X-Supplier-PIN header' });
    return;
  }
  next();
}

router.use(requirePin);

// GET /api/supplier/alerts — varieties with stock below 10
router.get('/alerts', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(varieties)
      .where(lt(varieties.stock_remaining, 10))
      .orderBy(varieties.stock_remaining);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Harvest logs migration
db.execute(sql`CREATE TABLE IF NOT EXISTS harvest_logs (
  id serial PRIMARY KEY,
  supplier_user_id integer NOT NULL,
  variety_id integer REFERENCES varieties(id),
  variety_name_freeform text,
  harvest_date date NOT NULL,
  quantity_kg numeric(10,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

// GET /api/supplier/harvests
router.get('/harvests', async (req: Request, res: Response) => {
  // supplier_user_id not in users table — use pin header user context isn't available here, use a placeholder user_id of 0 for supplier
  // We identify supplier by the pin, not by a user ID — just return all logs for admin view
  try {
    const rows = await db.execute(sql`
      SELECT hl.*, v.name AS variety_name
      FROM harvest_logs hl
      LEFT JOIN varieties v ON v.id = hl.variety_id
      ORDER BY hl.harvest_date DESC, hl.created_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/supplier/harvests
router.post('/harvests', async (req: Request, res: Response) => {
  const { variety_id, variety_name_freeform, harvest_date, quantity_kg, notes } = req.body;
  if (!harvest_date) { res.status(400).json({ error: 'harvest_date required' }); return; }
  try {
    const result = await db.execute(sql`
      INSERT INTO harvest_logs (supplier_user_id, variety_id, variety_name_freeform, harvest_date, quantity_kg, notes)
      VALUES (0, ${variety_id ?? null}, ${variety_name_freeform ?? null}, ${harvest_date}, ${quantity_kg ?? null}, ${notes ?? null})
      RETURNING *
    `);
    res.status(201).json(((result as any).rows ?? result)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/supplier/harvests/:id
router.delete('/harvests/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    await db.execute(sql`DELETE FROM harvest_logs WHERE id=${id}`);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
