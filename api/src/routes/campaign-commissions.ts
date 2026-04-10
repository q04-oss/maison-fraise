import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { businesses, campaignCommissions } from '../db/schema';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';
import { requireUser } from '../lib/auth';

const router = Router();

// Portrait campaign commission fee: $350 CAD
const COMMISSION_FEE_CENTS = 35000;

// POST /api/campaign-commissions
router.post('/', requireUser, async (req: Request, res: Response) => {
  const user_id: number = (req as any).userId;
  const { popup_id, invited_user_ids } = req.body;
  if (!popup_id || !Array.isArray(invited_user_ids)) {
    res.status(400).json({ error: 'popup_id and invited_user_ids are required' });
    return;
  }

  try {
    const [popup] = await db.select().from(businesses).where(eq(businesses.id, popup_id));
    if (!popup) {
      res.status(404).json({ error: 'Popup not found' });
      return;
    }

    const pi = await stripe.paymentIntents.create({
      amount: COMMISSION_FEE_CENTS,
      currency: 'cad',
      metadata: {
        type: 'campaign_commission',
        popup_id: String(popup_id),
        user_id: String(user_id),
      },
    });

    const [commission] = await db
      .insert(campaignCommissions)
      .values({
        popup_id,
        commissioner_user_id: user_id,
        stripe_payment_intent_id: pi.id,
        invited_user_ids,
        status: 'pending',
      })
      .returning();

    res.status(201).json({ id: commission.id, client_secret: pi.client_secret });
  } catch (err) {
    logger.error('Commission creation error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
