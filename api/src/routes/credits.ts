import { Router } from 'express';
import crypto from 'crypto';
import Stripe from 'stripe';
import { db } from '../db';
import { users, creditTransactions, pendingCreditTransfers } from '../db/schema';
import { eq, or } from 'drizzle-orm';
import { requireUser } from '../lib/auth';
import { sendCreditSMS } from '../lib/twilio';
import { sendCreditNotification } from '../lib/resend';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-06-20' });

// GET /api/credits/balance
router.get('/balance', requireUser, async (req: any, res: any) => {
  const [user] = await db.select({ platform_credit_cents: users.platform_credit_cents })
    .from(users).where(eq(users.id, req.userId)).limit(1);
  res.json({ balance_cents: user?.platform_credit_cents ?? 0 });
});

// POST /api/credits/send — create PaymentIntent to send credit to an existing user
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

// POST /api/credits/send-to-contact — send credit to phone or email (may not be on platform yet)
// body: { recipient_phone?, recipient_email?, amount_cents, note? }
router.post('/send-to-contact', requireUser, async (req: any, res: any) => {
  const { recipient_phone, recipient_email, amount_cents, note } = req.body;
  if (!amount_cents || amount_cents < 100) {
    return res.status(400).json({ error: 'amount_cents (min 100) required' });
  }
  const hasPhone = recipient_phone && /^\+[1-9]\d{7,14}$/.test(recipient_phone);
  const hasEmail = recipient_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email);
  if (!hasPhone && !hasEmail) {
    return res.status(400).json({ error: 'valid recipient_phone or recipient_email required' });
  }

  const claim_token = crypto.randomBytes(4).toString('hex').toUpperCase();

  const [pending] = await db.insert(pendingCreditTransfers).values({
    from_user_id: req.userId,
    recipient_phone: hasPhone ? recipient_phone : null,
    recipient_email: hasEmail ? recipient_email : null,
    amount_cents,
    claim_token,
    note: note ?? null,
  }).returning({ id: pendingCreditTransfers.id });

  const pi = await stripe.paymentIntents.create({
    amount: amount_cents,
    currency: 'cad',
    metadata: {
      type: 'credit_transfer_contact',
      pending_transfer_id: String(pending.id),
      from_user_id: String(req.userId),
      note: note ?? '',
    },
  });

  await db.update(pendingCreditTransfers)
    .set({ payment_intent_id: pi.id })
    .where(eq(pendingCreditTransfers.id, pending.id));

  res.json({ client_secret: pi.client_secret, claim_token });
});

// POST /api/credits/claim — claim pending credit by token (called on signup/login)
// body: { claim_token }
router.post('/claim', requireUser, async (req: any, res: any) => {
  const { claim_token } = req.body;
  if (!claim_token) return res.status(400).json({ error: 'claim_token required' });

  const [pending] = await db.select().from(pendingCreditTransfers)
    .where(eq(pendingCreditTransfers.claim_token, claim_token.toUpperCase())).limit(1);

  if (!pending) return res.status(404).json({ error: 'not_found' });
  if (pending.status === 'claimed') return res.status(409).json({ error: 'already_claimed' });
  if (pending.status !== 'paid') return res.status(402).json({ error: 'not_paid_yet' });

  const [user] = await db.select({ platform_credit_cents: users.platform_credit_cents })
    .from(users).where(eq(users.id, req.userId)).limit(1);

  await db.update(pendingCreditTransfers)
    .set({ status: 'claimed' })
    .where(eq(pendingCreditTransfers.id, pending.id));

  await db.update(users)
    .set({ platform_credit_cents: (user?.platform_credit_cents ?? 0) + pending.amount_cents })
    .where(eq(users.id, req.userId));

  await db.insert(creditTransactions).values({
    from_user_id: pending.from_user_id,
    to_user_id: req.userId,
    amount_cents: pending.amount_cents,
    type: 'transfer',
    note: pending.note,
  });

  res.json({ claimed_cents: pending.amount_cents });
});

// POST /api/credits/apply — apply credit balance toward an order
// body: { amount_cents }
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

// Helper — auto-claim any paid pending transfers for a user's email or phone
export async function autoClaimPendingCredits(userId: number, email?: string, phone?: string) {
  if (!email && !phone) return;
  const conditions = [];
  if (email) conditions.push(eq(pendingCreditTransfers.recipient_email, email));
  if (phone) conditions.push(eq(pendingCreditTransfers.recipient_phone, phone));

  const pending = await db.select().from(pendingCreditTransfers)
    .where(or(...conditions));

  const paid = pending.filter(p => p.status === 'paid');
  if (paid.length === 0) return;

  const total = paid.reduce((sum, p) => sum + p.amount_cents, 0);
  const [user] = await db.select({ platform_credit_cents: users.platform_credit_cents })
    .from(users).where(eq(users.id, userId)).limit(1);

  await db.update(users)
    .set({ platform_credit_cents: (user?.platform_credit_cents ?? 0) + total })
    .where(eq(users.id, userId));

  for (const p of paid) {
    await db.update(pendingCreditTransfers)
      .set({ status: 'claimed' })
      .where(eq(pendingCreditTransfers.id, p.id));
    await db.insert(creditTransactions).values({
      from_user_id: p.from_user_id,
      to_user_id: userId,
      amount_cents: p.amount_cents,
      type: 'transfer',
      note: p.note,
    });
  }
}

export { sendCreditSMS, sendCreditNotification };
export default router;
