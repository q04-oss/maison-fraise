import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { orders, varieties, timeSlots } from '../db/schema';
import { stripe } from '../lib/stripe';

const router = Router();

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
  } = req.body;

  if (!variety_id || !location_id || !time_slot_id || !chocolate || !finish || !quantity || !customer_email) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const [variety] = await db.select().from(varieties).where(eq(varieties.id, variety_id));
    if (!variety || !variety.active) {
      res.status(404).json({ error: 'Variety not found' });
      return;
    }
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

    const total_cents = variety.price_cents * quantity;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: total_cents,
      currency: 'cad',
      receipt_email: customer_email,
      metadata: {
        variety_id: String(variety_id),
        time_slot_id: String(time_slot_id),
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
      })
      .returning();

    res.status(201).json({ order, client_secret: paymentIntent.client_secret });
  } catch (err) {
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

    const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id!);
    if (pi.status !== 'succeeded') {
      res.status(400).json({ error: 'Payment not yet confirmed by Stripe' });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(orders).set({ status: 'paid' }).where(eq(orders.id, id));
      await tx
        .update(varieties)
        .set({ stock_remaining: sql`${varieties.stock_remaining} - ${order.quantity}` })
        .where(eq(varieties.id, order.variety_id));
      await tx
        .update(timeSlots)
        .set({ booked: sql`${timeSlots.booked} + ${order.quantity}` })
        .where(eq(timeSlots.id, order.time_slot_id));
    });

    const [updated] = await db.select().from(orders).where(eq(orders.id, id));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/orders?email= — orders by customer email
router.get('/', async (req: Request, res: Response) => {
  const { email } = req.query;
  if (!email) {
    res.status(400).json({ error: 'email query parameter is required' });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.customer_email, String(email)))
      .orderBy(orders.created_at);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
