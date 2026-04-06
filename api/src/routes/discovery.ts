import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/discovery — businesses with social context
// Returns only businesses that have at least one social signal (evening, portrait, or menu)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        b.id,
        b.name,
        b.type,
        b.neighbourhood,
        b.address,
        b.description,
        b.instagram_handle,
        COALESCE(ev.evening_count, 0)::int AS evening_count,
        COALESCE(pl.portrait_count, 0)::int AS portrait_count,
        (mi.business_id IS NOT NULL) AS has_menu,
        ev.recent_evening_at
      FROM businesses b
      LEFT JOIN (
        SELECT business_id,
               COUNT(*) FILTER (WHERE minted_at IS NOT NULL)::int AS evening_count,
               MAX(minted_at) AS recent_evening_at
        FROM evening_tokens
        GROUP BY business_id
      ) ev ON ev.business_id = b.id
      LEFT JOIN (
        SELECT (elem->>'id')::int AS business_id, COUNT(*)::int AS portrait_count
        FROM portrait_license_requests plr
        JOIN portrait_licenses pl ON pl.request_id = plr.id,
             jsonb_array_elements(plr.requesting_businesses) AS elem
        GROUP BY (elem->>'id')::int
      ) pl ON pl.business_id = b.id
      LEFT JOIN (
        SELECT business_id
        FROM business_menu_items
        GROUP BY business_id
      ) mi ON mi.business_id = b.id
      WHERE COALESCE(ev.evening_count, 0) > 0
         OR COALESCE(pl.portrait_count, 0) > 0
         OR mi.business_id IS NOT NULL
      ORDER BY COALESCE(ev.evening_count, 0) DESC, COALESCE(pl.portrait_count, 0) DESC, b.name ASC
    `);
    const result = (rows as any).rows ?? rows;
    res.json(result);
  } catch (err) {
    logger.error(`discovery error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
