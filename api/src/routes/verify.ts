import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { orders, users, legitimacyEvents, varieties } from '../db/schema';
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

    const [variety] = await db.select({
      id: varieties.id,
      name: varieties.name,
      source_farm: varieties.source_farm,
      harvest_date: varieties.harvest_date,
    }).from(varieties).where(eq(varieties.id, order.variety_id));

    res.json({ verified: true, user_id, fraise_chat_email: fraiseChatEmail, unlocked: ['standing_orders', 'campaigns'], quantity: order.quantity, variety_id: order.variety_id, variety_name: variety?.name ?? null, farm: variety?.source_farm ?? null, harvest_date: variety?.harvest_date ?? null });
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

    // Security: verify the requesting user was the one who originally claimed this token
    const [claimEvent] = await db.select({ id: legitimacyEvents.id })
      .from(legitimacyEvents)
      .where(and(eq(legitimacyEvents.user_id, user_id), eq(legitimacyEvents.event_type, 'nfc_verified')));

    if (!claimEvent) {
      res.status(403).json({ error: 'This token is invalid or has already been used.' });
      return;
    }

    const [variety] = await db.select({
      id: varieties.id,
      name: varieties.name,
      source_farm: varieties.source_farm,
      harvest_date: varieties.harvest_date,
    }).from(varieties).where(eq(varieties.id, order.variety_id));

    // Feature 3: Collectif pickups today (via collectif_commitments as membership proxy)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const collectifRows = await db.execute(sql`
      SELECT COUNT(DISTINCT le.user_id)::int AS pickup_count
      FROM legitimacy_events le
      JOIN collectif_commitments cc_self ON cc_self.user_id = ${user_id}
      JOIN collectif_commitments cc_other ON cc_other.collectif_id = cc_self.collectif_id
        AND cc_other.user_id = le.user_id
        AND cc_other.user_id != ${user_id}
      WHERE le.event_type = 'nfc_verified'
        AND le.created_at >= ${todayStart}
    `);
    const collectifData = ((collectifRows as any).rows ?? collectifRows)[0];
    const collectifPickupsToday = (collectifData ?? {}).pickup_count ?? 0;

    // Feature 5: Variety streak — count collected orders for this variety by this user
    const countRows = await db.execute(sql`
      SELECT COUNT(*)::int AS order_count
      FROM orders o
      JOIN users u ON u.apple_id = o.apple_id
      WHERE u.id = ${user_id}
        AND o.variety_id = ${order.variety_id}
        AND o.status = 'collected'
    `);
    const orderCount = (((countRows as any).rows ?? countRows)[0]?.order_count) ?? 0;

    res.json({
      variety_id: order.variety_id,
      variety_name: variety?.name ?? null,
      farm: variety?.source_farm ?? null,
      harvest_date: variety?.harvest_date ?? null,
      chocolate: order.chocolate,
      finish: order.finish,
      quantity: order.quantity,
      location_id: order.location_id,
      // Feature 3
      collectif_pickups_today: collectifPickupsToday,
      // Feature 4
      is_gift: order.is_gift ?? false,
      gift_note: order.is_gift ? (order.gift_note ?? null) : null,
      // Feature 5
      order_count: orderCount,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
