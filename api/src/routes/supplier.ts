import { Router, Request, Response, NextFunction } from 'express';
import { lt } from 'drizzle-orm';
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

export default router;
