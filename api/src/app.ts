import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import varietiesRouter from './routes/varieties';
import { locationsRouter, slotsRouter, timeSlotsPublicRouter } from './routes/locations';
import ordersRouter from './routes/orders';
import stripeRouter from './routes/stripe';
import adminRouter from './routes/admin';
import chocolatierRouter from './routes/chocolatier';
import supplierRouter from './routes/supplier';
import verifyRouter from './routes/verify';
import standingOrdersRouter from './routes/standing-orders';
import usersRouter from './routes/users';
import giftNoteRouter from './routes/gift-note';
import campaignsRouter from './routes/campaigns';
import businessesRouter from './routes/businesses';
import posRouter from './routes/pos';
import askRouter from './routes/ask';
import authRouter from './routes/auth';
import popupsRouter from './routes/popups';
import popupRequestsRouter from './routes/popup-requests';
import campaignCommissionsRouter from './routes/campaign-commissions';
import contractsRouter from './routes/contracts';
import searchRouter from './routes/search';
import { membersRouter, fundRouter } from './routes/memberships';
import editorialRouter from './routes/editorial';
import nfcRouter, { contactsRouter } from './routes/nfc';
import portalRouter from './routes/portal';
import profilesRouter from './routes/profiles';
import tokensRouter from './routes/tokens';
import patronagesRouter from './routes/patronages';
import greenhousesRouter from './routes/greenhouses';
import businessLocationsRouter from './routes/business-locations';
import messagesRouter from './routes/messages';
import beaconsRouter from './routes/beacons';
import jobsRouter from './routes/jobs';
import collectifsRouter from './routes/collectifs';
import marketRouter from './routes/market';
import contentTokensRouter from './routes/content-tokens';
import tournamentsRouter from './routes/tournaments';
import venturesRouter from './routes/ventures';
import payoutsRouter from './routes/payouts';
import adsRouter from './routes/ads';
import toiletsRouter from './routes/toilets';
import healthProfileRouter from './routes/health-profile';
import itinerariesRouter from './routes/itineraries';
import menusRouter from './routes/menus';
import menuItemsRouter from './routes/menu-items';
import reservationOffersRouter from './routes/reservation-offers';
import portraitTokensRouter from './routes/portrait-tokens';
import portraitLicensesRouter from './routes/portrait-licenses';
import eveningTokensRouter from './routes/evening-tokens';
import discoveryRouter from './routes/discovery';
import menuRecommendationRouter from './routes/menu-recommendation';
import staffRouter from './routes/staff';
import walkinRouter from './routes/walkin';
import nodeApplicationsRouter from './routes/node-applications';
import waitlistRouter from './routes/standing-order-waitlist';
import transfersRouter from './routes/standing-order-transfers';
import tiersRouter from './routes/standing-order-tiers';
import dropsRouter from './routes/drops';
import preordersRouter from './routes/preorders';
import bundlesRouter from './routes/bundles';
import corporateRouter from './routes/corporate';
import referralsRouter from './routes/referrals';
import statsRouter from './routes/stats';
import farmVisitsRouter from './routes/farm-visits';
import seasonsRouter from './routes/seasons';
import fraiseChatRouter from './routes/fraise-chat';
import webhooksRouter from './routes/webhooks';
import varietyProfilesRouter from './routes/variety-profiles';
import arNotesRouter from './routes/ar-notes';
import arPoemRouter from './routes/ar-poem';
import tastingJournalRouter from './routes/tasting-journal';
import varietyMapRouter from './routes/variety-map';
import pickupGridRouter from './routes/pickup-grid';
import giftRegistryRouter from './routes/gift-registry';
import collectifChallengesRouter from './routes/collectif-challenges';
import coScansRouter from './routes/co-scans';
import notificationsRouter from './routes/notifications';
import arVideosRouter from './routes/ar-videos';
import socialRouter from './routes/social';
import artRouter from './routes/art';
import artAdminRouter from './routes/art-admin';
import { logger } from './lib/logger';
import { db } from './db';
import { editorialPieces, users, notifications, memberships, batches, varieties as varietiesTable } from './db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { sendPushNotification } from './lib/push';
import { requireUser } from './lib/auth';
import { uploadMedia } from './lib/upload';

const app = express();
app.set('trust proxy', 1);

const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);

const authLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter);

const operatorLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/operator', operatorLimiter);

const adminLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
app.use('/api/admin', adminLimiter);

const aiLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
app.use('/api/gift-note', aiLimiter);
app.use('/api/ask', aiLimiter);
app.use('/api/ar-poem', aiLimiter);

// Raw body for Stripe webhook — must be registered before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.use('/api/varieties', varietiesRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/slots', slotsRouter);
app.use('/api/time-slots', timeSlotsPublicRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/stripe', stripeRouter);
app.use('/api/admin', adminRouter);
app.use('/api/chocolatier', chocolatierRouter);
app.use('/api/supplier', supplierRouter);
app.use('/api/verify', verifyRouter);
app.use('/api/standing-orders', standingOrdersRouter);
app.use('/api/users', usersRouter);
app.use('/api/gift-note', giftNoteRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/businesses', businessesRouter);
app.use('/api/pos', posRouter);
app.use('/api/ask', askRouter);
app.use('/api/auth', authRouter);
app.use('/api/popups', popupsRouter);
app.use('/api/popup-requests', popupRequestsRouter);
app.use('/api/campaign-commissions', campaignCommissionsRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/search', searchRouter);
app.use('/api/members', membersRouter);
app.use('/api/fund', fundRouter);
app.use('/api/editorial', editorialRouter);
app.use('/api/nfc', nfcRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/portal', portalRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/patronages', patronagesRouter);
app.use('/api/greenhouses', greenhousesRouter);
app.use('/api/business-locations', businessLocationsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/beacons', beaconsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/collectifs', collectifsRouter);
app.use('/api/market', marketRouter);
app.use('/api/content-tokens', contentTokensRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/ventures', venturesRouter);
app.use('/api/payouts', payoutsRouter);
app.use('/api/ads', adsRouter);
app.use('/api/toilets', toiletsRouter);
app.use('/api/health-profile', healthProfileRouter);
app.use('/api/itineraries', itinerariesRouter);
app.use('/api/menus', menusRouter);
app.use('/api/menu-items', menuItemsRouter);
app.use('/api/reservation-offers', reservationOffersRouter);
app.use('/api/portrait-tokens', portraitTokensRouter);
app.use('/api/portrait-licenses', portraitLicensesRouter);
app.use('/api/evening-tokens', eveningTokensRouter);
app.use('/api/discovery', discoveryRouter);
app.use('/api/menu-recommendation', menuRecommendationRouter);
app.use('/api/staff', staffRouter);
app.use('/api/walkin', walkinRouter);
app.use('/api/node-applications', nodeApplicationsRouter);

// GET /api/batches?location_id=&variety_id= — live batch availability for the iOS order flow
app.get('/api/batches', async (req, res) => {
  const locationId = parseInt(String(req.query.location_id), 10);
  const varietyId = parseInt(String(req.query.variety_id), 10);
  if (!locationId || !varietyId) { res.status(400).json({ error: 'location_id and variety_id required' }); return; }
  try {
    const rows = await db
      .select({
        id: batches.id,
        quantity_remaining: batches.quantity_remaining,
        variety_name: varietiesTable.name,
        price_cents: varietiesTable.price_cents,
      })
      .from(batches)
      .innerJoin(varietiesTable, eq(batches.variety_id, varietiesTable.id))
      .where(and(
        eq(batches.location_id, locationId),
        eq(batches.variety_id, varietyId),
        eq(batches.published, true),
        sql`${batches.quantity_remaining} > 0`,
      ))
      .orderBy(batches.created_at);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

app.use('/api/standing-order-waitlist', waitlistRouter);
app.use('/api/standing-order-transfers', transfersRouter);
app.use('/api/standing-order-tiers', tiersRouter);
app.use('/api/drops', dropsRouter);
app.use('/api/preorders', preordersRouter);
app.use('/api/bundles', bundlesRouter);
app.use('/api/corporate', corporateRouter);
app.use('/api/referrals', referralsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/farm-visits', farmVisitsRouter);
app.use('/api/seasons', seasonsRouter);
app.use('/api/fraise-chat', fraiseChatRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/variety-profiles', varietyProfilesRouter);
app.use('/api/ar-notes', arNotesRouter);
app.use('/api/tasting-journal', tastingJournalRouter);
app.use('/api/variety-map', varietyMapRouter);
app.use('/api/pickup-grid', pickupGridRouter);
app.use('/api/gift-registry', giftRegistryRouter);
app.use('/api/collectif-challenges', collectifChallengesRouter);
app.use('/api/co-scans', coScansRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/ar-videos', arVideosRouter);
app.use('/api/social', socialRouter);
app.use('/api/art', artRouter);
app.use('/api/art-admin', artAdminRouter);
app.use('/api/ar-poem', arPoemRouter);

// POST /api/upload — Cloudinary media upload (50mb limit on this route only)
app.post('/api/upload', express.json({ limit: '50mb' }), requireUser, async (req: any, res: any) => {
  if (!process.env.CLOUDINARY_URL) {
    return res.status(503).json({ error: 'Upload service not configured' });
  }
  const { data, type } = req.body;
  if (!data || !type || !['image', 'video'].includes(type)) {
    return res.status(400).json({ error: 'data and type (image|video) are required' });
  }
  try {
    const url = await uploadMedia(data as string, type as 'image' | 'video');
    return res.json({ url });
  } catch (err) {
    logger.error('Upload failed', err);
    return res.status(500).json({ error: 'upload_failed' });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(express.static(path.join(__dirname, '../public')));

app.get('/operator', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/operator.html'));
});

app.get('/chocolatier', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/chocolatier.html'));
});

app.get('/privacy', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Privacy Policy — Maison Fraise</title>
  <style>body{font-family:Georgia,serif;max-width:680px;margin:60px auto;padding:0 24px;color:#1a1a1a;line-height:1.7}h1{font-size:24px}h2{font-size:18px;margin-top:32px}p{margin:12px 0}</style></head>
  <body><h1>Privacy Policy</h1><p>Last updated: ${new Date().toLocaleDateString('en-CA')}</p>
  <p>Maison Fraise ("we", "our") operates the Maison Fraise mobile application. This policy describes how we collect, use, and protect your information.</p>
  <h2>Information We Collect</h2><p>We collect your name, email address, and Apple ID when you sign in with Apple. We collect order information including variety, quantity, pickup location, and payment details processed by Stripe.</p>
  <h2>How We Use Your Information</h2><p>We use your information to process orders, send order confirmations and status updates, and improve our service. We do not sell your personal information.</p>
  <h2>Data Retention</h2><p>We retain order records for accounting purposes. You may request deletion of your account by contacting us.</p>
  <h2>Contact</h2><p>For privacy inquiries: privacy@maison-fraise.com</p>
  </body></html>`);
});

app.get('/terms', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Terms of Service — Maison Fraise</title>
  <style>body{font-family:Georgia,serif;max-width:680px;margin:60px auto;padding:0 24px;color:#1a1a1a;line-height:1.7}h1{font-size:24px}h2{font-size:18px;margin-top:32px}p{margin:12px 0}</style></head>
  <body><h1>Terms of Service</h1><p>Last updated: ${new Date().toLocaleDateString('en-CA')}</p>
  <p>By using the Maison Fraise app, you agree to these terms.</p>
  <h2>Orders</h2><p>All orders are final. Refunds are issued at our discretion for quality issues. Orders not collected within 2 hours of the designated time slot may be forfeited.</p>
  <h2>Payments</h2><p>Payments are processed securely by Stripe. We do not store card details.</p>
  <h2>Accounts</h2><p>You are responsible for maintaining the security of your account. We may terminate accounts that violate these terms.</p>
  <h2>Contact</h2><p>For support: hello@maison-fraise.com</p>
  </body></html>`);
});

app.get('/support', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/support.html'));
});

app.get('/editorial/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [piece] = await db.select({
      title: editorialPieces.title,
      body: editorialPieces.body,
      published_at: editorialPieces.published_at,
      commission_cents: editorialPieces.commission_cents,
      author_name: users.display_name,
    })
    .from(editorialPieces)
    .leftJoin(users, eq(editorialPieces.author_user_id, users.id))
    .where(and(eq(editorialPieces.id, id), eq(editorialPieces.status, 'published')));

    if (!piece) { res.status(404).send('<h1>Not found</h1>'); return; }

    const date = piece.published_at ? new Date(piece.published_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const bodyHtml = piece.body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');

    res.send(`<!DOCTYPE html><html lang="en"><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${piece.title} — Maison Fraise</title>
      <meta property="og:title" content="${piece.title}">
      <meta property="og:site_name" content="Maison Fraise">
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Georgia,serif;background:#faf9f7;color:#1a1a1a;padding:0 24px}
        .wrap{max-width:680px;margin:0 auto;padding:80px 0 120px}
        .brand{font-family:Georgia,serif;font-size:13px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:60px}
        .brand a{color:#888;text-decoration:none}
        h1{font-size:32px;line-height:1.25;margin-bottom:16px;font-weight:normal}
        .meta{font-family:'DM Mono',monospace,monospace;font-size:11px;color:#888;margin-bottom:48px;display:flex;gap:16px}
        .body p{font-size:17px;line-height:1.75;margin-bottom:24px}
        .commission{font-family:'DM Mono',monospace,monospace;font-size:11px;color:#c5705d;margin-top:48px;padding-top:24px;border-top:1px solid #e8e4df}
        @media(prefers-color-scheme:dark){body{background:#0e0e0e;color:#f0ede8}.brand,.meta{color:#555}.body p{color:#d4d0ca}.commission{color:#c5705d}}
      </style>
    </head><body><div class="wrap">
      <div class="brand"><a href="/">Maison Fraise</a></div>
      <h1>${piece.title}</h1>
      <div class="meta">
        <span>${piece.author_name ?? 'Maison Fraise'}</span>
        <span>${date}</span>
      </div>
      <div class="body"><p>${bodyHtml}</p></div>
      ${piece.commission_cents ? `<div class="commission">Commissioned at CA$${(piece.commission_cents/100).toFixed(2)}</div>` : ''}
    </div></body></html>`);
  } catch (e) { res.status(500).send('<h1>Error</h1>'); }
});

app.get('/members/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const { ilike } = await import('drizzle-orm');

    // Look up user by display_name case-insensitively
    const [profile] = await db
      .select({ id: users.id, display_name: users.display_name })
      .from(users)
      .where(ilike(users.display_name, username))
      .limit(1);

    if (!profile) { res.status(404).send('<h1>Member not found</h1>'); return; }

    const [activeMembership] = await db
      .select({ tier: memberships.tier, status: memberships.status, started_at: memberships.started_at })
      .from(memberships)
      .where(and(eq(memberships.user_id, profile.id), eq(memberships.status, 'active')))
      .limit(1);

    const pieces = await db
      .select({ id: editorialPieces.id, title: editorialPieces.title, published_at: editorialPieces.published_at })
      .from(editorialPieces)
      .where(and(eq(editorialPieces.author_user_id, profile.id), eq(editorialPieces.status, 'published')))
      .orderBy(desc(editorialPieces.published_at));

    const tierLabel = activeMembership
      ? activeMembership.tier.charAt(0).toUpperCase() + activeMembership.tier.slice(1)
      : null;

    const pieceItems = pieces.map(p => {
      const d = p.published_at ? new Date(p.published_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
      return `<li><a href="/editorial/${p.id}">${p.title}</a><span class="date">${d}</span></li>`;
    }).join('');

    res.send(`<!DOCTYPE html><html lang="en"><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${profile.display_name ?? username} — Maison Fraise</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Georgia,serif;background:#faf9f7;color:#1a1a1a;padding:0 24px}
        .wrap{max-width:680px;margin:0 auto;padding:80px 0 120px}
        .brand{font-family:Georgia,serif;font-size:13px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:60px}
        .brand a{color:#888;text-decoration:none}
        h1{font-size:28px;font-weight:normal;margin-bottom:8px}
        .tier{font-family:'DM Mono',monospace,monospace;font-size:11px;color:#888;margin-bottom:48px}
        h2{font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:24px;font-weight:normal}
        ul{list-style:none}
        li{padding:12px 0;border-bottom:1px solid #e8e4df;display:flex;justify-content:space-between;align-items:baseline;gap:16px}
        li a{color:#1a1a1a;text-decoration:none;font-size:16px}
        li a:hover{text-decoration:underline}
        .date{font-family:'DM Mono',monospace,monospace;font-size:11px;color:#888;white-space:nowrap}
        @media(prefers-color-scheme:dark){body{background:#0e0e0e;color:#f0ede8}.brand,.tier,.date{color:#555}li{border-color:#222}li a{color:#f0ede8}}
      </style>
    </head><body><div class="wrap">
      <div class="brand"><a href="/">Maison Fraise</a></div>
      <h1>${profile.display_name ?? username}</h1>
      <div class="tier">${activeMembership ? `${tierLabel} member · Active` : 'No active membership'}</div>
      ${pieces.length > 0 ? `<h2>Published pieces</h2><ul>${pieceItems}</ul>` : '<p style="color:#888;font-size:14px">No published pieces yet.</p>'}
    </div></body></html>`);
  } catch (e) { res.status(500).send('<h1>Error</h1>'); }
});

// Sentry error handler — must be after all routes
app.use(Sentry.expressErrorHandler());

export default app;
