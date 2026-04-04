import { Router, Request, Response } from 'express';
import { eq, or, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { messages, users, nfcConnections } from '../db/schema';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';

const router = Router();

// Verify both users are verified and have an NFC connection
async function canMessage(userA: number, userB: number): Promise<boolean> {
  const [connection] = await db
    .select({ id: nfcConnections.id })
    .from(nfcConnections)
    .where(
      or(
        and(eq(nfcConnections.user_a, userA), eq(nfcConnections.user_b, userB)),
        and(eq(nfcConnections.user_a, userB), eq(nfcConnections.user_b, userA)),
      )
    )
    .limit(1);
  if (!connection) return false;

  const [sender] = await db.select({ verified: users.verified }).from(users).where(eq(users.id, userA));
  const [recipient] = await db.select({ verified: users.verified }).from(users).where(eq(users.id, userB));
  return !!(sender?.verified && recipient?.verified);
}

// GET /api/messages/conversations — list all conversations for current user
router.get('/conversations', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    // Get the latest message per conversation partner
    const rows = await db.execute<{
      other_user_id: number;
      display_name: string | null;
      user_code: string | null;
      last_body: string;
      last_at: string;
      unread_count: number;
    }>(sql`
      SELECT
        other_user_id,
        u.display_name,
        u.user_code,
        last_body,
        last_at,
        unread_count
      FROM (
        SELECT
          CASE WHEN sender_id = ${userId} THEN recipient_id ELSE sender_id END AS other_user_id,
          (array_agg(body ORDER BY created_at DESC))[1] AS last_body,
          MAX(created_at) AS last_at,
          COUNT(*) FILTER (WHERE recipient_id = ${userId} AND read = false) AS unread_count
        FROM messages
        WHERE sender_id = ${userId} OR recipient_id = ${userId}
        GROUP BY other_user_id
      ) t
      JOIN users u ON u.id = t.other_user_id
      ORDER BY last_at DESC
    `);
    const result = (rows as any).rows ?? rows;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/messages/:userId — thread with a specific user
router.get('/:userId', requireUser, async (req: Request, res: Response) => {
  const currentUserId = (req as any).userId as number;
  const otherId = parseInt(req.params.userId);
  if (isNaN(otherId)) { res.status(400).json({ error: 'Invalid user id' }); return; }

  try {
    const thread = await db
      .select()
      .from(messages)
      .where(
        or(
          and(eq(messages.sender_id, currentUserId), eq(messages.recipient_id, otherId)),
          and(eq(messages.sender_id, otherId), eq(messages.recipient_id, currentUserId)),
        )
      )
      .orderBy(messages.created_at);

    // Mark received messages as read
    await db
      .update(messages)
      .set({ read: true })
      .where(and(eq(messages.recipient_id, currentUserId), eq(messages.sender_id, otherId)));

    res.json(thread);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/messages — send a message
router.post('/', requireUser, async (req: Request, res: Response) => {
  const senderId = (req as any).userId as number;
  const { recipient_id, body } = req.body;

  if (!recipient_id || !body?.trim()) {
    res.status(400).json({ error: 'recipient_id and body are required' });
    return;
  }

  try {
    const allowed = await canMessage(senderId, recipient_id);
    if (!allowed) {
      res.status(403).json({ error: 'You can only message verified contacts.' });
      return;
    }

    const [message] = await db
      .insert(messages)
      .values({ sender_id: senderId, recipient_id, body: body.trim() })
      .returning();

    // Push notification to recipient
    const [recipient] = await db
      .select({ push_token: users.push_token, display_name: users.display_name })
      .from(users)
      .where(eq(users.id, recipient_id));

    const [sender] = await db
      .select({ display_name: users.display_name, user_code: users.user_code })
      .from(users)
      .where(eq(users.id, senderId));

    if (recipient?.push_token) {
      const senderName = sender?.display_name ?? sender?.user_code ?? 'Someone';
      sendPushNotification(recipient.push_token, {
        title: senderName,
        body: body.trim(),
        data: { screen: 'messages', user_id: senderId },
      }).catch(() => {});
    }

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
