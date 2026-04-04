import { Router, Request, Response } from 'express';
import { eq, sql, and, desc, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import { db } from '../db';
import { orders, varieties, timeSlots, legitimacyEvents, users, referralCodes, locations, seasonPatronages, patronTokens, messages, businesses } from '../db/schema';
import { stripe } from '../lib/stripe';
import { sendOrderConfirmation } from '../lib/resend';
import { sendPushNotification } from '../lib/push';
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
      }, { idempotencyKey: `order-${customer_email}-${variety_id}-${time_slot_id}-${quantity}` });
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
  } catch (err: any) {
    logger.error('Order creation error: ' + String(err?.message ?? err));
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

  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (order.status !== 'pending') {
      // Already processed — return the full order so iOS app can read id, nfc_token, total_cents
      res.json(order);
      return;
    }

    // Verify with Stripe that payment was actually collected before marking paid.
    if (!isReview && order.stripe_payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
      if (pi.status !== 'succeeded') {
        res.status(402).json({ error: 'payment_not_confirmed' });
        return;
      }
    }

    const nfc_token = randomUUID();

    // Atomically mark order paid, decrement stock, and increment slot booking
    // Re-check stock inside the transaction to prevent race conditions
    await db.transaction(async (tx) => {
      await tx.update(orders).set({ status: 'paid', nfc_token }).where(eq(orders.id, id));
      if (!isReview) {
        const result = await tx
          .update(varieties)
          .set({ stock_remaining: sql`${varieties.stock_remaining} - ${order.quantity}` })
          .where(and(eq(varieties.id, order.variety_id), sql`${varieties.stock_remaining} >= ${order.quantity}`))
          .returning({ stock_remaining: varieties.stock_remaining });
        if (result.length === 0) {
          throw new Error('sold_out');
        }
        await tx
          .update(timeSlots)
          .set({ booked: sql`${timeSlots.booked} + ${order.quantity}` })
          .where(eq(timeSlots.id, order.time_slot_id));
      }
    });

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

    // Open shop thread — fire-and-forget
    if (dbUserId && !isReview) {
      (async () => {
        try {
          const [location] = await db.select({ business_id: locations.id }).from(locations).where(eq(locations.id, order.location_id));
          if (!location) return;
          // Find the shop user account linked to this business
          const [shopUser] = await db
            .select({ id: users.id, display_name: users.display_name, push_token: users.push_token })
            .from(users)
            .where(and(eq(users.is_shop, true), eq(users.business_id, location.business_id ?? order.location_id)));
          if (!shopUser) return;
          const [variety] = await db.select({ name: varieties.name }).from(varieties).where(eq(varieties.id, order.variety_id));
          const [slot] = await db.select({ time: timeSlots.time, date: timeSlots.date }).from(timeSlots).where(eq(timeSlots.id, order.time_slot_id));
          const timeStr = slot?.time ? slot.time.substring(0, 5) : '';
          const body = `Order received — ${variety?.name ?? 'your order'} ready at ${timeStr}. See you then.`;
          await db.insert(messages).values({
            sender_id: shopUser.id,
            recipient_id: dbUserId,
            body,
            order_id: order.id,
          });
          if (shopUser.push_token) {
            sendPushNotification(shopUser.push_token, {
              title: 'New order',
              body: `Order #${order.id} placed`,
              data: { screen: 'messages', user_id: dbUserId },
            }).catch(() => {});
          }
        } catch (threadErr) {
          logger.error('Order thread creation failed (non-fatal)', threadErr);
        }
      })();
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

      // Send low stock alert to active workers when stock drops to 3 or fewer
      if (variety && variety.stock_remaining <= 3) {
        const activeWorkers = await db
          .select({ push_token: users.push_token })
          .from(users)
          .where(and(eq(users.worker_status, 'active'), isNotNull(users.push_token)));
        for (const worker of activeWorkers) {
          if (worker.push_token) {
            sendPushNotification(worker.push_token, {
              title: 'Low Stock',
              body: `${variety.name} is down to ${variety.stock_remaining} remaining`,
            }).catch((err: unknown) => logger.error('Low stock push failed', err));
          }
        }
      }
    }

    res.json({ ...updated, nfc_token, user_db_id: dbUserId });
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
    res.status(500).json({ error: 'Internal server error' });
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

export default router;