import { Router, Request, Response } from 'express';
import { eq, sum, and, sql, desc, inArray, gte } from 'drizzle-orm';
import { db } from '../db';
import {
  users, legitimacyEvents, businesses, popupRsvps, djOffers, popupNominations,
  employmentContracts, orders, varieties, timeSlots, userFollows, notifications,
  referralCodes, memberships, popupMerchOrders, popupMerchItems,
} from '../db/schema';
import { requireUser } from '../lib/auth';
import { MIN_QUANTITY } from '../lib/batchTrigger';
import { stripe } from '../lib/stripe';
import { currentBankSeconds, tierFromBalance, effectiveTier } from '../lib/socialTier';

const router = Router();

// GET /api/users/me — identified by Bearer token
router.get('/me', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;

  try {
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      display_name: users.display_name,
      verified: users.verified,
      verified_at: users.verified_at,
      is_dj: users.is_dj,
      is_shop: users.is_shop,
      user_code: users.user_code,
      fraise_chat_email: users.fraise_chat_email,
      ad_balance_cents: users.ad_balance_cents,
      portal_opted_in: users.portal_opted_in,
      is_dorotka: users.is_dorotka,
      social_time_bank_seconds: users.social_time_bank_seconds,
      social_time_bank_updated_at: users.social_time_bank_updated_at,
      social_lifetime_credits_seconds: users.social_lifetime_credits_seconds,
      social_tier: users.social_tier,
      current_streak_weeks: users.current_streak_weeks,
      longest_streak_weeks: users.longest_streak_weeks,
      notification_prefs: users.notification_prefs,
      business_id: users.business_id,
      stripe_connect_onboarded: users.stripe_connect_onboarded,
    }).from(users).where(eq(users.id, user_id));
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

