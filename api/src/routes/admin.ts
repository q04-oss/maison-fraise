import { Router, Request, Response, NextFunction } from 'express';
import { eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { orders, varieties, timeSlots, campaigns, campaignSignups, businesses, users, legitimacyEvents } from '../db/schema';
import { logger } from '../lib/logger';
import { sendOrderReady } from '../lib/resend';

const router = Router();

const VALID_STATUSES = ['pending', 'paid', 'preparing', 'ready', 'collected', 'cancelled'] as const;

function requirePin(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers['x-admin-pin'];
  if (!pin || pin !== process.env.ADMIN_PIN) {
    res.status(401).json({ error: 'Invalid or missing X-Admin-PIN header' });
    return;
  }
  next();
}

router.use(requirePin);

// GET /api/admin/orders — all orders enriched with variety name and slot time
router.get('/orders', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: orders.id,
        variety_id: orders.variety_id,
        variety_name: varieties.name,
        location_id: orders.location_id,
        time_slot_id: orders.time_slot_id,
        slot_date: timeSlots.date,
        slot_time: timeSlots.time,
        chocolate: orders.chocolate,
        finish: orders.finish,
        quantity: orders.quantity,
        is_gift: orders.is_gift,
        total_cents: orders.total_cents,
        stripe_payment_intent_id: orders.stripe_payment_intent_id,
        status: orders.status,
        customer_email: orders.customer_email,
        created_at: orders.created_at,
      })
      .from(orders)
      .leftJoin(varieties, eq(orders.variety_id, varieties.id))
      .leftJoin(timeSlots, eq(orders.time_slot_id, timeSlots.id))
      .orderBy(orders.created_at);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function sendReadyNotification(pushToken: string, orderSummary: string) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title: 'Your order is ready.',
        body: `${orderSummary} — ready for collection at Marché Atwater.`,
        sound: 'default',
      }),
    });
  } catch (err) {
    logger.error('Push notification failed', err);
  }
}

// PATCH /api/admin/orders/:id/status — update order status
router.patch('/orders/:id/status', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid order id' });
    return;
  }

  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }

  try {
    const [updated] = await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    // Send push notification + email when order becomes ready
    if (status === 'ready') {
      const [variety] = await db.select({ name: varieties.name }).from(varieties).where(eq(varieties.id, updated.variety_id));
      const [slot] = await db.select({ time: timeSlots.time }).from(timeSlots).where(eq(timeSlots.id, updated.time_slot_id));
      const varietyName = variety?.name ?? 'your order';

      if (updated.push_token) {
        const summary = `${updated.quantity}× ${varietyName}`;
        sendReadyNotification(updated.push_token, summary); // fire-and-forget
      }

      sendOrderReady({
        to: updated.customer_email,
        varietyName,
        quantity: updated.quantity,
        slotTime: slot?.time ?? '',
      }).catch(err => logger.error('Ready email failed', err));
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/varieties/:id/stock — update stock level
router.patch('/varieties/:id/stock', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid variety id' });
    return;
  }

  const { stock_remaining } = req.body;
  if (typeof stock_remaining !== 'number' || !Number.isInteger(stock_remaining) || stock_remaining < 0) {
    res.status(400).json({ error: 'stock_remaining must be a non-negative integer' });
    return;
  }

  try {
    const [updated] = await db
      .update(varieties)
      .set({ stock_remaining })
      .where(eq(varieties.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'Variety not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/campaigns
router.post('/campaigns', async (req: Request, res: Response) => {
  const { title, concept, salon_id, paying_client_id, date, total_spots } = req.body;
  if (!title || !concept || !salon_id || !date || !total_spots) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    const [campaign] = await db.insert(campaigns).values({
      title,
      concept,
      salon_id,
      paying_client_id: paying_client_id ?? null,
      date: new Date(date),
      total_spots,
      spots_remaining: total_spots,
      status: 'upcoming',
    }).returning();
    res.status(201).json(campaign);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/campaigns/:id
router.patch('/campaigns/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const [updated] = await db.update(campaigns).set(req.body).where(eq(campaigns.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/campaigns/:id/signups
router.get('/campaigns/:id/signups', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const rows = await db.select().from(campaignSignups).where(eq(campaignSignups.campaign_id, id));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/nfc-pending
router.get('/nfc-pending', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: orders.id,
        nfc_token: orders.nfc_token,
        nfc_token_used: orders.nfc_token_used,
        customer_email: orders.customer_email,
        created_at: orders.created_at,
      })
      .from(orders)
      .where(eq(orders.nfc_token_used, false));
    const pending = rows.filter(r => r.nfc_token !== null);
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/businesses
router.post('/businesses', async (req: Request, res: Response) => {
  const { name, type, address, city, hours, contact, latitude, longitude, launched_at } = req.body;
  if (!name || !type || !address || !city || !launched_at) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    const [business] = await db.insert(businesses).values({
      name,
      type,
      address,
      city,
      hours: hours ?? null,
      contact: contact ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      launched_at: new Date(launched_at),
    }).returning();
    res.status(201).json(business);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id/photographed
router.patch('/users/:id/photographed', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const [updated] = await db.update(users)
      .set({ photographed: true })
      .where(eq(users.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    await db.insert(legitimacyEvents).values({
      user_id: id,
      event_type: 'photographed',
      weight: 4,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
