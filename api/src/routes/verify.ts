import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { orders, users, legitimacyEvents } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';

const router = Router();

// POST /api/verify/nfc
router.post('/nfc', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const { nfc_token } = req.body;
  if (!nfc_token) {
    res.status(400).json({ error: 'nfc_token is required' });
    return;
  }

  try {
    const [order] = await db.select().from(orders).where(eq(orders.nfc_token, nfc_token));

    if (!order) {
      res.status(403).json({ error: 'This token is invalid or has already been used.' });
      return;
    }

    const now = new Date();

    const [currentUser] = await db.select({ user_code: users.user_code }).from(users).where(eq(users.id, user_id));
    const fraiseChatEmail = currentUser?.user_code ? `${currentUser.user_code}@fraise.chat` : null;

    await db.transaction(async (tx) => {
      // Atomic claim: only succeeds if nfc_token_used is still false
      const [claimed] = await tx.update(orders)
        .set({ nfc_token_used: true, nfc_verified_at: now })
        .where(and(eq(orders.id, order.id), eq(orders.nfc_token_used, false)))
        .returning({ id: orders.id });

      if (!claimed) {
        throw Object.assign(new Error('already_used'), { code: 'already_used' });
      }

      await tx.update(users)
        .set({
          verified: true,
          verified_at: now,
          verified_by: 'nfc',
          ...(fraiseChatEmail ? { fraise_chat_email: fraiseChatEmail } : {}),
        })
        .where(eq(users.id, user_id));

      await tx.insert(legitimacyEvents).values({
        user_id,
        event_type: 'nfc_verified',
        weight: 5,
      });
    });

    // Create per-user forwarding rule in ImprovMX
    if (fraiseChatEmail && currentUser?.user_code) {
      const appleEmail = order.customer_email;
      if (appleEmail && process.env.IMPROVMX_API_KEY) {
        fetch('https://api.improvmx.com/v3/domains/fraise.chat/aliases/', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`api:${process.env.IMPROVMX_API_KEY}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ alias: currentUser.user_code, forward: appleEmail }),
        }).catch((err) => { logger.error('ImprovMX alias creation failed', err); });
      }
    }

    res.json({ verified: true, user_id, fraise_chat_email: fraiseChatEmail, unlocked: ['standing_orders', 'campaigns'], quantity: order.quantity });
  } catch (err: any) {
    if (err?.code === 'already_used') {
      res.status(403).json({ error: 'This token is invalid or has already been used.' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/verify/reorder
router.post('/reorder', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const { nfc_token } = req.body;
  if (!nfc_token) {
    res.status(400).json({ error: 'nfc_token is required' });
    return;
  }

  try {
    const [order] = await db.select().from(orders).where(eq(orders.nfc_token, nfc_token));

    if (!order || !order.nfc_token_used) {
      res.status(403).json({ error: 'This token is invalid or has already been used.' });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, user_id));
    if (!user || !user.verified) {
      res.status(403).json({ error: 'This token is invalid or has already been used.' });
      return;
    }

    res.json({
      variety_id: order.variety_id,
      chocolate: order.chocolate,
      finish: order.finish,
      quantity: order.quantity,
      location_id: order.location_id,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
