import { Router, Request, Response } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  portraitTokens,
  portraitLicenseRequests,
  portraitLicenses,
} from '../db/schema';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';
import { logger } from '../lib/logger';

const router = Router();

// ─── Self-healing migrations (idempotent — tables created in portrait-tokens.ts) ─

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

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /request — auth + is_shop
router.post('/request', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const {
    token_id,
    scope,
    duration_months,
    business_contributions,
    handle_visible,
    message,
  } = req.body;

  if (!token_id || !scope || !duration_months || !business_contributions) {
    res.status(400).json({ error: 'token_id, scope, duration_months, business_contributions required' });
    return;
  }
  if (!Array.isArray(business_contributions) || business_contributions.length === 0) {
    res.status(400).json({ error: 'business_contributions must be a non-empty array' });
    return;
  }
  if (!['in_app', 'regional_print', 'global'].includes(scope)) {
    res.status(400).json({ error: 'invalid scope' });
    return;
  }

  try {
    const [user] = await db.select({ is_shop: users.is_shop, business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.is_shop) { res.status(403).json({ error: 'shop_only' }); return; }
    if (!user.business_id) { res.status(422).json({ error: 'no_business_on_account' }); return; }

    // Validate token exists and is open to licensing
    const [token] = await db.select().from(portraitTokens)
      .where(eq(portraitTokens.id, parseInt(String(token_id), 10)));
    if (!token) { res.status(404).json({ error: 'token_not_found' }); return; }
    if (!token.open_to_licensing) { res.status(400).json({ error: 'token_not_open_to_licensing' }); return; }

    const totalOfferedCents: number = business_contributions.reduce(
      (sum: number, b: { contribution_cents: number }) => sum + (b.contribution_cents ?? 0),
      0,
    );
    if (totalOfferedCents < 1) {
      res.status(400).json({ error: 'total contribution must be >= 1' }); return;
    }

    const commissionCents = Math.round(totalOfferedCents * 0.2);
    const subjectCents = totalOfferedCents - commissionCents;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Build requesting_businesses array — null id falls back to caller's business
    const requestingBusinesses = await Promise.all(
      business_contributions.map(async (bc: { id: number | null; name?: string; contribution_cents: number }) => {
        const bizId = bc.id ?? user.business_id!;
        if (bc.name) {
          return { id: bizId, name: bc.name, contribution_cents: bc.contribution_cents };
        }
        const { businesses } = await import('../db/schema');
        const [biz] = await db.select({ name: businesses.name })
          .from(businesses).where(eq(businesses.id, bizId));
        return { id: bizId, name: biz?.name ?? `Business #${bizId}`, contribution_cents: bc.contribution_cents };
      }),
    );

    const [licenseRequest] = await db.insert(portraitLicenseRequests).values({
      token_id: parseInt(String(token_id), 10),
      requesting_businesses: requestingBusinesses,
      scope: String(scope),
      duration_months: parseInt(String(duration_months), 10),
      total_offered_cents: totalOfferedCents,
      commission_cents: commissionCents,
      subject_cents: subjectCents,
      handle_visible: handle_visible ?? false,
      message: message ?? null,
      status: 'pending',
      expires_at: expiresAt,
    }).returning();

    // Push notify token owner
    const [owner] = await db.select({ push_token: users.push_token })
      .from(users).where(eq(users.id, token.owner_id));
    if (owner?.push_token) {
      sendPushNotification(owner.push_token, {
        title: 'New portrait license request',
        body: `A business wants to license your portrait for CA$${(subjectCents / 100).toFixed(2)}.`,
        data: { type: 'portrait_license_request', request_id: licenseRequest.id },
      }).catch(() => {});
    }

    res.json(licenseRequest);
  } catch (err) {
    logger.error(`portrait-licenses /request error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /incoming — auth required. Pending requests for tokens owned by this user.
router.get('/incoming', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    // Get user's token IDs
    const myTokens = await db.select({ id: portraitTokens.id })
      .from(portraitTokens).where(eq(portraitTokens.owner_id, userId));
    const tokenIds = myTokens.map(t => t.id);
    if (tokenIds.length === 0) { res.json([]); return; }

    const requests = await db.select().from(portraitLicenseRequests)
      .where(
        and(
          sql`${portraitLicenseRequests.token_id} = ANY(ARRAY[${sql.join(tokenIds.map(id => sql`${id}`), sql`, `)}]::int[])`,
          eq(portraitLicenseRequests.status, 'pending'),
          sql`${portraitLicenseRequests.expires_at} > NOW()`,
        ),
      );

    res.json(requests);
  } catch (err) {
    logger.error(`portrait-licenses /incoming error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /sent — auth + is_shop. Requests sent by this user's business.
router.get('/sent', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [user] = await db.select({ is_shop: users.is_shop, business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.is_shop) { res.status(403).json({ error: 'shop_only' }); return; }

    // Find requests where this business appears in requesting_businesses
    const businessId = user.business_id;
    if (!businessId) { res.json([]); return; }

    const requests = await db.select().from(portraitLicenseRequests)
      .where(
        sql`${portraitLicenseRequests.requesting_businesses} @> ${JSON.stringify([{ id: businessId }])}::jsonb`,
      );

    res.json(requests);
  } catch (err) {
    logger.error(`portrait-licenses /sent error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /:id/accept — auth, must be token owner. Atomic.
router.patch('/:id/accept', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId)) { res.status(400).json({ error: 'invalid id' }); return; }

  try {
    // Fetch request first — verify it exists, is pending, and not expired
    const [licenseRequest] = await db.select().from(portraitLicenseRequests)
      .where(
        and(
          eq(portraitLicenseRequests.id, requestId),
          eq(portraitLicenseRequests.status, 'pending'),
          sql`${portraitLicenseRequests.expires_at} > NOW()`,
        ),
      );
    if (!licenseRequest) { res.status(409).json({ error: 'already_responded_or_expired' }); return; }

    // Verify caller is token owner BEFORE touching status
    const [token] = await db.select({ owner_id: portraitTokens.owner_id })
      .from(portraitTokens).where(eq(portraitTokens.id, licenseRequest.token_id));
    if (!token || token.owner_id !== userId) {
      res.status(403).json({ error: 'not_owner' }); return;
    }

    const businesses = licenseRequest.requesting_businesses as Array<{ id: number; name: string; contribution_cents: number }>;

    // Compute active_until before transaction
    const activeUntil = new Date();
    activeUntil.setMonth(activeUntil.getMonth() + licenseRequest.duration_months);

    // Wrap status update + all debits + credit + license creation in one transaction
    const license = await db.transaction(async (tx) => {
      // Atomic status guard inside transaction
      const [accepted] = await tx.update(portraitLicenseRequests)
        .set({ status: 'accepted', accepted_at: new Date() })
        .where(
          and(
            eq(portraitLicenseRequests.id, requestId),
            eq(portraitLicenseRequests.status, 'pending'),
          ),
        )
        .returning();
      if (!accepted) throw new Error('RACE_CONFLICT');

      // Debit each business — any failure rolls back the whole transaction
      for (const biz of businesses) {
        const [shopUser] = await tx.select({ id: users.id })
          .from(users)
          .where(and(eq(users.business_id, biz.id), eq(users.is_shop, true)));
        if (!shopUser) throw new Error('SHOP_NOT_FOUND');

        const [debitResult] = await tx.update(users)
          .set({ ad_balance_cents: sql`${users.ad_balance_cents} - ${biz.contribution_cents}` })
          .where(
            and(
              eq(users.id, shopUser.id),
              sql`${users.ad_balance_cents} >= ${biz.contribution_cents}`,
            ),
          )
          .returning({ id: users.id });
        if (!debitResult) throw new Error('INSUFFICIENT_BALANCE');
      }

      // Credit subject
      await tx.update(users)
        .set({ ad_balance_cents: sql`${users.ad_balance_cents} + ${licenseRequest.subject_cents}` })
        .where(eq(users.id, userId));

      // Create license record
      const [newLicense] = await tx.insert(portraitLicenses).values({
        token_id: licenseRequest.token_id,
        request_id: requestId,
        active_until: activeUntil,
        scope: licenseRequest.scope,
        impression_rate_cents: 5,
      }).returning();

      return newLicense;
    });

    // Fire-and-forget push notify first business's shop user
    if (businesses.length > 0) {
      db.select({ push_token: users.push_token })
        .from(users)
        .where(and(eq(users.business_id, businesses[0].id), eq(users.is_shop, true)))
        .then(([shopUser]) => {
          if (shopUser?.push_token) {
            sendPushNotification(shopUser.push_token, {
              title: 'Portrait license accepted',
              body: 'Your portrait license request has been accepted.',
              data: { type: 'portrait_license_accepted', license_id: license.id },
            }).catch(() => {});
          }
        }).catch(() => {});
    }

    res.json({ ok: true, license });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'RACE_CONFLICT') { res.status(409).json({ error: 'already_responded_or_expired' }); return; }
    if (msg === 'INSUFFICIENT_BALANCE') { res.status(402).json({ error: 'insufficient_business_balance' }); return; }
    if (msg === 'SHOP_NOT_FOUND') { res.status(422).json({ error: 'business_shop_user_not_found' }); return; }
    logger.error(`portrait-licenses /:id/accept error: ${msg}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /:id/decline — auth, token owner, atomic status guard.
router.patch('/:id/decline', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId)) { res.status(400).json({ error: 'invalid id' }); return; }

  try {
    const [licenseRequest] = await db.select().from(portraitLicenseRequests)
      .where(eq(portraitLicenseRequests.id, requestId));
    if (!licenseRequest) { res.status(404).json({ error: 'not_found' }); return; }

    // Verify caller is token owner
    const [token] = await db.select({ owner_id: portraitTokens.owner_id })
      .from(portraitTokens).where(eq(portraitTokens.id, licenseRequest.token_id));
    if (!token || token.owner_id !== userId) { res.status(403).json({ error: 'not_owner' }); return; }

    const [updated] = await db.update(portraitLicenseRequests)
      .set({ status: 'declined' })
      .where(
        and(
          eq(portraitLicenseRequests.id, requestId),
          eq(portraitLicenseRequests.status, 'pending'),
        ),
      )
      .returning();

    if (!updated) { res.status(409).json({ error: 'already_responded' }); return; }

    res.json({ ok: true });
  } catch (err) {
    logger.error(`portrait-licenses /:id/decline error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
