import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createHmac, timingSafeEqual } from 'crypto';
import path from 'path';
import varietiesRouter from './routes/varieties';
import { locationsRouter, slotsRouter, timeSlotsPublicRouter } from './routes/locations';
import ordersRouter from './routes/orders';
import stripeRouter from './routes/stripe';
import adminRouter from './routes/admin';
import chocolatierRouter from './routes/chocolatier';
import supplierRouter from './routes/supplier';
import verifyRouter from './routes/verify';
import batchPreferencesRouter from './routes/batch-preferences';
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
import braveRouter from './routes/brave';
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
import keysRouter from './routes/keys';
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
import dropsRouter from './routes/drops';
import preordersRouter from './routes/preorders';
import bundlesRouter from './routes/bundles';
import corporateRouter from './routes/corporate';
import referralsRouter from './routes/referrals';
import statsRouter from './routes/stats';
import farmVisitsRouter from './routes/farm-visits';
import seasonsRouter from './routes/seasons';
import fraiseChatRouter from './routes/fraise-chat';
import connectionsRouter from './routes/connections';
import platformMessagesRouter from './routes/platform-messages';
import akeneRouter from './routes/akene';
import datesRouter from './routes/dates';
import devicesRouter from './routes/devices';
import webhooksRouter from './routes/webhooks';
import varietyProfilesRouter from './routes/variety-profiles';
import arNotesRouter from './routes/ar-notes';
import arPoemRouter from './routes/ar-poem';
import tastingJournalRouter from './routes/tasting-journal';
import varietyMapRouter from './routes/variety-map';
import pickupGridRouter from './routes/pickup-grid';
import giftRegistryRouter from './routes/gift-registry';
import giftsRouter from './routes/gifts';
import stickersRouter from './routes/stickers';
import donateRouter from './routes/donate';
import creditsRouter from './routes/credits';
import collectifChallengesRouter from './routes/collectif-challenges';
import coScansRouter from './routes/co-scans';
import notificationsRouter from './routes/notifications';
import arVideosRouter from './routes/ar-videos';
import socialRouter from './routes/social';
import mapsRouter from './routes/maps';
import tableRouter from './routes/table';
import fraiseRouter from './routes/fraise';
import proposalsRouter from './routes/proposals';
import artRouter from './routes/art';
import artAdminRouter from './routes/art-admin';
import { logger } from './lib/logger';
import { stripe } from './lib/stripe';
import { db } from './db';
import { editorialPieces, users, notifications, memberships, batches, varieties as varietiesTable } from './db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { sendPushNotification } from './lib/push';
import { requireUser } from './lib/auth';
import { uploadMedia } from './lib/upload';

const app = express();
app.set('trust proxy', 1);

// Drop bot probe requests early — keeps logs clean and skips all middleware
app.use((req, res, next) => {
  const p = req.path;
  if (
    p.startsWith('/wp-') ||
    p.startsWith('/wordpress/') ||
    p === '/xmlrpc.php' ||
    p === '/.env' ||
    p.startsWith('/.env.') ||
    p.startsWith('/.git/') ||
    p.startsWith('//wp') ||
    p.startsWith('//feed') ||
    p.startsWith('//xmlrpc')
  ) {
    return res.status(404).end();
  }
  next();
});

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

// Key endpoint rate limiting — tight windows to prevent challenge farming and key spam
const keysChallengeLimiter = rateLimit({ windowMs: 60 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
app.use('/api/keys/challenge', keysChallengeLimiter);
const keysRegisterLimiter = rateLimit({ windowMs: 24 * 60 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
app.use('/api/keys/register', keysRegisterLimiter);

// Raw body for Stripe webhook — must be registered before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({
  verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; },
}));

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ─── HMAC request signing ─────────────────────────────────────────────────────
// Every iOS request includes:
//   X-Fraise-Client: ios
//   X-Fraise-Ts:     Unix timestamp (seconds)
//   X-Fraise-Sig:    HMAC-SHA256(method + path + ts + body, deviceKey) base64
//   X-Fraise-Attest-Key: App Attest key ID (present after attestation)
//
// Key resolution:
//   1. If X-Fraise-Attest-Key present and device is attested → per-device HMAC key
//   2. Otherwise → shared fallback (pre-attestation bootstrap only)
//
// Replay prevention: each (sig, ts) pair is cached for the validity window.
// NOTE: nonce cache is in-process — for multi-instance deploys, move to Redis.

const _FRAISE_SHARED_KEY = Buffer.from(process.env.FRAISE_HMAC_SHARED_KEY ?? 'fraise-request-signing-v1', 'utf8');
const _FRAISE_MAX_SKEW   = 300; // seconds

// Map<sig, expiresAtMs> — entries pruned every minute
const _nonceCache = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of _nonceCache) if (exp < now) _nonceCache.delete(k);
}, 60_000).unref();

