import { Router, Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { orders, timeSlots } from '../db/schema';

const router = Router();

function requirePin(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers['x-chocolatier-pin'];
  if (!pin || pin !== process.env.CHOCOLATIER_PIN) {
    res.status(401).json({ error: 'Invalid or missing X-Chocolatier-PIN header' });
    return;
  }
  next();
}

router.use(requirePin);

// GET /api/chocolatier/orders — today's paid orders (by pickup time slot date)
router.get('/orders', async (_req: Request, res: Response) => {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  try {
    const rows = await db
      .select({
        order: orders,
        slot: timeSlots,
      })
      .from(orders)
      .innerJoin(timeSlots, eq(orders.time_slot_id, timeSlots.id))
      .where(
        and(
          eq(timeSlots.date, dateStr),
          eq(orders.status, 'paid')
        )
      )
      .orderBy(timeSlots.time);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
