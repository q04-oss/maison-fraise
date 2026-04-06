import { Router, Request, Response } from 'express';
import { eq, and, sql, count } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  portraitTokens,
  portraitLicenseRequests,
  portraitLicenses,
  portraitTokenListings,
} from '../db/schema';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';
import { logger } from '../lib/logger';

const router = Router();

// ─── Self-healing migrations ──────────────────────────────────────────────────

db.execute(sql`
  CREATE TABLE IF NOT EXISTS portrait_tokens (
    id SERIAL PRIMARY KEY,
    nfc_uid TEXT UNIQUE,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    original_owner_id INTEGER NOT NULL REFERENCES users(id),
    image_url TEXT NOT NULL,
    shot_at TIMESTAMP,
    minted_by INTEGER NOT NULL REFERENCES users(id),
    minted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    handle_visible BOOLEAN NOT NULL DEFAULT false,
    instagram_handle TEXT,
    open_to_licensing BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'active'
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS portrait_license_requests (
    id SERIAL PRIMARY KEY,
    token_id INTEGER NOT NULL REFERENCES portrait_tokens(id),
    requesting_businesses JSONB NOT NULL,
    scope TEXT NOT NULL DEFAULT 'in_app',
    duration_months INTEGER NOT NULL DEFAULT 3,
    total_offered_cents INTEGER NOT NULL,
    commission_cents INTEGER NOT NULL DEFAULT 0,
    subject_cents INTEGER NOT NULL DEFAULT 0,
    handle_visible BOOLEAN NOT NULL DEFAULT false,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS portrait_licenses (
    id SERIAL PRIMARY KEY,
    token_id INTEGER NOT NULL REFERENCES portrait_tokens(id),
    request_id INTEGER NOT NULL UNIQUE REFERENCES portrait_license_requests(id),
    active_from TIMESTAMP NOT NULL DEFAULT NOW(),
    active_until TIMESTAMP NOT NULL,
    scope TEXT NOT NULL,
    impression_rate_cents INTEGER NOT NULL DEFAULT 5,
    total_impressions INTEGER NOT NULL DEFAULT 0,
    total_earned_cents INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS portrait_token_listings (
    id SERIAL PRIMARY KEY,
    token_id INTEGER NOT NULL UNIQUE REFERENCES portrait_tokens(id),
    seller_user_id INTEGER NOT NULL REFERENCES users(id),
    asking_price_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'listed',
    buyer_user_id INTEGER REFERENCES users(id),
    sold_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

// ─── Routes (fixed routes before parameterized to prevent capture) ────────────

// GET /mine — auth required. Returns user's owned tokens with active license count
// and pending incoming request count.
router.get('/mine', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const tokens = await db.select().from(portraitTokens)
      .where(eq(portraitTokens.owner_id, userId));

    const enriched = await Promise.all(tokens.map(async (token) => {
      const [activeLicenseCount] = await db
        .select({ c: count() })
        .from(portraitLicenses)
        .where(
          and(
            eq(portraitLicenses.token_id, token.id),
            sql`${portraitLicenses.active_until} > NOW()`,
          ),
        );

      const [pendingRequestCount] = await db
        .select({ c: count() })
        .from(portraitLicenseRequests)
        .where(
          and(
            eq(portraitLicenseRequests.token_id, token.id),
            eq(portraitLicenseRequests.status, 'pending'),
            sql`${portraitLicenseRequests.expires_at} > NOW()`,
          ),
        );

      return {
        ...token,
        active_license_count: Number(activeLicenseCount?.c ?? 0),
        pending_request_count: Number(pendingRequestCount?.c ?? 0),
      };
    }));

    res.json(enriched);
  } catch (err) {
    logger.error(`portrait-tokens /mine error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /available — auth + is_shop. Returns tokens open to licensing.
router.get('/available', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [user] = await db.select({ is_shop: users.is_shop })
      .from(users).where(eq(users.id, userId));
    if (!user?.is_shop) { res.status(403).json({ error: 'shop_only' }); return; }

    const rows = await db
      .select({
        id: portraitTokens.id,
        image_url: portraitTokens.image_url,
        shot_at: portraitTokens.shot_at,
        handle_visible: portraitTokens.handle_visible,
        instagram_handle: portraitTokens.instagram_handle,
        open_to_licensing: portraitTokens.open_to_licensing,
        status: portraitTokens.status,
        owner_display_name: users.display_name,
      })
      .from(portraitTokens)
      .leftJoin(users, eq(portraitTokens.owner_id, users.id))
      .where(eq(portraitTokens.open_to_licensing, true));

    // Hide instagram_handle if not visible
    const result = rows.map(r => ({
      ...r,
      instagram_handle: r.handle_visible ? r.instagram_handle : null,
    }));

    res.json(result);
  } catch (err) {
    logger.error(`portrait-tokens /available error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /listings/:id/buy — must be before /:id to avoid param capture
router.post('/listings/:id/buy', requireUser, async (req: Request, res: Response) => {
  const buyerId = (req as any).userId as number;
  const listingId = parseInt(req.params.id, 10);
  if (isNaN(listingId)) { res.status(400).json({ error: 'invalid id' }); return; }

  try {
    // Load listing
    const [listing] = await db.select().from(portraitTokenListings)
      .where(eq(portraitTokenListings.id, listingId));
    if (!listing) { res.status(404).json({ error: 'listing_not_found' }); return; }
    if (listing.status !== 'listed') { res.status(409).json({ error: 'listing_not_active' }); return; }
    if (listing.seller_user_id === buyerId) { res.status(400).json({ error: 'cannot_buy_own_listing' }); return; }

    const royaltyCents = Math.round(listing.asking_price_cents * 0.15);
    const sellerProceedsCents = listing.asking_price_cents - royaltyCents;

    // Debit buyer with WHERE guard
    const [buyerUpdate] = await db
      .update(users)
      .set({ ad_balance_cents: sql`${users.ad_balance_cents} - ${listing.asking_price_cents}` })
      .where(
        and(
          eq(users.id, buyerId),
          sql`${users.ad_balance_cents} >= ${listing.asking_price_cents}`,
        ),
      )
      .returning({ ad_balance_cents: users.ad_balance_cents });

    if (!buyerUpdate) { res.status(402).json({ error: 'insufficient_balance' }); return; }

    // Credit seller
    await db.update(users)
      .set({ ad_balance_cents: sql`${users.ad_balance_cents} + ${sellerProceedsCents}` })
      .where(eq(users.id, listing.seller_user_id));

    // Transfer token ownership
    await db.update(portraitTokens)
      .set({ owner_id: buyerId, status: 'active' })
      .where(eq(portraitTokens.id, listing.token_id));

    // Update listing
    await db.update(portraitTokenListings)
      .set({ status: 'sold', buyer_user_id: buyerId, sold_at: new Date() })
      .where(eq(portraitTokenListings.id, listingId));

    // Push notify seller
    const [seller] = await db.select({ push_token: users.push_token })
      .from(users).where(eq(users.id, listing.seller_user_id));
    if (seller?.push_token) {
      sendPushNotification(seller.push_token, {
        title: 'Portrait token sold',
        body: `Your portrait token sold for CA$${(listing.asking_price_cents / 100).toFixed(2)}.`,
        data: { type: 'portrait_token_sold', token_id: listing.token_id },
      }).catch(() => {});
    }

    res.json({ ok: true, token_id: listing.token_id });
  } catch (err) {
    logger.error(`portrait-tokens /listings/:id/buy error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /mint — requires auth + is_dorotka check
router.post('/mint', requireUser, async (req: Request, res: Response) => {
  const photographerId = (req as any).userId as number;
  const { user_id, image_url, shot_at, handle_visible, instagram_handle } = req.body;
  if (!user_id || !image_url) {
    res.status(400).json({ error: 'user_id and image_url required' }); return;
  }

  try {
    const [photographer] = await db.select({ is_dorotka: users.is_dorotka })
      .from(users).where(eq(users.id, photographerId));
    if (!photographer?.is_dorotka) { res.status(403).json({ error: 'dorotka_only' }); return; }

    // Get subject's instagram handle
    const [subject] = await db.select({ instagram_handle: users.instagram_handle, push_token: users.push_token })
      .from(users).where(eq(users.id, parseInt(String(user_id), 10)));
    if (!subject) { res.status(404).json({ error: 'user_not_found' }); return; }

    const [token] = await db.insert(portraitTokens).values({
      owner_id: parseInt(String(user_id), 10),
      original_owner_id: parseInt(String(user_id), 10),
      image_url: String(image_url),
      shot_at: shot_at ? new Date(shot_at) : undefined,
      minted_by: photographerId,
      handle_visible: handle_visible ?? false,
      instagram_handle: instagram_handle ?? null,
      open_to_licensing: true,
      status: 'active',
    }).returning();

    // Push notify subject
    const [subjectUser] = await db.select({ push_token: users.push_token })
      .from(users).where(eq(users.id, parseInt(String(user_id), 10)));
    if (subjectUser?.push_token) {
      sendPushNotification(subjectUser.push_token, {
        title: 'Your portrait token is ready',
        body: 'A new portrait token has been minted for you.',
        data: { type: 'portrait_token_minted', token_id: token.id },
      }).catch(() => {});
    }

    res.json(token);
  } catch (err) {
    logger.error(`portrait-tokens /mint error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /:id — auth required. Returns full token detail.
router.get('/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const tokenId = parseInt(req.params.id, 10);
  if (isNaN(tokenId)) { res.status(400).json({ error: 'invalid id' }); return; }

  try {
    const [token] = await db.select().from(portraitTokens)
      .where(eq(portraitTokens.id, tokenId));
    if (!token) { res.status(404).json({ error: 'not_found' }); return; }

    // License history
    const licenses = await db
      .select({
        license: portraitLicenses,
        request: portraitLicenseRequests,
      })
      .from(portraitLicenses)
      .leftJoin(portraitLicenseRequests, eq(portraitLicenses.request_id, portraitLicenseRequests.id))
      .where(eq(portraitLicenses.token_id, tokenId));

    // Pending incoming requests (only visible to owner)
    let pendingRequests: any[] = [];
    if (token.owner_id === userId) {
      pendingRequests = await db.select().from(portraitLicenseRequests)
        .where(
          and(
            eq(portraitLicenseRequests.token_id, tokenId),
            eq(portraitLicenseRequests.status, 'pending'),
            sql`${portraitLicenseRequests.expires_at} > NOW()`,
          ),
        );
    }

    // Active listing if any
    const [activeListing] = await db.select().from(portraitTokenListings)
      .where(
        and(
          eq(portraitTokenListings.token_id, tokenId),
          eq(portraitTokenListings.status, 'listed'),
        ),
      );

    res.json({
      token,
      licenses,
      pending_requests: pendingRequests,
      active_listing: activeListing ?? null,
    });
  } catch (err) {
    logger.error(`portrait-tokens /:id error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /:id — auth, owner only. Accepts { open_to_licensing?, handle_visible? }.
router.patch('/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const tokenId = parseInt(req.params.id, 10);
  if (isNaN(tokenId)) { res.status(400).json({ error: 'invalid id' }); return; }

  try {
    const [token] = await db.select({ owner_id: portraitTokens.owner_id })
      .from(portraitTokens).where(eq(portraitTokens.id, tokenId));
    if (!token) { res.status(404).json({ error: 'not_found' }); return; }
    if (token.owner_id !== userId) { res.status(403).json({ error: 'not_owner' }); return; }

    // Whitelist
    const patch: Record<string, any> = {};
    if (typeof req.body.open_to_licensing === 'boolean') {
      patch.open_to_licensing = req.body.open_to_licensing;
    }
    if (typeof req.body.handle_visible === 'boolean') {
      patch.handle_visible = req.body.handle_visible;
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'no valid fields' }); return;
    }

    const [updated] = await db.update(portraitTokens).set(patch)
      .where(eq(portraitTokens.id, tokenId)).returning();
    res.json(updated);
  } catch (err) {
    logger.error(`portrait-tokens PATCH /:id error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /:id/list — auth, owner only.
router.post('/:id/list', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const tokenId = parseInt(req.params.id, 10);
  const { asking_price_cents } = req.body;
  if (isNaN(tokenId) || !asking_price_cents || asking_price_cents < 1) {
    res.status(400).json({ error: 'asking_price_cents required' }); return;
  }

  try {
    const [token] = await db.select().from(portraitTokens)
      .where(eq(portraitTokens.id, tokenId));
    if (!token) { res.status(404).json({ error: 'not_found' }); return; }
    if (token.owner_id !== userId) { res.status(403).json({ error: 'not_owner' }); return; }
    if (token.status === 'listed') { res.status(409).json({ error: 'already_listed' }); return; }

    const [listing] = await db.insert(portraitTokenListings).values({
      token_id: tokenId,
      seller_user_id: userId,
      asking_price_cents: parseInt(String(asking_price_cents), 10),
      status: 'listed',
    }).returning();

    await db.update(portraitTokens).set({ status: 'listed' })
      .where(eq(portraitTokens.id, tokenId));

    res.json(listing);
  } catch (err) {
    logger.error(`portrait-tokens /:id/list POST error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /:id/list — auth, owner only. Cancels listing.
router.delete('/:id/list', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const tokenId = parseInt(req.params.id, 10);
  if (isNaN(tokenId)) { res.status(400).json({ error: 'invalid id' }); return; }

  try {
    const [token] = await db.select({ owner_id: portraitTokens.owner_id })
      .from(portraitTokens).where(eq(portraitTokens.id, tokenId));
    if (!token) { res.status(404).json({ error: 'not_found' }); return; }
    if (token.owner_id !== userId) { res.status(403).json({ error: 'not_owner' }); return; }

    await db.update(portraitTokenListings)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(portraitTokenListings.token_id, tokenId),
          eq(portraitTokenListings.status, 'listed'),
        ),
      );

    await db.update(portraitTokens).set({ status: 'active' })
      .where(eq(portraitTokens.id, tokenId));

    res.json({ ok: true });
  } catch (err) {
    logger.error(`portrait-tokens /:id/list DELETE error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /:id/impression — auth, business must have active license for this token.
router.post('/:id/impression', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const tokenId = parseInt(req.params.id, 10);
  if (isNaN(tokenId)) { res.status(400).json({ error: 'invalid id' }); return; }

  try {
    // Find active license for this token
    const [license] = await db.select().from(portraitLicenses)
      .where(
        and(
          eq(portraitLicenses.token_id, tokenId),
          sql`${portraitLicenses.active_until} > NOW()`,
        ),
      );
    if (!license) { res.status(403).json({ error: 'no_active_license' }); return; }

    // Get token owner
    const [token] = await db.select({ owner_id: portraitTokens.owner_id })
      .from(portraitTokens).where(eq(portraitTokens.id, tokenId));
    if (!token) { res.status(404).json({ error: 'token_not_found' }); return; }

    const rateCents = license.impression_rate_cents;

    // Debit 2x from business user
    const [bizUpdate] = await db.update(users)
      .set({ ad_balance_cents: sql`${users.ad_balance_cents} - ${rateCents * 2}` })
      .where(
        and(
          eq(users.id, userId),
          sql`${users.ad_balance_cents} >= ${rateCents * 2}`,
        ),
      )
      .returning({ ad_balance_cents: users.ad_balance_cents });

    if (!bizUpdate) { res.status(402).json({ error: 'insufficient_balance' }); return; }

    // Credit token owner
    await db.update(users)
      .set({ ad_balance_cents: sql`${users.ad_balance_cents} + ${rateCents}` })
      .where(eq(users.id, token.owner_id));

    // Update license stats
    await db.update(portraitLicenses)
      .set({
        total_impressions: sql`${portraitLicenses.total_impressions} + 1`,
        total_earned_cents: sql`${portraitLicenses.total_earned_cents} + ${rateCents}`,
      })
      .where(eq(portraitLicenses.id, license.id));

    res.json({ ok: true, earned_cents: rateCents });
  } catch (err) {
    logger.error(`portrait-tokens /:id/impression error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