app.use('/api', async (req: any, res: any, next: any) => {
  if (req.headers['x-fraise-client'] !== 'ios') return next();

  // Auth endpoints: HMAC key can't be registered until after sign-in completes.
  // Apple Sign In tokens provide the auth guarantee here.
  if (req.path.startsWith('/auth/')) return next();

  const ts  = req.headers['x-fraise-ts']  as string | undefined;
  const sig = req.headers['x-fraise-sig'] as string | undefined;
  if (!ts || !sig) return res.status(401).json({ error: 'missing signature' });

  // Timestamp window check
  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > _FRAISE_MAX_SKEW) {
    return res.status(401).json({ error: 'request expired' });
  }

  // Replay check — sig is deterministic for a given request so it's a safe nonce
  if (_nonceCache.has(sig)) {
    return res.status(401).json({ error: 'request replayed' });
  }

  const bodyBuf: Buffer = req.rawBody ?? Buffer.alloc(0);
  const requestPath = req.originalUrl.split('?')[0];
  const message = Buffer.concat([Buffer.from(`${req.method}${requestPath}${ts}`, 'utf8'), bodyBuf]);

  // Determine signing key: per-device if attested, shared fallback otherwise
  const attestKeyId = req.headers['x-fraise-attest-key'] as string | undefined;
  let signingKey: Buffer = _FRAISE_SHARED_KEY;

  if (attestKeyId) {
    try {
      const rows = await db.execute(sql`
        SELECT hmac_key FROM device_attestations
        WHERE key_id = ${attestKeyId} AND hmac_key IS NOT NULL
        LIMIT 1
      `);
      const row = ((rows as any).rows ?? rows)[0] as any;
      if (row?.hmac_key) {
        signingKey = Buffer.from(row.hmac_key, 'base64');
      }
      // If key ID present but not yet registered (attestation race), use shared fallback
    } catch {
      // DB error — fail safe: continue with shared key
    }
  }

  const expected = createHmac('sha256', signingKey).update(message).digest('base64');

  try {
    const eBuf = Buffer.from(expected, 'base64');
    const aBuf = Buffer.from(sig, 'base64');
    if (eBuf.length !== aBuf.length || !timingSafeEqual(eBuf, aBuf)) {
      return res.status(401).json({ error: 'invalid signature' });
    }
  } catch {
    return res.status(401).json({ error: 'invalid signature' });
  }

  // Cache nonce — prevents replay within the validity window
  _nonceCache.set(sig, Date.now() + _FRAISE_MAX_SKEW * 1000);
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
app.use('/api/batch-preferences', batchPreferencesRouter);
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
app.use('/api/brave', braveRouter);
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
app.use('/api/keys', keysRouter);
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
app.use('/api/devices', devicesRouter);

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

app.use('/api/drops', dropsRouter);
app.use('/api/preorders', preordersRouter);
app.use('/api/bundles', bundlesRouter);
app.use('/api/corporate', corporateRouter);
app.use('/api/referrals', referralsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/farm-visits', farmVisitsRouter);
app.use('/api/seasons', seasonsRouter);
app.use('/api/fraise-chat', fraiseChatRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/platform-messages', platformMessagesRouter);
app.use('/api/akene', akeneRouter);
app.use('/api/dates', datesRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/variety-profiles', varietyProfilesRouter);
app.use('/api/ar-notes', arNotesRouter);
app.use('/api/tasting-journal', tastingJournalRouter);
app.use('/api/variety-map', varietyMapRouter);
app.use('/api/pickup-grid', pickupGridRouter);
app.use('/api/gift-registry', giftRegistryRouter);
app.use('/api/gifts', giftsRouter);
app.use('/api/stickers', stickersRouter);
app.use('/api/donate', donateRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/collectif-challenges', collectifChallengesRouter);
app.use('/api/co-scans', coScansRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/ar-videos', arVideosRouter);
app.use('/api/social', socialRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/art', artRouter);
app.use('/api/art-admin', artAdminRouter);
app.use('/api/ar-poem', arPoemRouter);
app.use('/api/table', tableRouter);
app.use('/api/fraise', fraiseRouter);

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

// Apple App Site Association — required for Universal Links and App Clips
app.get('/.well-known/apple-app-site-association', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    applinks: {
      apps: [],
      details: [{
        appIDs: ['X96F7X388X.com.boxfraise.app'],
        components: [
          { '/': '/order*',   comment: 'Order panel deep link' },
          { '/': '/popups*',  comment: 'Popups panel deep link' },
          { '/': '/popup/*',  comment: 'Specific popup deep link' },
          { '/': '/profile*', comment: 'Profile panel deep link' },
          { '/': '/verify*',  comment: 'NFC verify deep link' },
          { '/': '/history*', comment: 'Order history deep link' },
        ],
      }],
    },
    appclips: {
      apps: ['X96F7X388X.com.boxfraise.app.Clip'],
    },
    webcredentials: {
      apps: ['X96F7X388X.com.boxfraise.app'],
    },
  });
});

// Rajzyngier Research — serve when request comes from rajzyngier.co
app.use((req, res, next) => {
  const host = req.hostname;
  if (host === 'rajzyngier.co' || host === 'www.rajzyngier.co') {
    res.sendFile(path.join(__dirname, '../public/rajzyngier.html'));
    return;
  }
  if (host === 'fraise.land' || host === 'www.fraise.land') {
    res.sendFile(path.join(__dirname, '../public/filozofia-pracy.html'));
    return;
  }
  next();
});

app.use(express.static(path.join(__dirname, '../public')));

app.get('/paper', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/paper.html'));
});

app.get('/backstage', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/backstage.html'));
});

app.get('/business/:slug', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/fraise-business.html'));
});

app.get('/chocolatier', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/chocolatier.html'));
});

