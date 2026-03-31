import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { orders, users, legitimacyEvents } from '../db/schema';

const router = Router();

// POST /api/verify/nfc
router.post('/nfc', async (req: Request, res: Response) => {
  const { nfc_token, user_id } = req.body;
  if (!nfc_token || !user_id) {
    res.status(400).json({ error: 'nfc_token and user_id are required' });
    return;
  }

  try {
    const [order] = await db.select().from(orders).where(eq(orders.nfc_token, nfc_token));

    if (!order || order.nfc_token_used) {
      res.status(403).json({ error: 'This token is invalid or has already been used.' });
      return;
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.update(orders)
        .set({ nfc_token_used: true, nfc_verified_at: now })
        .where(eq(orders.id, order.id));

      await tx.update(users)
        .set({ verified: true, verified_at: now, verified_by: 'nfc' })
        .where(eq(users.id, user_id));

      await tx.insert(legitimacyEvents).values({
        user_id,
        event_type: 'nfc_verified',
        weight: 5,
      });
    });

    res.json({ verified: true, user_id, unlocked: ['standing_orders', 'campaigns'] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/verify/reorder
router.post('/reorder', async (req: Request, res: Response) => {
  const { nfc_token, user_id } = req.body;
  if (!nfc_token || !user_id) {
    res.status(400).json({ error: 'nfc_token and user_id are required' });
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

    res.json({
      variety_id: order.variety_id,
      chocolate: order.chocolate,
      finish: order.finish,
      quantity: order.quantity,
      location_id: order.location_id,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
