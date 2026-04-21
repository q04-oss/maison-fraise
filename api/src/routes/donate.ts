import { Router, Response } from 'express';
import { eq } from 'drizzle-orm';
import { stripe } from '../lib/stripe';
import { db } from '../db';
import { businesses } from '../db/schema';
import { logger } from '../lib/logger';

const router = Router();

const PLATFORM_CUT = 0.05; // 5% to Box Fraise

// POST /api/donate/payment-intent
// Donation to Box Fraise directly.
router.post('/payment-intent', async (req: any, res: Response) => {
  const { amount_cents } = req.body;

  if (!Number.isInteger(amount_cents) || amount_cents < 100 || amount_cents > 1_000_000) {
    res.status(400).json({ error: 'invalid_amount' });
    return;
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      metadata: { type: 'donation' },
    });

    res.json({ client_secret: intent.client_secret });
  } catch (err) {
    logger.error('Failed to create donation payment intent:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/donate/business/:id
// Donation to a specific business. Platform takes 5%, rest logged for payout.
router.post('/business/:id', async (req: any, res: Response) => {
  const bizId = parseInt(req.params.id, 10);
  const { amount_cents } = req.body;

  if (isNaN(bizId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  if (!Number.isInteger(amount_cents) || amount_cents < 100 || amount_cents > 1_000_000) {
    res.status(400).json({ error: 'invalid_amount' });
    return;
  }

  try {
    const [biz] = await db.select({ id: businesses.id, name: businesses.name })
      .from(businesses).where(eq(businesses.id, bizId)).limit(1);
    if (!biz) { res.status(404).json({ error: 'not_found' }); return; }

    const platformCents = Math.round(amount_cents * PLATFORM_CUT);
    const businessCents = amount_cents - platformCents;

    const intent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      metadata: {
        type: 'business_donation',
        business_id: String(bizId),
        business_name: biz.name,
        business_cents: String(businessCents),
        platform_cents: String(platformCents),
      },
    });

    res.json({ client_secret: intent.client_secret });
  } catch (err) {
    logger.error('Failed to create business donation payment intent:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
