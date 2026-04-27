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

  // ── Kommune press applications ───────────────────────────────────────────────
  await run('kommune_press_applications', sql`CREATE TABLE IF NOT EXISTS kommune_press_applications (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    personal_code TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('kommune_press_applications.user_id', sql`ALTER TABLE kommune_press_applications ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id)`);

  // ── Kommune press assignments ────────────────────────────────────────────────
  await run('kommune_assignments', sql`CREATE TABLE IF NOT EXISTS kommune_assignments (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    neighbourhood TEXT NOT NULL,
    note TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ── Kommune menu ratings ─────────────────────────────────────────────────────
  await run('kommune_ratings', sql`CREATE TABLE IF NOT EXISTS kommune_ratings (
    id SERIAL PRIMARY KEY,
    item_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('kommune_flavour_suggestions', sql`CREATE TABLE IF NOT EXISTS kommune_flavour_suggestions (
    id SERIAL PRIMARY KEY,
    suggestion TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('kommune_reservations', sql`CREATE TABLE IF NOT EXISTS kommune_reservations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    preorder TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('table_events.threshold', sql`
    ALTER TABLE table_events ADD COLUMN IF NOT EXISTS threshold INTEGER
  `);

  await run('table_events.instructor_id nullable', sql`
    ALTER TABLE table_events ALTER COLUMN instructor_id DROP NOT NULL
  `);

  await run('table_booking_tokens', sql`CREATE TABLE IF NOT EXISTS table_booking_tokens (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    booking_id INTEGER NOT NULL REFERENCES table_bookings(id),
    action TEXT NOT NULL CHECK (action IN ('confirm', 'refund')),
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ── Table venues (operator accounts) ────────────────────────────────────
  await run('table_venues', sql`CREATE TABLE IF NOT EXISTS table_venues (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 12000,
    active BOOLEAN NOT NULL DEFAULT true,
    stripe_connect_account_id TEXT,
    stripe_connect_onboarded BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('table_venue_sessions', sql`CREATE TABLE IF NOT EXISTS table_venue_sessions (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ── Table memberships (pool) ─────────────────────────────────────────────
  await run('table_memberships', sql`CREATE TABLE IF NOT EXISTS table_memberships (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'waiting',
    events_attended INTEGER NOT NULL DEFAULT 0,
    last_called_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await run('table_memberships_idx', sql`
    CREATE INDEX IF NOT EXISTS table_memberships_slug_idx
    ON table_memberships (slug, status, created_at)
  `);
  await run('table_memberships.confirm_token', sql`ALTER TABLE table_memberships ADD COLUMN IF NOT EXISTS confirm_token TEXT UNIQUE`);
  await run('table_memberships.confirmed_at', sql`ALTER TABLE table_memberships ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ`);
  await run('table_memberships.refunded_at', sql`ALTER TABLE table_memberships ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ`);

  // ── Fraise platform ──────────────────────────────────────────────────────────

  await run('fraise_members', sql`CREATE TABLE IF NOT EXISTS fraise_members (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    credit_balance INTEGER NOT NULL DEFAULT 0,
    credits_purchased INTEGER NOT NULL DEFAULT 0,
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('fraise_member_sessions', sql`CREATE TABLE IF NOT EXISTS fraise_member_sessions (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES fraise_members(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('fraise_credit_purchases', sql`CREATE TABLE IF NOT EXISTS fraise_credit_purchases (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES fraise_members(id),
    credits INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('fraise_businesses', sql`CREATE TABLE IF NOT EXISTS fraise_businesses (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    stripe_connect_account_id TEXT,
    stripe_connect_onboarded BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('fraise_business_sessions', sql`CREATE TABLE IF NOT EXISTS fraise_business_sessions (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES fraise_businesses(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('fraise_events', sql`CREATE TABLE IF NOT EXISTS fraise_events (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES fraise_businesses(id),
    title TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL DEFAULT 12000,
    min_seats INTEGER NOT NULL DEFAULT 6,
    max_seats INTEGER NOT NULL DEFAULT 20,
    seats_claimed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    event_date TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await run('fraise_invitations', sql`CREATE TABLE IF NOT EXISTS fraise_invitations (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES fraise_events(id),
    member_id INTEGER NOT NULL REFERENCES fraise_members(id),
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    UNIQUE (event_id, member_id)
  )`);

  await run('fraise_invitations_idx', sql`
    CREATE INDEX IF NOT EXISTS fraise_invitations_member_idx ON fraise_invitations (member_id, status)
  `);
  await run('fraise_members.push_token',  sql`ALTER TABLE fraise_members  ADD COLUMN IF NOT EXISTS push_token TEXT`);
  await run('fraise_members.apple_sub',   sql`ALTER TABLE fraise_members  ADD COLUMN IF NOT EXISTS apple_sub TEXT UNIQUE`);
  await run('fraise_members.password_hash_nullable', sql`ALTER TABLE fraise_members ALTER COLUMN password_hash DROP NOT NULL`);
  await run('fraise_events.location_text', sql`ALTER TABLE fraise_events ADD COLUMN IF NOT EXISTS location_text TEXT`);
  await run('fraise_events.lat',           sql`ALTER TABLE fraise_events ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
  await run('fraise_events.lng',           sql`ALTER TABLE fraise_events ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
  await run('fraise_businesses.lat',      sql`ALTER TABLE fraise_businesses ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
  await run('fraise_businesses.lng',      sql`ALTER TABLE fraise_businesses ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);

  await run('fraise_interest', sql`CREATE TABLE IF NOT EXISTS fraise_interest (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES fraise_businesses(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    fraise_member_id INTEGER REFERENCES fraise_members(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, email)
  )`);
  await run('fraise_interest_idx', sql`
    CREATE INDEX IF NOT EXISTS fraise_interest_business_idx ON fraise_interest (business_id, created_at DESC)
  `);
  await run('fraise_member_resets', sql`CREATE TABLE IF NOT EXISTS fraise_member_resets (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES fraise_members(id),
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ── Kommune reservations — paid pre-order columns ─────────────────────────
  await run('kommune_reservations.email', sql`ALTER TABLE kommune_reservations ADD COLUMN IF NOT EXISTS email text`);
  await run('kommune_reservations.total_cents', sql`ALTER TABLE kommune_reservations ADD COLUMN IF NOT EXISTS total_cents integer NOT NULL DEFAULT 0`);
  await run('kommune_reservations.stripe_payment_intent_id', sql`ALTER TABLE kommune_reservations ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text`);
  await run('kommune_reservations.order_json', sql`ALTER TABLE kommune_reservations ADD COLUMN IF NOT EXISTS order_json jsonb`);
  await run('kommune_reservations.event_id', sql`ALTER TABLE kommune_reservations ADD COLUMN IF NOT EXISTS event_id integer REFERENCES table_events(id)`);

  logger.info('ensureSchema complete');
}
