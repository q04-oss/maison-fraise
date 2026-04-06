import { Router, Request, Response } from 'express';
import { eq, or, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { standingOrders, users, legitimacyEvents, varieties, orders, membershipFunds, timeSlots } from '../db/schema';
import { stripe } from '../lib/stripe';
import { requireUser } from '../lib/auth';

const router = Router();

async function requireVerified(userId: number, res: Response): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.verified) {
    res.status(403).json({ error: 'Standing orders are available to verified members only. Tap your box to get verified.' });
    return false;
  }
  return true;
}

// Startup migrations for new columns
db.execute(sql`ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS expires_at timestamptz`).catch(() => {});
db.execute(sql`ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS renewal_notified_30_at timestamptz`).catch(() => {});
db.execute(sql`ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS renewal_notified_60_at timestamptz`).catch(() => {});
db.execute(sql`ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS tier text DEFAULT 'standard'`).catch(() => {});
db.execute(sql`ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS gifted_by_user_id integer REFERENCES users(id)`).catch(() => {});
db.execute(sql`ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS recipient_email text`).catch(() => {});
db.execute(sql`ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS gift_message text`).catch(() => {});
db.execute(sql`ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS is_gift_standing_order boolean NOT NULL DEFAULT false`).catch(() => {});

// GET /api/standing-orders/renewal-status — literal before parameterized
router.get('/renewal-status', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT so.id, so.expires_at, so.status, so.quantity, v.name AS variety_name, v.price_cents
      FROM standing_orders so
      JOIN varieties v ON v.id = so.variety_id
      WHERE so.sender_id = ${userId} AND so.status = 'active'
      ORDER BY so.id DESC LIMIT 1
    `);
    const row = ((rows as any).rows ?? rows)[0];
    if (!row) { res.json(null); return; }

    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    const daysUntilExpiry = expiresAt
      ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
    const canRenew = expiresAt ? daysUntilExpiry !== null && daysUntilExpiry <= 60 : false;

    res.json({ ...row, days_until_expiry: daysUntilExpiry, can_renew: canRenew });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/standing-orders/gift — literal before parameterized
router.post('/gift', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { recipient_email, gift_message } = req.body;
  if (!recipient_email) { res.status(400).json({ error: 'recipient_email required' }); return; }
  try {
    const pi = await stripe.paymentIntents.create({
      amount: 29500,
      currency: 'cad',
      metadata: { type: 'standing_order_gift', recipient_email, gifted_by_user_id: String(userId) },
    });
    res.json({ client_secret: pi.client_secret });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/standing-orders
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const {
    recipient_id,
    variety_id,
    chocolate,
    finish,
    quantity,
    location_id,
    time_slot_preference,
    frequency,
    next_order_date,
    gift_tone,
  } = req.body;

  if (!variety_id || !chocolate || !finish || !quantity || !location_id || !time_slot_preference || !frequency || !next_order_date) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 24) {
    res.status(400).json({ error: 'quantity must be between 1 and 24' });
    return;
  }

  try {
    if (!await requireVerified(userId, res)) return;

    if (recipient_id) {
      const [recipient] = await db.select().from(users).where(eq(users.id, recipient_id));
      if (!recipient || !recipient.verified) {
        res.status(403).json({ error: 'Gift recipient must also be a verified member.' });
        return;
      }
    }

    const [standing] = await db.insert(standingOrders).values({
      sender_id: userId,
      recipient_id: recipient_id ?? null,
      variety_id,
      chocolate,
      finish,
      quantity,
      location_id,
      time_slot_preference,
      frequency,
      next_order_date: new Date(next_order_date),
      gift_tone: gift_tone ?? null,
      status: 'active',
    }).returning();

    await db.insert(legitimacyEvents).values({
      user_id: userId,
      event_type: 'standing_order_active',
      weight: 5,
    });

    res.status(201).json(standing);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/standing-orders — own standing orders only
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;

  try {
    const rows = await db
      .select({
        id: standingOrders.id,
        variety_name: varieties.name,
        chocolate: standingOrders.chocolate,
        finish: standingOrders.finish,
        quantity: standingOrders.quantity,
        frequency: standingOrders.frequency,
        next_order_date: standingOrders.next_order_date,
        status: standingOrders.status,
        recipient_id: standingOrders.recipient_id,
      })
      .from(standingOrders)
      .leftJoin(varieties, eq(standingOrders.variety_id, varieties.id))
      .where(or(eq(standingOrders.sender_id, userId), eq(standingOrders.recipient_id, userId)));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/standing-orders/:id/pay-from-balance
router.post('/:id/pay-from-balance', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const userId: number = (req as any).userId;

  try {
    const [standing] = await db.select().from(standingOrders).where(eq(standingOrders.id, id));
    if (!standing) { res.status(404).json({ error: 'not_found' }); return; }
    if (standing.sender_id !== userId) { res.status(403).json({ error: 'forbidden' }); return; }
    if (standing.status !== 'active') { res.status(409).json({ error: 'not_active' }); return; }

    const [variety] = await db.select({ price_cents: varieties.price_cents })
      .from(varieties).where(eq(varieties.id, standing.variety_id)).limit(1);
    if (!variety) { res.status(404).json({ error: 'variety_not_found' }); return; }

    const totalCents = variety.price_cents * standing.quantity;

    // Deduct from ad_balance_cents with balance guard
    const [debited] = await db.update(users)
      .set({ ad_balance_cents: sql`${users.ad_balance_cents} - ${totalCents}` })
      .where(and(
        eq(users.id, userId),
        sql`${users.ad_balance_cents} >= ${totalCents}`,
      ))
      .returning({ id: users.id });
    if (!debited) { res.status(402).json({ error: 'insufficient_balance' }); return; }

    // Find next available time slot
    const slotRows = await db.execute<{ id: number }>(sql`
      SELECT id FROM time_slots
      WHERE location_id = ${standing.location_id}
        AND time = ${standing.time_slot_preference}
        AND date >= NOW()
      ORDER BY date ASC
      LIMIT 1
    `);
    const slotResult = (slotRows as any).rows ?? slotRows;
    const slotId: number | null = slotResult[0]?.id ?? null;
    if (!slotId) { res.status(409).json({ error: 'no_available_slot' }); return; }

    // Create order record
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    const [order] = await db.insert(orders).values({
      variety_id: standing.variety_id,
      location_id: standing.location_id,
      time_slot_id: slotId,
      chocolate: standing.chocolate,
      finish: standing.finish,
      quantity: standing.quantity,
      is_gift: !!standing.recipient_id,
      total_cents: totalCents,
      stripe_payment_intent_id: null,
      status: 'paid',
      customer_email: user?.email ?? '',
      payment_method: 'balance',
    }).returning();

    // Advance next_order_date
    const freqDays: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30 };
    const days = freqDays[standing.frequency] ?? 30;
    const nextDate = new Date(standing.next_order_date ?? new Date());
    nextDate.setDate(nextDate.getDate() + days);

    await db.update(standingOrders)
      .set({ next_order_date: nextDate })
      .where(eq(standingOrders.id, id));

    res.json({ ok: true, order_id: order.id, next_order_date: nextDate.toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/standing-orders/:id/renew
router.post('/:id/renew', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT so.id, so.quantity, v.price_cents
      FROM standing_orders so
      JOIN varieties v ON v.id = so.variety_id
      WHERE so.id = ${id} AND so.sender_id = ${userId} AND so.status = 'active'
    `);
    const so = ((rows as any).rows ?? rows)[0];
    if (!so) { res.status(404).json({ error: 'not_found' }); return; }

    const amount = so.price_cents * so.quantity;
    const pi = await stripe.paymentIntents.create({
      amount,
      currency: 'cad',
      metadata: { type: 'standing_order_renewal', standing_order_id: String(id), user_id: String(userId) },
    });
    res.json({ client_secret: pi.client_secret });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/standing-orders/:id
