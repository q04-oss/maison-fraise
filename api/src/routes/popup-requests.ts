import { Router, Request, Response } from 'express';
import { db } from '../db';
import { businesses, popupRequests } from '../db/schema';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';
import { eq } from 'drizzle-orm';
import { requireUser } from '../lib/auth';

const router = Router();

// Submission fee for hosting a popup: $25 CAD
const POPUP_REQUEST_FEE_CENTS = 2500;

// POST /api/popup-requests
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { venue_id, date, time, notes } = req.body;
  if (!venue_id || !date || !time) {
    res.status(400).json({ error: 'venue_id, date, and time are required' });
    return;
  }

  try {
    const [venue] = await db.select().from(businesses).where(eq(businesses.id, venue_id));
    if (!venue) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }

    const pi = await stripe.paymentIntents.create({
      amount: POPUP_REQUEST_FEE_CENTS,
      currency: 'cad',
      metadata: { type: 'popup_request', user_id: String(userId), venue_id: String(venue_id) },
    });

    const [request] = await db
      .insert(popupRequests)
      .values({
        user_id: userId,
        venue_id,
        requested_date: date,
        requested_time: time,
        notes: notes ?? null,
        stripe_payment_intent_id: pi.id,
        status: 'pending',
      })
      .returning();

    res.status(201).json({ id: request.id, client_secret: pi.client_secret });
  } catch (err) {
    logger.error('Popup request error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