app.get('/search', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/search.html'));
});

app.get('/join', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/claim.html'));
});

app.get('/reset-password', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/reset-password.html'));
});

app.get('/account', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/account.html'));
});

// ── Kommune proposal pages ────────────────────────────────────────────────────
app.get('/kommune', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/kommune-proposal.html'));
});

app.get('/press', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/press.html'));
});

app.get('/kommune/press', (_req, res) => {
  res.redirect('/press');
});

app.post('/api/kommune/ask', async (req: any, res: any) => {
  const question = String(req.body?.question ?? '').trim();
  if (!question) return res.status(400).json({ error: 'question required' });

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: `You are a helpful presence at Kommune, a snack bar at 11931 Jasper Ave NW, Edmonton. Answer questions about the space concisely and naturally.

What you know:
- $0 oat milk on every drink. The brand is Minor Figures.
- Whisked is an independent ceremonial matcha bar in residence. Their site: visitwhisked.ca
- Open daily from 10am
- WiFi: Kommune@1
- Reservations: hello@kommunesnackbar.ca
- Full food menu: plates, bakes, snacks, sweets
- Drinks: coffee, fog (tea lattes), NA cocktails, cocktails, beer, wine
- Located on Treaty 6 Territory

Keep answers short — one or two sentences. If you don't know something specific, say so honestly.`,
    messages: [{ role: 'user', content: question }],
  });

  const answer = (message.content[0] as any).text ?? '';
  res.json({ answer });
});

app.post('/api/kommune/press/apply', async (req: any, res: any) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 200);
  const email = String(req.body?.email ?? '').trim().slice(0, 200);
  const note = String(req.body?.note ?? '').trim().slice(0, 500);
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  await db.execute(sql`INSERT INTO kommune_press_applications (name, email, note) VALUES (${name}, ${email}, ${note || null})`);
  const { resend } = await import('./lib/resend');
  await resend.emails.send({
    from: 'cold.press <orders@fraise.chat>',
    to: 'hello@kommunesnackbar.ca',
    subject: `cold.press application — ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\n${note}\n\nApprove at /owner.`,
  });
  res.json({ ok: true });
});

app.post('/api/kommune/press/verify', async (req: any, res: any) => {
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  const rows = await db.execute(sql`SELECT id, display_name FROM users WHERE user_code = ${code} AND verified_by = 'kommune' LIMIT 1`);
  const row = (((rows as any).rows ?? rows)[0] as any);
  if (!row) return res.status(401).json({ error: 'invalid code' });
  res.json({ ok: true, name: row.display_name });
});

