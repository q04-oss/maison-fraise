import { Router, Request, Response } from 'express';
import { eq, sql, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import { db } from '../db';
import { orders, varieties, timeSlots, legitimacyEvents, users, referralCodes, locations } from '../db/schema';
import { stripe } from '../lib/stripe';
import { sendOrderConfirmation } from '../lib/resend';
import { logger } from '../lib/logger';
import { requireUser } from '../lib/auth';

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
    gift_note,
  } = req.body;

  if (!variety_id || !location_id || !time_slot_id || !chocolate || !finish || !quantity || !customer_email) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const isReview = isReviewRequest(req);

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

    let stripePaymentIntentId: string;
    let clientSecret: string;

    if (isReview) {
      // Skip Stripe entirely in review mode
      stripePaymentIntentId = `review_${randomUUID()}`;
      clientSecret = 'review_secret';
    } else {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: total_cents,
        currency: 'cad',
        receipt_email: customer_email,
        metadata: {
          variety_id: String(variety_id),
          time_slot_id: String(time_slot_id),
        },
      });
      stripePaymentIntentId = paymentIntent.id;
      clientSecret = paymentIntent.client_secret!;
    }

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
        stripe_payment_intent_id: stripePaymentIntentId,
        status: 'pending',
        customer_email,
        push_token: push_token ?? null,
        gift_note: gift_note ?? null,
      })
      .returning();

    res.status(201).json({ order, client_secret: clientSecret });
  } catch (err) {
    logger.error('Order creation error', err);
    res.status(500).json({ error: 'Internal server error', detail: String(err) });
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

    // Stripe confirmation already happened client-side via presentPaymentSheet.
    // No need to re-verify — if the client got here, payment was collected.

    const nfc_token = randomUUID();

    // Mark order paid and update inventory
    await db.update(orders).set({ status: 'paid', nfc_token }).where(eq(orders.id, id));
    if (!isReview) {
      await db
        .update(varieties)
        .set({ stock_remaining: sql`${varieties.stock_remaining} - ${order.quantity}` })
        .where(eq(varieties.id, order.variety_id));
      await db
        .update(timeSlots)
        .set({ booked: sql`${timeSlots.booked} + ${order.quantity}` })
        .where(eq(timeSlots.id, order.time_slot_id));
    }

    const [updated] = await db.select().from(orders).where(eq(orders.id, id));

    // User upsert + legitimacy event — non-blocking, don't fail the response
    let dbUserId: number | undefined;
    try {
      const existingUsers = await db.select({ id: users.id }).from(users).where(eq(users.email, order.customer_email));
      if (existingUsers.length > 0) {
        dbUserId = existingUsers[0].id;
      } else {
        const [newUser] = await db.insert(users).values({ email: order.customer_email }).returning({ id: users.id });
        dbUserId = newUser.id;
      }
      if (!isReview && dbUserId) {
        await db.insert(legitimacyEvents).values({ user_id: dbUserId, event_type: 'order_placed', weight: 1 });
      }
    } catch (userErr) {
      logger.error('User upsert/legitimacy error (non-fatal)', userErr);
    }

    // Send confirmation email — fire-and-forget
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
    res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
});

// POST /api/orders/payment-intent — create a Stripe PaymentIntent for a new order (public, no admin PIN)
router.post('/payment-intent', async (req: Request, res: Response) => {
  const {
    variety_id,
    quantity,
    location_id,
    time_slot_id,
    chocolate,
    finish,
    is_gift,
    gift_note,
    customer_email,
  } = req.body;

  if (!variety_id || !quantity || !location_id || !time_slot_id || !chocolate || !finish || !customer_email) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const [variety] = await db.select().from(varieties).where(eq(varieties.id, variety_id));
    if (!variety || !variety.active) {
      res.status(404).json({ error: 'Variety not found' });
      return;
    }

    // Stock guard
    if (variety.stock_remaining <= 0) {
      res.status(409).json({ error: 'sold_out' });
      return;
    }
    if (variety.stock_remaining < quantity) {
      res.status(409).json({ error: 'insufficient_stock', available: variety.stock_remaining });
      return;
    }

    let total_cents = variety.price_cents * quantity;

    // Referral discount: apply 10% if user has a referral code and no prior discount applied
    let discount_applied = false;
    const [userRow] = await db
      .select({ referred_by_code: users.referred_by_code })
      .from(users)
      .where(eq(users.email, customer_email));

    if (userRow?.referred_by_code) {
      // Check if any of their previous orders already had a discount applied
      const discountedOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.customer_email, customer_email), eq(orders.discount_applied, true)))
        .limit(1);

      if (discountedOrders.length === 0) {
        total_cents = Math.round(total_cents * 0.9);
        discount_applied = true;
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: total_cents,
      currency: 'cad',
      metadata: {
        variety_id: String(variety_id),
        quantity: String(quantity),
        location_id: String(location_id),
        time_slot_id: String(time_slot_id),
        chocolate: String(chocolate),
        finish: String(finish),
        is_gift: String(is_gift ?? false),
        gift_note: gift_note ?? '',
        customer_email: String(customer_email),
        discount_applied: String(discount_applied),
      },
    });

    res.status(201).json({ client_secret: paymentIntent.client_secret, total_cents, discount_applied });
  } catch (err) {
    logger.error('Payment intent creation error', err);
    res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
});

