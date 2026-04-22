import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';

const router = Router();

// ─── Boot-time migrations ─────────────────────────────────────────────────────
db.execute(sql`
  CREATE TABLE IF NOT EXISTS user_maps (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS user_map_entries (
    id serial PRIMARY KEY,
    map_id integer NOT NULL REFERENCES user_maps(id) ON DELETE CASCADE,
    business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    note text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (map_id, business_id)
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS user_saves (
    id serial PRIMARY KEY,
    saver_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    saved_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (saver_id, saved_user_id)
  )
`).catch(() => {});

db.execute(sql`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS feed_visible boolean NOT NULL DEFAULT false
`).catch(() => {});

// ─── Maps ─────────────────────────────────────────────────────────────────────

// GET /api/maps/mine — current user's maps with entry counts
router.get('/mine', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db.execute(sql`
      SELECT m.id, m.name, m.description, m.created_at,
             COUNT(e.id)::int AS entry_count
      FROM user_maps m
      LEFT JOIN user_map_entries e ON e.map_id = m.id
      WHERE m.user_id = ${userId}
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/maps/user/:userId — another user's maps + save count
router.get('/user/:userId', async (req: Request, res: Response) => {
  const profileUserId = parseInt(req.params.userId, 10);
  if (isNaN(profileUserId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const [mapsRows, saveRows] = await Promise.all([
      db.execute(sql`
        SELECT m.id, m.name, m.description, m.created_at,
               COUNT(e.id)::int AS entry_count
        FROM user_maps m
        LEFT JOIN user_map_entries e ON e.map_id = m.id
        WHERE m.user_id = ${profileUserId}
        GROUP BY m.id
        ORDER BY m.created_at DESC
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS save_count
        FROM user_saves WHERE saved_user_id = ${profileUserId}
      `),
    ]);
    const maps = (mapsRows as any).rows ?? mapsRows;
    const save_count = (((saveRows as any).rows ?? saveRows)[0] as any)?.save_count ?? 0;
    res.json({ maps, save_count });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/maps/:id — map with full business entries
router.get('/:id', async (req: Request, res: Response) => {
  const mapId = parseInt(req.params.id, 10);
  if (isNaN(mapId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const mapRows = await db.execute(sql`
      SELECT m.id, m.name, m.description, m.created_at,
             u.id AS author_id, u.display_name AS author_display_name
      FROM user_maps m
      JOIN users u ON u.id = m.user_id
      WHERE m.id = ${mapId}
      LIMIT 1
    `);
    const map = ((mapRows as any).rows ?? mapRows)[0];
    if (!map) { res.status(404).json({ error: 'not_found' }); return; }

    const entryRows = await db.execute(sql`
      SELECT b.id, b.name, b.type, b.address, b.lat, b.lng,
             b.neighbourhood, b.hours, b.description,
             e.note, e.sort_order
      FROM user_map_entries e
      JOIN businesses b ON b.id = e.business_id
      WHERE e.map_id = ${mapId}
      ORDER BY e.sort_order ASC, e.created_at ASC
    `);
    const entries = (entryRows as any).rows ?? entryRows;

    res.json({ map, entries });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/maps — create a map
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { name, description } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name required' }); return;
  }
  try {
    const rows = await db.execute(sql`
      INSERT INTO user_maps (user_id, name, description)
      VALUES (${userId}, ${name.trim()}, ${description ?? null})
      RETURNING id, name, description, created_at
    `);
    res.json(((rows as any).rows ?? rows)[0]);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// PATCH /api/maps/:id — update name/description
router.patch('/:id', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const mapId = parseInt(req.params.id, 10);
  if (isNaN(mapId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const { name, description } = req.body;
  try {
    const rows = await db.execute(sql`
      UPDATE user_maps SET
        name = COALESCE(${name ?? null}, name),
        description = COALESCE(${description ?? null}, description)
      WHERE id = ${mapId} AND user_id = ${userId}
      RETURNING id, name, description
    `);
    const updated = ((rows as any).rows ?? rows)[0];
    if (!updated) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(updated);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// DELETE /api/maps/:id
router.delete('/:id', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const mapId = parseInt(req.params.id, 10);
  if (isNaN(mapId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    await db.execute(sql`DELETE FROM user_maps WHERE id = ${mapId} AND user_id = ${userId}`);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/maps/:id/entries — add a business to a map
router.post('/:id/entries', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const mapId = parseInt(req.params.id, 10);
  if (isNaN(mapId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const { business_id, note } = req.body;
  if (!business_id || isNaN(parseInt(business_id, 10))) {
    res.status(400).json({ error: 'business_id required' }); return;
  }
  try {
    // Verify map ownership
    const ownerRows = await db.execute(sql`SELECT id FROM user_maps WHERE id = ${mapId} AND user_id = ${userId} LIMIT 1`);
    if (!((ownerRows as any).rows ?? ownerRows)[0]) {
      res.status(403).json({ error: 'forbidden' }); return;
    }
    await db.execute(sql`
      INSERT INTO user_map_entries (map_id, business_id, note)
      VALUES (${mapId}, ${parseInt(business_id, 10)}, ${note ?? null})
      ON CONFLICT (map_id, business_id) DO UPDATE SET note = EXCLUDED.note
    `);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// DELETE /api/maps/:id/entries/:businessId
router.delete('/:id/entries/:businessId', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const mapId = parseInt(req.params.id, 10);
  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(mapId) || isNaN(businessId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const ownerRows = await db.execute(sql`SELECT id FROM user_maps WHERE id = ${mapId} AND user_id = ${userId} LIMIT 1`);
    if (!((ownerRows as any).rows ?? ownerRows)[0]) {
      res.status(403).json({ error: 'forbidden' }); return;
    }
    await db.execute(sql`DELETE FROM user_map_entries WHERE map_id = ${mapId} AND business_id = ${businessId}`);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// ─── User Saves ───────────────────────────────────────────────────────────────

// POST /api/maps/saves/:userId — save a user
router.post('/saves/:userId', requireUser, async (req: Request, res: Response) => {
  const saverId: number = (req as any).userId;
  const savedUserId = parseInt(req.params.userId, 10);
  if (isNaN(savedUserId) || saverId === savedUserId) {
    res.status(400).json({ error: 'invalid_id' }); return;
  }
  try {
    await db.execute(sql`
      INSERT INTO user_saves (saver_id, saved_user_id)
      VALUES (${saverId}, ${savedUserId})
      ON CONFLICT DO NOTHING
    `);
    res.json({ saved: true });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// DELETE /api/maps/saves/:userId — unsave a user
router.delete('/saves/:userId', requireUser, async (req: Request, res: Response) => {
  const saverId: number = (req as any).userId;
  const savedUserId = parseInt(req.params.userId, 10);
  if (isNaN(savedUserId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    await db.execute(sql`DELETE FROM user_saves WHERE saver_id = ${saverId} AND saved_user_id = ${savedUserId}`);
    res.json({ saved: false });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/maps/saves/mine — users I've saved (who I follow)
router.get('/saves/mine', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db.execute(sql`
      SELECT u.id, u.display_name, u.portrait_url, u.verified
      FROM user_saves s
      JOIN users u ON u.id = s.saved_user_id
      WHERE s.saver_id = ${userId}
      ORDER BY s.created_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/maps/saves/followers — users who've saved me (my audience)
router.get('/saves/followers', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db.execute(sql`
      SELECT u.id, u.display_name, u.portrait_url, u.verified
      FROM user_saves s
      JOIN users u ON u.id = s.saver_id
      WHERE s.saved_user_id = ${userId}
      ORDER BY s.created_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/maps/saves/check/:userId — is this user saved?
router.get('/saves/check/:userId', requireUser, async (req: Request, res: Response) => {
  const saverId: number = (req as any).userId;
  const savedUserId = parseInt(req.params.userId, 10);
  if (isNaN(savedUserId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT id FROM user_saves WHERE saver_id = ${saverId} AND saved_user_id = ${savedUserId} LIMIT 1
    `);
    res.json({ saved: !!((rows as any).rows ?? rows)[0] });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// ─── Presence Feed ────────────────────────────────────────────────────────────

// GET /api/maps/feed — orders at locations from saved users (opt-in only)
router.get('/feed', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db.execute(sql`
      SELECT
        o.id AS order_id,
        o.created_at,
        b.id AS business_id,
        b.name AS business_name,
        b.neighbourhood,
        b.lat, b.lng,
        u.id AS user_id,
        u.display_name,
        u.portrait_url
      FROM user_saves s
      JOIN users u ON u.id = s.saved_user_id AND u.feed_visible = true
      JOIN orders o ON o.apple_id = u.apple_user_id AND o.status IN ('collected', 'paid', 'ready')
      JOIN businesses b ON b.id = o.location_id
      WHERE s.saver_id = ${userId}
        AND o.created_at > NOW() - INTERVAL '30 days'
      ORDER BY o.created_at DESC
      LIMIT 60
    `);
    res.json((rows as any).rows ?? rows);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/maps/feed/visibility — current user's feed_visible setting
router.get('/feed/visibility', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db.execute(sql`SELECT feed_visible FROM users WHERE id = ${userId} LIMIT 1`);
    const row = ((rows as any).rows ?? rows)[0] as any;
    res.json({ feed_visible: row?.feed_visible ?? false });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// PATCH /api/maps/feed/visibility — toggle own feed visibility
router.patch('/feed/visibility', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { visible } = req.body;
  if (typeof visible !== 'boolean') { res.status(400).json({ error: 'visible must be boolean' }); return; }
  try {
    await db.execute(sql`UPDATE users SET feed_visible = ${visible} WHERE id = ${userId}`);
    res.json({ feed_visible: visible });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

export default router;

// @final-audit
