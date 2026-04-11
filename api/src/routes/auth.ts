import { Router, Request, Response } from 'express';
import appleSignin from 'apple-signin-auth';
import { eq, sql } from 'drizzle-orm';
import { randomInt } from 'crypto';
import { db } from '../db';
import { users } from '../db/schema';
import { logger } from '../lib/logger';
import { signToken, requireUser } from '../lib/auth';

// ─── Boot-time migration: social time-bank columns ───────────────────────────
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS social_time_bank_seconds integer NOT NULL DEFAULT 0`).catch(() => {});
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS social_time_bank_updated_at timestamptz`).catch(() => {});
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS social_lifetime_credits_seconds integer NOT NULL DEFAULT 0`).catch(() => {});
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak_weeks integer NOT NULL DEFAULT 0`).catch(() => {});
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak_weeks integer NOT NULL DEFAULT 0`).catch(() => {});
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_tap_week text`).catch(() => {});

function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[randomInt(chars.length)];
  return code;
}

async function uniqueUserCode(): Promise<string> {
  let code = generateUserCode();
  let attempts = 0;
  while (attempts < 10) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.user_code, code));
    if (!existing) return code;
    code = generateUserCode();
    attempts++;
  }
  return code;
}

// Self-healing: ensure columns added in later migrations exist
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_dorotka boolean NOT NULL DEFAULT false`).catch(() => {});
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_account_id text`).catch(() => {});
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_onboarded boolean NOT NULL DEFAULT false`).catch(() => {});
db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs jsonb`).catch(() => {});

