import { Router, Request, Response } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { walkInTokens, orders, varieties, locations } from '../db/schema';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/walkin/inventory?location_id=X — unclaimed tokens at a location grouped by variety
router.get('/inventory', async (req: Request, res: Response) => {
  const location_id = parseInt(req.query.location_id as string, 10);
  if (isNaN(location_id)) { res.status(400).json({ error: 'location_id required' }); return; }
  try {
    const rows = await db
      .select({
        variety_id: walkInTokens.variety_id,
        variety_name: varieties.name,
        price_cents: varieties.price_cents,
        description: varieties.description,
        available: sql<number>`count(*)::int`,
      })
      .from(walkInTokens)
      .innerJoin(varieties, eq(walkInTokens.variety_id, varieties.id))
      .where(and(
        eq(walkInTokens.location_id, location_id),
        eq(walkInTokens.claimed, false),
      ))
      .groupBy(walkInTokens.variety_id, varieties.name, varieties.price_cents, varieties.description);
    res.json(rows);
  } catch (err) {
    logger.error('Walk-in inventory error: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/walkin/:token — look up a walk-in token, return location + variety info
// If claimed, returns claimed status + owner email so app can check ownership
router.get('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const [row] = await db
      .select({
        id: walkInTokens.id,
        token: walkInTokens.token,
        claimed: walkInTokens.claimed,
        claimed_order_id: walkInTokens.claimed_order_id,
        location_id: walkInTokens.location_id,
        location_name: locations.name,
        variety_id: walkInTokens.variety_id,
        variety_name: varieties.name,
        price_cents: varieties.price_cents,
        description: varieties.description,
        stock_remaining: varieties.stock_remaining,
      })
      .from(walkInTokens)
      .innerJoin(locations, eq(walkInTokens.location_id, locations.id))
      .innerJoin(varieties, eq(walkInTokens.variety_id, varieties.id))
      .where(eq(walkInTokens.token, token));

    if (!row) { res.status(404).json({ error: 'not_found' }); return; }

    // Claimed — return owner email so app can check if this is their box
    if (row.claimed && row.claimed_order_id) {
      const [order] = await db
        .select({ customer_email: orders.customer_email })
        .from(orders)
        .where(eq(orders.id, row.claimed_order_id));
      res.json({ ...row, owner_email: order?.customer_email ?? null });
      return;
    }

    if (row.stock_remaining <= 0) { res.status(410).json({ error: 'sold_out' }); return; }

    res.json(row);
  } catch (err) {
    logger.error('Walk-in token lookup error: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/walkin/:token/order — claim token + create order + Stripe payment intent
router.post('/:token/order', async (req: Request, res: Response) => {
  const { token } = req.params;
  const { chocolate, finish, customer_email, push_token } = req.body;

  if (!chocolate || !finish || !customer_email) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  try {
    const [row] = await db
      .select({
        id: walkInTokens.id,
        claimed: walkInTokens.claimed,
        location_id: walkInTokens.location_id,
        variety_id: walkInTokens.variety_id,
        price_cents: varieties.price_cents,
        stock_remaining: varieties.stock_remaining,
        variety_name: varieties.name,
      })
      .from(walkInTokens)
      .innerJoin(varieties, eq(walkInTokens.variety_id, varieties.id))
      .where(eq(walkInTokens.token, token));

    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    if (row.claimed) { res.status(410).json({ error: 'already_claimed' }); return; }
    if (row.stock_remaining <= 0) { res.status(410).json({ error: 'sold_out' }); return; }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: row.price_cents,
      currency: 'cad',
      receipt_email: customer_email,
      metadata: { walk_in_token: token, variety_id: String(row.variety_id) },
    }, { idempotencyKey: `walkin-${token}-${customer_email}` });

    const [order] = await db
      .insert(orders)
      .values({
        variety_id: row.variety_id,
        location_id: row.location_id,
        time_slot_id: null,
        walk_in: true,
        chocolate,
        finish,
        quantity: 1,
        total_cents: row.price_cents,
        stripe_payment_intent_id: paymentIntent.id,
        status: 'pending',
        customer_email,
        push_token: push_token ?? null,
        nfc_token: token,
      })
      .returning();

    // Mark token as claimed
    await db
      .update(walkInTokens)
      .set({ claimed: true, claimed_order_id: order.id })
      .where(eq(walkInTokens.id, row.id));

    res.status(201).json({ order, client_secret: paymentIntent.client_secret });
  } catch (err) {
    logger.error('Walk-in order creation error: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
