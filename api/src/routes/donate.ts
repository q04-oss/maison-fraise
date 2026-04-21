import { Router, Response } from 'express';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';

const router = Router();

const ALLOWED_AMOUNTS = [300, 500, 1000, 2500]; // $3, $5, $10, $25 CAD

// POST /api/donate/payment-intent
router.post('/payment-intent', async (req: any, res: Response) => {
  const { amount_cents } = req.body;

  if (!ALLOWED_AMOUNTS.includes(amount_cents)) {
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

export default router;