// Fine art tables
db.execute(sql`CREATE TABLE IF NOT EXISTS art_pitches (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  title text NOT NULL,
  abstract text NOT NULL,
  reference_image_url text,
  status text NOT NULL DEFAULT 'submitted',
  grant_amount_cents integer,
  stripe_transfer_id text,
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS artworks (
  id serial PRIMARY KEY,
  pitch_id integer NOT NULL REFERENCES art_pitches(id),
  user_id integer NOT NULL REFERENCES users(id),
  title text NOT NULL,
  media_url text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'posted',
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS art_acquisitions (
  id serial PRIMARY KEY,
  artwork_id integer NOT NULL UNIQUE REFERENCES artworks(id),
  acquisition_price_cents integer NOT NULL,
  management_fee_annual_cents integer NOT NULL,
  nfc_token_serial text,
  acquired_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS art_auctions (
  id serial PRIMARY KEY,
  artwork_id integer NOT NULL REFERENCES artworks(id),
  reserve_price_cents integer NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  winning_bid_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS art_bids (
  id serial PRIMARY KEY,
  auction_id integer NOT NULL REFERENCES art_auctions(id),
  user_id integer NOT NULL REFERENCES users(id),
  amount_cents integer NOT NULL,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS art_management_fees (
  id serial PRIMARY KEY,
  acquisition_id integer NOT NULL REFERENCES art_acquisitions(id),
  collector_user_id integer NOT NULL REFERENCES users(id),
  amount_cents integer NOT NULL,
  due_at timestamptz NOT NULL,
  paid_at timestamptz,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

const router = Router();

async function handleAppleSignIn(req: Request, res: Response) {
  const { identityToken, firstName, lastName, email: bodyEmail } = req.body;
  if (!identityToken) {
    res.status(400).json({ error: 'identityToken is required' });
    return;
  }

  try {
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: 'com.boxfraise.app',
      ignoreExpiration: false,
    });
    const appleId = payload.sub;
    const appleEmail = payload.email || bodyEmail;
    const displayName = firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(' ')
      : undefined;

    // 1. Look up by apple_user_id
    const [byApple] = await db.select().from(users).where(eq(users.apple_user_id, appleId));
    if (byApple) {
      const token = signToken(byApple.id);
      res.json({ user_id: byApple.id, token, is_new: false, email: byApple.email, verified: byApple.verified, fraise_chat_email: byApple.fraise_chat_email, display_name: byApple.display_name });
      return;
    }

    // 2. If email available, try to link to an existing account
    if (appleEmail) {
      const [byEmail] = await db.select().from(users).where(eq(users.email, appleEmail));
      if (byEmail) {
        await db.update(users).set({ apple_user_id: appleId }).where(eq(users.id, byEmail.id));
        const token = signToken(byEmail.id);
        res.json({ user_id: byEmail.id, token, is_new: false, email: byEmail.email, verified: byEmail.verified, fraise_chat_email: byEmail.fraise_chat_email, display_name: byEmail.display_name });
        return;
      }

      // 3. Brand new user — atomic upsert guards against concurrent sign-in race
      const userCode = await uniqueUserCode();
      const [created] = await db
        .insert(users)
        .values({
          email: appleEmail,
          apple_user_id: appleId,
          user_code: userCode,
          ...(displayName ? { display_name: displayName } : {}),
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { apple_user_id: appleId },
        })
        .returning();
      const token = signToken(created.id);
      res.json({ user_id: created.id, token, is_new: true, email: created.email, verified: created.verified, fraise_chat_email: created.fraise_chat_email, display_name: created.display_name });
      return;
    }

    res.status(404).json({ error: 'Account not found and no email provided.' });
  } catch (err: unknown) {
    const e = err as any;
    logger.error(`Apple auth error: name=${e?.name} message=${e?.message} stack=${e?.stack} raw=${JSON.stringify(err, Object.getOwnPropertyNames(e ?? {}))}`);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// POST /api/auth/apple and /api/auth/apple/verify (alias) — both accepted by iOS
router.post('/apple', handleAppleSignIn);
router.post('/apple/verify', handleAppleSignIn);

// POST /api/auth/operator — shop account login with 6-char operator code
router.post('/operator', async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'code is required' });
    return;
  }
  try {
    const [shopUser] = await db
      .select()
      .from(users)
      .where(eq(users.user_code, code.trim().toUpperCase()))
      .limit(1);

    if (!shopUser || !shopUser.is_shop) {
      res.status(401).json({ error: 'invalid_code' });
      return;
    }

    const token = signToken(shopUser.id);
    res.json({
      user_id: shopUser.id,
      token,
      is_shop: true,
      business_id: shopUser.business_id,
      display_name: shopUser.display_name,
      fraise_chat_email: shopUser.fraise_chat_email,
    });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/auth/demo — demo login for Apple reviewers
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'reviewer@boxfraise.com';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
router.post('/demo', async (req: Request, res: Response) => {
  if (!DEMO_PASSWORD) { res.status(503).json({ error: 'Demo login not configured' }); return; }
  const { email, password } = req.body;
  if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    res.status(401).json({ error: 'invalid_credentials' }); return;
  }
  try {
    const existing = await db.execute<{ id: number }>(sql`SELECT id FROM users WHERE email = ${DEMO_EMAIL} LIMIT 1`);
    const rows = (existing as any).rows ?? existing;
    let userId: number;
    if (rows.length > 0) {
      userId = rows[0].id;
    } else {
      const code = await uniqueUserCode();
      const inserted = await db.execute<{ id: number }>(sql`
        INSERT INTO users (email, display_name, verified, user_code, apple_user_id)
        VALUES (${DEMO_EMAIL}, 'Demo', true, ${code}, 'demo_reviewer')
        RETURNING id
      `);
      const insertedRows = (inserted as any).rows ?? inserted;
      userId = insertedRows[0].id;
    }
    // Seed nfc_verified legitimacy event so the reorder NFC flow works
    await db.execute(sql`
      INSERT INTO legitimacy_events (user_id, event_type, weight, created_at)
      SELECT ${userId}, 'nfc_verified', 1, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM legitimacy_events WHERE user_id = ${userId} AND event_type = 'nfc_verified'
      )
    `).catch(() => {});
    res.json({ user_id: userId, token: signToken(userId), is_new: false });
  } catch (e) {
    logger.error('Demo login error: ' + String(e));
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/auth/push-token — update push token for the authenticated user
router.patch('/push-token', requireUser, async (req: Request, res: Response) => {
  const { push_token } = req.body;
  const userId = (req as any).userId as number;
  if (!push_token) {
    res.status(400).json({ error: 'push_token is required' });
    return;
  }
  try {
    await db.update(users).set({ push_token }).where(eq(users.id, userId));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/auth/display-name — update display name for the authenticated user
router.patch('/display-name', requireUser, async (req: Request, res: Response) => {
  const { display_name } = req.body;
  const userId = (req as any).userId as number;
  if (!display_name || !display_name.trim()) {
    res.status(400).json({ error: 'display_name is required' }); return;
  }
  if (display_name.trim().length > 60) {
    res.status(400).json({ error: 'display_name too long' }); return;
  }
  try {
    await db.update(users).set({ display_name: display_name.trim() }).where(eq(users.id, userId));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
