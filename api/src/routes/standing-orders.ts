import { Router, Request, Response } from 'express';
import { eq, or } from 'drizzle-orm';
import { db } from '../db';
import { standingOrders, users, legitimacyEvents } from '../db/schema';
import { stripe } from '../lib/stripe';

const router = Router();

async function requireVerified(userId: number, res: Response): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.verified) {
    res.status(403).json({ error: 'Standing orders are available to verified members only. Tap your box to get verified.' });
    return false;
  }
  return true;
}

// POST /api/standing-orders
router.post('/', async (req: Request, res: Response) => {
  const {
    sender_id,
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

  if (!sender_id || !variety_id || !chocolate || !finish || !quantity || !location_id || !time_slot_preference || !frequency || !next_order_date) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    if (!await requireVerified(sender_id, res)) return;

    if (recipient_id) {
      const [recipient] = await db.select().from(users).where(eq(users.id, recipient_id));
      if (!recipient || !recipient.verified) {
        res.status(403).json({ error: 'Gift recipient must also be a verified member.' });
        return;
      }
    }

    const [standing] = await db.insert(standingOrders).values({
      sender_id,
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
      user_id: sender_id,
      event_type: 'standing_order_active',
      weight: 5,
    });

    res.status(201).json(standing);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/standing-orders?user_id=
router.get('/', async (req: Request, res: Response) => {
  const user_id = parseInt(String(req.query.user_id), 10);
  if (isNaN(user_id)) {
    res.status(400).json({ error: 'user_id query parameter is required' });
    return;
  }

  try {
    const rows = await db.select().from(standingOrders)
      .where(or(eq(standingOrders.sender_id, user_id), eq(standingOrders.recipient_id, user_id)));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/standing-orders/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const { status } = req.body;
  if (status !== 'active' && status !== 'paused') {
    res.status(400).json({ error: 'status must be active or paused' });
    return;
  }

  try {
    const [updated] = await db.update(standingOrders)
      .set({ status })
      .where(eq(standingOrders.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'Standing order not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/standing-orders/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  try {
    const [standing] = await db.select().from(standingOrders).where(eq(standingOrders.id, id));
    if (!standing) {
      res.status(404).json({ error: 'Standing order not found' });
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

export default router;