app.get('/api/kommune/press/applications', async (req: any, res: any) => {
  const password = String(req.query?.password ?? '');
  if (password !== process.env.KOMMUNE_OWNER_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  const rows = await db.execute(sql`SELECT id, name, email, note, status, personal_code, created_at FROM kommune_press_applications ORDER BY created_at DESC`);
  res.json({ applications: ((rows as any).rows ?? rows) });
});

app.post('/api/kommune/press/applications/:id/approve', async (req: any, res: any) => {
  const password = String(req.body?.password ?? '');
  if (password !== process.env.KOMMUNE_OWNER_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  const appRows = await db.execute(sql`SELECT name, email FROM kommune_press_applications WHERE id = ${id} LIMIT 1`);
  const app = (((appRows as any).rows ?? appRows)[0] as any);
  if (!app) return res.status(404).json({ error: 'not found' });

  // Generate a unique user_code using the same alphabet as the platform
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];

  // Create or update the Box Fraise user
  const existingRows = await db.execute(sql`SELECT id FROM users WHERE email = ${app.email} LIMIT 1`);
  const existing = (((existingRows as any).rows ?? existingRows)[0] as any);
  let userId: number;

  if (existing) {
    await db.execute(sql`UPDATE users SET user_code = ${code}, verified = true, verified_by = 'kommune', verified_at = now() WHERE id = ${existing.id}`);
    userId = existing.id;
  } else {
    const newRows = await db.execute(sql`
      INSERT INTO users (email, display_name, user_code, verified, verified_by, verified_at)
      VALUES (${app.email}, ${app.name}, ${code}, true, 'kommune', now())
      RETURNING id
    `);
    userId = (((newRows as any).rows ?? newRows)[0] as any).id;
  }

  await db.execute(sql`UPDATE kommune_press_applications SET status = 'approved', personal_code = ${code}, user_id = ${userId} WHERE id = ${id}`);

  const { resend } = await import('./lib/resend');
  await resend.emails.send({
    from: 'cold.press <orders@fraise.chat>',
    to: app.email,
    subject: 'you\'re in — cold.press',
    text: `Hi ${app.name},\n\nYou've been approved as a cold.press reviewer.\n\nCome by Kommune (11931 Jasper Ave NW) and introduce yourself to whoever is working. They'll hand you your code.\n\n— Kommune`,
  });

  res.json({ ok: true, code });
});

app.post('/api/kommune/press/applications/:id/reject', async (req: any, res: any) => {
  const password = String(req.body?.password ?? '');
  if (password !== process.env.KOMMUNE_OWNER_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  await db.execute(sql`UPDATE kommune_press_applications SET status = 'rejected' WHERE id = ${id}`);
  res.json({ ok: true });
});

app.post('/api/kommune/recommend', async (req: any, res: any) => {
  const people = Math.min(Math.max(parseInt(req.body?.people) || 1, 1), 20);
  const mood = String(req.body?.mood ?? '').trim().slice(0, 200);
  if (!mood) return res.status(400).json({ error: 'mood required' });

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const menu = `
PLATES: Crispy Potato Cake $16 (potato, gouda sauce, chives), Berlin Mustard Eggs $12 (smoked egg yolk, potato, horseradish), Smoked Schnitzel $25 (breaded smoked meat, lettuce, dijon), Seitan Vegan Cheeses $18 (chili, dill, gorgonzola, rye chips)
BAKES: The Tony $14 (mortadella, provolone, dijon, brioche), The Bea $12 (eggs, bacon, spicy ketchup, aioli, brioche), Avocado Toast $12 (sourdough, tomatoes, gouda, pea shoots, +$2 egg), Almond French Toast $12.50 (sourdough, almond butter, banana, strawberries), Yogurt Bowl $10 (granola, berries, honey)
SNACKS: Beet Hummus $11 (roasted beets, oil, dill, rye chips), Marinated Goat Feta $8 (herbed feta, rye chips), Brio Rye Bread $7 (rosemary oil, pomegranate vinegar)
SWEETS: Flourless Chocolate Cake $9, Affogato $7 (espresso, matcha, or hojicha), Affogato Flight $12
COFFEE: Americano $4.50, Latte $6.25, Vanilla Latte $7, Flat White $5, Espresso $3.75, Tonic $6, Cappuccino $5.75, Cortado $5.50, Macchiato $4.50, Rotating Syrups $0.75, Oat or Reg Milk $0
FOG: London $6.50, Peppermint $6.50, Tea $4
MATCHA (by Whisked): Regular $7, Premium $10, Maple Sea Salt $8, Apple Cinnamon $8, Pumpkin Spice $8, Earl Grey $8, Hojicha $7
NA COCKTAILS: Dhos & Tonic $9, Kasu Yuzu & Soda $11, Coco-No-Lo $11, Coriander Crush $11, Pathfinder & Root Beer $12, The Moose is Loose $12, Not Mint to Be $11, Cheeky Boilermaker / Phony Negroni $14
COCKTAILS: Gin & Tonic $9, Kasu Vodka Yuzu & Soda $11, Sherry Colada Lowball $13, Coriander Spritz $11, Root of All Evil $12, Old Fashioned $14, Mint to Be $11, Arandasi Picante $12, Boilermaker / Negroni $14
BEER: Guinness Stout $9, Bent Stick Brewing $9, Establishment Afternoon Delight $9, Last Best Tokyo Drift $9, Rotating $9
WINE: Sparkling $10–17 / $52–85, White $16 / $75–80, Skin Contact / Rosé / Rotating (ask), Red $14–15 / $60–75`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: `You are helping guests at Kommune, a snack bar in Edmonton, decide what to order. Given the number of people and their mood, recommend specific dishes and drinks from the menu. Be concrete — name exact items, give a rough total. Keep it to 3–5 lines. No preamble, just the recommendation.`,
    messages: [{ role: 'user', content: `${people} ${people === 1 ? 'person' : 'people'}, mood: ${mood}\n\nMenu:\n${menu}` }],
  });

  const recommendation = (message.content[0] as any).text ?? '';
  res.json({ recommendation });
});

app.get('/api/kommune/assignments', async (_req: any, res: any) => {
  try {
    const rows = await db.execute(sql`SELECT id, name, neighbourhood, note FROM kommune_assignments WHERE active = true ORDER BY created_at DESC`);
    res.json({ assignments: ((rows as any).rows ?? rows) });
  } catch {
    res.status(500).json({ error: 'failed' });
  }
});

