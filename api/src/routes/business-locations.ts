import { Router, Request, Response } from 'express';
import { eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { businesses, users, locationFunding } from '../db/schema';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/business-locations — public
// Returns all businesses with location_type, partner_name, founding patron display_name if set.
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        type: businesses.type,
        address: businesses.address,
        city: businesses.city,
        hours: businesses.hours,
        contact: businesses.contact,
        latitude: businesses.latitude,
        longitude: businesses.longitude,
        launched_at: businesses.launched_at,
        description: businesses.description,
        instagram_handle: businesses.instagram_handle,
        neighbourhood: businesses.neighbourhood,
        location_type: businesses.location_type,
        partner_name: businesses.partner_name,
        operating_cost_cents: businesses.operating_cost_cents,
        founding_patron_id: businesses.founding_patron_id,
        founding_term_ends_at: businesses.founding_term_ends_at,
        inaugurated_at: businesses.inaugurated_at,
        approved_by_admin: businesses.approved_by_admin,
        created_at: businesses.created_at,
        founding_patron_display_name: users.display_name,
      })
      .from(businesses)
      .leftJoin(users, eq(businesses.founding_patron_id, users.id))
      .orderBy(businesses.name);

    res.json(rows);
  } catch (err) {
    logger.error('GET /business-locations error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/business-locations/:id/fund — requireUser
// Fund a house_chocolate location (always 10 years)
router.post('/:id/fund', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  try {
    const [business] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, id))
      .limit(1);

    if (!business) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    if (business.location_type !== 'house_chocolate') {
      res.status(400).json({ error: 'location_not_fundable' });
      return;
    }

    if (!business.approved_by_admin) {
      res.status(400).json({ error: 'not_approved' });
      return;
    }

    if (business.founding_patron_id !== null) {
      res.status(409).json({ error: 'already_funded' });
      return;
    }

    if (!business.operating_cost_cents) {
      res.status(400).json({ error: 'operating_cost_not_set' });
      return;
    }

    // Insert pending locationFunding row
    const [funding] = await db
      .insert(locationFunding)
      .values({
        business_id: id,
        user_id: userId,
        amount_cents: business.operating_cost_cents,
        status: 'pending',
      })
      .returning();

    // Create Stripe PaymentIntent
    const pi = await stripe.paymentIntents.create({
      amount: business.operating_cost_cents,
      currency: 'cad',
      metadata: {
        type: 'location_fund',
        business_id: id.toString(),
        user_id: userId.toString(),
        business_name: business.name,
        partner_name: business.partner_name ?? '',
      },
    });

    // Update funding row with stripe_payment_intent_id
    await db
      .update(locationFunding)
      .set({ stripe_payment_intent_id: pi.id })
      .where(eq(locationFunding.id, funding.id));

    res.json({
      client_secret: pi.client_secret,
      amount_cents: business.operating_cost_cents,
    });
  } catch (err) {
    logger.error('POST /business-locations/:id/fund error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
