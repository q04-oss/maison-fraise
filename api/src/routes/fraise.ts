import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import appleSignin from 'apple-signin-auth';
import Anthropic from '@anthropic-ai/sdk';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { stripe } from '../lib/stripe';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
import {
  sendFraiseWelcome,
  sendFraiseCreditsAdded,
  sendFraiseClaimConfirmation,
  sendFraiseMemberPasswordCode,
  sendFraiseThresholdReached,
  sendFraisePayoutFailed,
} from '../lib/resend';

const router = Router();

const CREDIT_PRICE_CENTS = 12000; // CA$120 per credit

// ── Helpers ──────────────────────────────────────────────────────────────────

function token(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function sendExpoPush(
  pushTokens: string[],
  title: string,
  body: string,
  data: Record<string, any> = {},
): Promise<void> {
  const messages = pushTokens
    .filter(t => t && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[')))
    .map(to => ({ to, title, body, data, sound: 'default' }));
  if (!messages.length) return;
  fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(messages),
  }).catch(() => {});
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

async function requireBusiness(req: any, res: any, next: NextFunction) {
  const t = req.headers['x-business-token'] as string;
  if (!t) return res.status(401).json({ error: 'business token required' });
  const rows = await db.execute(sql`
    SELECT b.id, b.slug, b.name, b.stripe_connect_account_id, b.stripe_connect_onboarded
    FROM fraise_business_sessions s
    JOIN fraise_businesses b ON b.id = s.business_id
    WHERE s.token = ${t} AND s.expires_at > now()
    LIMIT 1
  `);
  const business = ((rows as any).rows ?? rows)[0] as any;
  if (!business) return res.status(401).json({ error: 'invalid or expired token' });
  req.business = business;
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

    // 1. Find existing member by apple_sub
    let rows = await db.execute(sql`SELECT id, name, email, credit_balance, credits_purchased, created_at FROM fraise_members WHERE apple_sub = ${sub} LIMIT 1`);
    let m = ((rows as any).rows ?? rows)[0] as any;

    if (!m && email) {
      // 2. Link apple_sub to existing member matched by email
      rows = await db.execute(sql`
        UPDATE fraise_members SET apple_sub = ${sub}
        WHERE email = ${email} AND apple_sub IS NULL
        RETURNING id, name, email, credit_balance, credits_purchased, created_at
      `);
      m = ((rows as any).rows ?? rows)[0] as any;
    }

    if (!m) {
      // 3. Create new member — no password
      const displayName = name || (email ? email.split('@')[0] : 'member');
      const insertRows = await db.execute(sql`
        INSERT INTO fraise_members (name, email, apple_sub)
        VALUES (${displayName}, ${email || null}, ${sub})
        RETURNING id, name, email, credit_balance, credits_purchased, created_at
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

// POST /api/fraise/members/forgot-password — send a 6-char reset code
router.post('/members/forgot-password', async (req: any, res: any) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const rows = await db.execute(sql`SELECT id FROM fraise_members WHERE email = ${email} LIMIT 1`);
    const member = ((rows as any).rows ?? rows)[0] as any;
    // Always respond OK to prevent email enumeration
    if (member) {
      const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars
      await db.execute(sql`
        INSERT INTO fraise_member_resets (member_id, code, expires_at)
        VALUES (${member.id}, ${code}, now() + interval '15 minutes')
      `);
      sendFraiseMemberPasswordCode({ to: email, code }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/members/reset-password — verify code, set new password
router.post('/members/reset-password', async (req: any, res: any) => {
  const email    = String(req.body?.email ?? '').trim().toLowerCase();
  const code     = String(req.body?.code ?? '').trim().toUpperCase();
  const password = String(req.body?.password ?? '');
  if (!email || !code || password.length < 8) {
    return res.status(400).json({ error: 'email, code, and password (8+ chars) required' });
  }
  try {
    const memberRows = await db.execute(sql`SELECT id FROM fraise_members WHERE email = ${email} LIMIT 1`);
    const member = ((memberRows as any).rows ?? memberRows)[0] as any;
    if (!member) return res.status(400).json({ error: 'invalid code' });

    const resetRows = await db.execute(sql`
      SELECT id FROM fraise_member_resets
      WHERE member_id = ${member.id} AND code = ${code}
        AND expires_at > now() AND used_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `);
    const reset = ((resetRows as any).rows ?? resetRows)[0] as any;
    if (!reset) return res.status(400).json({ error: 'invalid or expired code' });

    const hash = await bcrypt.hash(password, 10);
    await db.execute(sql`UPDATE fraise_members SET password_hash = ${hash} WHERE id = ${member.id}`);
    await db.execute(sql`UPDATE fraise_member_resets SET used_at = now() WHERE id = ${reset.id}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/members/me
router.get('/members/me', requireMember, async (req: any, res: any) => {
  const rows = await db.execute(sql`
    SELECT
      m.id, m.name, m.email, m.credit_balance, m.credits_purchased, m.created_at,
      COALESCE(inv.confirmed, 0)::int AS events_attended,
      CASE
        WHEN COALESCE(inv.total, 0) > 0
        THEN ROUND((COALESCE(inv.responded, 0)::numeric / inv.total::numeric) * 100)::int
        ELSE NULL
      END AS response_rate,
      (
        COALESCE(inv.confirmed, 0) * 150 +
        m.credit_balance * 75 +
        m.credits_purchased * 30 +
        GREATEST(EXTRACT(EPOCH FROM (now() - m.created_at))::int / 2592000, 0) * 5 +
        COALESCE(CASE
          WHEN inv.total > 0
          THEN (inv.responded::float / inv.total::float * 100)::int
          ELSE 0
        END, 0)
      )::int AS standing
    FROM fraise_members m
    LEFT JOIN (
      SELECT
        member_id,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status != 'pending') AS responded,
        COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed
      FROM fraise_invitations
      WHERE member_id = ${req.member.id}
      GROUP BY member_id
    ) inv ON inv.member_id = m.id
    WHERE m.id = ${req.member.id}
    LIMIT 1
  `);
  res.json(((rows as any).rows ?? rows)[0]);
});

// GET /api/fraise/members/directory — members-only leaderboard
router.get('/members/directory', requireMember, async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        m.id, m.name, m.created_at,
        COALESCE(inv.confirmed, 0)::int AS events_attended,
        (
          COALESCE(inv.confirmed, 0) * 150 +
          m.credit_balance * 75 +
          m.credits_purchased * 30 +
          GREATEST(EXTRACT(EPOCH FROM (now() - m.created_at))::int / 2592000, 0) * 5
        )::int AS standing
      FROM fraise_members m
      LEFT JOIN (
        SELECT
          member_id,
          COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed
        FROM fraise_invitations
        GROUP BY member_id
      ) inv ON inv.member_id = m.id
      ORDER BY standing DESC
      LIMIT 100
    `);
    res.json({ members: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
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

// GET /api/fraise/members/invitations
router.get('/members/invitations', requireMember, async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        i.id, i.status, i.created_at, i.responded_at,
        e.id AS event_id, e.title, e.description, e.price_cents,
        e.min_seats, e.max_seats, e.seats_claimed, e.status AS event_status, e.event_date,
        e.location_text, e.lat, e.lng,
        b.name AS business_name, b.slug AS business_slug
      FROM fraise_invitations i
      JOIN fraise_events e ON e.id = i.event_id
      JOIN fraise_businesses b ON b.id = e.business_id
      WHERE i.member_id = ${req.member.id}
      ORDER BY i.created_at DESC
    `);
    res.json({ invitations: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/members/invitations/:event_id/accept — spend credit, accept spot
router.post('/members/invitations/:event_id/accept', requireMember, async (req: any, res: any) => {
  const eventId = parseInt(req.params.event_id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });
  try {
    const invRows = await db.execute(sql`
      SELECT id, status FROM fraise_invitations
      WHERE event_id = ${eventId} AND member_id = ${req.member.id} LIMIT 1
    `);
    const inv = ((invRows as any).rows ?? invRows)[0] as any;
    if (!inv) return res.status(404).json({ error: 'no invitation found' });
    if (inv.status === 'accepted') return res.status(409).json({ error: 'already accepted' });
    if (inv.status === 'declined') return res.status(400).json({ error: 'invitation already declined' });

    const evRows = await db.execute(sql`
      SELECT id, status, max_seats, seats_claimed, min_seats, title, business_id
      FROM fraise_events WHERE id = ${eventId} LIMIT 1
    `);
    const event = ((evRows as any).rows ?? evRows)[0] as any;
    if (!event) return res.status(404).json({ error: 'event not found' });
    if (event.seats_claimed >= event.max_seats) return res.status(400).json({ error: 'event is full' });

    const memRows = await db.execute(sql`SELECT credit_balance FROM fraise_members WHERE id = ${req.member.id} LIMIT 1`);
    const member = ((memRows as any).rows ?? memRows)[0] as any;
    if (member.credit_balance < 1) return res.status(402).json({ error: 'insufficient credits' });

    await db.execute(sql`UPDATE fraise_members SET credit_balance = credit_balance - 1 WHERE id = ${req.member.id} AND credit_balance >= 1`);
    await db.execute(sql`UPDATE fraise_invitations SET status = 'accepted', responded_at = now() WHERE id = ${inv.id}`);
    const newSeats = await db.execute(sql`
      UPDATE fraise_events SET seats_claimed = seats_claimed + 1 WHERE id = ${eventId}
      RETURNING seats_claimed, min_seats, status
    `);
    const updated = ((newSeats as any).rows ?? newSeats)[0] as any;

    if (updated.status === 'open' && updated.seats_claimed >= updated.min_seats) {
      await db.execute(sql`UPDATE fraise_events SET status = 'threshold_met' WHERE id = ${eventId}`);
      // Notify business owner that minimum is met
      db.execute(sql`
        SELECT b.email, b.name FROM fraise_businesses b
        JOIN fraise_events e ON e.business_id = b.id
        WHERE e.id = ${eventId} LIMIT 1
      `).then((bizRows: any) => {
        const biz = ((bizRows as any).rows ?? bizRows)[0] as any;
        if (biz?.email) {
          sendFraiseThresholdReached({
            to: biz.email,
            businessName: biz.name,
            eventTitle: event.title,
            seatCount: updated.seats_claimed,
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    const balRows = await db.execute(sql`SELECT credit_balance FROM fraise_members WHERE id = ${req.member.id} LIMIT 1`);
    const balance = (((balRows as any).rows ?? balRows)[0] as any).credit_balance;

    const bizRows = await db.execute(sql`SELECT name FROM fraise_businesses WHERE id = ${event.business_id} LIMIT 1`);
    const bizName = (((bizRows as any).rows ?? bizRows)[0] as any)?.name ?? '';
    sendFraiseClaimConfirmation({ to: req.member.email, name: req.member.name, eventTitle: event.title, businessName: bizName, creditBalance: balance }).catch(() => {});

    res.json({ ok: true, credit_balance: balance, seats_claimed: updated.seats_claimed });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/members/invitations/:event_id/decline — decline, no credit charge
router.post('/members/invitations/:event_id/decline', requireMember, async (req: any, res: any) => {
  const eventId = parseInt(req.params.event_id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });
  try {
    const invRows = await db.execute(sql`
      SELECT id, status FROM fraise_invitations
      WHERE event_id = ${eventId} AND member_id = ${req.member.id} LIMIT 1
    `);
    const inv = ((invRows as any).rows ?? invRows)[0] as any;
    if (!inv) return res.status(404).json({ error: 'no invitation found' });
    if (inv.status === 'declined') return res.status(409).json({ error: 'already declined' });

    const creditReturned = inv.status === 'accepted';
    await db.execute(sql`UPDATE fraise_invitations SET status = 'declined', responded_at = now() WHERE id = ${inv.id}`);
    if (creditReturned) {
      await db.execute(sql`UPDATE fraise_members SET credit_balance = credit_balance + 1 WHERE id = ${req.member.id}`);
      await db.execute(sql`UPDATE fraise_events SET seats_claimed = GREATEST(seats_claimed - 1, 0) WHERE id = ${eventId}`);
      await db.execute(sql`
        UPDATE fraise_events SET status = 'open'
        WHERE id = ${eventId} AND status = 'threshold_met' AND seats_claimed < min_seats
      `);
    }

    const balRows = await db.execute(sql`SELECT credit_balance FROM fraise_members WHERE id = ${req.member.id} LIMIT 1`);
    const balance = (((balRows as any).rows ?? balRows)[0] as any).credit_balance;
    res.json({ ok: true, credit_returned: creditReturned, credit_balance: balance });
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

// ── Business auth ─────────────────────────────────────────────────────────────

// POST /api/fraise/businesses/signup
router.post('/businesses/signup', async (req: any, res: any) => {
  const name  = String(req.body?.name ?? '').trim().slice(0, 200);
  const slug  = String(req.body?.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  const desc  = String(req.body?.description ?? '').trim().slice(0, 1000);
  const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200);
  const pw    = String(req.body?.password ?? '');
  if (!name || !slug || !email || pw.length < 8) {
    return res.status(400).json({ error: 'name, slug, email, and password (8+ chars) required' });
  }
  try {
    const conflict = await db.execute(sql`SELECT id FROM fraise_businesses WHERE slug = ${slug} OR email = ${email} LIMIT 1`);
    if (((conflict as any).rows ?? conflict).length) {
      return res.status(409).json({ error: 'slug or email already taken' });
    }
    const hash = await bcrypt.hash(pw, 10);
    const rows = await db.execute(sql`
      INSERT INTO fraise_businesses (slug, name, description, email, password_hash)
      VALUES (${slug}, ${name}, ${desc || null}, ${email}, ${hash})
      RETURNING id, slug, name
    `);
    const b = ((rows as any).rows ?? rows)[0] as any;
    const t = token();
    await db.execute(sql`
      INSERT INTO fraise_business_sessions (business_id, token, expires_at)
      VALUES (${b.id}, ${t}, now() + interval '30 days')
    `);
    res.json({ token: t, id: b.id, slug: b.slug, name: b.name });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/businesses/login
router.post('/businesses/login', async (req: any, res: any) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const pw    = String(req.body?.password ?? '');
  if (!email || !pw) return res.status(400).json({ error: 'email and password required' });
  try {
    const rows = await db.execute(sql`SELECT id, slug, name, email, password_hash, stripe_connect_onboarded FROM fraise_businesses WHERE email = ${email} LIMIT 1`);
    const b = ((rows as any).rows ?? rows)[0] as any;
    if (!b || !(await bcrypt.compare(pw, b.password_hash))) {
      return res.status(401).json({ error: 'invalid email or password' });
    }
    const t = token();
    await db.execute(sql`
      INSERT INTO fraise_business_sessions (business_id, token, expires_at)
      VALUES (${b.id}, ${t}, now() + interval '30 days')
    `);
    res.json({ token: t, id: b.id, slug: b.slug, name: b.name, stripe_connect_onboarded: b.stripe_connect_onboarded });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/businesses/me
router.get('/businesses/me', requireBusiness, async (req: any, res: any) => {
  const rows = await db.execute(sql`
    SELECT id, slug, name, description, email, stripe_connect_onboarded, active, created_at
    FROM fraise_businesses WHERE id = ${req.business.id} LIMIT 1
  `);
  res.json(((rows as any).rows ?? rows)[0]);
});


// ── Events ────────────────────────────────────────────────────────────────────

// POST /api/fraise/businesses/:slug/interest — widget interest capture (public)
router.post('/businesses/:slug/interest', async (req: any, res: any) => {
  const slug  = String(req.params.slug ?? '').trim().toLowerCase();
  const name  = String(req.body?.name ?? '').trim().slice(0, 200);
  const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200);
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });

  // Basic email shape check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid email' });
  }

  try {
    const bizRows = await db.execute(sql`SELECT id FROM fraise_businesses WHERE slug = ${slug} AND active = true LIMIT 1`);
    const biz = ((bizRows as any).rows ?? bizRows)[0] as any;
    if (!biz) return res.status(404).json({ error: 'business not found' });

    // Link to existing member if email matches
    const memRows = await db.execute(sql`SELECT id, credit_balance FROM fraise_members WHERE email = ${email} LIMIT 1`);
    const member = ((memRows as any).rows ?? memRows)[0] as any;

    await db.execute(sql`
      INSERT INTO fraise_interest (business_id, name, email, fraise_member_id)
      VALUES (${biz.id}, ${name}, ${email}, ${member?.id ?? null})
      ON CONFLICT (business_id, email) DO UPDATE SET name = EXCLUDED.name, fraise_member_id = EXCLUDED.fraise_member_id
    `);

    res.json({ ok: true, has_credit: member ? member.credit_balance > 0 : false });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/businesses/interest — business sees their interest list
router.get('/businesses/interest', requireBusiness, async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT i.id, i.name, i.email, i.created_at,
             m.id AS member_id, m.credit_balance
      FROM fraise_interest i
      LEFT JOIN fraise_members m ON m.id = i.fraise_member_id
      WHERE i.business_id = ${req.business.id}
      ORDER BY i.created_at DESC
    `);
    res.json({ interest: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/businesses/members — ticket holders available to invite
router.get('/businesses/members', requireBusiness, async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, name, email, credit_balance
      FROM fraise_members
      WHERE credit_balance > 0
      ORDER BY name ASC
    `);
    res.json({ members: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/businesses/events — business lists their own events
router.get('/businesses/events', requireBusiness, async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, title, description, status, min_seats, max_seats, seats_claimed, event_date, created_at
      FROM fraise_events
      WHERE business_id = ${req.business.id}
      ORDER BY created_at DESC
    `);
    res.json({ events: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/events — business creates event
router.post('/events', requireBusiness, async (req: any, res: any) => {
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

// GET /api/fraise/businesses/card — generate printable A4 sheet of table cards
router.get('/businesses/card', requireBusiness, async (req: any, res: any) => {
  try {
    const bizName  = req.business.name as string;
    const joinUrl  = 'https://fraise.box/join';

    // Generate QR code as PNG buffer
    const qrBuffer = await QRCode.toBuffer(joinUrl, {
      width: 160,
      margin: 1,
      color: { dark: '#1C1C1E', light: '#FFFFFF' },
    });

    // A4 in points (72pt = 1 inch): 595 × 842
    // Business card: 85mm × 55mm = 241pt × 156pt
    // Layout: 2 columns × 4 rows = 8 cards, centred with 12pt gutters
    const A4_W = 595, A4_H = 842;
    const CARD_W = 241, CARD_H = 156;
    const COLS = 2, ROWS = 4;
    const GUTTER = 12;
    const TOTAL_W = COLS * CARD_W + (COLS - 1) * GUTTER;
    const TOTAL_H = ROWS * CARD_H + (ROWS - 1) * GUTTER;
    const MARGIN_X = (A4_W - TOTAL_W) / 2;
    const MARGIN_Y = (A4_H - TOTAL_H) / 2;

    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="box-fraise-card.pdf"`);
    doc.pipe(res);

    // Register built-in font (Courier is the closest monospace in pdfkit)
    // Draw each card
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = MARGIN_X + col * (CARD_W + GUTTER);
        const y = MARGIN_Y + row * (CARD_H + GUTTER);

        // Card background
        doc.rect(x, y, CARD_W, CARD_H).fillColor('#FFFFFF').fill();

        // Card border (hairline)
        doc.rect(x, y, CARD_W, CARD_H).strokeColor('#E5E1DA').lineWidth(0.5).stroke();

        // Cut guides — small corner marks outside the card
        const TK = 6; // tick length
        doc.strokeColor('#CCCCCC').lineWidth(0.3);
        // top-left
        doc.moveTo(x - TK, y).lineTo(x - 2, y).stroke();
        doc.moveTo(x, y - TK).lineTo(x, y - 2).stroke();
        // top-right
        doc.moveTo(x + CARD_W + 2, y).lineTo(x + CARD_W + TK, y).stroke();
        doc.moveTo(x + CARD_W, y - TK).lineTo(x + CARD_W, y - 2).stroke();
        // bottom-left
        doc.moveTo(x - TK, y + CARD_H).lineTo(x - 2, y + CARD_H).stroke();
        doc.moveTo(x, y + CARD_H + 2).lineTo(x, y + CARD_H + TK).stroke();
        // bottom-right
        doc.moveTo(x + CARD_W + 2, y + CARD_H).lineTo(x + CARD_W + TK, y + CARD_H).stroke();
        doc.moveTo(x + CARD_W, y + CARD_H + 2).lineTo(x + CARD_W, y + CARD_H + TK).stroke();

        const PAD = 16;

        // "box fraise" eyebrow
        doc.font('Courier').fontSize(6).fillColor('#8E8E93')
          .text('BOX FRAISE', x + PAD, y + PAD, { characterSpacing: 1.5 });

        // Business name
        doc.font('Courier-Bold').fontSize(11).fillColor('#1C1C1E')
          .text(bizName, x + PAD, y + PAD + 14, { width: CARD_W - PAD * 2 - 56 });

        // Tagline
        doc.font('Courier').fontSize(7).fillColor('#8E8E93')
          .text('by invitation only.', x + PAD, y + CARD_H - PAD - 18, { width: CARD_W - PAD * 2 - 56 });

        // QR code — right side, vertically centred
        const QR_SIZE = 56;
        const qrX = x + CARD_W - PAD - QR_SIZE;
        const qrY = y + (CARD_H - QR_SIZE) / 2;
        doc.image(qrBuffer, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });
      }
    }

    doc.end();
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/businesses/assist — AI copywriting for event title + description
router.post('/businesses/assist', requireBusiness, async (req: any, res: any) => {
  const title = String(req.body?.title ?? '').trim().slice(0, 200);
  const draft = String(req.body?.description ?? '').trim().slice(0, 500);
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You write event copy for box fraise — an invitation-only platform where businesses run exclusive experiences for vetted members. The tone is understated, specific, and confident. No marketing language, no exclamation marks, no adjectives like "amazing" or "unique". Short sentences. Write in lowercase.

Business: ${req.business.name}
Event title: ${title}${draft ? `\nDraft description: ${draft}` : ''}

Return a JSON object with two fields:
- "title": a polished version of the event title (max 60 chars, lowercase)
- "description": 1-2 sentences describing the experience (max 120 chars, lowercase, no period at end optional)

Return only the JSON object, nothing else.`,
      }],
    });
    const text = (msg.content[0] as any).text.trim();
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text);
    res.json({ title: json.title ?? title, description: json.description ?? draft });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// PATCH /api/fraise/events/:id — edit title and/or description
router.patch('/events/:id', requireBusiness, async (req: any, res: any) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });
  const title = req.body?.title != null ? String(req.body.title).trim().slice(0, 200) : null;
  const desc  = req.body?.description != null ? String(req.body.description).trim().slice(0, 2000) : null;
  if (title !== null && !title) return res.status(400).json({ error: 'title cannot be empty' });
  try {
    const evRows = await db.execute(sql`SELECT id FROM fraise_events WHERE id = ${eventId} AND business_id = ${req.business.id} LIMIT 1`);
    if (!((evRows as any).rows ?? evRows).length) return res.status(404).json({ error: 'event not found' });
    if (title !== null) await db.execute(sql`UPDATE fraise_events SET title = ${title} WHERE id = ${eventId}`);
    if (desc  !== null) await db.execute(sql`UPDATE fraise_events SET description = ${desc || null} WHERE id = ${eventId}`);
    const updated = await db.execute(sql`SELECT id, title, description FROM fraise_events WHERE id = ${eventId} LIMIT 1`);
    res.json(((updated as any).rows ?? updated)[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/events/:id/invite — business sends invitations to selected members
router.post('/events/:id/invite', requireBusiness, async (req: any, res: any) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });
  const memberIds: number[] = Array.isArray(req.body?.member_ids) ? req.body.member_ids.map(Number).filter(Boolean) : [];
  if (!memberIds.length) return res.status(400).json({ error: 'member_ids required' });

  try {
    const evRows = await db.execute(sql`SELECT id, max_seats FROM fraise_events WHERE id = ${eventId} AND business_id = ${req.business.id} LIMIT 1`);
    if (!((evRows as any).rows ?? evRows).length) return res.status(404).json({ error: 'event not found' });

    const evDetailRows = await db.execute(sql`SELECT title FROM fraise_events WHERE id = ${eventId} LIMIT 1`);
    const evTitle = (((evDetailRows as any).rows ?? evDetailRows)[0] as any)?.title ?? 'an invitation';

    let sent = 0;
    const notifyTokens: string[] = [];
    for (const memberId of memberIds) {
      try {
        const result = await db.execute(sql`
          INSERT INTO fraise_invitations (event_id, member_id) VALUES (${eventId}, ${memberId})
          ON CONFLICT (event_id, member_id) DO NOTHING
          RETURNING id
        `);
        if (((result as any).rows ?? result).length) {
          sent++;
          const memRow = await db.execute(sql`SELECT push_token FROM fraise_members WHERE id = ${memberId} AND push_token IS NOT NULL LIMIT 1`);
          const pt = (((memRow as any).rows ?? memRow)[0] as any)?.push_token;
          if (pt) notifyTokens.push(pt);
        }
      } catch {}
    }

    sendExpoPush(notifyTokens, `${req.business.name}`, `you've been invited: ${evTitle}`, { screen: 'home' });
    res.json({ ok: true, sent });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/events/:id/invitations — business sees invitation responses
router.get('/events/:id/invitations', requireBusiness, async (req: any, res: any) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });
  try {
    const evRows = await db.execute(sql`SELECT id FROM fraise_events WHERE id = ${eventId} AND business_id = ${req.business.id} LIMIT 1`);
    if (!((evRows as any).rows ?? evRows).length) return res.status(404).json({ error: 'event not found' });

    const rows = await db.execute(sql`
      SELECT i.id, i.status, i.created_at, i.responded_at, m.name, m.email
      FROM fraise_invitations i
      JOIN fraise_members m ON m.id = i.member_id
      WHERE i.event_id = ${eventId}
      ORDER BY i.status, i.created_at ASC
    `);
    res.json({ invitations: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/events/:id/confirm — admin or business sets the date, notifies accepted members
router.post('/events/:id/confirm', async (req: any, res: any) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });

  // Accept admin PIN or business token
  const pin = req.headers['x-admin-pin'];
  const bizToken = req.headers['x-business-token'] as string;
  let businessId: number | null = null;

  if (pin && pin === process.env.ADMIN_PIN) {
    businessId = null; // admin can confirm any event
  } else if (bizToken) {
    const r = await db.execute(sql`SELECT business_id FROM fraise_business_sessions WHERE token = ${bizToken} AND expires_at > now() LIMIT 1`);
    const row = ((r as any).rows ?? r)[0] as any;
    if (!row) return res.status(401).json({ error: 'unauthorized' });
    businessId = row.business_id;
  } else {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const eventDate    = String(req.body?.event_date ?? '').trim().slice(0, 100);
  const locationText = String(req.body?.location_text ?? '').trim().slice(0, 500) || null;
  const lat          = req.body?.lat  != null ? parseFloat(req.body.lat)  : null;
  const lng          = req.body?.lng  != null ? parseFloat(req.body.lng)  : null;
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
      UPDATE fraise_events
      SET status = 'confirmed', event_date = ${eventDate},
          location_text = ${locationText}, lat = ${lat}, lng = ${lng}
      WHERE id = ${eventId}
    `);

    // Auto-confirm all accepted invitations
    const invRows = await db.execute(sql`
      UPDATE fraise_invitations SET status = 'confirmed'
      WHERE event_id = ${eventId} AND status = 'accepted'
      RETURNING id, member_id
    `);
    const invitations = (invRows as any).rows ?? invRows;

    // Notify confirmed members
    if (invitations.length) {
      const memberIds = invitations.map((i: any) => i.member_id);
      const tokenRows = await db.execute(sql`
        SELECT push_token FROM fraise_members
        WHERE id = ANY(${memberIds}::int[]) AND push_token IS NOT NULL
      `);
      const pushTokens = ((tokenRows as any).rows ?? tokenRows).map((r: any) => r.push_token);
      sendExpoPush(pushTokens, `${event.title}`, `date confirmed: ${eventDate}`, { screen: 'my-claims' });
    }

    // ── Stripe Connect payout ─────────────────────────────────────────────────
    const BUSINESS_RATE = 9600; // CA$96 per akène
    let transferCount = 0;
    if (invitations.length > 0) {
      const bizRows = await db.execute(sql`
        SELECT stripe_connect_account_id, stripe_connect_onboarded FROM fraise_businesses WHERE id = ${event.business_id ?? businessId} LIMIT 1
      `);
      const bizRow = (((bizRows as any).rows ?? bizRows)[0] as any);
      if (bizRow?.stripe_connect_account_id && bizRow?.stripe_connect_onboarded) {
        const totalCents = invitations.length * BUSINESS_RATE;
        try {
          await stripe.transfers.create({
            amount: totalCents,
            currency: 'cad',
            destination: bizRow.stripe_connect_account_id,
            metadata: {
              event_id: String(eventId),
              confirmed_count: String(invitations.length),
            },
          });
          transferCount = invitations.length;
        } catch (transferErr: any) {
          // Log but don't fail the confirmation — payout can be retried manually
          console.error('[fraise] transfer failed:', transferErr.message);
          // Notify business owner of payout failure
          db.execute(sql`SELECT email, name FROM fraise_businesses WHERE id = ${event.business_id ?? businessId} LIMIT 1`).then((r: any) => {
            const biz = ((r as any).rows ?? r)[0] as any;
            if (biz?.email) {
              sendFraisePayoutFailed({
                to: biz.email,
                businessName: biz.name,
                eventTitle: event.title,
                confirmedCount: invitations.length,
                amountCents: totalCents,
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      }
    }

    res.json({ ok: true, confirmed: invitations.length, transferred: transferCount, event_date: eventDate, location_text: locationText, lat, lng });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/businesses/connect — create/retrieve Stripe Express account + onboarding link
router.post('/businesses/connect', requireBusiness, async (req: any, res: any) => {
  try {
    let accountId = req.business.stripe_connect_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: req.business.email,
        capabilities: { transfers: { requested: true } },
        business_profile: { name: req.business.name },
        metadata: { fraise_business_id: String(req.business.id) },
      });
      accountId = account.id;
      await db.execute(sql`
        UPDATE fraise_businesses SET stripe_connect_account_id = ${accountId} WHERE id = ${req.business.id}
      `);
    }

    const origin = req.headers.origin || 'https://fraise.box';
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/business`,
      return_url:  `${origin}/business?connect=done`,
      type: 'account_onboarding',
    });

    res.json({ url: link.url, account_id: accountId });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/businesses/connect/status — check onboarding completion
router.get('/businesses/connect/status', requireBusiness, async (req: any, res: any) => {
  try {
    const accountId = req.business.stripe_connect_account_id;
    if (!accountId) return res.json({ connected: false, onboarded: false });

    const account = await stripe.accounts.retrieve(accountId);
    const onboarded = account.details_submitted && !account.requirements?.currently_due?.length;

    if (onboarded && !req.business.stripe_connect_onboarded) {
      await db.execute(sql`
        UPDATE fraise_businesses SET stripe_connect_onboarded = true WHERE id = ${req.business.id}
      `);
    }

    res.json({
      connected: true,
      onboarded: !!onboarded,
      payouts_enabled: account.payouts_enabled,
      account_id: accountId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/fraise/businesses/earnings — total and per-event earnings at 80% rate
router.get('/businesses/earnings', requireBusiness, async (req: any, res: any) => {
  const BUSINESS_RATE = 9600; // CA$96 per akène (80% of CA$120)
  try {
    const rows = await db.execute(sql`
      SELECT e.id AS event_id, e.title,
             COUNT(i.id) FILTER (WHERE i.status IN ('accepted','confirmed'))::int AS accepted_count
      FROM fraise_events e
      LEFT JOIN fraise_invitations i ON i.event_id = e.id
      WHERE e.business_id = ${req.business.id}
      GROUP BY e.id, e.title
      ORDER BY e.created_at DESC
    `);
    const events = ((rows as any).rows ?? rows) as any[];
    const totalAkenes = events.reduce((s, e) => s + (parseInt(e.accepted_count) || 0), 0);
    res.json({
      total_akenes: totalAkenes,
      total_earned_cents: totalAkenes * BUSINESS_RATE,
      events: events.map(e => ({
        event_id: e.event_id,
        title: e.title,
        accepted_count: parseInt(e.accepted_count) || 0,
        earned_cents: (parseInt(e.accepted_count) || 0) * BUSINESS_RATE,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/events/:id/cancel — cancel event, return akènes, notify members
router.post('/events/:id/cancel', requireBusiness, async (req: any, res: any) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });
  try {
    const evRows = await db.execute(sql`
      SELECT id, title, status FROM fraise_events WHERE id = ${eventId} AND business_id = ${req.business.id} LIMIT 1
    `);
    const event = (((evRows as any).rows ?? evRows)[0] as any);
    if (!event) return res.status(404).json({ error: 'event not found' });
    if (event.status === 'cancelled') return res.status(400).json({ error: 'already cancelled' });

    // Return akènes to all members who accepted
    const accepted = await db.execute(sql`
      SELECT member_id FROM fraise_invitations
      WHERE event_id = ${eventId} AND status IN ('accepted','confirmed')
    `);
    const acceptedRows = (accepted as any).rows ?? accepted;

    if (acceptedRows.length) {
      const memberIds = acceptedRows.map((r: any) => r.member_id);
      await db.execute(sql`
        UPDATE fraise_members SET credit_balance = credit_balance + 1
        WHERE id = ANY(${memberIds}::int[])
      `);
      // Notify affected members
      const tokenRows = await db.execute(sql`
        SELECT push_token FROM fraise_members
        WHERE id = ANY(${memberIds}::int[]) AND push_token IS NOT NULL
      `);
      const pushTokens = ((tokenRows as any).rows ?? tokenRows).map((r: any) => r.push_token);
      sendExpoPush(pushTokens, `${event.title}`, `this event was cancelled. your akène has been returned.`, { screen: 'home' });
    }

    // Mark event and all invitations cancelled
    await db.execute(sql`UPDATE fraise_events SET status = 'cancelled' WHERE id = ${eventId}`);
    await db.execute(sql`UPDATE fraise_invitations SET status = 'declined' WHERE event_id = ${eventId} AND status IN ('accepted','confirmed','pending')`);

    res.json({ ok: true, returned: acceptedRows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/fraise/events/:id/invite/remind — re-push pending invitees
router.post('/events/:id/invite/remind', requireBusiness, async (req: any, res: any) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: 'invalid id' });
  try {
    const evRows = await db.execute(sql`SELECT id, title FROM fraise_events WHERE id = ${eventId} AND business_id = ${req.business.id} LIMIT 1`);
    const event = ((evRows as any).rows ?? evRows)[0] as any;
    if (!event) return res.status(404).json({ error: 'event not found' });

    const pendingRows = await db.execute(sql`
      SELECT m.push_token FROM fraise_invitations i
      JOIN fraise_members m ON m.id = i.member_id
      WHERE i.event_id = ${eventId} AND i.status = 'pending' AND m.push_token IS NOT NULL
    `);
    const pushTokens = ((pendingRows as any).rows ?? pendingRows).map((r: any) => r.push_token);
    sendExpoPush(pushTokens, `${req.business.name}`, `reminder: you have a pending invitation — ${event.title}`, { screen: 'home' });
    res.json({ ok: true, reminded: pushTokens.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// ── Admin ─────────────────────────────────────────────────────────────────────

// POST /api/fraise/admin/members/merge
// Merges drop_id into keep_id: transfers apple_sub, credits, invitations, interest.
// Protected by ADMIN_PIN header.
router.post('/admin/members/merge', async (req: any, res: any) => {
  if (req.headers['x-admin-pin'] !== process.env.ADMIN_PIN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const keepId = parseInt(req.body?.keep_id);
  const dropId = parseInt(req.body?.drop_id);
  if (isNaN(keepId) || isNaN(dropId) || keepId === dropId) {
    return res.status(400).json({ error: 'keep_id and drop_id required and must differ' });
  }
  try {
    const keepRows = await db.execute(sql`SELECT id, apple_sub, credit_balance, credits_purchased FROM fraise_members WHERE id = ${keepId} LIMIT 1`);
    const keep = ((keepRows as any).rows ?? keepRows)[0] as any;
    if (!keep) return res.status(404).json({ error: 'keep member not found' });

    const dropRows = await db.execute(sql`SELECT id, apple_sub, credit_balance, credits_purchased FROM fraise_members WHERE id = ${dropId} LIMIT 1`);
    const drop = ((dropRows as any).rows ?? dropRows)[0] as any;
    if (!drop) return res.status(404).json({ error: 'drop member not found' });

    // Transfer apple_sub if keep doesn't have one
    if (!keep.apple_sub && drop.apple_sub) {
      await db.execute(sql`UPDATE fraise_members SET apple_sub = ${drop.apple_sub} WHERE id = ${keepId}`);
    }

    // Merge credits
    if (drop.credit_balance > 0 || drop.credits_purchased > 0) {
      await db.execute(sql`
        UPDATE fraise_members
        SET credit_balance    = credit_balance    + ${drop.credit_balance},
            credits_purchased = credits_purchased + ${drop.credits_purchased}
        WHERE id = ${keepId}
      `);
    }

    // Reassign invitations (skip conflicts — keep's record wins)
    await db.execute(sql`
      UPDATE fraise_invitations SET member_id = ${keepId}
      WHERE member_id = ${dropId}
        AND NOT EXISTS (
          SELECT 1 FROM fraise_invitations fi2
          WHERE fi2.event_id = fraise_invitations.event_id AND fi2.member_id = ${keepId}
        )
    `);
    await db.execute(sql`DELETE FROM fraise_invitations WHERE member_id = ${dropId}`);

    // Reassign widget interest
    await db.execute(sql`
      UPDATE fraise_interest SET fraise_member_id = ${keepId}
      WHERE fraise_member_id = ${dropId}
    `);

    // Delete drop's sessions then the member row
    await db.execute(sql`DELETE FROM fraise_member_sessions WHERE member_id = ${dropId}`);
    await db.execute(sql`DELETE FROM fraise_credit_purchases WHERE member_id = ${dropId}`);
    await db.execute(sql`DELETE FROM fraise_members WHERE id = ${dropId}`);

    res.json({ ok: true, kept: keepId, dropped: dropId });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

export default router;