router.patch('/:id', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const userId: number = (req as any).userId;
  const { status } = req.body;
  if (status !== 'active' && status !== 'paused') {
    res.status(400).json({ error: 'status must be active or paused' });
    return;
  }

  try {
    const [existing] = await db.select().from(standingOrders).where(eq(standingOrders.id, id));
    if (!existing) {
      res.status(404).json({ error: 'Standing order not found' });
      return;
    }
    if (existing.sender_id !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const [updated] = await db.update(standingOrders)
      .set({ status })
      .where(eq(standingOrders.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/standing-orders/:id
router.delete('/:id', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const userId: number = (req as any).userId;

  try {
    const [standing] = await db.select().from(standingOrders).where(eq(standingOrders.id, id));
    if (!standing) {
      res.status(404).json({ error: 'Standing order not found' });
      return;
    }
    if (standing.sender_id !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (standing.stripe_subscription_id) {
      await stripe.subscriptions.cancel(standing.stripe_subscription_id);
    }

    await db.update(standingOrders)
      .set({ status: 'cancelled' })
      .where(eq(standingOrders.id, id));

    res.json({ cancelled: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/standing-orders/from-fund — create an order paid from the user's fund balance
router.post('/from-fund', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { variety_id, quantity, location_id, time_slot_id, chocolate, finish } = req.body;

  if (!variety_id || !quantity || !location_id || !time_slot_id || !chocolate || !finish) {
    res.status(400).json({ error: 'variety_id, quantity, location_id, time_slot_id, chocolate, and finish are required' });
    return;
  }

  try {
    const [variety] = await db.select({ price_cents: varieties.price_cents }).from(varieties).where(eq(varieties.id, variety_id)).limit(1);
    if (!variety) { res.status(404).json({ error: 'variety_not_found' }); return; }

    const required_cents = variety.price_cents * quantity;

    const [fund] = await db.select({ balance_cents: membershipFunds.balance_cents }).from(membershipFunds).where(eq(membershipFunds.user_id, userId)).limit(1);
    const balance_cents = fund?.balance_cents ?? 0;

    if (balance_cents < required_cents) {
      res.status(400).json({ error: 'insufficient_fund_balance', balance_cents, required_cents });
      return;
    }

    // Look up user email before the transaction
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) { res.status(401).json({ error: 'unauthorized' }); return; }

    // Atomically deduct and create order in a single transaction
    const result = await db.transaction(async (tx) => {
      const deducted = await tx.execute(sql`
        UPDATE membership_funds
        SET balance_cents = balance_cents - ${required_cents}, updated_at = now()
        WHERE user_id = ${userId} AND balance_cents >= ${required_cents}
      `);

      // If no rows updated, balance was insufficient (race condition guard)
      const rowCount = (deducted as any).rowCount ?? (deducted as any).rowsAffected ?? 0;
      if (rowCount === 0) return null;

      const [order] = await tx.insert(orders).values({
        variety_id,
        location_id,
        time_slot_id,
        chocolate,
        finish,
        quantity,
        is_gift: false,
        total_cents: required_cents,
        customer_email: user.email,
        status: 'paid',
        payment_method: 'fund',
      }).returning();

      return order;
    });

    if (!result) {
      res.status(400).json({ error: 'insufficient_fund_balance' });
      return;
    }

    const [updatedFund] = await db.select({ balance_cents: membershipFunds.balance_cents }).from(membershipFunds).where(eq(membershipFunds.user_id, userId)).limit(1);
    res.json({ ok: true, order_id: result.id, new_balance_cents: updatedFund?.balance_cents ?? 0 });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