app.post('/api/kommune/assignments', async (req: any, res: any) => {
  const password = String(req.body?.password ?? '');
  if (password !== process.env.KOMMUNE_OWNER_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  const name = String(req.body?.name ?? '').trim().slice(0, 200);
  const neighbourhood = String(req.body?.neighbourhood ?? '').trim().slice(0, 100);
  const note = String(req.body?.note ?? '').trim().slice(0, 300);
  if (!name || !neighbourhood) return res.status(400).json({ error: 'name and neighbourhood required' });
  await db.execute(sql`INSERT INTO kommune_assignments (name, neighbourhood, note) VALUES (${name}, ${neighbourhood}, ${note || null})`);
  res.json({ ok: true });
});

app.delete('/api/kommune/assignments/:id', async (req: any, res: any) => {
  const password = String(req.body?.password ?? '');
  if (password !== process.env.KOMMUNE_OWNER_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  await db.execute(sql`UPDATE kommune_assignments SET active = false WHERE id = ${id}`);
  res.json({ ok: true });
});

app.get('/api/kommune/ratings', async (_req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT item_name,
             ROUND(AVG(rating)::numeric, 1)::float AS avg_rating,
             COUNT(*)::int AS total
      FROM kommune_ratings
      GROUP BY item_name
    `);
    const data = ((rows as any).rows ?? rows) as any[];
    res.json({ ratings: data });
  } catch (err) {
    res.status(500).json({ error: 'failed' });
  }
});

app.post('/api/kommune/rate', async (req: any, res: any) => {
  const item_name = String(req.body?.item_name ?? '').trim().slice(0, 200);
  const rating = parseInt(req.body?.rating);
  if (!item_name || isNaN(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'invalid' });
  }
  await db.execute(sql`INSERT INTO kommune_ratings (item_name, rating) VALUES (${item_name}, ${rating})`);
  const rows = await db.execute(sql`
    SELECT ROUND(AVG(rating)::numeric, 1)::float AS avg_rating, COUNT(*)::int AS total
    FROM kommune_ratings WHERE item_name = ${item_name}
  `);
  const row = (((rows as any).rows ?? rows)[0] as any) ?? {};
  res.json({ ok: true, avg_rating: row.avg_rating, total: row.total });
});

app.post('/api/kommune/chat', async (req: any, res: any) => {
  const message = String(req.body?.message ?? '').trim().slice(0, 500);
  if (!message) return res.status(400).json({ error: 'message required' });

  let activeEvents: any[] = [];
  try {
    const evRows = await db.execute(sql`
      SELECT id, title, price_cents, capacity, seats_taken, event_date, date_tbd
      FROM table_events WHERE active = true
    `);
    activeEvents = ((evRows as any).rows ?? evRows) as any[];
  } catch {}

  const eventContext = activeEvents.length
    ? `Current events:\n${activeEvents.map((e: any) =>
        `- "${e.title}" (id:${e.id}) — ${e.date_tbd ? 'date TBD' : new Date(e.event_date).toDateString()} — CA$${(e.price_cents / 100).toFixed(0)}/person — ${e.capacity - e.seats_taken} seats left`
      ).join('\n')}`
    : 'No active events right now.';

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are the concierge for Kommune, a snack bar at 11931 Jasper Ave NW, Edmonton. Open daily from 10am. $0 oat milk on every drink (Minor Figures oat).

Menu: matcha by Whisked (Regular $7, Premium $10, Maple Sea Salt / Apple Cinnamon / Pumpkin Spice / Earl Grey $8, Hojicha $7), plates, bakes, snacks, sweets, coffee, fog (tea lattes), NA cocktails, cocktails, beer, wine.

${eventContext}

WiFi: Kommune@1. Instagram: @kommune.whisked.

Use the route_customer tool for EVERY response. Always set "text". Add "action" when the customer wants to book, see events, or browse the menu. Short and direct — one or two sentences. No filler.`,
      messages: [{ role: 'user', content: message }],
      tools: [
        {
          name: 'route_customer',
          description: 'Respond to the customer and optionally route them to an action',
          input_schema: {
            type: 'object' as const,
            properties: {
              text: { type: 'string' },
              action: {
                type: 'object' as const,
                properties: {
                  type: { type: 'string', enum: ['reservation', 'event', 'open_menu', 'press'] },
                  label: { type: 'string' },
                  eventId: { type: 'number' },
                  prefill: {
                    type: 'object' as const,
                    properties: { size: { type: 'number' }, preorder: { type: 'string' } },
                  },
                },
                required: ['type', 'label'],
              },
            },
            required: ['text'],
          },
        },
      ],
      tool_choice: { type: 'auto' },
    });

    let text = '';
    let action = null;
    for (const block of response.content) {
      if (block.type === 'text') text = block.text;
      if (block.type === 'tool_use' && block.name === 'route_customer') {
        const inp = block.input as any;
        text = inp.text || text;
        action = inp.action ?? null;
      }
    }
    if (!text) text = 'unavailable right now';
    res.json({ text, action });
  } catch (err) {
    logger.error('Kommune chat error', err);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/kommune/suggest', async (req: any, res: any) => {
  const suggestion = String(req.body?.suggestion ?? '').trim().slice(0, 300);
  if (!suggestion) return res.status(400).json({ error: 'invalid' });
  await db.execute(sql`
    INSERT INTO kommune_flavour_suggestions (suggestion) VALUES (${suggestion})
  `);
  res.json({ ok: true });
});

app.post('/api/kommune/reservations/checkout', async (req: any, res: any) => {
  const totalCents = parseInt(req.body?.total_cents) || 0;
  if (totalCents < 50) return res.status(400).json({ error: 'invalid amount' });
  const intent = await stripe.paymentIntents.create({
    amount: totalCents,
    currency: 'cad',
    automatic_payment_methods: { enabled: true },
  });
  res.json({ client_secret: intent.client_secret });
});

