import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';

const router = Router();

// GET /api/variety-map/my-scanned — varieties the user has ordered (with farm coordinates)
router.get('/my-scanned', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (v.id)
        v.id AS variety_id,
        v.name AS variety_name,
        vp.farm_lat,
        vp.farm_lng,
        true AS scanned
      FROM orders o
      JOIN varieties v ON v.id = o.variety_id
      LEFT JOIN variety_profiles vp ON vp.variety_id = v.id
      WHERE o.user_id = ${userId}
        AND o.status IN ('delivered', 'ready', 'picked_up')
      ORDER BY v.id
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
