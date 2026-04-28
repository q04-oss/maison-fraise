import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger';
import { sendPushNotification } from '../lib/push';

const router = Router();

// ── Schema ────────────────────────────────────────────────────────────────────

db.execute(sql`
  CREATE TABLE IF NOT EXISTS meeting_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '10 minutes',
    used BOOLEAN NOT NULL DEFAULT false
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS pending_connections (
    id SERIAL PRIMARY KEY,
    user_a_id INTEGER NOT NULL REFERENCES users(id),
    user_b_id INTEGER NOT NULL REFERENCES users(id),
    met_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '48 hours',
    approved_by_a BOOLEAN NOT NULL DEFAULT false,
    approved_by_b BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'pending',
    UNIQUE(user_a_id, user_b_id)
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS connections (
    id SERIAL PRIMARY KEY,
    user_a_id INTEGER NOT NULL REFERENCES users(id),
    user_b_id INTEGER NOT NULL REFERENCES users(id),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    met_at TIMESTAMPTZ,
    UNIQUE(user_a_id, user_b_id)
  )
`).catch(() => {});

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/connections/token — generate short-lived meeting token
router.post('/token', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const token = randomUUID();
    await db.execute(sql`
      INSERT INTO meeting_tokens (user_id, token) VALUES (${userId}, ${token})
    `);
    res.json({ token, expires_in: 600 });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/connections/meet — both tokens detected, create pending connection
router.post('/meet', requireUser, async (req: Request, res: Response) => {
  const myUserId = (req as any).userId as number;
  const { my_token, their_token } = req.body;
  if (!my_token || !their_token) {
    res.status(400).json({ error: 'my_token and their_token required' }); return;
  }

  try {
    const myTokenRow = ((await db.execute(sql`
      SELECT id, user_id FROM meeting_tokens
      WHERE token = ${my_token} AND user_id = ${myUserId}
        AND used = false AND expires_at > now()
    `)) as any).rows?.[0];
    if (!myTokenRow) { res.status(400).json({ error: 'invalid_token' }); return; }

    const theirTokenRow = ((await db.execute(sql`
      SELECT id, user_id FROM meeting_tokens
      WHERE token = ${their_token} AND used = false AND expires_at > now()
    `)) as any).rows?.[0];
    if (!theirTokenRow || theirTokenRow.user_id === myUserId) {
      res.status(400).json({ error: 'invalid_their_token' }); return;
    }

    const theirUserId: number = theirTokenRow.user_id;

    // Mark both tokens used
    await db.execute(sql`
      UPDATE meeting_tokens SET used = true WHERE id IN (${myTokenRow.id}, ${theirTokenRow.id})
    `);

    // Already connected?
    const existing = ((await db.execute(sql`
      SELECT id FROM connections
      WHERE (user_a_id = ${myUserId} AND user_b_id = ${theirUserId})
         OR (user_a_id = ${theirUserId} AND user_b_id = ${myUserId})
    `)) as any).rows?.[0];
    if (existing) { res.json({ status: 'already_connected' }); return; }

    const [userA, userB] = myUserId < theirUserId
      ? [myUserId, theirUserId] : [theirUserId, myUserId];
    const iAmA = myUserId === userA;

    await db.execute(sql`
      INSERT INTO pending_connections (user_a_id, user_b_id, approved_by_a, approved_by_b)
      VALUES (${userA}, ${userB}, ${iAmA}, ${!iAmA})
      ON CONFLICT (user_a_id, user_b_id) DO UPDATE
        SET approved_by_a = CASE WHEN pending_connections.user_a_id = ${myUserId}
                                 THEN true ELSE pending_connections.approved_by_a END,
            approved_by_b = CASE WHEN pending_connections.user_b_id = ${myUserId}
                                 THEN true ELSE pending_connections.approved_by_b END,
            status = 'pending',
            expires_at = now() + INTERVAL '48 hours',
            met_at = now()
    `);

    // Push notification to the other user
    const myUser = ((await db.execute(sql`
      SELECT display_name FROM users WHERE id = ${myUserId}
    `)) as any).rows?.[0];
    const theirUser = ((await db.execute(sql`
      SELECT push_token FROM users WHERE id = ${theirUserId}
    `)) as any).rows?.[0];

    if (theirUser?.push_token) {
      const name = myUser?.display_name ?? 'someone';
      sendPushNotification(theirUser.push_token, {
        title: 'you met someone',
        body: `you met ${name}. you have 48 hours to approve.`,
        data: { screen: 'meet' },
      }).catch(() => {});
    }

    res.json({ status: 'pending', expires_in: 172800 });
  } catch (err) {
    logger.error('meet error: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/connections/pending
router.get('/pending', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = ((await db.execute(sql`
      SELECT pc.id, pc.met_at, pc.expires_at, pc.status,
             CASE WHEN pc.user_a_id = ${userId} THEN ub.display_name ELSE ua.display_name END AS their_name,
             CASE WHEN pc.user_a_id = ${userId} THEN ub.user_code    ELSE ua.user_code    END AS their_code,
             CASE WHEN pc.user_a_id = ${userId} THEN pc.approved_by_a ELSE pc.approved_by_b END AS i_approved
      FROM pending_connections pc
      JOIN users ua ON ua.id = pc.user_a_id
      JOIN users ub ON ub.id = pc.user_b_id
      WHERE (pc.user_a_id = ${userId} OR pc.user_b_id = ${userId})
        AND pc.status = 'pending' AND pc.expires_at > now()
      ORDER BY pc.met_at DESC
    `)) as any).rows ?? [];
    res.json(rows);
  } catch { res.status(500).json({ error: 'internal' }); }
});

// POST /api/connections/approve/:id
router.post('/approve/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const row = ((await db.execute(sql`
      UPDATE pending_connections
      SET approved_by_a = CASE WHEN user_a_id = ${userId} THEN true ELSE approved_by_a END,
          approved_by_b = CASE WHEN user_b_id = ${userId} THEN true ELSE approved_by_b END
      WHERE id = ${id} AND (user_a_id = ${userId} OR user_b_id = ${userId})
        AND status = 'pending' AND expires_at > now()
      RETURNING id, user_a_id, user_b_id, approved_by_a, approved_by_b, met_at
    `)) as any).rows?.[0];
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }

    if (row.approved_by_a && row.approved_by_b) {
      const [ua, ub] = row.user_a_id < row.user_b_id
        ? [row.user_a_id, row.user_b_id] : [row.user_b_id, row.user_a_id];
      await db.execute(sql`
        INSERT INTO connections (user_a_id, user_b_id, met_at)
        VALUES (${ua}, ${ub}, ${row.met_at}) ON CONFLICT DO NOTHING
      `);
      await db.execute(sql`
        UPDATE pending_connections SET status = 'connected' WHERE id = ${id}
      `);
      res.json({ connected: true });
    } else {
      res.json({ approved: true, waiting: true });
    }
  } catch { res.status(500).json({ error: 'internal' }); }
});

// POST /api/connections/decline/:id
router.post('/decline/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    await db.execute(sql`
      UPDATE pending_connections SET status = 'declined'
      WHERE id = ${id} AND (user_a_id = ${userId} OR user_b_id = ${userId})
    `);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal' }); }
});

// GET /api/connections/contacts
router.get('/contacts', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = ((await db.execute(sql`
      SELECT c.id, c.connected_at, c.met_at,
             CASE WHEN c.user_a_id = ${userId} THEN c.user_b_id     ELSE c.user_a_id     END AS contact_id,
             CASE WHEN c.user_a_id = ${userId} THEN ub.display_name ELSE ua.display_name END AS name,
             CASE WHEN c.user_a_id = ${userId} THEN ub.user_code    ELSE ua.user_code    END AS user_code,
             CASE WHEN c.user_a_id = ${userId} THEN ub.verified     ELSE ua.verified     END AS verified
      FROM connections c
      JOIN users ua ON ua.id = c.user_a_id
      JOIN users ub ON ub.id = c.user_b_id
      WHERE c.user_a_id = ${userId} OR c.user_b_id = ${userId}
      ORDER BY c.connected_at DESC
    `)) as any).rows ?? [];
    res.json(rows);
  } catch { res.status(500).json({ error: 'internal' }); }
});

// POST /api/connections/business-contact — add a business node as a contact
// Triggered when a customer collects at a node; no 48h pending window needed.
router.post('/business-contact', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { business_user_code } = req.body;
  if (!business_user_code) {
    res.status(400).json({ error: 'business_user_code required' }); return;
  }
  try {
    const shopRow = ((await db.execute(sql`
      SELECT id FROM users WHERE user_code = ${business_user_code} AND is_shop = true
    `)) as any).rows?.[0];
    if (!shopRow) { res.status(404).json({ error: 'business not found' }); return; }

    const shopId: number = shopRow.id;
    const [ua, ub] = userId < shopId ? [userId, shopId] : [shopId, userId];
    await db.execute(sql`
      INSERT INTO connections (user_a_id, user_b_id, met_at)
      VALUES (${ua}, ${ub}, now())
      ON CONFLICT (user_a_id, user_b_id) DO NOTHING
    `);
    res.json({ connected: true });
  } catch { res.status(500).json({ error: 'internal' }); }
});

export default router;
// @final-audit
