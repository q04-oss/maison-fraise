import { Router, Request, Response, NextFunction } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';

const router = Router();

const requireStaff = async (req: Request, res: Response, next: NextFunction) => {
  const pin = req.headers['x-staff-pin'] as string | undefined;
  const staffPin = process.env.STAFF_PIN;
  if (staffPin && pin === staffPin) { next(); return; }
  const authHeader = req.headers.authorization;
  if (!authHeader) { res.status(403).json({ error: 'staff_only' }); return; }
  try {
    const token = authHeader.replace('Bearer ', '');
    const { verifyToken } = await import('../lib/auth');
    const payload = verifyToken(token);
    if (!payload) { res.status(403).json({ error: 'staff_only' }); return; }
    const [user] = await db.select({ is_dj: users.is_dj }).from(users).where(eq(users.id, payload.userId));
    if (!user?.is_dj) { res.status(403).json({ error: 'staff_only' }); return; }
    next();
  } catch { res.status(403).json({ error: 'staff_only' }); }
};

// GET /api/pickup-grid/today — today's pickup slots as a grid
router.get('/today', requireStaff, async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        slot_time,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
        COUNT(*) FILTER (WHERE status = 'preparing')::int AS preparing,
        COUNT(*) FILTER (WHERE status = 'ready')::int AS ready
      FROM orders
      WHERE DATE(pickup_date) = CURRENT_DATE
        AND status IN ('paid', 'preparing', 'ready')
        AND slot_time IS NOT NULL
      GROUP BY slot_time
      ORDER BY slot_time ASC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
