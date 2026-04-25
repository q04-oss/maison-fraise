/**
 * ensureSchema — centralised self-healing DDL.
 *
 * All CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS
 * statements live here so they run exactly once at startup, in dependency
 * order, rather than scattered as module-load side-effects across route files.
 *
 * Call `await ensureSchema()` in index.ts before app.listen().
 */
import { sql } from 'drizzle-orm';
import { db } from './index';
import { logger } from '../lib/logger';

async function run(label: string, statement: ReturnType<typeof sql>): Promise<void> {
  try {
    await db.execute(statement);
  } catch (err) {
    logger.error(`ensureSchema [${label}] failed: ${String(err)}`);
  }
}

export async function ensureSchema(): Promise<void> {
  // ── User columns added post-launch ──────────────────────────────────────────
  await run('users.social_time_bank_seconds', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS social_time_bank_seconds integer NOT NULL DEFAULT 0`);
  await run('users.social_time_bank_updated_at', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS social_time_bank_updated_at timestamptz`);
  await run('users.social_lifetime_credits_seconds', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS social_lifetime_credits_seconds integer NOT NULL DEFAULT 0`);
  await run('users.current_streak_weeks', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak_weeks integer NOT NULL DEFAULT 0`);
  await run('users.longest_streak_weeks', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak_weeks integer NOT NULL DEFAULT 0`);
  await run('users.last_tap_week', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_tap_week text`);
  await run('users.is_dorotka', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_dorotka boolean NOT NULL DEFAULT false`);
  await run('users.stripe_connect_account_id', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_account_id text`);
  await run('users.stripe_connect_onboarded', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_onboarded boolean NOT NULL DEFAULT false`);
  await run('users.notification_prefs', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs jsonb`);
  await run('users.eth_address', sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS eth_address text UNIQUE`);

  // ── locations columns ────────────────────────────────────────────────────────
  await run('locations.allows_walkin', sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS allows_walkin boolean NOT NULL DEFAULT false`);

  // ── businesses columns ───────────────────────────────────────────────────────
  await run('businesses.has_toilet', sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS has_toilet boolean NOT NULL DEFAULT false`);
  await run('businesses.toilet_fee_cents', sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS toilet_fee_cents integer NOT NULL DEFAULT 150`);

  // ── Fine art tables (created in dependency order) ────────────────────────────
  await run('art_pitches', sql`CREATE TABLE IF NOT EXISTS art_pitches (
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
  )`);

  await run('artworks', sql`CREATE TABLE IF NOT EXISTS artworks (
    id serial PRIMARY KEY,
    pitch_id integer NOT NULL REFERENCES art_pitches(id),
    user_id integer NOT NULL REFERENCES users(id),
    title text NOT NULL,
    media_url text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'posted',
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

  await run('art_acquisitions', sql`CREATE TABLE IF NOT EXISTS art_acquisitions (
    id serial PRIMARY KEY,
    artwork_id integer NOT NULL UNIQUE REFERENCES artworks(id),
    acquisition_price_cents integer NOT NULL,
    management_fee_annual_cents integer NOT NULL,
    nfc_token_serial text,
    acquired_at timestamptz NOT NULL DEFAULT now()
  )`);

  await run('art_auctions', sql`CREATE TABLE IF NOT EXISTS art_auctions (
    id serial PRIMARY KEY,
    artwork_id integer NOT NULL REFERENCES artworks(id),
    reserve_price_cents integer NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'active',
    winning_bid_id integer,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

  await run('art_bids', sql`CREATE TABLE IF NOT EXISTS art_bids (
    id serial PRIMARY KEY,
    auction_id integer NOT NULL REFERENCES art_auctions(id),
    user_id integer NOT NULL REFERENCES users(id),
    amount_cents integer NOT NULL,
    stripe_payment_intent_id text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

  await run('art_management_fees', sql`CREATE TABLE IF NOT EXISTS art_management_fees (
    id serial PRIMARY KEY,
    acquisition_id integer NOT NULL REFERENCES art_acquisitions(id),
    collector_user_id integer NOT NULL REFERENCES users(id),
    amount_cents integer NOT NULL,
    due_at timestamptz NOT NULL,
    paid_at timestamptz,
    stripe_payment_intent_id text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

  // ── Toilet tables ────────────────────────────────────────────────────────────
  await run('personal_toilets', sql`CREATE TABLE IF NOT EXISTS personal_toilets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    instagram_handle TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await run('toilet_visits', sql`CREATE TABLE IF NOT EXISTS toilet_visits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    business_id INTEGER REFERENCES businesses(id),
    personal_toilet_id INTEGER REFERENCES personal_toilets(id),
    fee_cents INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    stripe_payment_intent_id TEXT,
    paid BOOLEAN NOT NULL DEFAULT false,
    access_code TEXT,
    access_code_expires_at TIMESTAMP,
    rating INTEGER,
    review_note TEXT,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await run('toilet_visits.business_id drop not null', sql`ALTER TABLE toilet_visits ALTER COLUMN business_id DROP NOT NULL`);
  await run('toilet_visits.personal_toilet_id', sql`ALTER TABLE toilet_visits ADD COLUMN IF NOT EXISTS personal_toilet_id INTEGER REFERENCES personal_toilets(id)`);
  await run('toilet_visits.access_code_expires_at', sql`ALTER TABLE toilet_visits ADD COLUMN IF NOT EXISTS access_code_expires_at TIMESTAMP`);

  // ── Tasting journal (must precede tasting_feed_reactions) ────────────────────
  await run('tasting_journal', sql`CREATE TABLE IF NOT EXISTS tasting_journal (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id),
    variety_id integer NOT NULL REFERENCES varieties(id),
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, variety_id)
  )`);

  await run('tasting_journal.public', sql`ALTER TABLE tasting_journal ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT false`);

  // ── Social tables ────────────────────────────────────────────────────────────
  await run('variety_reviews', sql`CREATE TABLE IF NOT EXISTS variety_reviews (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id),
    variety_id integer NOT NULL REFERENCES varieties(id),
    rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, variety_id)
  )`);

  await run('tasting_feed_reactions', sql`CREATE TABLE IF NOT EXISTS tasting_feed_reactions (
    id serial PRIMARY KEY,
    entry_id integer NOT NULL REFERENCES tasting_journal(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users(id),
    emoji text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (entry_id, user_id, emoji)
  )`);

  // ── Evening tokens ───────────────────────────────────────────────────────────
  await run('evening_tokens', sql`CREATE TABLE IF NOT EXISTS evening_tokens (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL UNIQUE,
    user_a_id INTEGER NOT NULL REFERENCES users(id),
    user_b_id INTEGER NOT NULL REFERENCES users(id),
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    offer_id INTEGER NOT NULL REFERENCES reservation_offers(id),
    window_closes_at TIMESTAMP NOT NULL,
    user_a_confirmed BOOLEAN NOT NULL DEFAULT false,
    user_b_confirmed BOOLEAN NOT NULL DEFAULT false,
    minted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  // ── Webhook subscriptions ────────────────────────────────────────────────────
  await run('webhook_subscriptions', sql`CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id),
    url text NOT NULL,
    events text[] NOT NULL DEFAULT '{}',
    secret text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_fired_at timestamptz,
    last_status_code integer
  )`);

  // ── Device tables ────────────────────────────────────────────────────────────
  await run('device_role_enum', sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_role') THEN
      CREATE TYPE device_role AS ENUM ('user', 'employee', 'chocolatier');
    END IF;
  END $$`);
  await run('devices', sql`CREATE TABLE IF NOT EXISTS devices (
    id serial PRIMARY KEY,
    device_address text NOT NULL UNIQUE,
    user_id integer NOT NULL REFERENCES users(id),
    role device_role NOT NULL DEFAULT 'user',
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await run('device_pairing_tokens', sql`CREATE TABLE IF NOT EXISTS device_pairing_tokens (
    id serial PRIMARY KEY,
    token text NOT NULL UNIQUE,
    user_id integer NOT NULL REFERENCES users(id),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

  // ── Food popup crowd-confirm columns ─────────────────────────────────────────
  await run('businesses.food_popup_status', sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS food_popup_status text NOT NULL DEFAULT 'announced'`);
  await run('businesses.min_orders_to_confirm', sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS min_orders_to_confirm integer`);
  await run('businesses.confirmed_at', sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS confirmed_at timestamptz`);

  // ── Popup merch ──────────────────────────────────────────────────────────────
  await run('popup_merch_items', sql`CREATE TABLE IF NOT EXISTS popup_merch_items (
    id SERIAL PRIMARY KEY,
    popup_id INTEGER NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    image_url TEXT,
    sizes TEXT[] NOT NULL DEFAULT '{}',
    stock_remaining INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('popup_merch_orders', sql`CREATE TABLE IF NOT EXISTS popup_merch_orders (
    id SERIAL PRIMARY KEY,
    popup_id INTEGER NOT NULL REFERENCES businesses(id),
    item_id INTEGER NOT NULL REFERENCES popup_merch_items(id),
    buyer_user_id INTEGER NOT NULL REFERENCES users(id),
    recipient_user_id INTEGER REFERENCES users(id),
    donated BOOLEAN NOT NULL DEFAULT false,
    size TEXT,
    total_cents INTEGER NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ── Popup food orders ────────────────────────────────────────────────────────
  await run('popup_food_orders', sql`CREATE TABLE IF NOT EXISTS popup_food_orders (
    id SERIAL PRIMARY KEY,
    popup_id INTEGER NOT NULL REFERENCES businesses(id),
    menu_item_id INTEGER NOT NULL REFERENCES business_menu_items(id),
    buyer_user_id INTEGER NOT NULL REFERENCES users(id),
    recipient_user_id INTEGER REFERENCES users(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    total_cents INTEGER NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ── Community fund ───────────────────────────────────────────────────────────
  await run('community_fund', sql`CREATE TABLE IF NOT EXISTS community_fund (
    id SERIAL PRIMARY KEY,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    total_raised_cents INTEGER NOT NULL DEFAULT 0,
    threshold_cents INTEGER NOT NULL DEFAULT 110000,
    popup_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await run('community_fund_seed', sql`INSERT INTO community_fund (id, balance_cents, total_raised_cents, threshold_cents, popup_count)
    VALUES (1, 0, 0, 110000, 0) ON CONFLICT (id) DO NOTHING`);

  await run('community_fund_contributions', sql`CREATE TABLE IF NOT EXISTS community_fund_contributions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    amount_cents INTEGER NOT NULL DEFAULT 200,
    order_type TEXT NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ── Community events ─────────────────────────────────────────────────────────
  await run('community_events', sql`CREATE TABLE IF NOT EXISTS community_events (
    id SERIAL PRIMARY KEY,
    event_date DATE NOT NULL,
    operator_names TEXT NOT NULL,
    people_fed INTEGER NOT NULL DEFAULT 0,
    location TEXT,
    description TEXT,
    photo_url TEXT,
    fund_raised_cents INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ── Community popup interest ─────────────────────────────────────────────────
  await run('community_popup_interest', sql`CREATE TABLE IF NOT EXISTS community_popup_interest (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    business_id INTEGER REFERENCES businesses(id),
    concept TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ── Indexes ──────────────────────────────────────────────────────────────────
  await run('nfc_connections_pair_unique', sql`
    CREATE UNIQUE INDEX IF NOT EXISTS nfc_connections_pair_unique
    ON nfc_connections (LEAST(user_a, user_b), GREATEST(user_a, user_b))
  `);

  // ── Kommune menu ratings ─────────────────────────────────────────────────────
  await run('kommune_ratings', sql`CREATE TABLE IF NOT EXISTS kommune_ratings (
    id SERIAL PRIMARY KEY,
    item_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  logger.info('ensureSchema complete');
}