app.post('/api/kommune/reservations', async (req: any, res: any) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 200);
  const size = parseInt(req.body?.size) || 0;
  const date = String(req.body?.date ?? '').trim().slice(0, 20);
  const time = String(req.body?.time ?? '').trim().slice(0, 10);
  const note = String(req.body?.note ?? '').trim().slice(0, 500);
  const email = String(req.body?.email ?? '').trim().slice(0, 200);
  const stripePaymentIntentId = String(req.body?.stripe_payment_intent_id ?? '').trim().slice(0, 200);
  const orderJson = req.body?.order_json ?? null;
  const eventId = req.body?.event_id ? parseInt(req.body.event_id) : null;
  if (!name || !size || !date || !time) return res.status(400).json({ error: 'invalid' });

  // Verify payment server-side — never trust browser-supplied total_cents
  let totalCents = 0;
  if (stripePaymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
    if (intent.status !== 'succeeded') {
      return res.status(402).json({ error: 'payment not confirmed' });
    }
    totalCents = intent.amount;
  }

  await db.execute(sql`
    INSERT INTO kommune_reservations (name, size, date, time, note, email, total_cents, stripe_payment_intent_id, order_json, event_id)
    VALUES (${name}, ${size}, ${date}, ${time}, ${note}, ${email}, ${totalCents},
            ${stripePaymentIntentId || null}, ${orderJson ? JSON.stringify(orderJson) : null}, ${eventId})
  `);
  if (eventId) {
    await db.execute(sql`
      UPDATE table_events SET seats_taken = seats_taken + ${size} WHERE id = ${eventId}
    `);
  }
  res.json({ ok: true });
});

app.get('/api/kommune/reservations', async (req: any, res: any) => {
  const password = String(req.query?.password ?? '');
  if (password !== process.env.KOMMUNE_OWNER_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  const rows = await db.execute(sql`
    SELECT id, name, size, date, time, note, email, total_cents, order_json, event_id, stripe_payment_intent_id, status, created_at
    FROM kommune_reservations ORDER BY date ASC, time ASC
  `);
  res.json({ reservations: (rows as any).rows ?? rows });
});

app.patch('/api/kommune/reservations/:id', async (req: any, res: any) => {
  const password = String(req.body?.password ?? '');
  if (password !== process.env.KOMMUNE_OWNER_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  const id = parseInt(req.params.id);
  const status = String(req.body?.status ?? '').trim();
  if (!['pending', 'confirmed', 'arrived', 'done'].includes(status)) return res.status(400).json({ error: 'invalid' });
  await db.execute(sql`UPDATE kommune_reservations SET status = ${status} WHERE id = ${id}`);
  res.json({ ok: true });
});

app.get('/table', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/table.html'));
});

app.get('/table/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/table-admin.html'));
});

app.get('/table/abstract', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/table-abstract.html'));
});

app.get('/table/join', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/table-join.html'));
});

app.get('/table/widget.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(path.join(__dirname, '../public/widget.js'));
});


app.get('/table/:slug', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/table.html'));
});

app.get('/device', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/device.html'));
});

