import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { orders, varieties, timeSlots, legitimacyEvents, users } from '../db/schema';
import { stripe, stripeTest } from '../lib/stripe';
import { sendOrderConfirmation } from '../lib/resend';
import { logger } from '../lib/logger';

const router = Router();

function isReviewRequest(req: Request): boolean {
  const pin = req.headers['x-review-mode'];
  return typeof pin === 'string' && pin === process.env.REVIEW_PIN && !!process.env.REVIEW_PIN;
}

// POST /api/orders — create order + Stripe payment intent
router.post('/', async (req: Request, res: Response) => {
  const {
    variety_id,
    location_id,
    time_slot_id,
    chocolate,
    finish,
    quantity,
    is_gift,
    customer_email,
    push_token,
  } = req.body;

  if (!variety_id || !location_id || !time_slot_id || !chocolate || !finish || !quantity || !customer_email) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const isReview = isReviewRequest(req);
  const stripeClient = isReview ? stripeTest : stripe;

  try {
    const [variety] = await db.select().from(varieties).where(eq(varieties.id, variety_id));
    if (!variety || !variety.active) {
      res.status(404).json({ error: 'Variety not found' });
      return;
    }

    // In review mode, skip stock and slot capacity checks
    if (!isReview) {
      if (variety.stock_remaining < quantity) {
        res.status(400).json({ error: 'Insufficient stock' });
        return;
      }

      const [slot] = await db.select().from(timeSlots).where(eq(timeSlots.id, time_slot_id));
      if (!slot) {
        res.status(404).json({ error: 'Time slot not found' });
        return;
      }
      if (slot.capacity - slot.booked < quantity) {
        res.status(400).json({ error: 'Time slot is full' });
        return;
      }
    }

    const total_cents = variety.price_cents * quantity;

    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: total_cents,
      currency: 'cad',
      receipt_email: customer_email,
      metadata: {
        variety_id: String(variety_id),
        time_slot_id: String(time_slot_id),
        review_mode: isReview ? 'true' : 'false',
      },
    });

    const [order] = await db
      .insert(orders)
      .values({
        variety_id,
        location_id,
        time_slot_id,
        chocolate,
        finish,
        quantity,
        is_gift: is_gift ?? false,
        total_cents,
        stripe_payment_intent_id: paymentIntent.id,
        status: 'pending',
        customer_email,
        push_token: push_token ?? null,
      })
      .returning();

    res.status(201).json({ order, client_secret: paymentIntent.client_secret });
  } catch (err) {
    logger.error('Order creation error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/orders/:id/confirm — mark order paid after client-side Stripe confirmation
router.post('/:id/confirm', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid order id' });
    return;
  }

  const isReview = isReviewRequest(req);
  const stripeClient = isReview ? stripeTest : stripe;

  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (order.status !== 'pending') {
      res.status(400).json({ error: 'Order already processed' });
      return;
    }

    // In review mode, skip Stripe verification entirely
    if (!isReview) {
      const pi = await stripeClient.paymentIntents.retrieve(order.stripe_payment_intent_id!);
      if (pi.status !== 'succeeded') {
        res.status(400).json({ error: 'Payment not yet confirmed by Stripe' });
        return;
      }
    }

    const nfc_token = randomUUID();

    // Upsert user by email so we have a stable numeric ID for verification + standing orders
    const existingUsers = await db.select({ id: users.id }).from(users).where(eq(users.email, order.customer_email));
    let dbUserId: number;
    if (existingUsers.length > 0) {
      dbUserId = existingUsers[0].id;
    } else {
      const [newUser] = await db.insert(users).values({ email: order.customer_email }).returning({ id: users.id });
      dbUserId = newUser.id;
    }

    await db.transaction(async (tx) => {
      await tx.update(orders).set({ status: 'paid', nfc_token }).where(eq(orders.id, id));
      // In review mode, skip stock/slot mutations so live inventory is unaffected
      if (!isReview) {
        await tx
          .update(varieties)
          .set({ stock_remaining: sql`${varieties.stock_remaining} - ${order.quantity}` })
          .where(eq(varieties.id, order.variety_id));
        await tx
          .update(timeSlots)
          .set({ booked: sql`${timeSlots.booked} + ${order.quantity}` })
          .where(eq(timeSlots.id, order.time_slot_id));
        await tx.insert(legitimacyEvents).values({
          user_id: dbUserId,
          event_type: 'order_placed',
          weight: 1,
        });
      }
    });

    const [updated] = await db.select().from(orders).where(eq(orders.id, id));

    // Send branded confirmation email (fire-and-forget, skip in review mode)
    if (!isReview) {
      const [slot] = await db.select().from(timeSlots).where(eq(timeSlots.id, order.time_slot_id));
      const [variety] = await db.select().from(varieties).where(eq(varieties.id, order.variety_id));
      if (slot && variety) {
        sendOrderConfirmation({
          to: order.customer_email,
          varietyName: variety.name,
          chocolate: order.chocolate,
          finish: order.finish,
          quantity: order.quantity,
          isGift: order.is_gift,
          totalCents: order.total_cents,
          slotDate: slot.date,
          slotTime: slot.time,
        }).catch((err: unknown) => logger.error('Confirmation email failed', err));
      }
    }

    res.json({ ...updated, nfc_token, user_db_id: dbUserId });
  } catch (err) {
    logger.error('Order confirm error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/orders?email= — orders by customer email, enriched with variety/slot
router.get('/', async (req: Request, res: Response) => {
  const { email } = req.query;
  if (!email) {
    res.status(400).json({ error: 'email query parameter is required' });
    return;
  }

  try {
    const rows = await db
      .select({
        id: orders.id,
        variety_name: varieties.name,
        chocolate: orders.chocolate,
        finish: orders.finish,
        quantity: orders.quantity,
        is_gift: orders.is_gift,
        total_cents: orders.total_cents,
        status: orders.status,
        slot_date: timeSlots.date,
        slot_time: timeSlots.time,
        created_at: orders.created_at,
      })
      .from(orders)
      .leftJoin(varieties, eq(orders.variety_id, varieties.id))
      .leftJoin(timeSlots, eq(orders.time_slot_id, timeSlots.id))
      .where(eq(orders.customer_email, String(email)))
      .orderBy(orders.created_at);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;