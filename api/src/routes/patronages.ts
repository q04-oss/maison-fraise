import { Router, Request, Response } from 'express';
import { eq, asc, and } from 'drizzle-orm';
import { db } from '../db';
import { seasonPatronages, patronTokens, users } from '../db/schema';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';

const router = Router();

const VALID_YEARS = [1, 2, 3, 5, 10] as const;

// GET /api/patronages — public, all approved patronages
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: seasonPatronages.id,
        location_id: seasonPatronages.location_id,
        location_name: seasonPatronages.location_name,
        season_year: seasonPatronages.season_year,
        price_per_year_cents: seasonPatronages.price_per_year_cents,
        status: seasonPatronages.status,
        patron_user_id: seasonPatronages.patron_user_id,
        years_claimed: seasonPatronages.years_claimed,
        patron_display_name: users.display_name,
      })
      .from(seasonPatronages)
      .leftJoin(users, eq(seasonPatronages.patron_user_id, users.id))
      .where(eq(seasonPatronages.approved_by_admin, true))
      .orderBy(asc(seasonPatronages.season_year), asc(seasonPatronages.location_name));

    res.json(rows);
  } catch (err) {
    logger.error('GET /patronages error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/patronages/:id — public, single patronage detail
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [patronage] = await db
      .select({
        id: seasonPatronages.id,
        location_id: seasonPatronages.location_id,
        location_name: seasonPatronages.location_name,
        season_year: seasonPatronages.season_year,
        price_per_year_cents: seasonPatronages.price_per_year_cents,
        status: seasonPatronages.status,
        patron_user_id: seasonPatronages.patron_user_id,
        years_claimed: seasonPatronages.years_claimed,
        approved_by_admin: seasonPatronages.approved_by_admin,
        claimed_at: seasonPatronages.claimed_at,
        patron_display_name: users.display_name,
      })
      .from(seasonPatronages)
      .leftJoin(users, eq(seasonPatronages.patron_user_id, users.id))
      .where(eq(seasonPatronages.id, id))
      .limit(1);

    if (!patronage) { res.status(404).json({ error: 'not_found' }); return; }

    let patron_tokens_list: { id: number; season_year: number; location_name: string; patronage_id: number }[] = [];
    if (patronage.status === 'claimed') {
      patron_tokens_list = await db
        .select({
          id: patronTokens.id,
          season_year: patronTokens.season_year,
          location_name: patronTokens.location_name,
          patronage_id: patronTokens.patronage_id,
        })
        .from(patronTokens)
        .where(eq(patronTokens.patronage_id, id));
    }

    res.json({ ...patronage, patron_tokens: patron_tokens_list });
  } catch (err) {
    logger.error('GET /patronages/:id error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/patronages/:id/claim — requireUser
router.post('/:id/claim', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { years } = req.body;
  if (!VALID_YEARS.includes(years as typeof VALID_YEARS[number])) {
    res.status(400).json({ error: 'years must be one of [1, 2, 3, 5, 10]' });
    return;
  }

  const userId: number = req.userId;

  try {
    const [patronage] = await db
      .select()
      .from(seasonPatronages)
      .where(eq(seasonPatronages.id, id))
      .limit(1);

    if (!patronage) { res.status(404).json({ error: 'not_found' }); return; }
    if (patronage.status !== 'available') {
      res.status(409).json({ error: 'patronage_not_available' });
      return;
    }
    if (!patronage.approved_by_admin) {
      res.status(403).json({ error: 'not_approved' });
      return;
    }

    const total_cents = patronage.price_per_year_cents * years;

    const pi = await stripe.paymentIntents.create({
      amount: total_cents,
      currency: 'cad',
      metadata: {
        type: 'patronage_claim',
        patronage_id: String(id),
        user_id: String(userId),
        years: String(years),
        price_per_year_cents: String(patronage.price_per_year_cents),
        location_name: patronage.location_name,
        season_year: String(patronage.season_year),
      },
    });

    // Hold patronage while payment processes
    await db
      .update(seasonPatronages)
      .set({ status: 'pending' })
      .where(eq(seasonPatronages.id, id));

    res.json({
      client_secret: pi.client_secret,
      total_cents,
      years,
      price_per_year_cents: patronage.price_per_year_cents,
    });
  } catch (err) {
    logger.error('POST /patronages/:id/claim error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/patronages/request — requireUser (operator requesting a listing)
router.post('/request', requireUser, async (req: any, res: Response) => {
  const { location_id, season_year, requested_price_per_year_cents, location_name, notes } = req.body;

  if (!location_id || !season_year || !requested_price_per_year_cents || !location_name) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  const userId: number = req.userId;

  try {
    const [inserted] = await db
      .insert(seasonPatronages)
      .values({
        location_id,
        season_year,
        price_per_year_cents: requested_price_per_year_cents,
        location_name,
        status: 'available',
        approved_by_admin: false,
        requested_by: userId,
      })
      .returning({ id: seasonPatronages.id });

    res.status(201).json({ id: inserted.id });
  } catch (err) {
    logger.error('POST /patronages/request error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
