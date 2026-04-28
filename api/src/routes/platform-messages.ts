import { Router, Request, Response } from 'express';
import { sql, eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';
import { logger } from '../lib/logger';

const router = Router();

// ── Schema ────────────────────────────────────────────────────────────────────

db.execute(sql`
  CREATE TABLE IF NOT EXISTS platform_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    encrypted_body TEXT NOT NULL,
    x3dh_sender_key TEXT,
    message_type TEXT NOT NULL DEFAULT 'text',
    fraise_object JSONB,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
  )
`).catch(() => {});

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/platform-messages/send
router.post('/send', requireUser, async (req: Request, res: Response) => {
  const senderId = (req as any).userId as number;
  const { recipient_code, encrypted_body, message_type, fraise_object, x3dh_sender_key, expires_in_days } = req.body;
  if (!recipient_code || !encrypted_body) {
    res.status(400).json({ error: 'recipient_code and encrypted_body required' }); return;
  }

  try {
    const recipientRows = await db.execute(sql`
      SELECT id, push_token FROM users WHERE user_code = ${recipient_code}
    `);
    const recipient = ((recipientRows as any).rows ?? recipientRows)[0];
    if (!recipient) { res.status(404).json({ error: 'recipient not found' }); return; }

    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 86400 * 1000)
      : null;

    const rows = await db.execute(sql`
      INSERT INTO platform_messages
        (sender_id, recipient_id, encrypted_body, x3dh_sender_key, message_type, fraise_object, expires_at)
      VALUES (
        ${senderId}, ${recipient.id}, ${encrypted_body},
        ${x3dh_sender_key ?? null},
        ${message_type ?? 'text'},
        ${fraise_object ? JSON.stringify(fraise_object) : null},
        ${expiresAt}
      )
      RETURNING id, sender_id, recipient_id, encrypted_body, x3dh_sender_key,
                message_type, fraise_object, sent_at, expires_at
    `);
    const msg = ((rows as any).rows ?? rows)[0];

    const senderName = ((await db.execute(sql`
      SELECT display_name FROM users WHERE id = ${senderId}
    `)) as any).rows?.[0]?.display_name ?? 'someone';

    if (recipient.push_token) {
      sendPushNotification(recipient.push_token, {
        title: senderName,
        body: message_type === 'text' ? '🔒 new message' : `shared a ${message_type ?? 'item'}`,
        data: { screen: 'messages' },
      }).catch(() => {});
    }

    res.status(201).json(msg);
  } catch (err) {
    logger.error('send message error: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/platform-messages/threads
router.get('/threads', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      WITH ranked AS (
        SELECT id, sender_id, recipient_id, encrypted_body, message_type, sent_at,
               CASE WHEN sender_id = ${userId} THEN recipient_id ELSE sender_id END AS contact_id,
               ROW_NUMBER() OVER (
                 PARTITION BY LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id)
                 ORDER BY sent_at DESC
               ) AS rn
        FROM platform_messages
        WHERE sender_id = ${userId} OR recipient_id = ${userId}
      ),
      last_msgs AS (SELECT * FROM ranked WHERE rn = 1),
      unreads AS (
        SELECT sender_id AS cid, COUNT(*) AS cnt
        FROM platform_messages
        WHERE recipient_id = ${userId} AND read_at IS NULL
        GROUP BY sender_id
      )
      SELECT
        lm.contact_id, lm.id AS last_message_id, lm.encrypted_body,
        lm.message_type, lm.sent_at AS last_message_at, lm.sender_id AS last_sender_id,
        COALESCE(un.cnt, 0) AS unread_count,
        u.display_name AS name, u.user_code, u.is_shop,
        c.met_at
      FROM last_msgs lm
      JOIN users u ON u.id = lm.contact_id
      LEFT JOIN unreads un ON un.cid = lm.contact_id
      LEFT JOIN connections c ON (
        (c.user_a_id = ${userId} AND c.user_b_id = lm.contact_id) OR
        (c.user_a_id = lm.contact_id AND c.user_b_id = ${userId})
      )
      ORDER BY lm.sent_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    logger.error('threads error: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/platform-messages/thread/:userCode
router.get('/thread/:userCode', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { userCode } = req.params;
  try {
    const contactRow = ((await db.execute(sql`
      SELECT id FROM users WHERE user_code = ${userCode}
    `)) as any).rows?.[0];
    if (!contactRow) { res.status(404).json({ error: 'user not found' }); return; }
    const contactId = contactRow.id;

    const rows = await db.execute(sql`
      SELECT id, sender_id, recipient_id, encrypted_body, x3dh_sender_key,
             message_type, fraise_object, sent_at, delivered_at, read_at, expires_at
      FROM platform_messages
      WHERE (sender_id = ${userId} AND recipient_id = ${contactId})
         OR (sender_id = ${contactId} AND recipient_id = ${userId})
      ORDER BY sent_at ASC
      LIMIT 100
    `);
    res.json((rows as any).rows ?? rows);
  } catch { res.status(500).json({ error: 'internal' }); }
});

// POST /api/platform-messages/thread/:userCode/delivered
router.post('/thread/:userCode/delivered', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { userCode } = req.params;
  try {
    const contactRow = ((await db.execute(sql`
      SELECT id FROM users WHERE user_code = ${userCode}
    `)) as any).rows?.[0];
    if (!contactRow) { res.status(404).json({ error: 'user not found' }); return; }
    await db.execute(sql`
      UPDATE platform_messages
      SET delivered_at = now()
      WHERE sender_id = ${contactRow.id} AND recipient_id = ${userId}
        AND delivered_at IS NULL
    `);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal' }); }
});

// POST /api/platform-messages/thread/:userCode/read
router.post('/thread/:userCode/read', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { userCode } = req.params;
  try {
    const contactRow = ((await db.execute(sql`
      SELECT id FROM users WHERE user_code = ${userCode}
    `)) as any).rows?.[0];
    if (!contactRow) { res.status(404).json({ error: 'user not found' }); return; }
    await db.execute(sql`
      UPDATE platform_messages
      SET read_at = now(), delivered_at = COALESCE(delivered_at, now())
      WHERE sender_id = ${contactRow.id} AND recipient_id = ${userId}
        AND read_at IS NULL
    `);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal' }); }
});

// ── Typing indicators ─────────────────────────────────────────────────────────

db.execute(sql`
  CREATE TABLE IF NOT EXISTS typing_indicators (
    user_id INTEGER NOT NULL REFERENCES users(id),
    contact_id INTEGER NOT NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, contact_id)
  )
`).catch(() => {});

// POST /api/platform-messages/thread/:userCode/typing
router.post('/thread/:userCode/typing', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const contactRow = ((await db.execute(sql`SELECT id FROM users WHERE user_code = ${req.params.userCode}`)) as any).rows?.[0];
    if (!contactRow) { res.json({ ok: true }); return; }
    await db.execute(sql`
      INSERT INTO typing_indicators (user_id, contact_id) VALUES (${userId}, ${contactRow.id})
      ON CONFLICT (user_id, contact_id) DO UPDATE SET updated_at = now()
    `);
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

// GET /api/platform-messages/thread/:userCode/typing-status
router.get('/thread/:userCode/typing-status', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const contactRow = ((await db.execute(sql`SELECT id FROM users WHERE user_code = ${req.params.userCode}`)) as any).rows?.[0];
    if (!contactRow) { res.json({ typing: false }); return; }
    const row = ((await db.execute(sql`
      SELECT updated_at FROM typing_indicators
      WHERE user_id = ${contactRow.id} AND contact_id = ${userId}
        AND updated_at > now() - INTERVAL '5 seconds'
    `)) as any).rows?.[0];
    res.json({ typing: !!row });
  } catch { res.json({ typing: false }); }
});

// POST /api/platform-messages/broadcast — send to all contacts
router.post('/broadcast', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { encrypted_body } = req.body;
  if (!encrypted_body) { res.status(400).json({ error: 'encrypted_body required' }); return; }
  try {
    const contactRows = ((await db.execute(sql`
      SELECT CASE WHEN user_a_id = ${userId} THEN user_b_id ELSE user_a_id END AS contact_id
      FROM connections WHERE user_a_id = ${userId} OR user_b_id = ${userId}
    `)) as any).rows ?? [];
    await Promise.all(contactRows.map((r: any) =>
      db.execute(sql`
        INSERT INTO platform_messages (sender_id, recipient_id, encrypted_body, message_type)
        VALUES (${userId}, ${r.contact_id}, ${encrypted_body}, 'broadcast')
      `)
    ));
    res.json({ sent: contactRows.length });
  } catch { res.status(500).json({ error: 'internal' }); }
});

// PATCH /api/users/me/status — update status line (registered here for locality)
router.patch('/status', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { status } = req.body;
  try {
    await db.execute(sql`UPDATE users SET status = ${status ?? null} WHERE id = ${userId}`);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal' }); }
});

export default router;
// @final-audit
