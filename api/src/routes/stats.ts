import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';

const router = Router();

// GET /api/stats/today — public
router.get('/today', async (_req: Request, res: Response) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const rows = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM legitimacy_events WHERE event_type='nfc_verified' AND created_at >= ${todayStart}) AS pickups_today,
        (SELECT COUNT(DISTINCT o.location_id)::int FROM orders o WHERE o.created_at >= ${todayStart} AND o.status IN ('paid','preparing','ready','collected')) AS active_locations,
        (SELECT COUNT(DISTINCT o.variety_id)::int FROM orders o WHERE o.created_at >= ${todayStart} AND o.status IN ('paid','preparing','ready','collected')) AS varieties_today
    `);
    const row = ((rows as any).rows ?? rows)[0] ?? { pickups_today: 0, active_locations: 0, varieties_today: 0 };
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