// ── Privacy hop — /go?url=... ──────────────────────────────────────────────
// Checks the destination domain against the Disconnect.me tracker list and
// shows a grade before forwarding. No query is logged.
{
  const trackerSet: Set<string> = new Set(
    (require('./lib/trackers.json') as string[]).map((d: string) => d.toLowerCase())
  );

  function countTrackers(hostname: string): number {
    // Check the hostname and each parent domain
    const parts = hostname.toLowerCase().replace(/^www\./, '').split('.');
    let count = 0;
    for (let i = 0; i < parts.length - 1; i++) {
      const candidate = parts.slice(i).join('.');
      if (trackerSet.has(candidate)) count++;
    }
    return count;
  }

  app.get('/go', (req, res) => {
    const raw = req.query.url as string;
    if (!raw) { res.redirect('/'); return; }

    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    } catch {
      res.redirect('/'); return;
    }

    const hostname = url.hostname.replace(/^www\./, '');
    const trackerCount = countTrackers(url.hostname);
    const dest = url.toString();

    const grade = trackerCount === 0 ? 'clean' : trackerCount <= 3 ? 'moderate' : 'heavy';
    const gradeColor = grade === 'clean' ? '#2d6a4f' : grade === 'moderate' ? '#b5700a' : '#9b1c1c';
    const gradeLabel = grade === 'clean'
      ? 'No known trackers'
      : `${trackerCount} known tracker${trackerCount === 1 ? '' : 's'} detected`;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>leaving fraise.box</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#FFFFFF;--text:#1C1C1E;--muted:#8E8E93;--border:#E5E1DA;--card:#F7F5F2}
    body{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);font-family:'DM Mono',monospace;padding:2rem;gap:1.25rem}
    .back{position:fixed;top:1.25rem;left:1.5rem;font-size:.7rem;color:var(--muted);text-decoration:none;letter-spacing:.05em}
    .back:hover{color:var(--text)}
    .domain{font-size:1.1rem;font-weight:500;color:var(--text);text-align:center;word-break:break-all;letter-spacing:.01em}
    .grade{display:flex;align-items:center;gap:.6rem;font-size:.75rem;letter-spacing:.05em;color:var(--muted)}
    .dot{width:8px;height:8px;border-radius:50%;background:${gradeColor};flex-shrink:0}
    .grade-label{color:${gradeColor}}
    .detail{font-size:.72rem;color:var(--muted);text-align:center;max-width:38ch;line-height:1.75}
    .actions{display:flex;gap:.6rem;margin-top:.25rem}
    .btn{padding:.5rem 1.25rem;border-radius:9999px;font-family:'DM Mono',monospace;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;text-decoration:none;border:1px solid;transition:background .15s,border-color .15s,color .15s}
    .btn-go{background:var(--text);color:var(--bg);border-color:var(--text)}
    .btn-go:hover{opacity:.85}
    .btn-back{background:var(--bg);color:var(--muted);border-color:var(--border)}
    .btn-back:hover{border-color:var(--text);color:var(--text);background:var(--card)}
    .note{font-size:.62rem;color:var(--border);letter-spacing:.05em;text-transform:uppercase}
  </style>
</head>
<body>
  <a class="back" href="/">← fraise.box</a>
  <div class="domain">${hostname}</div>
  <div class="grade">
    <div class="dot"></div>
    <span class="grade-label">${gradeLabel}</span>
  </div>
  <p class="detail">
    ${grade === 'clean'
      ? 'this domain does not appear in any known tracker list.'
      : grade === 'moderate'
      ? 'this domain appears in tracker blocklists. it may collect analytics or advertising data.'
      : 'this domain runs multiple known trackers. it is likely collecting detailed analytics and ad targeting data.'}
  </p>
  <div class="actions">
    <a class="btn btn-back" href="/">go back</a>
    <a class="btn btn-go" href="${dest}" rel="noopener">continue anyway</a>
  </div>
  <p class="note">fraise.box did not log this request.</p>
</body>
</html>`);
  });
}

app.get('/privacy', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Privacy Policy — Box Fraise</title>
  <style>body{font-family:Georgia,serif;max-width:680px;margin:60px auto;padding:0 24px;color:#1a1a1a;line-height:1.7}h1{font-size:24px}h2{font-size:18px;margin-top:32px}p{margin:12px 0}</style></head>
  <body><h1>Privacy Policy</h1><p>Last updated: ${new Date().toLocaleDateString('en-CA')}</p>
  <p>Box Fraise ("we", "our") operates the Box Fraise mobile application. This policy describes how we collect, use, and protect your information.</p>
  <h2>Information We Collect</h2><p>We collect your name, email address, and Apple ID when you sign in with Apple. We collect order information including variety, quantity, pickup location, and payment details processed by Stripe.</p>
  <h2>How We Use Your Information</h2><p>We use your information to process orders, send order confirmations and status updates, and improve our service. We do not sell your personal information.</p>
  <h2>Data Retention</h2><p>We retain order records for accounting purposes. You may request deletion of your account by contacting us.</p>
  <h2>Contact</h2><p>For privacy inquiries: privacy@box-fraise.com</p>
  </body></html>`);
});

app.get('/terms', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Terms of Service — Box Fraise</title>
  <style>body{font-family:Georgia,serif;max-width:680px;margin:60px auto;padding:0 24px;color:#1a1a1a;line-height:1.7}h1{font-size:24px}h2{font-size:18px;margin-top:32px}p{margin:12px 0}</style></head>
  <body><h1>Terms of Service</h1><p>Last updated: ${new Date().toLocaleDateString('en-CA')}</p>
  <p>By using the Box Fraise app, you agree to these terms.</p>
  <h2>Orders</h2><p>All orders are final. Refunds are issued at our discretion for quality issues. Orders not collected within 2 hours of the designated time slot may be forfeited.</p>
  <h2>Payments</h2><p>Payments are processed securely by Stripe. We do not store card details.</p>
  <h2>Accounts</h2><p>You are responsible for maintaining the security of your account. We may terminate accounts that violate these terms.</p>
  <h2>Contact</h2><p>For support: hello@box-fraise.com</p>
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
    const bodyHtml = (piece.body ?? '').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');

    res.send(`<!DOCTYPE html><html lang="en"><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${piece.title} — Box Fraise</title>
      <meta property="og:title" content="${piece.title}">
      <meta property="og:site_name" content="Box Fraise">
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
      <div class="brand"><a href="/">Box Fraise</a></div>
      <h1>${piece.title}</h1>
      <div class="meta">
        <span>${piece.author_name ?? 'Box Fraise'}</span>
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
      <title>${profile.display_name ?? username} — Box Fraise</title>
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
      <div class="brand"><a href="/">Box Fraise</a></div>
      <h1>${profile.display_name ?? username}</h1>
      <div class="tier">${activeMembership ? `${tierLabel} member · Active` : 'No active membership'}</div>
      ${pieces.length > 0 ? `<h2>Published pieces</h2><ul>${pieceItems}</ul>` : '<p style="color:#888;font-size:14px">No published pieces yet.</p>'}
    </div></body></html>`);
  } catch (e) { res.status(500).send('<h1>Error</h1>'); }
});

