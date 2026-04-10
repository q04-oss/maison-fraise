import { Router, Request, Response } from 'express';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../db';
import { greenhouses, provenanceTokens, users, greenhouseFunding } from '../db/schema';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';

const router = Router();

const VALID_YEARS = [3, 5, 10] as const;

// GET /api/greenhouses — public
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: greenhouses.id,
        name: greenhouses.name,
        location: greenhouses.location,
        description: greenhouses.description,
        status: greenhouses.status,
        funding_goal_cents: greenhouses.funding_goal_cents,
        funded_cents: greenhouses.funded_cents,
        founding_patron_id: greenhouses.founding_patron_id,
        founding_years: greenhouses.founding_years,
        founding_term_ends_at: greenhouses.founding_term_ends_at,
        opened_at: greenhouses.opened_at,
        created_at: greenhouses.created_at,
        founding_patron_display_name: users.display_name,
      })
      .from(greenhouses)
      .leftJoin(users, eq(greenhouses.founding_patron_id, users.id))
      .where(eq(greenhouses.approved_by_admin, true))
      .orderBy(desc(greenhouses.created_at));

    res.json(rows.map(r => ({
      ...r,
      funding_progress: r.funding_goal_cents > 0
        ? r.funded_cents / r.funding_goal_cents
        : 0,
    })));
  } catch (err) {
    logger.error('GET /greenhouses error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/greenhouses/:id — public
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [greenhouse] = await db
      .select({
        id: greenhouses.id,
        name: greenhouses.name,
        location: greenhouses.location,
        description: greenhouses.description,
        status: greenhouses.status,
        funding_goal_cents: greenhouses.funding_goal_cents,
        funded_cents: greenhouses.funded_cents,
        founding_patron_id: greenhouses.founding_patron_id,
        founding_years: greenhouses.founding_years,
        founding_term_ends_at: greenhouses.founding_term_ends_at,
        opened_at: greenhouses.opened_at,
        created_at: greenhouses.created_at,
        approved_by_admin: greenhouses.approved_by_admin,
        founding_patron_display_name: users.display_name,
      })
      .from(greenhouses)
      .leftJoin(users, eq(greenhouses.founding_patron_id, users.id))
      .where(eq(greenhouses.id, id))
      .limit(1);

    if (!greenhouse) { res.status(404).json({ error: 'not_found' }); return; }

    // Fetch provenance token if it exists
    const [provenanceToken] = await db
      .select()
      .from(provenanceTokens)
      .where(eq(provenanceTokens.greenhouse_id, id))
      .limit(1);

    res.json({
      ...greenhouse,
      funding_progress: greenhouse.funding_goal_cents > 0
        ? greenhouse.funded_cents / greenhouse.funding_goal_cents
        : 0,
      provenance_token: provenanceToken
        ? {
            id: provenanceToken.id,
            minted_at: provenanceToken.minted_at,
            provenance_ledger: JSON.parse(provenanceToken.provenance_ledger),
          }
        : null,
    });
  } catch (err) {
    logger.error('GET /greenhouses/:id error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/greenhouses/:id/fund — requireUser
router.post('/:id/fund', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { years } = req.body;
  if (!VALID_YEARS.includes(years as typeof VALID_YEARS[number])) {
    res.status(400).json({ error: 'years must be one of [3, 5, 10]' });
    return;
  }

  const userId: number = req.userId;

  try {
    const [greenhouse] = await db
      .select()
      .from(greenhouses)
      .where(eq(greenhouses.id, id))
      .limit(1);

    if (!greenhouse) { res.status(404).json({ error: 'not_found' }); return; }

    if (greenhouse.status !== 'funding') {
      res.status(409).json({ error: 'greenhouse_not_in_funding_status' });
      return;
    }

    if (!greenhouse.approved_by_admin) {
      res.status(403).json({ error: 'not_approved' });
      return;
    }

    if (greenhouse.founding_patron_id !== null) {
      res.status(409).json({ error: 'greenhouse_already_funded' });
      return;
    }

    const amount_cents = greenhouse.funding_goal_cents;

    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      metadata: {
        type: 'greenhouse_fund',
        greenhouse_id: String(id),
        user_id: String(userId),
        years: String(years),
        greenhouse_name: greenhouse.name,
        greenhouse_location: greenhouse.location,
      },
    });

    await db.insert(greenhouseFunding).values({
      greenhouse_id: id,
      user_id: userId,
      amount_cents,
      years,
      stripe_payment_intent_id: pi.id,
      status: 'pending',
    });

    res.json({
      client_secret: pi.client_secret,
      amount_cents,
      years,
    });
  } catch (err) {
    logger.error('POST /greenhouses/:id/fund error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
