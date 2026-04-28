import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import appleSignin from 'apple-signin-auth';
import { stripe } from '../lib/stripe';
import {
  sendFraiseWelcome,
  sendFraiseCreditsAdded,
  sendFraiseClaimConfirmation,
  sendFraiseEventConfirmed,
} from '../lib/resend';

const router = Router();

const CREDIT_PRICE_CENTS = 12000; // CA$120 per credit
const FRAISE_PLATFORM_FEE = 0.15;

// ── Helpers ──────────────────────────────────────────────────────────────────

function token(): string {
  return crypto.randomBytes(32).toString('hex');
}

function confirmToken(): string {
  return crypto.randomBytes(20).toString('hex');
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Auth middleware ───────────────────────────────────────────────────────────

async function requireMember(req: any, res: any, next: NextFunction) {
  const t = req.headers['x-member-token'] as string;
  if (!t) return res.status(401).json({ error: 'member token required' });
  const rows = await db.execute(sql`
    SELECT m.id, m.name, m.email, m.credit_balance
    FROM fraise_member_sessions s
    JOIN fraise_members m ON m.id = s.member_id
    WHERE s.token = ${t} AND s.expires_at > now()
    LIMIT 1
  `);
  const member = ((rows as any).rows ?? rows)[0] as any;
  if (!member) return res.status(401).json({ error: 'invalid or expired token' });
  req.member = member;
  next();
}

async function requireMemberBusiness(req: any, res: any, next: NextFunction) {
  const t = req.headers['x-member-token'] as string;
  if (!t) return res.status(401).json({ error: 'member token required' });
  const memberRows = await db.execute(sql`
    SELECT m.id, m.name, m.email, m.credit_balance
    FROM fraise_member_sessions s
    JOIN fraise_members m ON m.id = s.member_id
    WHERE s.token = ${t} AND s.expires_at > now()
    LIMIT 1
  `);
  const member = ((memberRows as any).rows ?? memberRows)[0] as any;
  if (!member) return res.status(401).json({ error: 'invalid or expired token' });
  req.member = member;

  const bizRows = await db.execute(sql`
    SELECT id, slug, name, stripe_connect_account_id, stripe_connect_onboarded
    FROM fraise_businesses
    WHERE member_id = ${member.id} AND status = 'approved'
    LIMIT 1
  `);
  const business = ((bizRows as any).rows ?? bizRows)[0] as any;
  if (!business) return res.status(403).json({ error: 'no approved business on this account' });
  req.business = business;
  next();
}

function requireAdmin(req: any, res: any, next: NextFunction) {
  const pin = req.headers['x-admin-pin'];
  if (!pin || pin !== process.env.ADMIN_PIN) {
    return res.status(401).json({ error: 'admin pin required' });
  }
  next();
}

// ── Member auth ───────────────────────────────────────────────────────────────

// POST /api/fraise/members/signup
router.post('/members/signup', async (req: any, res: any) => {
  const name  = String(req.body?.name ?? '').trim().slice(0, 200);
  const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200);
  const pw    = String(req.body?.password ?? '');
  if (!name || !email || pw.length < 8) {
    return res.status(400).json({ error: 'name, email, and password (8+ chars) required' });
  }
  try {
    const existing = await db.execute(sql`SELECT id FROM fraise_members WHERE email = ${email} LIMIT 1`);
    if (((existing as any).rows ?? existing).length) {
      return res.status(409).json({ error: 'email already registered' });
    }
    const hash = await bcrypt.hash(pw, 10);
    const rows = await db.execute(sql`
      INSERT INTO fraise_members (name, email, password_hash)
      VALUES (${name}, ${email}, ${hash})
      RETURNING id
    `);
    const memberId = (((rows as any).rows ?? rows)[0] as any).id;
    const t = token();
    await db.execute(sql`
      INSERT INTO fraise_member_sessions (member_id, token, expires_at)
      VALUES (${memberId}, ${t}, now() + interval '30 days')
    `);
    sendFraiseWelcome({ to: email, name }).catch(() => {});
    res.json({ token: t, name, email, credit_balance: 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/members/login
router.post('/members/login', async (req: any, res: any) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const pw    = String(req.body?.password ?? '');
  if (!email || !pw) return res.status(400).json({ error: 'email and password required' });
  try {
    const rows = await db.execute(sql`SELECT id, name, email, password_hash, credit_balance FROM fraise_members WHERE email = ${email} LIMIT 1`);
    const m = ((rows as any).rows ?? rows)[0] as any;
    if (!m || !(await bcrypt.compare(pw, m.password_hash))) {
      return res.status(401).json({ error: 'invalid email or password' });
    }
    const t = token();
    await db.execute(sql`
      INSERT INTO fraise_member_sessions (member_id, token, expires_at)
      VALUES (${m.id}, ${t}, now() + interval '30 days')
    `);
    res.json({ token: t, name: m.name, email: m.email, credit_balance: m.credit_balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/members/apple-signin
router.post('/members/apple-signin', async (req: any, res: any) => {
  const { identityToken, name: bodyName, email: bodyEmail } = req.body ?? {};
  if (!identityToken) return res.status(400).json({ error: 'identityToken required' });
  try {
    const payload = await appleSignin.verifyIdToken(String(identityToken), {
      audience: 'com.boxfraise.app',
    });
    const sub   = payload.sub as string;
    const email = (payload.email ?? bodyEmail ?? '').toString().toLowerCase().trim();
    const name  = String(bodyName ?? '').trim().slice(0, 200);

    let rows = await db.execute(sql`SELECT id, name, email, credit_balance FROM fraise_members WHERE apple_sub = ${sub} LIMIT 1`);
    let m = ((rows as any).rows ?? rows)[0] as any;

    if (!m && email) {
      rows = await db.execute(sql`
        UPDATE fraise_members SET apple_sub = ${sub}
        WHERE email = ${email} AND apple_sub IS NULL
        RETURNING id, name, email, credit_balance
      `);
      m = ((rows as any).rows ?? rows)[0] as any;
    }

    if (!m) {
      const displayName = name || (email ? email.split('@')[0] : 'member');
      const insertRows = await db.execute(sql`
        INSERT INTO fraise_members (name, email, apple_sub)
        VALUES (${displayName}, ${email || null}, ${sub})
        RETURNING id, name, email, credit_balance
      `);
      m = ((insertRows as any).rows ?? insertRows)[0] as any;
      if (email) sendFraiseWelcome({ to: email, name: displayName }).catch(() => {});
    }

    const t = token();
    await db.execute(sql`
      INSERT INTO fraise_member_sessions (member_id, token, expires_at)
      VALUES (${m.id}, ${t}, now() + interval '30 days')
    `);
    res.json({ token: t, name: m.name, email: m.email ?? '', credit_balance: m.credit_balance });
  } catch (err: any) {
    res.status(401).json({ error: err.message ?? 'apple sign in failed' });
  }
});

// GET /api/fraise/members/me
router.get('/members/me', requireMember, async (req: any, res: any) => {
  const rows = await db.execute(sql`
    SELECT id, name, email, credit_balance, credits_purchased, created_at
    FROM fraise_members WHERE id = ${req.member.id} LIMIT 1
  `);
  res.json(((rows as any).rows ?? rows)[0]);
});

// PUT /api/fraise/members/push-token
router.put('/members/push-token', requireMember, async (req: any, res: any) => {
  const pushToken = String(req.body?.push_token ?? '').trim().slice(0, 500);
  if (!pushToken) return res.status(400).json({ error: 'push_token required' });
  try {
    await db.execute(sql`UPDATE fraise_members SET push_token = ${pushToken} WHERE id = ${req.member.id}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// PATCH /api/fraise/businesses/location
router.patch('/businesses/location', requireMemberBusiness, async (req: any, res: any) => {
  const lat = parseFloat(req.body?.lat);
  const lng = parseFloat(req.body?.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });
  try {
    await db.execute(sql`UPDATE fraise_businesses SET lat = ${lat}, lng = ${lng} WHERE id = ${req.business.id}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/members/claims
router.get('/members/claims', requireMember, async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        c.id, c.status, c.created_at,
        e.id AS event_id, e.title, e.description, e.price_cents,
        e.min_seats, e.max_seats, e.seats_claimed, e.status AS event_status, e.event_date,
        b.name AS business_name, b.slug AS business_slug
      FROM fraise_claims c
      JOIN fraise_events e ON e.id = c.event_id
      JOIN fraise_businesses b ON b.id = e.business_id
      WHERE c.member_id = ${req.member.id}
        AND c.status NOT IN ('declined')
      ORDER BY c.created_at DESC
    `);
    res.json({ claims: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// ── Credits ───────────────────────────────────────────────────────────────────

// POST /api/fraise/members/credits/checkout — create PI for N credits
router.post('/members/credits/checkout', requireMember, async (req: any, res: any) => {
  const credits = parseInt(req.body?.credits) || 0;
  if (credits < 1 || credits > 20) {
    return res.status(400).json({ error: 'credits must be between 1 and 20' });
  }
  const amountCents = credits * CREDIT_PRICE_CENTS;
  try {
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'cad',
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: 'fraise_credits',
        member_id: String(req.member.id),
        credits: String(credits),
      },
    });
    res.json({ client_secret: intent.client_secret, amount_cents: amountCents, credits });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/members/credits/confirm — verify PI, add credits
router.post('/members/credits/confirm', requireMember, async (req: any, res: any) => {
  const paymentIntentId = String(req.body?.payment_intent_id ?? '').trim();
  if (!paymentIntentId) return res.status(400).json({ error: 'payment_intent_id required' });
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return res.status(402).json({ error: 'payment not confirmed' });
    }
    if (intent.metadata?.type !== 'fraise_credits' || String(intent.metadata?.member_id) !== String(req.member.id)) {
      return res.status(400).json({ error: 'payment intent does not match this account' });
    }
    // Idempotent: check if already processed
    const existing = await db.execute(sql`SELECT id FROM fraise_credit_purchases WHERE stripe_payment_intent_id = ${paymentIntentId} LIMIT 1`);
    if (((existing as any).rows ?? existing).length) {
      return res.status(409).json({ error: 'already processed' });
    }
    const credits = parseInt(intent.metadata.credits) || 0;
    if (credits < 1) return res.status(400).json({ error: 'invalid credits in payment metadata' });
    await db.execute(sql`
      INSERT INTO fraise_credit_purchases (member_id, credits, amount_cents, stripe_payment_intent_id)
      VALUES (${req.member.id}, ${credits}, ${intent.amount}, ${paymentIntentId})
    `);
    await db.execute(sql`
      UPDATE fraise_members
      SET credit_balance = credit_balance + ${credits},
          credits_purchased = credits_purchased + ${credits}
      WHERE id = ${req.member.id}
    `);
    const updated = await db.execute(sql`SELECT credit_balance FROM fraise_members WHERE id = ${req.member.id} LIMIT 1`);
    const balance = (((updated as any).rows ?? updated)[0] as any).credit_balance;
    sendFraiseCreditsAdded({ to: req.member.email, name: req.member.name, credits, balance }).catch(() => {});
    res.json({ ok: true, credits_added: credits, credit_balance: balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// ── Business application ──────────────────────────────────────────────────────

// POST /api/fraise/members/business-application — authenticated member submits application
router.post('/members/business-application', requireMember, async (req: any, res: any) => {
  const name     = String(req.body?.name ?? '').trim().slice(0, 200);
  const slug     = String(req.body?.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  const desc     = String(req.body?.description ?? '').trim().slice(0, 1000);
  const email    = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200);
  const category = String(req.body?.category ?? '').trim().slice(0, 100);
  const address  = String(req.body?.address ?? '').trim().slice(0, 500);
  if (!name || !slug || !email) {
    return res.status(400).json({ error: 'name, slug, and email required' });
  }
  try {
    const existing = await db.execute(sql`SELECT id FROM fraise_businesses WHERE member_id = ${req.member.id} LIMIT 1`);
    if (((existing as any).rows ?? existing).length) {
      return res.status(409).json({ error: 'you already have a business application' });
    }
    const conflict = await db.execute(sql`SELECT id FROM fraise_businesses WHERE slug = ${slug} LIMIT 1`);
    if (((conflict as any).rows ?? conflict).length) {
      return res.status(409).json({ error: 'slug already taken' });
    }
    const rows = await db.execute(sql`
      INSERT INTO fraise_businesses (member_id, slug, name, description, email, category, address, status)
      VALUES (${req.member.id}, ${slug}, ${name}, ${desc || null}, ${email}, ${category || null}, ${address || null}, 'pending')
      RETURNING id, slug, name, status, created_at
    `);
    res.json(((rows as any).rows ?? rows)[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/members/my-business — get the business tied to this member account
router.get('/members/my-business', requireMember, async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, slug, name, description, email, category, address, status,
             stripe_connect_onboarded, active, lat, lng, created_at
      FROM fraise_businesses WHERE member_id = ${req.member.id} LIMIT 1
    `);
    const biz = ((rows as any).rows ?? rows)[0];
    if (!biz) return res.status(404).json({ error: 'no business application found' });
    res.json(biz);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// ── (legacy business auth routes removed — businesses now use member token) ───


// POST /api/fraise/businesses/connect
router.post('/businesses/connect', requireMemberBusiness, async (req: any, res: any) => {
  const returnUrl = String(req.body?.return_url ?? '').trim();
  if (!returnUrl) return res.status(400).json({ error: 'return_url required' });
  try {
    let accountId = req.business.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({ type: 'express' });
      accountId = account.id;
      await db.execute(sql`UPDATE fraise_businesses SET stripe_connect_account_id = ${accountId} WHERE id = ${req.business.id}`);
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrl,
      return_url: returnUrl + '?connect=done',
      type: 'account_onboarding',
    });
    res.json({ url: link.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/businesses/connect/verify
router.post('/businesses/connect/verify', requireMemberBusiness, async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`SELECT stripe_connect_account_id FROM fraise_businesses WHERE id = ${req.business.id} LIMIT 1`);
    const b = ((rows as any).rows ?? rows)[0] as any;
    if (!b?.stripe_connect_account_id) return res.status(400).json({ error: 'no connect account' });
    const account = await stripe.accounts.retrieve(b.stripe_connect_account_id);
    if (account.details_submitted) {
      await db.execute(sql`UPDATE fraise_businesses SET stripe_connect_onboarded = true WHERE id = ${req.business.id}`);
    }
    res.json({ onboarded: account.details_submitted });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// ── Events ────────────────────────────────────────────────────────────────────

// GET /api/fraise/events — public feed of open events
router.get('/events', async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        e.id, e.title, e.description, e.price_cents,
        e.min_seats, e.max_seats, e.seats_claimed, e.status, e.event_date, e.created_at,
        b.slug AS business_slug, b.name AS business_name, b.lat AS business_lat, b.lng AS business_lng
      FROM fraise_events e
      JOIN fraise_businesses b ON b.id = e.business_id
      WHERE e.status IN ('open', 'threshold_met')
      ORDER BY e.created_at DESC
    `);
    res.json({ events: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/events/:id
router.get('/events/:id', async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const rows = await db.execute(sql`
      SELECT
        e.id, e.title, e.description, e.price_cents,
        e.min_seats, e.max_seats, e.seats_claimed, e.status, e.event_date, e.created_at,
        b.slug AS business_slug, b.name AS business_name
      FROM fraise_events e
      JOIN fraise_businesses b ON b.id = e.business_id
      WHERE e.id = ${id} LIMIT 1
    `);
    const event = ((rows as any).rows ?? rows)[0];
    if (!event) return res.status(404).json({ error: 'not found' });
    res.json(event);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/events — business creates event
router.post('/events', requireMemberBusiness, async (req: any, res: any) => {
  const title    = String(req.body?.title ?? '').trim().slice(0, 200);
  const desc     = String(req.body?.description ?? '').trim().slice(0, 2000);
  const minSeats = parseInt(req.body?.min_seats) || 6;
  const maxSeats = parseInt(req.body?.max_seats) || 20;
  const price    = parseInt(req.body?.price_cents) || CREDIT_PRICE_CENTS;
  if (!title) return res.status(400).json({ error: 'title required' });
  if (price < CREDIT_PRICE_CENTS) return res.status(400).json({ error: `minimum price is CA$${CREDIT_PRICE_CENTS / 100}` });
  if (minSeats < 1 || maxSeats < minSeats) return res.status(400).json({ error: 'invalid seat range' });
  try {
    const rows = await db.execute(sql`
      INSERT INTO fraise_events (business_id, title, description, price_cents, min_seats, max_seats)
      VALUES (${req.business.id}, ${title}, ${desc || null}, ${price}, ${minSeats}, ${maxSeats})
      RETURNING id, title, status, created_at
    `);
    res.json(((rows as any).rows ?? rows)[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/events/:id/claim — member claims a spot (atomic CTE)
router.post('/events/:id/claim', requireMember, async (req: any, res: any) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });
  try {
    const result = await db.execute(sql`
      WITH
      check_and_claim AS (
        INSERT INTO fraise_claims (member_id, event_id)
        SELECT ${req.member.id}, ${eventId}
        FROM fraise_events e, fraise_members m
        WHERE e.id = ${eventId}
          AND e.status IN ('open', 'threshold_met')
          AND e.seats_claimed < e.max_seats
          AND m.id = ${req.member.id}
          AND m.credit_balance >= 1
        ON CONFLICT (member_id, event_id) DO NOTHING
        RETURNING id
      ),
      deduct_credit AS (
        UPDATE fraise_members SET credit_balance = credit_balance - 1
        WHERE id = ${req.member.id} AND EXISTS (SELECT 1 FROM check_and_claim)
        RETURNING credit_balance
      ),
      update_seats AS (
        UPDATE fraise_events SET seats_claimed = seats_claimed + 1
        WHERE id = ${eventId} AND EXISTS (SELECT 1 FROM check_and_claim)
        RETURNING seats_claimed, min_seats, status
      )
      SELECT
        (SELECT id    FROM check_and_claim) AS claim_id,
        (SELECT credit_balance FROM deduct_credit) AS credit_balance,
        (SELECT seats_claimed  FROM update_seats)  AS seats_claimed,
        (SELECT min_seats      FROM update_seats)  AS min_seats,
        (SELECT status         FROM update_seats)  AS status
    `);

    const row = ((result as any).rows ?? result)[0] as any;

    if (!row?.claim_id) {
      // Claim was not inserted — diagnose why
      const evRows = await db.execute(sql`SELECT status, max_seats, seats_claimed FROM fraise_events WHERE id = ${eventId} LIMIT 1`);
      const ev = ((evRows as any).rows ?? evRows)[0] as any;
      if (!ev) return res.status(404).json({ error: 'event not found' });
      if (!['open', 'threshold_met'].includes(ev.status)) return res.status(400).json({ error: 'event is not open for claims' });
      if (ev.seats_claimed >= ev.max_seats) return res.status(400).json({ error: 'event is full' });
      const memRows = await db.execute(sql`SELECT credit_balance FROM fraise_members WHERE id = ${req.member.id} LIMIT 1`);
      const mem = ((memRows as any).rows ?? memRows)[0] as any;
      if (mem?.credit_balance < 1) return res.status(402).json({ error: 'insufficient credits' });
      return res.status(409).json({ error: 'already claimed this event' });
    }

    // Auto-advance to threshold_met if needed (idempotent)
    if (row.status === 'open' && row.seats_claimed >= row.min_seats) {
      await db.execute(sql`UPDATE fraise_events SET status = 'threshold_met' WHERE id = ${eventId} AND status = 'open'`);
    }

    // Send confirmation email
    const evRows = await db.execute(sql`SELECT title, business_id FROM fraise_events WHERE id = ${eventId} LIMIT 1`);
    const ev = ((evRows as any).rows ?? evRows)[0] as any;
    const bizRows = await db.execute(sql`SELECT name FROM fraise_businesses WHERE id = ${ev.business_id} LIMIT 1`);
    const bizName = (((bizRows as any).rows ?? bizRows)[0] as any)?.name ?? '';
    sendFraiseClaimConfirmation({ to: req.member.email, name: req.member.name, eventTitle: ev.title, businessName: bizName, creditBalance: row.credit_balance }).catch(() => {});

    res.json({ ok: true, credit_balance: row.credit_balance, seats_claimed: row.seats_claimed });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/events/:id/decline — member releases claim, credit returned (atomic CTE)
router.post('/events/:id/decline', requireMember, async (req: any, res: any) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });
  try {
    const result = await db.execute(sql`
      WITH
      decline_claim AS (
        UPDATE fraise_claims SET status = 'declined', declined_at = now()
        WHERE member_id = ${req.member.id}
          AND event_id = ${eventId}
          AND status NOT IN ('declined', 'attended')
        RETURNING id
      ),
      return_credit AS (
        UPDATE fraise_members SET credit_balance = credit_balance + 1
        WHERE id = ${req.member.id} AND EXISTS (SELECT 1 FROM decline_claim)
        RETURNING credit_balance
      ),
      release_seat AS (
        UPDATE fraise_events SET seats_claimed = GREATEST(seats_claimed - 1, 0)
        WHERE id = ${eventId} AND EXISTS (SELECT 1 FROM decline_claim)
        RETURNING seats_claimed, min_seats, status
      )
      SELECT
        (SELECT id             FROM decline_claim) AS claim_id,
        (SELECT credit_balance FROM return_credit) AS credit_balance,
        (SELECT seats_claimed  FROM release_seat)  AS seats_claimed,
        (SELECT min_seats      FROM release_seat)  AS min_seats,
        (SELECT status         FROM release_seat)  AS event_status
    `);

    const row = ((result as any).rows ?? result)[0] as any;

    if (!row?.claim_id) {
      const claimRows = await db.execute(sql`SELECT status FROM fraise_claims WHERE member_id = ${req.member.id} AND event_id = ${eventId} LIMIT 1`);
      const claim = ((claimRows as any).rows ?? claimRows)[0] as any;
      if (!claim) return res.status(404).json({ error: 'no claim found' });
      return res.status(400).json({ error: 'claim already closed' });
    }

    // Re-open if was threshold_met but now below threshold (idempotent)
    if (row.event_status === 'threshold_met' && row.seats_claimed < row.min_seats) {
      await db.execute(sql`UPDATE fraise_events SET status = 'open' WHERE id = ${eventId} AND status = 'threshold_met'`);
    }

    res.json({ ok: true, credit_returned: true, credit_balance: row.credit_balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/events/:id/claims — business sees who claimed their event
router.get('/events/:id/claims', requireMemberBusiness, async (req: any, res: any) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });
  try {
    // Verify business owns this event
    const evRows = await db.execute(sql`SELECT id FROM fraise_events WHERE id = ${eventId} AND business_id = ${req.business.id} LIMIT 1`);
    if (!((evRows as any).rows ?? evRows).length) return res.status(404).json({ error: 'event not found' });

    const rows = await db.execute(sql`
      SELECT c.id, c.status, c.created_at, m.name, m.email
      FROM fraise_claims c
      JOIN fraise_members m ON m.id = c.member_id
      WHERE c.event_id = ${eventId}
      ORDER BY c.created_at ASC
    `);
    res.json({ claims: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/events/:id/confirm — admin or business sets the date, notifies claimants
router.post('/events/:id/confirm', async (req: any, res: any) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });

  // Accept admin PIN or member token (member must have an approved business)
  const pin = req.headers['x-admin-pin'];
  const memberToken = req.headers['x-member-token'] as string;
  let businessId: number | null = null;

  if (pin && pin === process.env.ADMIN_PIN) {
    businessId = null; // admin can confirm any event
  } else if (memberToken) {
    const r = await db.execute(sql`
      SELECT b.id AS business_id
      FROM fraise_member_sessions s
      JOIN fraise_members m ON m.id = s.member_id
      JOIN fraise_businesses b ON b.member_id = m.id
      WHERE s.token = ${memberToken} AND s.expires_at > now() AND b.status = 'approved'
      LIMIT 1
    `);
    const row = ((r as any).rows ?? r)[0] as any;
    if (!row) return res.status(401).json({ error: 'unauthorized' });
    businessId = row.business_id;
  } else {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const eventDate = String(req.body?.event_date ?? '').trim().slice(0, 100);
  if (!eventDate) return res.status(400).json({ error: 'event_date required' });

  try {
    const evQuery = businessId
      ? sql`SELECT e.id, e.title, e.status, b.name AS business_name FROM fraise_events e JOIN fraise_businesses b ON b.id = e.business_id WHERE e.id = ${eventId} AND e.business_id = ${businessId} LIMIT 1`
      : sql`SELECT e.id, e.title, e.status, b.name AS business_name FROM fraise_events e JOIN fraise_businesses b ON b.id = e.business_id WHERE e.id = ${eventId} LIMIT 1`;

    const evRows = await db.execute(evQuery);
    const event = ((evRows as any).rows ?? evRows)[0] as any;
    if (!event) return res.status(404).json({ error: 'event not found' });
    if (event.status === 'confirmed') return res.status(400).json({ error: 'already confirmed' });

    await db.execute(sql`
      UPDATE fraise_events SET status = 'confirmed', event_date = ${eventDate} WHERE id = ${eventId}
    `);

    // Generate confirm tokens and notify all active claimants
    const claimRows = await db.execute(sql`
      UPDATE fraise_claims SET confirm_token = encode(gen_random_bytes(20), 'hex')
      WHERE event_id = ${eventId} AND status = 'claimed'
      RETURNING id, confirm_token, member_id
    `);
    const claims = (claimRows as any).rows ?? claimRows;

    const apiBase = process.env.API_BASE_URL ?? 'https://api.fraise.box';
    for (const c of claims) {
      const memRows = await db.execute(sql`SELECT name, email FROM fraise_members WHERE id = ${c.member_id} LIMIT 1`);
      const mem = ((memRows as any).rows ?? memRows)[0] as any;
      if (!mem) continue;
      const confirmUrl = `${apiBase}/api/fraise/claims/confirm/${c.confirm_token}`;
      const declineUrl = `${apiBase}/api/fraise/claims/decline/${c.confirm_token}`;
      sendFraiseEventConfirmed({ to: mem.email, name: mem.name, eventTitle: event.title, businessName: event.business_name, eventDate, confirmUrl, declineUrl }).catch(() => {});
    }

    res.json({ ok: true, notified: claims.length, event_date: eventDate });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// ── Claim token actions (from email links) ────────────────────────────────────

const PAGE_STYLE = `*{box-sizing:border-box;margin:0;padding:0}html{background:#fff;font-family:'DM Mono',monospace;font-size:14px;-webkit-font-smoothing:antialiased}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:2rem}main{max-width:400px;width:100%}.eyebrow{font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:#8A8880;margin-bottom:0.5rem}h1{font-size:1rem;font-weight:500;margin-bottom:1rem}p{font-size:0.78rem;color:#8A8880;line-height:1.7}a{color:#1A1A18;text-underline-offset:3px}button{margin-top:1.5rem;background:#1A1A18;color:#fff;border:none;border-radius:9999px;padding:0.6rem 1.5rem;font-family:'DM Mono',monospace;font-size:0.78rem;cursor:pointer;letter-spacing:0.05em}button:hover{opacity:0.85}`;

function claimResponsePage(heading: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(heading)} — fraise.box</title><style>${PAGE_STYLE}</style></head><body><main><div class="eyebrow">fraise.box</div><h1>${escHtml(heading)}</h1><p>${escHtml(body)}</p></main></body></html>`;
}

function claimActionPage(heading: string, body: string, action: string, buttonLabel: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(heading)} — fraise.box</title><style>${PAGE_STYLE}</style></head><body><main><div class="eyebrow">fraise.box</div><h1>${escHtml(heading)}</h1><p>${escHtml(body)}</p><form method="POST" action="${escHtml(action)}"><button type="submit">${escHtml(buttonLabel)}</button></form></main></body></html>`;
}

// GET /api/fraise/claims/confirm/:token — show confirmation form (safe for email prefetch)
router.get('/claims/confirm/:token', async (req: any, res: any) => {
  const t = String(req.params.token ?? '').trim();
  if (!t) return res.status(400).send(claimResponsePage('invalid link', 'this confirmation link is not valid.'));
  try {
    const rows = await db.execute(sql`
      SELECT c.status FROM fraise_claims c WHERE c.confirm_token = ${t} LIMIT 1
    `);
    const claim = ((rows as any).rows ?? rows)[0] as any;
    if (!claim) return res.send(claimResponsePage('link not found', 'this link has already been used or does not exist.'));
    if (claim.status === 'confirmed') return res.send(claimResponsePage("already confirmed.", `you're already confirmed. see you there.`));
    if (claim.status === 'declined') return res.send(claimResponsePage('already declined', 'you already released this spot. your credit was returned.'));
    res.send(claimActionPage("confirm your spot.", "tap below to confirm you're coming.", `/api/fraise/claims/confirm/${t}`, 'confirm →'));
  } catch (err: any) {
    res.status(500).send(claimResponsePage('error', "something went wrong. reply to your email and we'll sort it."));
  }
});

// POST /api/fraise/claims/confirm/:token — commit confirmation
router.post('/claims/confirm/:token', async (req: any, res: any) => {
  const t = String(req.params.token ?? '').trim();
  if (!t) return res.status(400).send(claimResponsePage('invalid link', 'this confirmation link is not valid.'));
  try {
    const rows = await db.execute(sql`
      SELECT c.id, c.status, m.name
      FROM fraise_claims c
      JOIN fraise_members m ON m.id = c.member_id
      WHERE c.confirm_token = ${t} LIMIT 1
    `);
    const claim = ((rows as any).rows ?? rows)[0] as any;
    if (!claim) return res.send(claimResponsePage('link not found', 'this link has already been used or does not exist.'));
    if (claim.status === 'confirmed') return res.send(claimResponsePage("already confirmed.", `you're already confirmed. see you there.`));
    if (claim.status === 'declined') return res.send(claimResponsePage('already declined', 'you already released this spot. your credit was returned.'));
    await db.execute(sql`UPDATE fraise_claims SET status = 'confirmed', confirmed_at = now(), confirm_token = NULL WHERE id = ${claim.id}`);
    res.send(claimResponsePage("you're confirmed.", `see you there, ${claim.name.split(' ')[0]}. we'll be in touch with any details closer to the date.`));
  } catch (err: any) {
    res.status(500).send(claimResponsePage('error', "something went wrong. reply to your email and we'll sort it."));
  }
});

// GET /api/fraise/claims/decline/:token — show decline form (safe for email prefetch)
router.get('/claims/decline/:token', async (req: any, res: any) => {
  const t = String(req.params.token ?? '').trim();
  if (!t) return res.status(400).send(claimResponsePage('invalid link', 'this decline link is not valid.'));
  try {
    const rows = await db.execute(sql`
      SELECT c.status FROM fraise_claims c WHERE c.confirm_token = ${t} LIMIT 1
    `);
    const claim = ((rows as any).rows ?? rows)[0] as any;
    if (!claim) return res.send(claimResponsePage('link not found', 'this link has already been used or does not exist.'));
    if (claim.status === 'declined') return res.send(claimResponsePage('already released', 'your credit was already returned. use it on the next event.'));
    if (claim.status === 'confirmed') return res.send(claimResponsePage('already confirmed', 'you already confirmed this spot. reply to your email if you need to cancel.'));
    res.send(claimActionPage('release your spot?', "your credit will be returned to your balance. this can't be undone.", `/api/fraise/claims/decline/${t}`, 'yes, release my spot'));
  } catch (err: any) {
    res.status(500).send(claimResponsePage('error', "something went wrong. reply to your email and we'll sort it."));
  }
});

// POST /api/fraise/claims/decline/:token — commit decline, return credit
router.post('/claims/decline/:token', async (req: any, res: any) => {
  const t = String(req.params.token ?? '').trim();
  if (!t) return res.status(400).send(claimResponsePage('invalid link', 'this decline link is not valid.'));
  try {
    const rows = await db.execute(sql`
      SELECT c.id, c.status, c.event_id, c.member_id, m.name
      FROM fraise_claims c
      JOIN fraise_members m ON m.id = c.member_id
      WHERE c.confirm_token = ${t} LIMIT 1
    `);
    const claim = ((rows as any).rows ?? rows)[0] as any;
    if (!claim) return res.send(claimResponsePage('link not found', 'this link has already been used or does not exist.'));
    if (claim.status === 'declined') return res.send(claimResponsePage('already released', 'your credit was already returned. use it on the next event.'));
    if (claim.status === 'confirmed') return res.send(claimResponsePage('already confirmed', 'you already confirmed this spot. reply to your email if you need to cancel.'));
    await db.execute(sql`UPDATE fraise_claims SET status = 'declined', declined_at = now(), confirm_token = NULL WHERE id = ${claim.id}`);
    await db.execute(sql`UPDATE fraise_members SET credit_balance = credit_balance + 1 WHERE id = ${claim.member_id}`);
    await db.execute(sql`UPDATE fraise_events SET seats_claimed = GREATEST(seats_claimed - 1, 0) WHERE id = ${claim.event_id}`);
    res.send(claimResponsePage('spot released.', `no problem, ${claim.name.split(' ')[0]}. your credit has been returned — it'll be there for the next event.`));
  } catch (err: any) {
    res.status(500).send(claimResponsePage('error', "something went wrong. reply to your email and we'll sort it."));
  }
});

// ── Admin ─────────────────────────────────────────────────────────────────────

router.get('/admin/members', requireAdmin, async (req: any, res: any) => {
  const rows = await db.execute(sql`
    SELECT id, name, email, credit_balance, credits_purchased, created_at
    FROM fraise_members ORDER BY created_at DESC
  `);
  res.json({ members: (rows as any).rows ?? rows });
});

router.get('/admin/businesses', requireAdmin, async (req: any, res: any) => {
  const status = req.query.status as string | undefined;
  const rows = status
    ? await db.execute(sql`
        SELECT b.id, b.slug, b.name, b.email, b.category, b.address, b.description,
               b.status, b.stripe_connect_onboarded, b.active, b.created_at,
               m.name AS member_name, m.email AS member_email
        FROM fraise_businesses b
        LEFT JOIN fraise_members m ON m.id = b.member_id
        WHERE b.status = ${status}
        ORDER BY b.created_at DESC
      `)
    : await db.execute(sql`
        SELECT b.id, b.slug, b.name, b.email, b.category, b.address, b.description,
               b.status, b.stripe_connect_onboarded, b.active, b.created_at,
               m.name AS member_name, m.email AS member_email
        FROM fraise_businesses b
        LEFT JOIN fraise_members m ON m.id = b.member_id
        ORDER BY b.created_at DESC
      `);
  res.json({ businesses: (rows as any).rows ?? rows });
});

// PATCH /api/fraise/admin/businesses/:id/status — approve or reject an application
router.patch('/admin/businesses/:id/status', requireAdmin, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const status = String(req.body?.status ?? '').trim();
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }
  try {
    const rows = await db.execute(sql`
      UPDATE fraise_businesses SET status = ${status} WHERE id = ${id}
      RETURNING id, slug, name, status
    `);
    const biz = ((rows as any).rows ?? rows)[0];
    if (!biz) return res.status(404).json({ error: 'business not found' });
    res.json(biz);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

router.get('/admin/events', requireAdmin, async (req: any, res: any) => {
  const rows = await db.execute(sql`
    SELECT e.id, e.title, e.status, e.price_cents, e.min_seats, e.max_seats,
           e.seats_claimed, e.event_date, e.created_at, b.name AS business_name
    FROM fraise_events e
    JOIN fraise_businesses b ON b.id = e.business_id
    ORDER BY e.created_at DESC
  `);
  res.json({ events: (rows as any).rows ?? rows });
});

export default router;
