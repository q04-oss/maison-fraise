import { Router, Request, Response } from 'express';
import { eq, sql, and, desc, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import { db } from '../db';
import { orders, varieties, timeSlots, batches, legitimacyEvents, users, referralCodes, locations, seasonPatronages, patronTokens, messages, businesses } from '../db/schema';
import { stripe } from '../lib/stripe';
import { sendOrderConfirmation, sendOrderQueued } from '../lib/resend';
import { sendPushNotification } from '../lib/push';
import { logger } from '../lib/logger';
import { requireUser, requireDevice } from '../lib/auth';
import { checkAndTriggerBatch, MIN_QUANTITY } from '../lib/batchTrigger';

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
    chocolate,
    finish,
    quantity,
    is_gift,
    customer_email,
    push_token,
    gift_note,
  } = req.body;

  if (!variety_id || !location_id || !chocolate || !finish || !quantity || !customer_email) {
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

    const total_cents = variety.price_cents * quantity;

    let stripePaymentIntentId: string;
    let clientSecret: string;

    if (isReview) {
      stripePaymentIntentId = `review_${randomUUID()}`;
      clientSecret = 'review_secret';
    } else {
      // Manual capture: authorizes the card now, captures only when batch triggers
      const paymentIntent = await stripe.paymentIntents.create({
        amount: total_cents,
        currency: 'cad',
        capture_method: 'manual',
        receipt_email: customer_email,
        metadata: { variety_id: String(variety_id), location_id: String(location_id) },
      }, { idempotencyKey: `order-${customer_email}-${variety_id}-${location_id}-${Date.now()}` });
      stripePaymentIntentId = paymentIntent.id;
      clientSecret = paymentIntent.client_secret!;
    }

    const [order] = await db
      .insert(orders)
      .values({
        variety_id,
        location_id,
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
  } catch (err: any) {
    logger.error('Order creation error: ' + String(err?.message ?? err));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/orders/:id/confirm — mark order paid after client-side Stripe confirmation
router.post('/:id/confirm', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid order id' }); return; }

  const isReview = isReviewRequest(req);

  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    if (order.status !== 'pending') { res.json(order); return; }

    if (!isReview && order.stripe_payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
      // Accept requires_capture (manual) or succeeded (immediate — legacy/review)
      if (pi.status !== 'requires_capture' && pi.status !== 'succeeded') {
        res.status(402).json({ error: 'payment_not_confirmed' });
        return;
      }
    }

    // User upsert + legitimacy
    let dbUserId: number | undefined;
    try {
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, order.customer_email));
      if (existing) {
        dbUserId = existing.id;
      } else {
        const [newUser] = await db.insert(users).values({ email: order.customer_email }).returning({ id: users.id });
        dbUserId = newUser.id;
      }
      if (!isReview && dbUserId) {
        await db.insert(legitimacyEvents).values({ user_id: dbUserId, event_type: 'order_placed', weight: 1 });
      }
    } catch (e) { logger.error('User upsert error (non-fatal)', e); }

    if (isReview) {
      // Review mode: charge immediately, skip queue
      const nfc_token = randomUUID();
      await db.update(orders).set({ status: 'paid', nfc_token, queued_at: new Date(), payment_captured: true }).where(eq(orders.id, id));
      const [updated] = await db.select().from(orders).where(eq(orders.id, id));
      res.json({ ...updated, user_db_id: dbUserId });
      return;
    }

    // Mark as queued — card is authorized, not yet captured
    await db.update(orders).set({ status: 'queued', queued_at: new Date() }).where(eq(orders.id, id));

    // Check if threshold is met — may immediately trigger
    const [variety] = await db.select().from(varieties).where(eq(varieties.id, order.variety_id));
    const { triggered, deliveryDate } = await checkAndTriggerBatch(order.variety_id, order.location_id);

    // Only send "in the queue" email if batch didn't trigger immediately
    // (batchTrigger.ts already sends the batch-confirmed email if triggered)
    if (!triggered && variety) {
      sendOrderQueued({
        to: order.customer_email,
        varietyName: variety.name,
        chocolate: order.chocolate,
        finish: order.finish,
        quantity: order.quantity,
        totalCents: order.total_cents,
      }).catch(() => {});
    }

    // Fetch final state of this order (may now be 'paid' if batch just triggered)
    const [updated] = await db.select().from(orders).where(eq(orders.id, id));
    let queued_boxes: number;
    if (triggered) {
      queued_boxes = MIN_QUANTITY;
    } else {
      const queuedRows = await db.select({ qty: orders.quantity }).from(orders).where(and(eq(orders.variety_id, order.variety_id), eq(orders.location_id, order.location_id), eq(orders.status, 'queued')));
      queued_boxes = queuedRows.reduce((s, r) => s + r.qty, 0);
    }
    res.json({ ...updated, delivery_date: deliveryDate ?? null, user_db_id: dbUserId, queued_boxes, min_quantity: MIN_QUANTITY });
  } catch (err) {
    logger.error('Order confirm error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/orders/payment-intent — create a Stripe PaymentIntent for a new order (public, no admin PIN)
router.post('/payment-intent', async (req: Request, res: Response) => {
  const {
    variety_id,
    quantity,
    location_id,
    chocolate,
    finish,
    is_gift,
    gift_note,
    customer_email,
  } = req.body;

  if (!variety_id || !quantity || !location_id || !chocolate || !finish || !customer_email) {
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
    res.status(500).json({ error: 'Internal server error' });
  }
});


// POST /api/orders/pay-with-balance — pay for an order using ad_balance_cents
// Atomically deducts the balance and confirms the order immediately (no Stripe)
router.post('/pay-with-balance', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const {
    variety_id, location_id,
    chocolate, finish, quantity, is_gift, gift_note, push_token,
  } = req.body;

  if (!variety_id || !location_id || !chocolate || !finish || !quantity) {
    res.status(400).json({ error: 'Missing required fields' }); return;
  }

  try {
    const [currentUser] = await db.select({ email: users.email, ad_balance_cents: users.ad_balance_cents, referred_by_code: users.referred_by_code })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser) { res.status(401).json({ error: 'unauthorized' }); return; }

    const [variety] = await db.select().from(varieties).where(eq(varieties.id, variety_id));
    if (!variety || !variety.active) { res.status(404).json({ error: 'Variety not found' }); return; }

    if (variety.stock_remaining < quantity) { res.status(409).json({ error: 'insufficient_stock', available: variety.stock_remaining }); return; }

    let total_cents = variety.price_cents * quantity;

    // Apply referral discount if applicable (first order only)
    let discount_applied = false;
    if (currentUser.referred_by_code) {
      const [prior] = await db.select({ id: orders.id }).from(orders)
        .where(and(eq(orders.customer_email, currentUser.email), eq(orders.discount_applied, true))).limit(1);
      if (!prior) { total_cents = Math.round(total_cents * 0.9); discount_applied = true; }
    }

    // Atomically deduct balance — fails if insufficient
    const deducted = await db.update(users)
      .set({ ad_balance_cents: sql`${users.ad_balance_cents} - ${total_cents}` })
      .where(and(eq(users.id, userId), sql`${users.ad_balance_cents} >= ${total_cents}`))
      .returning({ ad_balance_cents: users.ad_balance_cents });
    if (!deducted.length) { res.status(402).json({ error: 'insufficient_balance' }); return; }

    // Create order in queued state (balance is already deducted above as the "hold")
    const [order] = await db.insert(orders).values({
      variety_id, location_id, chocolate, finish,
      quantity, is_gift: is_gift ?? false, total_cents,
      stripe_payment_intent_id: `balance_${randomUUID()}`,
      status: 'queued', queued_at: new Date(),
      customer_email: currentUser.email,
      push_token: push_token ?? null, gift_note: gift_note ?? null,
      discount_applied, payment_captured: true,
    }).returning();

    // Legitimacy event
    await db.insert(legitimacyEvents).values({ user_id: userId, event_type: 'order_placed', weight: 1 }).catch(() => {});

    // Check if this tips over the threshold
    const { triggered, deliveryDate } = await checkAndTriggerBatch(variety_id, location_id);

    // Only send "in the queue" email if batch didn't trigger immediately
    if (!triggered) {
      sendOrderQueued({
        to: currentUser.email,
        varietyName: variety.name,
        chocolate: order.chocolate,
        finish: order.finish,
        quantity: order.quantity,
        totalCents: total_cents,
      }).catch(() => {});
    }
    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));

    res.status(201).json({ ...updated, delivery_date: deliveryDate ?? null, user_db_id: userId });
  } catch (err) {
    logger.error('Balance order error: ' + String(err));
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/orders?email= — orders by customer email, enriched with variety/slot
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;

  try {
    const [currentUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser) { res.status(401).json({ error: 'unauthorized' }); return; }
    const email = currentUser.email;

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
      .orderBy(orders.created_at)
      .limit(50);
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
        location_id: orders.location_id,
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

    let worker: { id: number; display_name: string | null; portrait_url: string | null } | null = null;
    if (row.worker_id !== null && row.worker_id !== undefined) {
      const [w] = await db
        .select({ id: users.id, display_name: users.display_name, portrait_url: users.portrait_url })
        .from(users)
        .where(eq(users.id, row.worker_id))
        .limit(1);
      if (w) worker = w;
    }

    // Look up season patron for this location and current year
    let season_patron: { display_name: string | null; user_id: number } | null = null;
    if (row.location_id !== null && row.location_id !== undefined) {
      const currentYear = new Date().getFullYear();
      const [patronageRow] = await db
        .select({
          patron_user_id: seasonPatronages.patron_user_id,
          display_name: users.display_name,
        })
        .from(seasonPatronages)
        .leftJoin(users, eq(seasonPatronages.patron_user_id, users.id))
        .where(
          and(
            eq(seasonPatronages.location_id, row.location_id),
            eq(seasonPatronages.season_year, currentYear),
            eq(seasonPatronages.status, 'claimed'),
          )
        )
        .limit(1);

      if (patronageRow?.patron_user_id !== null && patronageRow?.patron_user_id !== undefined) {
        season_patron = {
          display_name: patronageRow.display_name ?? null,
          user_id: patronageRow.patron_user_id,
        };
      }
    }

    res.json({
      id: row.id,
      variety_name: row.variety_name,
      price_cents: row.price_cents,
      location_name: row.location_name,
      created_at: row.created_at,
      nfc_token: row.nfc_token,
      worker,
      season_patron,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Device collect endpoint ───────────────────────────────────────────────────

// POST /api/orders/:nfc_token/collect
// Called by employee/chocolatier Cardputer after scanning a customer's NFC tag.
// Auth: Fraise <address>:<signature>  (device auth)
router.post('/:nfc_token/collect', requireDevice, async (req: Request, res: Response) => {
  const { nfc_token } = req.params;
  const deviceRole: string = (req as any).deviceRole;

  // Only operational devices may mark orders as collected
  if (deviceRole !== 'employee' && deviceRole !== 'chocolatier') {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return;
  }

  if (!nfc_token || !/^[0-9a-fA-F]{64}$/.test(nfc_token)) {
    res.status(400).json({ ok: false, error: 'invalid_token' });
    return;
  }

  try {
    const [order] = await db
      .select({
        id: orders.id,
        status: orders.status,
        nfc_token_used: orders.nfc_token_used,
        quantity: orders.quantity,
        customer_name: users.display_name,
        variety_name: varieties.name,
        push_token: orders.push_token,
      })
      .from(orders)
      .leftJoin(users, eq(orders.apple_id, users.apple_id))
      .leftJoin(varieties, eq(orders.variety_id, varieties.id))
      .where(eq(orders.nfc_token, nfc_token))
      .limit(1);

    if (!order) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }

    if (order.nfc_token_used) {
      res.status(409).json({ ok: false, error: 'already_claimed' });
      return;
    }

    if (order.status !== 'paid' && order.status !== 'ready') {
      res.status(409).json({ ok: false, error: 'not_ready' });
      return;
    }

    await db
      .update(orders)
      .set({
        status: 'collected',
        nfc_token_used: true,
        nfc_verified_at: new Date(),
      })
      .where(eq(orders.id, order.id));

    // Notify customer
    if (order.push_token) {
      sendPushNotification(order.push_token, { title: '🍓 Collected', body: 'Your order has been picked up. Enjoy!' }).catch(() => {});
    }

    logger.info(`order ${order.id} collected by device ${(req as any).deviceAddress}`);

    res.json({
      ok: true,
      customer_name: order.customer_name ?? 'Customer',
      variety_name:  order.variety_name ?? 'Order',
      quantity:      order.quantity,
    });
  } catch (err) {
    logger.error('collect error', err);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

export default router;
// @final-audit
