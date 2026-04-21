import { Router } from 'express';
import Stripe from 'stripe';
import { db } from '../db';
import { users, creditTransactions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireUser } from '../lib/auth';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-01-27.acacia' });

// GET /api/credits/balance
router.get('/balance', requireUser, async (req: any, res: any) => {
  const [user] = await db.select({ platform_credit_cents: users.platform_credit_cents })
    .from(users).where(eq(users.id, req.userId)).limit(1);
  res.json({ balance_cents: user?.platform_credit_cents ?? 0 });
});

// POST /api/credits/send — create PaymentIntent to send credit to another user
// body: { to_user_id, amount_cents, note? }
router.post('/send', requireUser, async (req: any, res: any) => {
  const { to_user_id, amount_cents, note } = req.body;
  if (!to_user_id || !amount_cents || amount_cents < 100) {
    return res.status(400).json({ error: 'to_user_id and amount_cents (min 100) required' });
  }
  if (to_user_id === req.userId) {
    return res.status(400).json({ error: 'cannot send to yourself' });
  }
  const [recipient] = await db.select({ id: users.id, display_name: users.display_name })
    .from(users).where(eq(users.id, to_user_id)).limit(1);
  if (!recipient) return res.status(404).json({ error: 'user not found' });

  const pi = await stripe.paymentIntents.create({
    amount: amount_cents,
    currency: 'cad',
    metadata: {
      type: 'credit_transfer',
      from_user_id: String(req.userId),
      to_user_id: String(to_user_id),
      to_display_name: recipient.display_name ?? '',
      note: note ?? '',
    },
  });
  res.json({ client_secret: pi.client_secret });
});

// POST /api/credits/apply — apply credit balance toward an order
// body: { amount_cents }  — deducted from caller's balance
router.post('/apply', requireUser, async (req: any, res: any) => {
  const { amount_cents } = req.body;
  if (!amount_cents || amount_cents < 1) {
    return res.status(400).json({ error: 'amount_cents required' });
  }
  const [user] = await db.select({ platform_credit_cents: users.platform_credit_cents })
    .from(users).where(eq(users.id, req.userId)).limit(1);
  if (!user || user.platform_credit_cents < amount_cents) {
    return res.status(400).json({ error: 'insufficient_credit' });
  }
  await db.update(users)
    .set({ platform_credit_cents: user.platform_credit_cents - amount_cents })
    .where(eq(users.id, req.userId));
  await db.insert(creditTransactions).values({
    to_user_id: req.userId,
    amount_cents: -amount_cents,
    type: 'applied',
  });
  res.json({ remaining_cents: user.platform_credit_cents - amount_cents });
});

export default router;
