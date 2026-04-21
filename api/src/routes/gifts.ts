import { Router, Response } from 'express';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { stripe } from '../lib/stripe';
import { db } from '../db';
import { gifts, users, businesses } from '../db/schema';
import { sendGiftNotification } from '../lib/resend';
import { logger } from '../lib/logger';
import { requireUser } from '../lib/auth';

const router = Router();

const PRICES: Record<string, number> = {
  digital: 300,  // $3.00 CAD
  physical: 1400, // $14.00 CAD
  bundle: 1600,  // $16.00 CAD
};

const BUSINESS_CUT = 0.25; // 25% of sale goes to the business

// POST /api/gifts/payment-intent
// Creates a Stripe PI and a pending gift record. Returns the client secret.
router.post('/payment-intent', requireUser, async (req: any, res: Response) => {
  const { gift_type, recipient_email, recipient_phone, business_id, is_outreach } = req.body;
  const sender_user_id: number = req.userId;

  if (!['digital', 'physical', 'bundle'].includes(gift_type)) {
    res.status(400).json({ error: 'invalid_gift_type' });
    return;
  }
  const hasEmail = recipient_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email);
  const hasPhone = recipient_phone && /^\+[1-9]\d{7,14}$/.test(recipient_phone);
  if (!hasEmail && !hasPhone) {
    res.status(400).json({ error: 'invalid_recipient' });
    return;
  }

  // Validate business if provided
  let sticker_business_id: number | null = null;
  let business_name: string | null = null;
  if (business_id) {
    const [biz] = await db.select({ id: businesses.id, name: businesses.name })
      .from(businesses).where(eq(businesses.id, Number(business_id))).limit(1);
    if (!biz) { res.status(404).json({ error: 'business_not_found' }); return; }
    sticker_business_id = biz.id;
    business_name = biz.name;
  }

  const amount_cents = PRICES[gift_type];
  const business_revenue_cents = sticker_business_id ? Math.floor(amount_cents * BUSINESS_CUT) : null;
  const claim_token = crypto.randomBytes(4).toString('hex').toUpperCase();

  try {
    const [gift] = await db.insert(gifts).values({
      sender_user_id,
      recipient_email: hasEmail ? recipient_email : null,
      recipient_phone: hasPhone ? recipient_phone : null,
      gift_type,
      amount_cents,
      claim_token,
      status: 'pending',
      sticker_business_id,
      business_revenue_cents,
      is_outreach: !!is_outreach,
    }).returning({ id: gifts.id });

    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      metadata: {
        type: 'gift',
        gift_id: String(gift.id),
        gift_type,
        recipient_email,
        sender_user_id: String(sender_user_id),
        ...(sticker_business_id ? { business_id: String(sticker_business_id), business_name: business_name ?? '' } : {}),
      },
    });

    await db.update(gifts)
      .set({ payment_intent_id: pi.id })
      .where(eq(gifts.id, gift.id));

    res.json({ client_secret: pi.client_secret, claim_token });
  } catch (err) {
    logger.error('Failed to create gift payment intent:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/gifts/claim
// Called after signup/login. Marks gift as claimed and collects shipping if physical.
router.post('/claim', requireUser, async (req: any, res: Response) => {
  const { claim_token, shipping_name, shipping_address, shipping_city, shipping_province, shipping_postal_code } = req.body;
  const claimer_user_id: number = req.userId;

  if (!claim_token) {
    res.status(400).json({ error: 'missing_claim_token' });
    return;
  }

  try {
    const [gift] = await db.select().from(gifts).where(eq(gifts.claim_token, claim_token.toUpperCase()));

    if (!gift) {
      res.status(404).json({ error: 'gift_not_found' });
      return;
    }
    if (gift.status === 'claimed') {
      res.status(409).json({ error: 'already_claimed' });
      return;
    }
    if (gift.status !== 'paid') {
      res.status(402).json({ error: 'gift_not_paid' });
      return;
    }

    const needsShipping = gift.gift_type === 'physical' || gift.gift_type === 'bundle';
    if (needsShipping && (!shipping_name || !shipping_address || !shipping_city || !shipping_province || !shipping_postal_code)) {
      res.status(400).json({ error: 'shipping_required', gift_type: gift.gift_type });
      return;
    }

    await db.update(gifts).set({
      status: 'claimed',
      claimed_by_user_id: claimer_user_id,
      claimed_at: new Date(),
      ...(needsShipping ? { shipping_name, shipping_address, shipping_city, shipping_province, shipping_postal_code } : {}),
    }).where(eq(gifts.id, gift.id));

    res.json({ success: true, gift_type: gift.gift_type });
  } catch (err) {
    logger.error('Failed to claim gift:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/gifts/sent
// Returns gifts sent by the authenticated user.
router.get('/sent', requireUser, async (req: any, res: Response) => {
  const sender_user_id: number = req.userId;
  try {
    const sent = await db.select({
      id: gifts.id,
      gift_type: gifts.gift_type,
      amount_cents: gifts.amount_cents,
      recipient_email: gifts.recipient_email,
      claim_token: gifts.claim_token,
      status: gifts.status,
      claimed_at: gifts.claimed_at,
      created_at: gifts.created_at,
    }).from(gifts).where(eq(gifts.sender_user_id, sender_user_id));
    res.json(sent);
  } catch (err) {
    logger.error('Failed to fetch sent gifts:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/gifts/received
// Returns gifts claimed by the authenticated user.
router.get('/received', requireUser, async (req: any, res: Response) => {
  const user_id: number = req.userId;
  try {
    const received = await db.select({
      id: gifts.id,
      gift_type: gifts.gift_type,
      claimed_at: gifts.claimed_at,
      sticker_emoji: businesses.sticker_emoji,
      sticker_image_url: businesses.sticker_image_url,
      business_name: businesses.name,
    })
      .from(gifts)
      .leftJoin(businesses, eq(gifts.sticker_business_id, businesses.id))
      .where(eq(gifts.claimed_by_user_id, user_id));
    res.json(received);
  } catch (err) {
    logger.error('Failed to fetch received gifts:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
