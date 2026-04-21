import { Router, Response } from 'express';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';

const router = Router();

// POST /api/donate/payment-intent
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

export default router;
