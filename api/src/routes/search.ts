import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { users, businesses, varieties } from '../db/schema';

const router = Router();

// GET /api/search?q= — cross-entity search
router.get('/', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.status(400).json({ error: 'q must be at least 2 characters' });
    return;
  }

  const pattern = `%${q}%`;
  const now = new Date();

  try {
    const [usersResult, popupsResult, varietiesResult] = await Promise.all([
      // Users by display_name with save count (public search — no email exposure)
      db.execute(sql`
        SELECT u.id, u.display_name, u.portrait_url, u.verified,
               COUNT(s.id)::int AS save_count
        FROM users u
        LEFT JOIN user_saves s ON s.saved_user_id = u.id
        WHERE u.display_name ILIKE ${pattern} AND u.banned = false
        GROUP BY u.id
        ORDER BY COUNT(s.id) DESC
        LIMIT 8
      `),

      // Future popups matching name or neighbourhood
      db
        .select({
          id: businesses.id,
          name: businesses.name,
          address: businesses.address,
          neighbourhood: businesses.neighbourhood,
          starts_at: businesses.starts_at,
          launched_at: businesses.launched_at,
        })
        .from(businesses)
        .where(
          sql`${businesses.type} = 'popup' AND ${businesses.launched_at} >= ${now} AND (${businesses.name} ILIKE ${pattern} OR ${businesses.neighbourhood} ILIKE ${pattern})`
        )
        .limit(5),

      // Active varieties by name
      db
        .select({
          id: varieties.id,
          name: varieties.name,
          description: varieties.description,
          price_cents: varieties.price_cents,
          stock_remaining: varieties.stock_remaining,
        })
        .from(varieties)
        .where(
          sql`${varieties.active} = true AND ${varieties.name} ILIKE ${pattern}`
        )
        .limit(5),
    ]);

    res.json({
      users: (usersResult as any).rows ?? usersResult,
      popups: popupsResult,
      varieties: varietiesResult,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

// @final-audit