// GET /api/users/me/social-access
router.get('/me/social-access', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const [user] = await db
      .select({
        social_time_bank_seconds: users.social_time_bank_seconds,
        social_time_bank_updated_at: users.social_time_bank_updated_at,
        social_lifetime_credits_seconds: users.social_lifetime_credits_seconds,
        social_tier: users.social_tier,
      })
      .from(users)
      .where(eq(users.id, user_id))
      .limit(1);
    const balance = currentBankSeconds(
      user?.social_time_bank_seconds ?? 0,
      user?.social_time_bank_updated_at ?? null,
    );
    const tier = effectiveTier(tierFromBalance(balance), user?.social_tier ?? null);
    res.json({
      active: balance > 0,
      tier,
      bank_days: Math.floor(balance / 86400),
      lifetime_days: Math.floor((user?.social_lifetime_credits_seconds ?? 0) / 86400),
    });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/users/me/stats — auth required. Returns profile stats.
router.get('/me/stats', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [user] = await db.select({
      id: users.id,
      ad_balance_cents: users.ad_balance_cents,
      display_name: users.display_name,
      user_code: users.user_code,
      portal_opted_in: users.portal_opted_in,
      verified: users.verified,
      current_streak_weeks: users.current_streak_weeks,
      longest_streak_weeks: users.longest_streak_weeks,
      eth_address: users.eth_address,
    }).from(users).where(eq(users.id, userId));
    if (!user) { res.status(404).json({ error: 'not_found' }); return; }

    const eveningRes = await db.execute(sql`
      SELECT COUNT(*)::text as count FROM evening_tokens
      WHERE (user_a_id = ${userId} OR user_b_id = ${userId}) AND minted_at IS NOT NULL
    `);
    const portraitRes = await db.execute(sql`
      SELECT COUNT(*)::text as count FROM portrait_tokens WHERE owner_id = ${userId}
    `);
    const nfcRes = await db.execute(sql`
      SELECT COUNT(*)::text as count FROM nfc_connections
      WHERE user_a = ${userId} OR user_b = ${userId}
    `);
    const eveningRow = ((eveningRes as any).rows ?? eveningRes)[0];
    const portraitRow = ((portraitRes as any).rows ?? portraitRes)[0];
    const nfcRow = ((nfcRes as any).rows ?? nfcRes)[0];
    const [membershipRow] = await db.select({ tier: memberships.tier })
      .from(memberships)
      .where(and(eq(memberships.user_id, userId), eq(memberships.status, 'active')))
      .limit(1);

    res.json({
      id: userId,
      ad_balance_cents: user.ad_balance_cents,
      display_name: user.display_name,
      user_code: user.user_code,
      portal_opted_in: user.portal_opted_in,
      verified: user.verified,
      current_streak_weeks: user.current_streak_weeks ?? 0,
      longest_streak_weeks: user.longest_streak_weeks ?? 0,
      evening_count: parseInt((eveningRow as any).count ?? '0', 10),
      portrait_count: parseInt((portraitRow as any).count ?? '0', 10),
      nfc_connection_count: parseInt((nfcRow as any).count ?? '0', 10),
      membership_tier: membershipRow?.tier ?? null,
      eth_address: user.eth_address ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/users/me/wallet — link an Optimism wallet address for FRS balance display
router.patch('/me/wallet', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { eth_address } = req.body ?? {};
  if (typeof eth_address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(eth_address)) {
    res.status(400).json({ error: 'invalid_address' });
    return;
  }
  try {
    await db.update(users).set({ eth_address: eth_address.toLowerCase() }).where(eq(users.id, userId));
    res.json({ eth_address: eth_address.toLowerCase() });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/users/search?q= — verified users only
router.get('/search', requireUser, async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.status(400).json({ error: 'q must be at least 2 characters' });
    return;
  }
  try {
    const rows = await db
      .select({ id: users.id, display_name: users.display_name, email: users.email, verified: users.verified, is_dj: users.is_dj })
      .from(users)
      .where(
        sql`(${users.display_name} ILIKE ${'%' + q + '%'} OR ${users.email} ILIKE ${'%' + q + '%'}) AND ${users.verified} = true`
      )
      .limit(20);
    res.json(rows.map(r => ({
      id: r.id,
      display_name: r.display_name ?? r.email.split('@')[0],
      verified: r.verified,
      is_dj: r.is_dj,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/me/display-name — update logged-in user's display name
router.patch('/me/display-name', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const { display_name } = req.body;
  if (!display_name || typeof display_name !== 'string' || display_name.trim().length < 2) {
    res.status(400).json({ error: 'display_name must be at least 2 characters' });
    return;
  }
  try {
    const [updated] = await db.update(users).set({ display_name: display_name.trim() }).where(eq(users.id, user_id)).returning();
    res.json({ success: true, display_name: updated.display_name });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/follow
router.post('/:id/follow', requireUser, async (req: Request, res: Response) => {
  const followee_id = parseInt(req.params.id, 10);
  const follower_id = (req as any).userId as number;
  if (isNaN(followee_id)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  if (follower_id === followee_id) {
    res.status(400).json({ error: 'Cannot follow yourself' });
    return;
  }
  try {
    await db.insert(userFollows).values({ follower_id, followee_id });

    // Notify the followee
    await db.insert(notifications).values({
      user_id: followee_id,
      type: 'follow',
      title: 'New follower',
      body: 'Someone started following you.',
      data: { follower_id },
    });

    res.json({ success: true });
  } catch (err: any) {
    // unique violation
    if (err?.code === '23505') {
      res.status(409).json({ error: 'Already following' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id/follow
router.delete('/:id/follow', requireUser, async (req: Request, res: Response) => {
  const followee_id = parseInt(req.params.id, 10);
  const follower_id = (req as any).userId as number;
  if (isNaN(followee_id)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  try {
    await db.delete(userFollows).where(
      and(eq(userFollows.follower_id, follower_id), eq(userFollows.followee_id, followee_id))
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/follow-status
router.get('/:id/follow-status', requireUser, async (req: Request, res: Response) => {
  const followee_id = parseInt(req.params.id, 10);
  const follower_id = (req as any).userId as number;
  if (isNaN(followee_id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const rows = await db
      .select({ id: userFollows.id })
      .from(userFollows)
      .where(and(eq(userFollows.follower_id, follower_id), eq(userFollows.followee_id, followee_id)));
    res.json({ is_following: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id/dj — toggle DJ status (admin only)
router.patch('/:id/dj', requireUser, async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  const caller_id = (req as any).userId as number;
  const { is_dj } = req.body;
  if (isNaN(user_id) || typeof is_dj !== 'boolean') {
    res.status(400).json({ error: 'is_dj boolean is required' });
    return;
  }

  try {
    const [caller] = await db.select({ is_dorotka: users.is_dorotka }).from(users).where(eq(users.id, caller_id)).limit(1);
    if (!caller?.is_dorotka) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    await db.update(users).set({ is_dj }).where(eq(users.id, user_id));
    res.json({ success: true, is_dj });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/popup-rsvps
router.get('/:id/popup-rsvps', requireUser, async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  const caller_id = (req as any).userId as number;
  if (isNaN(user_id)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  if (user_id !== caller_id) {
    res.status(403).json({ error: 'Forbidden' });
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
router.get('/:id/dj-gigs', requireUser, async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  const caller_id = (req as any).userId as number;
  if (isNaN(user_id)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  if (user_id !== caller_id) {
    res.status(403).json({ error: 'Forbidden' });
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
router.get('/:id/contract-offer', requireUser, async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  const caller_id = (req as any).userId as number;
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  if (user_id !== caller_id) { res.status(403).json({ error: 'Forbidden' }); return; }
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
router.get('/:id/active-contract', requireUser, async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  const caller_id = (req as any).userId as number;
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  if (user_id !== caller_id) { res.status(403).json({ error: 'Forbidden' }); return; }
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

// GET /api/users/:id/public-profile
router.get('/:id/public-profile', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  try {
    const [user] = await db.select().from(users).where(eq(users.id, user_id));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const [followerRow] = await db
      .select({ total: sql<number>`cast(count(distinct ${popupNominations.nominator_id}) as int)` })
      .from(popupNominations).where(eq(popupNominations.nominee_id, user_id));

    const [nominationRow] = await db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(popupNominations).where(eq(popupNominations.nominee_id, user_id));

    const [activeContract] = await db
      .select({ business_name: businesses.name, business_address: businesses.address, ends_at: employmentContracts.ends_at })
      .from(employmentContracts)
      .innerJoin(businesses, eq(employmentContracts.business_id, businesses.id))
      .where(and(eq(employmentContracts.user_id, user_id), eq(employmentContracts.status, 'active')));

    const [pastRow] = await db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(employmentContracts)
      .where(and(eq(employmentContracts.user_id, user_id), eq(employmentContracts.status, 'completed')));

    res.json({
      user_id,
      display_name: user.display_name ?? user.email.split('@')[0],
      is_dj: user.is_dj,
      follower_count: followerRow?.total ?? 0,
      nomination_count: nominationRow?.total ?? 0,
      active_placement: activeContract ? {
        business_name: activeContract.business_name,
        business_address: activeContract.business_address,
        ends_at: activeContract.ends_at,
      } : null,
      past_placements: pastRow?.total ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/me/orders — order history for authenticated user
router.get('/me/orders', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, user_id));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const rows = await db
      .select({
        id: orders.id,
        variety_id: orders.variety_id,
        location_id: orders.location_id,
        variety_name: varieties.name,
        chocolate: orders.chocolate,
        finish: orders.finish,
        quantity: orders.quantity,
        total_cents: orders.total_cents,
        status: orders.status,
        nfc_token: orders.nfc_token,
        rating: orders.rating,
        slot_date: timeSlots.date,
        slot_time: timeSlots.time,
        created_at: orders.created_at,
      })
      .from(orders)
      .leftJoin(varieties, eq(orders.variety_id, varieties.id))
      .leftJoin(timeSlots, eq(orders.time_slot_id, timeSlots.id))
      .where(eq(orders.customer_email, user.email))
      .orderBy(desc(orders.created_at))
      .limit(parseInt(req.query.limit as string) || 20)
      .offset(parseInt(req.query.offset as string) || 0);

    // Enrich queued orders with batch progress
    const enriched = await Promise.all(rows.map(async row => {
      if (row.status !== 'queued' || !row.variety_id || !row.location_id) return row;
      const queuedRows = await db.select({ qty: orders.quantity }).from(orders).where(and(eq(orders.variety_id, row.variety_id), eq(orders.location_id, row.location_id), eq(orders.status, 'queued')));
      const queued_boxes = queuedRows.reduce((s, r) => s + r.qty, 0);
      return { ...row, queued_boxes, min_quantity: MIN_QUANTITY };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notifications
router.get('/notifications', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, user_id))
      .orderBy(desc(notifications.created_at))
      .limit(40);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/notifications/:id/read', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const user_id = (req as any).userId as number;
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.user_id, user_id)));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/feed — activity feed from followed users
router.get('/feed', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const followRows = await db
      .select({ followee_id: userFollows.followee_id })
      .from(userFollows)
      .where(eq(userFollows.follower_id, user_id));

    if (followRows.length === 0) { res.json([]); return; }

    const followeeIds = followRows.map(r => r.followee_id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [nomRows, contractRows, rsvpRows] = await Promise.all([
      db
        .select({
          type: sql<string>`'nomination'`,
          actor_id: popupNominations.nominator_id,
          actor_name: users.display_name,
          actor_email: users.email,
          subject: businesses.name,
          created_at: popupNominations.created_at,
        })
        .from(popupNominations)
        .innerJoin(users, eq(popupNominations.nominator_id, users.id))
        .innerJoin(businesses, eq(popupNominations.popup_id, businesses.id))
        .where(and(
          inArray(popupNominations.nominator_id, followeeIds),
          gte(popupNominations.created_at, thirtyDaysAgo),
        )),

      db
        .select({
          type: sql<string>`'placement'`,
          actor_id: employmentContracts.user_id,
          actor_name: users.display_name,
          actor_email: users.email,
          subject: businesses.name,
          created_at: employmentContracts.created_at,
        })
        .from(employmentContracts)
        .innerJoin(users, eq(employmentContracts.user_id, users.id))
        .innerJoin(businesses, eq(employmentContracts.business_id, businesses.id))
        .where(and(
          inArray(employmentContracts.user_id, followeeIds),
          eq(employmentContracts.status, 'active'),
          gte(employmentContracts.created_at, thirtyDaysAgo),
        )),

      db
        .select({
          type: sql<string>`'rsvp'`,
          actor_id: popupRsvps.user_id,
          actor_name: users.display_name,
          actor_email: users.email,
          subject: businesses.name,
          created_at: popupRsvps.created_at,
        })
        .from(popupRsvps)
        .innerJoin(users, eq(popupRsvps.user_id, users.id))
        .innerJoin(businesses, eq(popupRsvps.popup_id, businesses.id))
        .where(and(
          inArray(popupRsvps.user_id, followeeIds),
          inArray(popupRsvps.status, ['paid', 'waitlist']),
          gte(popupRsvps.created_at, thirtyDaysAgo),
        )),
    ]);

    const allItems = [...nomRows, ...contractRows, ...rsvpRows].map(item => ({
      type: item.type,
      actor_id: item.actor_id,
      actor_name: item.actor_name ?? item.actor_email.split('@')[0],
      subject: item.subject,
      created_at: item.created_at,
    }));

    allItems.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    res.json(allItems.slice(0, 30));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/following — list of users this user follows
router.get('/:id/following', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  try {
    // alias users table for the followee
    const followees = await db
      .select({ id: users.id, display_name: users.display_name, email: users.email, is_dj: users.is_dj })
      .from(userFollows)
      .innerJoin(users, eq(userFollows.followee_id, users.id))
      .where(eq(userFollows.follower_id, user_id))
      .orderBy(desc(userFollows.created_at));
    res.json(followees.map(u => ({ ...u, display_name: u.display_name ?? u.email.split('@')[0] })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/followers-list — list of users who follow this user
router.get('/:id/followers-list', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  try {
    // We need to join on follower side — use aliased query
    const rows = await db
      .select({ id: userFollows.follower_id, created_at: userFollows.created_at })
      .from(userFollows)
      .where(eq(userFollows.followee_id, user_id))
      .orderBy(desc(userFollows.created_at));

    // Fetch user details for each follower
    if (rows.length === 0) { res.json([]); return; }
    const followerIds = rows.map(r => r.id);
    const followerUsers = await db
      .select({ id: users.id, display_name: users.display_name, email: users.email, is_dj: users.is_dj })
      .from(users)
      .where(inArray(users.id, followerIds));

    const map = Object.fromEntries(followerUsers.map(u => [u.id, u]));
    res.json(rows.map(r => {
      const u = map[r.id];
      return u ? { ...u, display_name: u.display_name ?? u.email.split('@')[0] } : null;
    }).filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/nominations-given — nominations this user has made
router.get('/:id/nominations-given', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  try {
    const rows = await db
      .select({
        id: popupNominations.id,
        popup_id: popupNominations.popup_id,
        popup_name: businesses.name,
        popup_starts_at: businesses.starts_at,
        nominee_id: popupNominations.nominee_id,
        nominee_name: users.display_name,
        nominee_email: users.email,
        created_at: popupNominations.created_at,
      })
      .from(popupNominations)
      .innerJoin(businesses, eq(popupNominations.popup_id, businesses.id))
      .innerJoin(users, eq(popupNominations.nominee_id, users.id))
      .where(eq(popupNominations.nominator_id, user_id))
      .orderBy(desc(popupNominations.created_at));
    res.json(rows.map(r => ({
      id: r.id,
      popup_id: r.popup_id,
      popup_name: r.popup_name,
      popup_starts_at: r.popup_starts_at,
      nominee_id: r.nominee_id,
      nominee_name: r.nominee_name ?? r.nominee_email.split('@')[0],
      created_at: r.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/nominations-received — nominations this user has received
router.get('/:id/nominations-received', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  try {
    // Need nominator info — join users twice
    // Use raw sql approach since drizzle doesn't easily alias tables
    const rows = await db
      .select({
        id: popupNominations.id,
        popup_id: popupNominations.popup_id,
        popup_name: businesses.name,
        popup_starts_at: businesses.starts_at,
        nominator_id: popupNominations.nominator_id,
        created_at: popupNominations.created_at,
      })
      .from(popupNominations)
      .innerJoin(businesses, eq(popupNominations.popup_id, businesses.id))
      .where(eq(popupNominations.nominee_id, user_id))
      .orderBy(desc(popupNominations.created_at));

    // Fetch nominator names separately
    const nominatorIds = [...new Set(rows.map(r => r.nominator_id))];
    const nominators = nominatorIds.length > 0
      ? await db.select({ id: users.id, display_name: users.display_name, email: users.email }).from(users).where(inArray(users.id, nominatorIds))
      : [];
    const nominatorMap = Object.fromEntries(nominators.map(u => [u.id, u]));

    res.json(rows.map(r => {
      const nom = nominatorMap[r.nominator_id];
      return { ...r, nominator_name: nom ? (nom.display_name ?? nom.email.split('@')[0]) : 'Unknown' };
    }));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/placements — past and active employment contracts for a user (as DJ)
router.get('/:id/placements', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  try {
    const rows = await db
      .select({
        id: employmentContracts.id,
        business_id: employmentContracts.business_id,
        business_name: businesses.name,
        starts_at: employmentContracts.starts_at,
        ends_at: employmentContracts.ends_at,
        status: employmentContracts.status,
      })
      .from(employmentContracts)
      .innerJoin(businesses, eq(employmentContracts.business_id, businesses.id))
      .where(eq(employmentContracts.user_id, user_id))
      .orderBy(desc(employmentContracts.starts_at))
      .limit(20);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/me/setup-intent — create or retrieve Stripe customer + SetupIntent
router.post('/me/setup-intent', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const [user] = await db.select().from(users).where(eq(users.id, user_id));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.display_name ?? undefined,
        metadata: { user_id: String(user_id) },
      });
      customerId = customer.id;
      await db.update(users).set({ stripe_customer_id: customerId }).where(eq(users.id, user_id));
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
    });

    res.json({ client_secret: setupIntent.client_secret, customer_id: customerId });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/me/payment-method — attach payment method + set as default
router.post('/me/payment-method', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const { payment_method_id } = req.body;
  if (!payment_method_id) { res.status(400).json({ error: 'payment_method_id is required' }); return; }
  try {
    const [user] = await db.select().from(users).where(eq(users.id, user_id));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.display_name ?? undefined,
        metadata: { user_id: String(user_id) },
      });
      customerId = customer.id;
      await db.update(users).set({ stripe_customer_id: customerId }).where(eq(users.id, user_id));
    }

    await stripe.paymentMethods.attach(payment_method_id, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: payment_method_id },
    });

    if (!user.stripe_customer_id) {
      await db.update(users).set({ stripe_customer_id: customerId }).where(eq(users.id, user_id));
    }

    res.json({ success: true, customer_id: customerId });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/legitimacy — score breakdown by event type
router.get('/:id/legitimacy', async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
  try {
    const events = await db
      .select({
        event_type: legitimacyEvents.event_type,
        total: sql<number>`cast(sum(${legitimacyEvents.weight}) as int)`,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(legitimacyEvents)
      .where(eq(legitimacyEvents.user_id, user_id))
      .groupBy(legitimacyEvents.event_type);

    const total = events.reduce((s, e) => s + (e.total ?? 0), 0);
    res.json({ total, breakdown: events });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/me/referral-code — get or create referral code for current user
router.get('/me/referral-code', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const [existing] = await db
      .select({ code: referralCodes.code, uses: referralCodes.uses })
      .from(referralCodes)
      .where(eq(referralCodes.user_id, user_id));

    if (existing) {
      res.json(existing);
      return;
    }

    // Generate a new 6-character uppercase alphanumeric code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const [inserted] = await db
      .insert(referralCodes)
      .values({ user_id, code, uses: 0 })
      .returning({ code: referralCodes.code, uses: referralCodes.uses });

    res.json(inserted);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/me/apply-referral — apply a referral code at signup
router.post('/me/apply-referral', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  try {
    const [referral] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.code, code.toUpperCase()));

    if (!referral) {
      res.status(404).json({ error: 'Referral code not found' });
      return;
    }

    if (referral.user_id === user_id) {
      res.status(400).json({ error: 'Cannot use your own referral code' });
      return;
    }

    const [currentUser] = await db
      .select({ referred_by_code: users.referred_by_code })
      .from(users)
      .where(eq(users.id, user_id));

    if (!currentUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (currentUser.referred_by_code !== null) {
      res.status(409).json({ error: 'Referral code already applied' });
      return;
    }

    await db.update(users).set({ referred_by_code: code.toUpperCase() }).where(eq(users.id, user_id));
    await db
      .update(referralCodes)
      .set({ uses: sql`${referralCodes.uses} + 1` })
      .where(eq(referralCodes.id, referral.id));

    res.json({ discount_percent: 10 });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const DEFAULT_NOTIFICATION_PREFS = { order_updates: true, social: true, popup_updates: true, marketing: true };

// GET /api/users/me/notification-prefs
router.get('/me/notification-prefs', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const [user] = await db.select({ notification_prefs: users.notification_prefs }).from(users).where(eq(users.id, user_id));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user.notification_prefs ?? DEFAULT_NOTIFICATION_PREFS);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/me/notification-prefs
router.patch('/me/notification-prefs', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const { order_updates, social, popup_updates, marketing } = req.body;
  const prefs = { order_updates: !!order_updates, social: !!social, popup_updates: !!popup_updates, marketing: !!marketing };
  try {
    const [updated] = await db.update(users).set({ notification_prefs: prefs }).where(eq(users.id, user_id)).returning({ notification_prefs: users.notification_prefs });
    if (!updated) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(updated.notification_prefs);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/me/merch-history
router.get('/me/merch-history', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  try {
    const sent = await db
      .select({
        id: popupMerchOrders.id,
        popup_id: popupMerchOrders.popup_id,
        item_id: popupMerchOrders.item_id,
        item_name: popupMerchItems.name,
        size: popupMerchOrders.size,
        total_cents: popupMerchOrders.total_cents,
        status: popupMerchOrders.status,
        donated: popupMerchOrders.donated,
        recipient_user_id: popupMerchOrders.recipient_user_id,
        recipient_name: sql<string | null>`(SELECT display_name FROM users WHERE id = ${popupMerchOrders.recipient_user_id})`,
        created_at: popupMerchOrders.created_at,
      })
      .from(popupMerchOrders)
      .innerJoin(popupMerchItems, eq(popupMerchOrders.item_id, popupMerchItems.id))
      .where(eq(popupMerchOrders.buyer_user_id, user_id))
      .orderBy(desc(popupMerchOrders.created_at));

    const received = await db
      .select({
        id: popupMerchOrders.id,
        popup_id: popupMerchOrders.popup_id,
        item_id: popupMerchOrders.item_id,
        item_name: popupMerchItems.name,
        size: popupMerchOrders.size,
        total_cents: popupMerchOrders.total_cents,
        status: popupMerchOrders.status,
        buyer_user_id: popupMerchOrders.buyer_user_id,
        buyer_name: sql<string | null>`(SELECT display_name FROM users WHERE id = ${popupMerchOrders.buyer_user_id})`,
        created_at: popupMerchOrders.created_at,
      })
      .from(popupMerchOrders)
      .innerJoin(popupMerchItems, eq(popupMerchOrders.item_id, popupMerchItems.id))
      .where(and(eq(popupMerchOrders.recipient_user_id, user_id), eq(popupMerchOrders.status, 'paid')))
      .orderBy(desc(popupMerchOrders.created_at));

    res.json({ sent, received });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

// @final-audit