// Business proposal claim landing page — top-level (not under /api)
app.get('/proposal/:token', (req, res, next) => {
  req.url = `/claim/${req.params.token}`;
  proposalsRouter(req, res, next);
});

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Public map deep link — /map/:userId
app.get('/map/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) { res.status(404).send('<h1>Not found</h1>'); return; }
  try {
    const userRows = await db.execute(sql`
      SELECT display_name FROM users WHERE id = ${userId} LIMIT 1
    `);
    const user = (((userRows as any).rows ?? userRows)[0] as any);
    if (!user) { res.status(404).send('<h1>Not found</h1>'); return; }

    const mapRows = await db.execute(sql`
      SELECT m.id, m.name FROM user_maps m WHERE m.user_id = ${userId} LIMIT 1
    `);
    const map = (((mapRows as any).rows ?? mapRows)[0] as any);

    let entries: any[] = [];
    if (map) {
      const entryRows = await db.execute(sql`
        SELECT b.name, b.address, b.neighbourhood, b.hours, b.instagram_handle, b.type
        FROM user_map_entries e
        JOIN businesses b ON b.id = e.business_id
        WHERE e.map_id = ${map.id}
        ORDER BY e.sort_order ASC, e.created_at ASC
      `);
      entries = (entryRows as any).rows ?? entryRows;
    }

    const displayName = escapeHtml(user.display_name ?? 'someone');
    const placeItems = entries.map((e: any) => {
      const neighbourhood = e.neighbourhood ? escapeHtml(e.neighbourhood) : null;
      const hours = e.hours ? escapeHtml(e.hours) : null;
      const meta = [neighbourhood, hours].filter(Boolean).join('  ·  ');
      const igHandle = e.instagram_handle ? escapeHtml(e.instagram_handle) : null;
      const ig = igHandle ? `<a href="https://instagram.com/${igHandle}" style="color:#8A8A8E;text-decoration:none;">@${igHandle}</a>` : '';
      return `
        <div style="padding:20px 0;border-bottom:1px solid #E5E1DA;">
          <div style="font-family:Georgia,serif;font-size:18px;color:#1C1C1E;margin-bottom:4px;">${escapeHtml(e.name ?? '')}</div>
          ${meta ? `<div style="font-family:'Courier New',monospace;font-size:11px;color:#8A8A8E;letter-spacing:0.5px;margin-bottom:4px;">${meta}</div>` : ''}
          ${e.address ? `<div style="font-family:'DM Sans',sans-serif;font-size:13px;color:#6A6A6E;">${escapeHtml(e.address)}</div>` : ''}
          ${ig ? `<div style="margin-top:4px;font-size:12px;">${ig}</div>` : ''}
        </div>`;
    }).join('');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${displayName}'s map — Box Fraise</title>
  <meta property="og:title" content="${displayName}'s map" />
  <meta property="og:description" content="${entries.length} place${entries.length === 1 ? '' : 's'} worth visiting" />
  <meta property="og:site_name" content="Box Fraise" />
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;background:#FAF9F7;color:#1C1C1E;padding:0 24px}
    .wrap{max-width:560px;margin:0 auto;padding:80px 0 120px}
    .brand{font-size:12px;letter-spacing:2px;color:#8A8A8E;text-transform:uppercase;font-family:'Courier New',monospace;margin-bottom:60px}
    .brand a{color:#8A8A8E;text-decoration:none}
    h1{font-size:32px;font-weight:normal;margin-bottom:8px;line-height:1.3}
    .count{font-family:'Courier New',monospace;font-size:11px;color:#8A8A8E;letter-spacing:1px;margin-bottom:48px}
    .empty{font-family:'Courier New',monospace;font-size:13px;color:#8A8A8E;margin-top:48px}
    .applink{margin-top:48px;padding-top:32px;border-top:1px solid #E5E1DA}
    .applink a{font-family:'Courier New',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#1C1C1E;text-decoration:none;background:#1C1C1E;color:#FAF9F7;padding:12px 24px;display:inline-block}
    @media(prefers-color-scheme:dark){
      body{background:#0E0E0E;color:#F0EDE8}
      h1{color:#F0EDE8}
      div[style*="1C1C1E"]{color:#F0EDE8 !important}
      .brand,.count,.empty{color:#555}
      .brand a{color:#555}
      div[style*="E5E1DA"]{border-color:#2A2A2A !important}
    }
  </style>
</head>
<body>
<div class="wrap">
  <div class="brand"><a href="/">Box Fraise</a></div>
  <h1>${displayName}</h1>
  <div class="count">${entries.length} ${entries.length === 1 ? 'place' : 'places'}</div>
  ${entries.length > 0 ? placeItems : '<div class="empty">no places yet</div>'}
  <div class="applink">
    <a href="https://apps.apple.com/app/box-fraise">Get the app →</a>
  </div>
</div>
</body>
</html>`);
  } catch { res.status(500).send('<h1>Error</h1>'); }
});

// Sentry error handler — must be after all routes
app.use(Sentry.expressErrorHandler());

export default app;

// @final-audit