// GET /api/orders/by-email/:email — most recent paid order for an email (iOS polls after PaymentSheet)
router.get('/by-email/:email', async (req: Request, res: Response) => {
  const email = req.params.email;
  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  try {
    const [order] = await db
      .select({
        id: orders.id,
        variety_id: orders.variety_id,
        variety_name: varieties.name,
        location_id: orders.location_id,
        time_slot_id: orders.time_slot_id,
        chocolate: orders.chocolate,
        finish: orders.finish,
        quantity: orders.quantity,
        is_gift: orders.is_gift,
        total_cents: orders.total_cents,
        status: orders.status,
        nfc_token: orders.nfc_token,
        gift_note: orders.gift_note,
        created_at: orders.created_at,
      })
      .from(orders)
      .leftJoin(varieties, eq(orders.variety_id, varieties.id))
      .where(and(eq(orders.customer_email, email), eq(orders.status, 'paid')))
      .orderBy(desc(orders.created_at))
      .limit(1);

    if (!order) {
      res.status(404).json({ error: 'No paid order found for this email' });
      return;
    }

    res.json(order);
  } catch (err) {
    logger.error('by-email lookup error', err);
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
        variety_id: orders.variety_id,
        variety_name: varieties.name,
        price_cents: varieties.price_cents,
        location_id: orders.location_id,
        chocolate: orders.chocolate,
        finish: orders.finish,
        quantity: orders.quantity,
        is_gift: orders.is_gift,
        total_cents: orders.total_cents,
        status: orders.status,
        gift_note: orders.gift_note,
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

// POST /api/orders/:id/rate — rate a collected order (1-5 stars)
router.post('/:id/rate', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid order id' }); return; }

  const user_id = (req as any).userId as number;
  const { rating, note } = req.body;

  if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
    return;
  }

  try {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, user_id));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    if (order.customer_email !== user.email) { res.status(403).json({ error: 'Forbidden' }); return; }
    if (order.status !== 'collected') { res.status(400).json({ error: 'Order must be collected before rating' }); return; }

    const [updated] = await db
      .update(orders)
      .set({ rating, rating_note: note ?? null })
      .where(eq(orders.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    logger.error('Order rating error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/orders/:id/receipt — order receipt with worker info (requireUser, own orders only)
router.get('/:id/receipt', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid order id' }); return; }
  const userId = (req as any).userId as number;

  try {
    const [currentUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser) { res.status(401).json({ error: 'unauthorized' }); return; }

    // Fetch order with variety and location
    const [row] = await db
      .select({
        id: orders.id,
        variety_name: varieties.name,
        price_cents: varieties.price_cents,
        location_name: locations.name,
        created_at: orders.created_at,
        nfc_token: orders.nfc_token,
        customer_email: orders.customer_email,
        worker_id: orders.worker_id,
      })
      .from(orders)
      .leftJoin(varieties, eq(orders.variety_id, varieties.id))
      .leftJoin(locations, eq(orders.location_id, locations.id))
      .where(eq(orders.id, id))
      .limit(1);

    if (!row) { res.status(404).json({ error: 'Order not found' }); return; }
    if (row.customer_email !== currentUser.email) { res.status(403).json({ error: 'forbidden' }); return; }

    let worker: { id: number; display_name: string | null; portrait_url: string | null; portal_opted_in: boolean } | null = null;
    if (row.worker_id !== null && row.worker_id !== undefined) {
      const [w] = await db
        .select({ id: users.id, display_name: users.display_name, portrait_url: users.portrait_url, portal_opted_in: users.portal_opted_in })
        .from(users)
        .where(eq(users.id, row.worker_id))
        .limit(1);
      if (w) worker = w;
    }

    res.json({
      id: row.id,
      variety_name: row.variety_name,
      price_cents: row.price_cents,
      location_name: row.location_name,
      created_at: row.created_at,
      nfc_token: row.nfc_token,
      worker,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;