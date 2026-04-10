import { Router, Request, Response } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '../db';
import { users, businesses, adCampaigns, adImpressions, seasonPatronages } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
const router = Router();

// Self-healing
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ad_balance_cents integer NOT NULL DEFAULT 0`).catch(() => {});
db.execute(sql`
  CREATE TABLE IF NOT EXISTS ad_campaigns (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'proximity',
    value_cents INTEGER NOT NULL,
    budget_cents INTEGER NOT NULL DEFAULT 0,
    spent_cents INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});
db.execute(sql`
  CREATE TABLE IF NOT EXISTS ad_impressions (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES ad_campaigns(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    accepted BOOLEAN,
    payout_cents INTEGER NOT NULL,
    responded_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

// ─── Stripe Connect onboarding (operator) ─────────────────────────────────────

// POST /api/ads/connect/onboard — create or retrieve Stripe Connect onboarding URL
router.post('/connect/onboard', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [user] = await db.select({
      id: users.id,
      is_shop: users.is_shop,
      email: users.email,
      stripe_connect_account_id: users.stripe_connect_account_id,
    }).from(users).where(eq(users.id, userId));

    if (!user?.is_shop) { res.status(403).json({ error: 'not_operator' }); return; }

    let accountId = user.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'CA',
        email: user.email ?? undefined,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });
      accountId = account.id;
      await db.update(users).set({ stripe_connect_account_id: accountId }).where(eq(users.id, userId));
    }

    const baseUrl = process.env.API_BASE_URL ?? 'https://api.box-fraise.com';
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/api/ads/connect/refresh`,
      return_url: `${baseUrl}/api/ads/connect/return?user_id=${userId}`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    logger.error(`Connect onboard error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/ads/connect/return — Stripe redirects here after onboarding
// user_id is validated against the authenticated token to prevent CSRF-style manipulation
router.get('/connect/return', requireUser, async (req: Request, res: Response) => {
  const authenticatedUserId = (req as any).userId as number;
  const userId = parseInt(req.query.user_id as string, 10);
  if (isNaN(userId) || userId !== authenticatedUserId) {
    res.status(400).send('Invalid user');
    return;
  }
  try {
    const [user] = await db.select({ stripe_connect_account_id: users.stripe_connect_account_id })
      .from(users).where(eq(users.id, userId));
    if (user?.stripe_connect_account_id) {
      const account = await stripe.accounts.retrieve(user.stripe_connect_account_id);
      if (account.details_submitted) {
        await db.update(users).set({ stripe_connect_onboarded: true }).where(eq(users.id, userId));
      }
    }
    res.redirect('boxfraise://connect-complete');
  } catch {
    res.redirect('boxfraise://connect-complete');
  }
});

// GET /api/ads/connect/refresh — if onboarding link expired, generate new one
router.get('/connect/refresh', (_req: Request, res: Response) => {
  res.redirect('boxfraise://connect-refresh');
});

// GET /api/ads/connect/status — operator checks their Connect status
router.get('/connect/status', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [user] = await db.select({
      stripe_connect_account_id: users.stripe_connect_account_id,
      stripe_connect_onboarded: users.stripe_connect_onboarded,
    }).from(users).where(eq(users.id, userId));
    res.json({
      has_account: !!user?.stripe_connect_account_id,
      onboarded: user?.stripe_connect_onboarded ?? false,
    });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Campaigns (operator) ─────────────────────────────────────────────────────

// GET /api/ads/campaigns — operator's campaigns
router.get('/campaigns', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [operator] = await db.select({ business_id: users.business_id, is_shop: users.is_shop })
      .from(users).where(eq(users.id, userId));
    if (!operator?.is_shop || !operator.business_id) { res.status(403).json({ error: 'not_operator' }); return; }
    const campaigns = await db.select().from(adCampaigns)
      .where(eq(adCampaigns.business_id, operator.business_id))
      .orderBy(sql`${adCampaigns.created_at} DESC`);
    res.json(campaigns);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/ads/campaigns — create campaign
router.post('/campaigns', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { title, body, type, value_cents } = req.body;
  if (!title || !body || !value_cents) { res.status(400).json({ error: 'title, body, value_cents required' }); return; }
  if (!['proximity', 'remote'].includes(type)) { res.status(400).json({ error: 'type must be proximity or remote' }); return; }
  if (value_cents < 1 || value_cents > 10000) { res.status(400).json({ error: 'value_cents must be 1–10000' }); return; }
  try {
    const [operator] = await db.select({ business_id: users.business_id, is_shop: users.is_shop, stripe_connect_onboarded: users.stripe_connect_onboarded })
      .from(users).where(eq(users.id, userId));
    if (!operator?.is_shop || !operator.business_id) { res.status(403).json({ error: 'not_operator' }); return; }
    if (!operator.stripe_connect_onboarded) { res.status(402).json({ error: 'stripe_connect_required' }); return; }
    const [campaign] = await db.insert(adCampaigns).values({
      business_id: operator.business_id,
      title: title.trim(),
      body: body.trim(),
      type: type ?? 'proximity',
      value_cents,
    }).returning();
    res.json(campaign);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/ads/campaigns/:id/toggle — activate/deactivate
router.patch('/campaigns/:id/toggle', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const campaignId = parseInt(req.params.id, 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [operator] = await db.select({ business_id: users.business_id, is_shop: users.is_shop })
      .from(users).where(eq(users.id, userId));
    if (!operator?.is_shop || !operator.business_id) { res.status(403).json({ error: 'not_operator' }); return; }
    const [campaign] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.business_id, operator.business_id)));
    if (!campaign) { res.status(404).json({ error: 'not found' }); return; }
    // Can only activate if budget > spent
    const remaining = campaign.budget_cents - campaign.spent_cents;
    if (!campaign.active && remaining <= 0) { res.status(400).json({ error: 'no_budget' }); return; }
    const [updated] = await db.update(adCampaigns).set({ active: !campaign.active })
      .where(eq(adCampaigns.id, campaignId)).returning();
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/ads/campaigns/:id/fund — create payment intent to add budget
router.post('/campaigns/:id/fund', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const campaignId = parseInt(req.params.id, 10);
  const { amount_cents } = req.body;
  if (isNaN(campaignId) || !amount_cents || amount_cents < 1000) {
    res.status(400).json({ error: 'amount_cents must be at least 1000' }); return;
  }
  try {
    const [operator] = await db.select({ business_id: users.business_id, is_shop: users.is_shop, stripe_connect_account_id: users.stripe_connect_account_id })
      .from(users).where(eq(users.id, userId));
    if (!operator?.is_shop || !operator.business_id) { res.status(403).json({ error: 'not_operator' }); return; }
    const [campaign] = await db.select({ id: adCampaigns.id, business_id: adCampaigns.business_id })
      .from(adCampaigns).where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.business_id, operator.business_id)));
    if (!campaign) { res.status(404).json({ error: 'not found' }); return; }
    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      metadata: { type: 'ad_budget', campaign_id: String(campaignId), user_id: String(userId) },
    });
    res.json({ client_secret: pi.client_secret });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Proximity campaign lookup (patrons only) ────────────────────────────────

// GET /api/ads/proximity/:businessId — active proximity campaign, only for patrons
router.get('/proximity/:businessId', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    // Must be a patron of this business
    const [patronage] = await db.select({ id: seasonPatronages.id })
      .from(seasonPatronages)
      .where(and(
        eq(seasonPatronages.patron_user_id, userId),
        eq(seasonPatronages.location_id, businessId),
        eq(seasonPatronages.status, 'claimed'),
      ))
      .limit(1);
    if (!patronage) { res.json(null); return; }

    const [campaign] = await db.select().from(adCampaigns)
      .where(and(
        eq(adCampaigns.business_id, businessId),
        eq(adCampaigns.type, 'proximity'),
        eq(adCampaigns.active, true),
        sql`${adCampaigns.budget_cents} > ${adCampaigns.spent_cents}`,
      ))
      .limit(1);
    res.json(campaign ?? null);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── User impression response ─────────────────────────────────────────────────

// POST /api/ads/impressions — create proximity impression
router.post('/impressions', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { campaign_id } = req.body;
  if (!campaign_id) { res.status(400).json({ error: 'campaign_id required' }); return; }
  try {
    const [campaign] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, campaign_id), eq(adCampaigns.active, true)));
    if (!campaign) { res.status(404).json({ error: 'campaign not found or inactive' }); return; }
    if (campaign.budget_cents - campaign.spent_cents < campaign.value_cents) {
      res.status(400).json({ error: 'no_budget' }); return;
    }
    // One pending impression per user per campaign at a time
    const [existing] = await db.select({ id: adImpressions.id })
      .from(adImpressions)
      .where(and(eq(adImpressions.campaign_id, campaign_id), eq(adImpressions.user_id, userId), sql`${adImpressions.accepted} IS NULL`));
    if (existing) { res.json({ impression_id: existing.id }); return; }
    const [impression] = await db.insert(adImpressions).values({
      campaign_id,
      user_id: userId,
      payout_cents: campaign.value_cents,
    }).returning();
    res.json({ impression_id: impression.id });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/ads/impressions/:id/respond — user accepts or denies
router.post('/impressions/:id/respond', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const impressionId = parseInt(req.params.id, 10);
  const { accepted } = req.body;
  if (isNaN(impressionId) || typeof accepted !== 'boolean') {
    res.status(400).json({ error: 'accepted (boolean) required' }); return;
  }
  try {
    const [impression] = await db.select().from(adImpressions)
      .where(and(eq(adImpressions.id, impressionId), eq(adImpressions.user_id, userId)));
    if (!impression) { res.status(404).json({ error: 'not found' }); return; }
    if (impression.accepted !== null) { res.status(409).json({ error: 'already_responded' }); return; }

    let newBalance = 0;

    await db.transaction(async (tx) => {
      // Conditional update: only proceed if impression is still unanswered
      const [updated] = await tx.update(adImpressions)
        .set({ accepted, responded_at: new Date() })
        .where(and(
          eq(adImpressions.id, impressionId),
          eq(adImpressions.user_id, userId),
          sql`${adImpressions.accepted} IS NULL`,
        ))
        .returning({ id: adImpressions.id });
      if (!updated) throw Object.assign(new Error('already_responded'), { status: 409 });

      if (accepted) {
        // Check budget has not been exhausted by a concurrent accept
        const [campaign] = await tx.select({
          budget_cents: adCampaigns.budget_cents,
          spent_cents: adCampaigns.spent_cents,
          value_cents: adCampaigns.value_cents,
        }).from(adCampaigns).where(eq(adCampaigns.id, impression.campaign_id));

        if (!campaign || (campaign.budget_cents - campaign.spent_cents) < impression.payout_cents) {
          throw Object.assign(new Error('budget_exhausted'), { status: 409 });
        }

        await tx.update(adCampaigns)
          .set({ spent_cents: sql`${adCampaigns.spent_cents} + ${impression.payout_cents}` })
          .where(eq(adCampaigns.id, impression.campaign_id));

        const [updatedUser] = await tx.update(users)
          .set({ ad_balance_cents: sql`${users.ad_balance_cents} + ${impression.payout_cents}` })
          .where(eq(users.id, userId))
          .returning({ ad_balance_cents: users.ad_balance_cents });
        newBalance = updatedUser?.ad_balance_cents ?? 0;

        // Auto-deactivate campaign if budget now exhausted
        if ((campaign.budget_cents - campaign.spent_cents - impression.payout_cents) < campaign.value_cents) {
          await tx.update(adCampaigns).set({ active: false }).where(eq(adCampaigns.id, impression.campaign_id));
        }
      }
    });

    res.json({ ok: true, new_balance_cents: newBalance });
  } catch (err: any) {
    if (err?.status === 409) { res.status(409).json({ error: err.message }); return; }
    logger.error(`Impression respond error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Available remote ads feed ────────────────────────────────────────────────

// GET /api/ads/available — remote campaigns available for this user in the terminal feed
// Returns active remote campaigns with their pending impression id (creates one if needed)
router.get('/available', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const activeCampaigns = await db.select().from(adCampaigns)
      .where(and(
        eq(adCampaigns.type, 'remote'),
        eq(adCampaigns.active, true),
        sql`${adCampaigns.budget_cents} > ${adCampaigns.spent_cents}`,
      ));

    const MAX_ADS_PER_REQUEST = 5;
    const result = [];
    for (const campaign of activeCampaigns) {
      if (result.length >= MAX_ADS_PER_REQUEST) break;
      // Skip if user already responded to this campaign
      const [existing] = await db.select({ id: adImpressions.id, accepted: adImpressions.accepted })
        .from(adImpressions)
        .where(and(eq(adImpressions.campaign_id, campaign.id), eq(adImpressions.user_id, userId)));
      if (existing?.accepted !== null && existing?.accepted !== undefined) continue;

      // Get or create pending impression
      let impressionId = existing?.id ?? null;
      if (!impressionId) {
        const [impression] = await db.insert(adImpressions).values({
          campaign_id: campaign.id,
          user_id: userId,
          payout_cents: campaign.value_cents,
        }).returning();
        impressionId = impression.id;
      }

      // Get business name
      const [biz] = await db.select({ name: businesses.name })
        .from(businesses).where(eq(businesses.id, campaign.business_id));

      result.push({
        impression_id: impressionId,
        campaign_id: campaign.id,
        title: campaign.title,
        body: campaign.body,
        value_cents: campaign.value_cents,
        business_name: biz?.name ?? '',
      });
    }

    res.json(result);
  } catch (err) {
    logger.error(`Available ads error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── User balance ─────────────────────────────────────────────────────────────

// GET /api/ads/balance — user's current ad balance
router.get('/balance', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [user] = await db.select({ ad_balance_cents: users.ad_balance_cents })
      .from(users).where(eq(users.id, userId));
    res.json({ ad_balance_cents: user?.ad_balance_cents ?? 0 });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
