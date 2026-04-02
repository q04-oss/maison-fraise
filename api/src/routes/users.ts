import { Router, Request, Response } from 'express';
import { eq, sum, and, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  users, legitimacyEvents, businesses, popupRsvps, djOffers, popupNominations,
  employmentContracts,
} from '../db/schema';

const router = Router();

// GET /api/users/me — identified by X-User-ID header
router.get('/me', async (req: Request, res: Response) => {
  const rawId = req.headers['x-user-id'];
  const user_id = parseInt(String(rawId), 10);
  if (isNaN(user_id)) {
    res.status(400).json({ error: 'X-User-ID header is required' });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, user_id));
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [scoreRow] = await db
      .select({ total: sum(legitimacyEvents.weight) })
      .from(legitimacyEvents)
      .where(eq(legitimacyEvents.user_id, user_id));

    const legitimacy_score = Number(scoreRow?.total ?? 0);

    res.json({ ...user, legitimacy_score });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/search?q= — verified users only
router.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.status(400).json({ error: 'q query parameter is required' });
    return;
  }

  try {
    const rows = await db
      .select({ id: users.id, verified: users.verified, created_at: users.created_at })
      .from(users)
      .where(eq(users.verified, true));

    const filtered = rows.filter(u => String(u.id).includes(q));
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id/dj — toggle DJ status
router.patch('/:id/dj', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  const { is_dj } = req.body;
  if (isNaN(user_id) || typeof is_dj !== 'boolean') {
    res.status(400).json({ error: 'is_dj boolean is required' });
    return;
  }

  try {
    await db.update(users).set({ is_dj }).where(eq(users.id, user_id));
    res.json({ success: true, is_dj });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/popup-rsvps
router.get('/:id/popup-rsvps', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  try {
    const rows = await db
      .select({
        rsvp_id: popupRsvps.id,
        popup_id: popupRsvps.popup_id,
        status: popupRsvps.status,
        created_at: popupRsvps.created_at,
        popup_name: businesses.name,
        popup_starts_at: businesses.starts_at,
        popup_address: businesses.address,
      })
      .from(popupRsvps)
      .innerJoin(businesses, eq(popupRsvps.popup_id, businesses.id))
      .where(eq(popupRsvps.user_id, user_id));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/dj-gigs — pending + accepted DJ offers
router.get('/:id/dj-gigs', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  try {
    const rows = await db
      .select({
        offer_id: djOffers.id,
        popup_id: djOffers.popup_id,
        status: djOffers.status,
        allocation_boxes: djOffers.allocation_boxes,
        organizer_note: djOffers.organizer_note,
        popup_name: businesses.name,
        popup_address: businesses.address,
        popup_starts_at: businesses.starts_at,
        popup_ends_at: businesses.ends_at,
        popup_neighbourhood: businesses.neighbourhood,
      })
      .from(djOffers)
      .innerJoin(businesses, eq(djOffers.popup_id, businesses.id))
      .where(eq(djOffers.dj_user_id, user_id))
      .orderBy(businesses.starts_at);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/allocations — accepted DJ box allocations
router.get('/:id/allocations', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  try {
    const rows = await db
      .select({
        offer_id: djOffers.id,
        popup_id: djOffers.popup_id,
        allocation_boxes: djOffers.allocation_boxes,
        status: djOffers.status,
        popup_name: businesses.name,
        popup_starts_at: businesses.starts_at,
      })
      .from(djOffers)
      .innerJoin(businesses, eq(djOffers.popup_id, businesses.id))
      .where(and(eq(djOffers.dj_user_id, user_id), eq(djOffers.status, 'accepted')));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/hosted-popups — popups hosted by this user
router.get('/:id/hosted-popups', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  try {
    const popups = await db
      .select()
      .from(businesses)
      .where(and(eq(businesses.host_user_id, user_id), eq(businesses.type, 'popup')));

    const results = await Promise.all(
      popups.map(async p => {
        const [nomRow] = await db
          .select({ total: sql<number>`cast(count(*) as int)` })
          .from(popupNominations)
          .where(eq(popupNominations.popup_id, p.id));

        const nomination_count = nomRow?.total ?? 0;
        const threshold_met = nomination_count >= 10;

        return {
          id: p.id,
          venue_name: p.name,
          date: p.starts_at?.toISOString() ?? p.launched_at.toISOString(),
          is_audition: p.is_audition,
          audition_status: p.audition_status as 'pending' | 'passed' | 'failed' | null,
          nomination_count,
          threshold_met,
        };
      })
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/contract-offer — pending contract offer
router.get('/:id/contract-offer', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  try {
    const rows = await db
      .select({
        id: employmentContracts.id,
        status: employmentContracts.status,
        starts_at: employmentContracts.starts_at,
        ends_at: employmentContracts.ends_at,
        note: employmentContracts.note,
        business_id: employmentContracts.business_id,
        business_name: businesses.name,
        business_address: businesses.address,
        business_neighbourhood: businesses.neighbourhood,
        business_instagram: businesses.instagram_handle,
      })
      .from(employmentContracts)
      .innerJoin(businesses, eq(employmentContracts.business_id, businesses.id))
      .where(and(eq(employmentContracts.user_id, user_id), eq(employmentContracts.status, 'pending')));
    res.json(rows[0] ?? null);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/active-contract
router.get('/:id/active-contract', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  try {
    const rows = await db
      .select({
        id: employmentContracts.id,
        starts_at: employmentContracts.starts_at,
        ends_at: employmentContracts.ends_at,
        business_id: employmentContracts.business_id,
        business_name: businesses.name,
        business_address: businesses.address,
      })
      .from(employmentContracts)
      .innerJoin(businesses, eq(employmentContracts.business_id, businesses.id))
      .where(and(eq(employmentContracts.user_id, user_id), eq(employmentContracts.status, 'active')));
    res.json(rows[0] ?? null);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/followers — users who have nominated this user
router.get('/:id/followers', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  try {
    const rows = await db
      .select({ total: sql<number>`cast(count(distinct ${popupNominations.nominator_id}) as int)` })
      .from(popupNominations)
      .where(eq(popupNominations.nominee_id, user_id));
    res.json({ follower_count: rows[0]?.total ?? 0 });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
