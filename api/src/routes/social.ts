import { Router, Request, Response } from 'express';
import { eq, and, desc, sql, ne } from 'drizzle-orm';
import { db } from '../db';
import { varietyReviews, varieties, users, orders, arVideos, tastingFeedReactions } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

// ─── Variety Reviews ──────────────────────────────────────────────────────────

// GET /api/social/varieties/:id/reviews
router.get('/varieties/:id/reviews', async (req: Request, res: Response) => {
  const variety_id = parseInt(req.params.id, 10);
  if (isNaN(variety_id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT vr.id, vr.rating, vr.note, vr.created_at,
             u.display_name AS author_display_name,
             u.id AS author_user_id
      FROM variety_reviews vr
      JOIN users u ON u.id = vr.user_id
      WHERE vr.variety_id = ${variety_id}
      ORDER BY vr.created_at DESC
      LIMIT 50
    `);
    const reviews = (rows as any).rows ?? rows;

    const [stats] = await db.execute(sql`
      SELECT ROUND(AVG(rating)::numeric, 1)::float AS avg_rating,
             COUNT(*)::int AS review_count
      FROM variety_reviews WHERE variety_id = ${variety_id}
    `);
    const s = ((stats as any).rows ?? [stats])[0] ?? {};

    res.json({ reviews, avg_rating: s.avg_rating ?? null, review_count: s.review_count ?? 0 });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/social/varieties/:id/review — one per user per variety, must have tapped it
router.post('/varieties/:id/review', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const variety_id = parseInt(req.params.id, 10);
  if (isNaN(variety_id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { rating, note } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'rating must be 1–5' }); return;
  }

  try {
    // Verify user has tapped this variety
    const [tapped] = await db.execute(sql`
      SELECT 1 FROM orders o
      JOIN users u ON u.apple_user_id = o.apple_id
      WHERE u.id = ${userId} AND o.variety_id = ${variety_id} AND o.nfc_token_used = true
      LIMIT 1
    `);
    if (!((tapped as any).rows ?? [tapped])[0]) {
      res.status(403).json({ error: 'tap_required', message: 'You must tap this variety\'s box before reviewing.' });
      return;
    }

    // Upsert review (one per user per variety)
    await db.execute(sql`
      INSERT INTO variety_reviews (user_id, variety_id, rating, note)
      VALUES (${userId}, ${variety_id}, ${rating}, ${note ?? null})
      ON CONFLICT (user_id, variety_id)
      DO UPDATE SET rating = EXCLUDED.rating, note = EXCLUDED.note
    `);

    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// ─── Variety AR Videos ────────────────────────────────────────────────────────

// GET /api/social/varieties/:id/ar-videos — published AR videos tagged to a variety
router.get('/varieties/:id/ar-videos', async (req: Request, res: Response) => {
  const variety_id = parseInt(req.params.id, 10);
  if (isNaN(variety_id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const videos = await db
      .select({
        id: arVideos.id, title: arVideos.title, description: arVideos.description,
        thumbnail_url: arVideos.thumbnail_url, luma_scene_url: arVideos.luma_scene_url,
        splat_url: arVideos.splat_url, published_at: arVideos.published_at,
        author_user_id: arVideos.author_user_id,
      })
      .from(arVideos)
      .where(and(eq(arVideos.variety_id, variety_id), eq(arVideos.status, 'published')))
      .orderBy(desc(arVideos.published_at))
      .limit(20);
    res.json(videos);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// ─── Lot Companions ───────────────────────────────────────────────────────────

// GET /api/social/varieties/:id/companions — users who tapped same variety in past 14 days
router.get('/varieties/:id/companions', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const variety_id = parseInt(req.params.id, 10);
  if (isNaN(variety_id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const rows = await db.execute(sql`
      SELECT DISTINCT u.id, u.display_name, u.portrait_url,
             u.current_streak_weeks, u.social_tier
      FROM orders o
      JOIN users u ON u.apple_user_id = o.apple_id
      WHERE o.variety_id = ${variety_id}
        AND o.nfc_token_used = true
        AND o.nfc_verified_at >= ${cutoff}
        AND u.id != ${userId}
      ORDER BY u.current_streak_weeks DESC
      LIMIT 24
    `);
    res.json((rows as any).rows ?? rows);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// ─── Tasting Feed ─────────────────────────────────────────────────────────────

// GET /api/social/tasting-feed — public tasting entries (opt-in)
router.get('/tasting-feed', async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT te.id, te.variety_id, te.rating, te.notes, te.created_at,
             v.name AS variety_name,
             u.id AS author_user_id, u.display_name AS author_display_name,
             u.portrait_url AS author_portrait_url,
             u.social_tier,
             COALESCE(r.reaction_counts, '{}') AS reactions
      FROM tasting_entries te
      JOIN users u ON u.id = te.user_id
      LEFT JOIN varieties v ON v.id = te.variety_id
      LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(emoji, cnt) AS reaction_counts
        FROM (
          SELECT emoji, COUNT(*)::int AS cnt
          FROM tasting_feed_reactions
          WHERE entry_id = te.id
          GROUP BY emoji
        ) sub
      ) r ON true
      WHERE te.public = true
      ORDER BY te.created_at DESC
      LIMIT 60
    `);
    res.json((rows as any).rows ?? rows);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/social/tasting-feed/:id/react — add/toggle emoji reaction
router.post('/tasting-feed/:id/react', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const entry_id = parseInt(req.params.id, 10);
  const { emoji } = req.body;
  if (!emoji || typeof emoji !== 'string' || emoji.length > 8) {
    res.status(400).json({ error: 'invalid_emoji' }); return;
  }
  try {
    // Toggle: insert or delete
    const [existing] = await db.execute(sql`
      SELECT id FROM tasting_feed_reactions
      WHERE entry_id = ${entry_id} AND user_id = ${userId} AND emoji = ${emoji}
    `);
    const existingRow = ((existing as any).rows ?? [existing])[0];
    if (existingRow) {
      await db.execute(sql`
        DELETE FROM tasting_feed_reactions
        WHERE entry_id = ${entry_id} AND user_id = ${userId} AND emoji = ${emoji}
      `);
      res.json({ reacted: false });
    } else {
      await db.execute(sql`
        INSERT INTO tasting_feed_reactions (entry_id, user_id, emoji) VALUES (${entry_id}, ${userId}, ${emoji})
        ON CONFLICT DO NOTHING
      `);
      res.json({ reacted: true });
    }
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// ─── Box Wall ─────────────────────────────────────────────────────────────────

// GET /api/social/users/:id/box-wall — all distinct varieties a user has tapped, chronological
router.get('/users/:id/box-wall', async (req: Request, res: Response) => {
  const profile_user_id = parseInt(req.params.id, 10);
  if (isNaN(profile_user_id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (o.variety_id)
             o.variety_id, v.name, v.source_farm, v.image_url,
             v.social_tier, v.time_credits_days,
             o.nfc_verified_at AS tapped_at
      FROM orders o
      JOIN users u ON u.apple_user_id = o.apple_id
      JOIN varieties v ON v.id = o.variety_id
      WHERE u.id = ${profile_user_id} AND o.nfc_token_used = true
      ORDER BY o.variety_id, o.nfc_verified_at ASC
    `);
    const wall = ((rows as any).rows ?? rows)
      .sort((a: any, b: any) => new Date(a.tapped_at).getTime() - new Date(b.tapped_at).getTime());
    res.json(wall);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// ─── Harvest Dispatches ───────────────────────────────────────────────────────

// GET /api/social/harvest-dispatches — published editorial pieces tagged 'Dispatch'
router.get('/harvest-dispatches', async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT ep.id, ep.title, ep.abstract, ep.published_at, ep.tag,
             u.display_name AS author_display_name, u.id AS author_user_id,
             v.id AS variety_id, v.name AS variety_name
      FROM editorial_pieces ep
      JOIN users u ON u.id = ep.author_user_id
      LEFT JOIN varieties v ON v.name ILIKE '%' || ep.tag || '%'
      WHERE ep.status = 'published' AND ep.tag = 'Dispatch'
      ORDER BY ep.published_at DESC
      LIMIT 30
    `);
    res.json((rows as any).rows ?? rows);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

export default router;
