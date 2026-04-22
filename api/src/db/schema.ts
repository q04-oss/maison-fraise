import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  decimal,
  jsonb,
  unique,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const chocolateEnum = pgEnum('chocolate', [
  'none',
  'guanaja_70',
  'caraibe_66',
  'jivara_40',
  'ivoire_blanc',
]);

export const finishEnum = pgEnum('finish', ['plain', 'fleur_de_sel', 'or_fin']);

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'queued',
  'paid',
  'preparing',
  'ready',
  'collected',
  'cancelled',
]);

export const batchPreferenceStatusEnum = pgEnum('batch_preference_status', ['active', 'paused']);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'upcoming',
  'open',
  'waitlist',
  'closed',
  'completed',
]);

export const campaignSignupStatusEnum = pgEnum('campaign_signup_status', [
  'confirmed',
  'waitlist',
  'cancelled',
  'completed',
]);

export const socialTierEnum = pgEnum('social_tier', ['standard', 'reserve', 'estate']);

export const varieties = pgTable('varieties', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  source_farm: text('source_farm'),
  source_location: text('source_location'),
  price_cents: integer('price_cents').notNull(),
  stock_remaining: integer('stock_remaining').notNull().default(0),
  harvest_date: date('harvest_date'),
  tag: text('tag'),
  location_id: integer('location_id').references(() => locations.id),
  image_url: text('image_url'),
  active: boolean('active').notNull().default(true),
  variety_type: text('variety_type').notNull().default('strawberry'), // 'strawberry' | 'chocolate'
  sort_order: integer('sort_order').notNull().default(0),
  social_tier: socialTierEnum('social_tier'),
  time_credits_days: integer('time_credits_days').notNull().default(30),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  active: boolean('active').notNull().default(true),
  staff_pin: text('staff_pin'),
  allows_walkin: boolean('allows_walkin').notNull().default(false),
  beacon_uuid: text('beacon_uuid').unique(),
  business_id: integer('business_id'), // links to businesses table for visit eligibility checks
});

export const timeSlots = pgTable('time_slots', {
  id: serial('id').primaryKey(),
  location_id: integer('location_id')
    .notNull()
    .references(() => locations.id),
  date: date('date').notNull(),
  time: text('time').notNull(),
  capacity: integer('capacity').notNull(),
  booked: integer('booked').notNull().default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  variety_id: integer('variety_id')
    .notNull()
    .references(() => varieties.id),
  location_id: integer('location_id')
    .notNull()
    .references(() => locations.id),
  time_slot_id: integer('time_slot_id')
    .references(() => timeSlots.id),
  batch_id: integer('batch_id').references(() => batches.id),
  walk_in: boolean('walk_in').notNull().default(false),
  chocolate: chocolateEnum('chocolate'),
  finish: finishEnum('finish'),
  quantity: integer('quantity').notNull(),
  is_gift: boolean('is_gift').notNull().default(false),
  total_cents: integer('total_cents').notNull(),
  apple_id: text('apple_id'),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  status: orderStatusEnum('status').notNull().default('pending'),
  customer_email: text('customer_email').notNull(),
  push_token: text('push_token'),
  gift_note: text('gift_note'),
  nfc_token: text('nfc_token').unique(),
  nfc_token_used: boolean('nfc_token_used').notNull().default(false),
  nfc_verified_at: timestamp('nfc_verified_at'),
  payment_intent_id: text('payment_intent_id'),
  rating: integer('rating'),
  rating_note: text('rating_note'),
  discount_applied: boolean('discount_applied').notNull().default(false),
  worker_id: integer('worker_id').references(() => users.id),
  payment_method: text('payment_method'),
  excess_amount_cents: integer('excess_amount_cents').notNull().default(0),
  token_id: integer('token_id'),
  payment_captured: boolean('payment_captured').notNull().default(false),
  queued_at: timestamp('queued_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idx_customer_email: index('orders_customer_email_idx').on(t.customer_email),
  chocolate_finish_pair: check(
    'chocolate_finish_pair_check',
    sql`(${t.chocolate} IS NULL AND ${t.finish} IS NULL) OR (${t.chocolate} IS NOT NULL AND ${t.finish} IS NOT NULL)`,
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const users: any = pgTable('users', {
  id: serial('id').primaryKey(),
  apple_user_id: text('apple_user_id').unique(),
  email: text('email').notNull().unique(),
  display_name: text('display_name'),
  push_token: text('push_token'),
  user_code: text('user_code').unique(),
  fraise_chat_email: text('fraise_chat_email').unique(),
  verified: boolean('verified').notNull().default(false),
  verified_at: timestamp('verified_at'),
  verified_by: text('verified_by'),
  is_dj: boolean('is_dj').notNull().default(false),
  photographed: boolean('photographed').notNull().default(false),
  campaign_interest: boolean('campaign_interest').notNull().default(false),
  stripe_customer_id: text('stripe_customer_id'),
  referred_by_code: text('referred_by_code'),
  notification_prefs: jsonb('notification_prefs').$type<{ order_updates: boolean; social: boolean; popup_updates: boolean; marketing: boolean } | null>().default(null),
  portrait_url: text('portrait_url'),
  worker_status: text('worker_status'),
  portal_opted_in: boolean('portal_opted_in').notNull().default(false),
  identity_verified: boolean('identity_verified').notNull().default(false),
  identity_verified_at: timestamp('identity_verified_at'),
  identity_session_id: text('identity_session_id'),
  id_attested_by: integer('id_attested_by').references(() => users.id),
  id_attested_at: timestamp('id_attested_at'),
  id_attestation_expires_at: timestamp('id_attestation_expires_at'),
  id_verified_name: text('id_verified_name'),
  id_verified_dob: text('id_verified_dob'),
  identity_verified_expires_at: timestamp('identity_verified_expires_at'),
  verification_renewal_due_at: timestamp('verification_renewal_due_at'),
  banned: boolean('banned').notNull().default(false),
  ban_reason: text('ban_reason'),
  is_shop: boolean('is_shop').notNull().default(false),
  is_dorotka: boolean('is_dorotka').notNull().default(false),
  business_id: integer('business_id').references(() => businesses.id),
  stripe_connect_account_id: text('stripe_connect_account_id'),
  stripe_connect_onboarded: boolean('stripe_connect_onboarded').notNull().default(false),
  ad_balance_cents: integer('ad_balance_cents').notNull().default(0),
  platform_credit_cents: integer('platform_credit_cents').notNull().default(0),
  social_time_bank_seconds: integer('social_time_bank_seconds').notNull().default(0),
  social_time_bank_updated_at: timestamp('social_time_bank_updated_at'),
  social_lifetime_credits_seconds: integer('social_lifetime_credits_seconds').notNull().default(0),
  current_streak_weeks: integer('current_streak_weeks').notNull().default(0),
  longest_streak_weeks: integer('longest_streak_weeks').notNull().default(0),
  last_tap_week: text('last_tap_week'), // ISO week string e.g. "2026-W14"
  eth_address: text('eth_address').unique(), // Linked Optimism wallet for FRS balance display
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const businesses = pgTable('businesses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'collection' | 'partner' | 'popup'
  address: text('address').notNull(),
  city: text('city').notNull(),
  hours: text('hours'),
  contact: text('contact'),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  launched_at: timestamp('launched_at').notNull(),
  // Partner / popup enrichment
  description: text('description'),
  instagram_handle: text('instagram_handle'),
  neighbourhood: text('neighbourhood'),
  // Popup-specific fields
  starts_at: timestamp('starts_at'),
  ends_at: timestamp('ends_at'),
  dj_name: text('dj_name'),
  organizer_note: text('organizer_note'),
  capacity: integer('capacity'),
  entrance_fee_cents: integer('entrance_fee_cents'),
  is_audition: boolean('is_audition').notNull().default(false),
  audition_status: text('audition_status'), // null | 'pending' | 'passed' | 'failed'
  partner_business_id: integer('partner_business_id'), // collaborating partner venue
  host_user_id: integer('host_user_id'),               // user who hosts the popup
  checkin_token: text('checkin_token'),                 // NFC check-in token for this popup
  // Chocolate / location type fields
  location_type: text('location_type').notNull().default('collection'), // 'collection' | 'popup' | 'house_chocolate' | 'collab_chocolate'
  partner_name: text('partner_name'), // for collab locations: "Chocolaterie du Parc"
  operating_cost_cents: integer('operating_cost_cents'), // for house_chocolate: 10-year operating cost
  founding_patron_id: integer('founding_patron_id').references(() => users.id),
  founding_term_ends_at: timestamp('founding_term_ends_at'),
  inaugurated_at: timestamp('inaugurated_at'),
  approved_by_admin: boolean('approved_by_admin').notNull().default(false),
  venture_id: integer('venture_id'), // associated venture (optional)
  has_toilet: boolean('has_toilet').notNull().default(false),
  toilet_fee_cents: integer('toilet_fee_cents').notNull().default(150),
  // Beacon proximity detection
  beacon_uuid: text('beacon_uuid').unique(),
  // Walk-in purchases: only true for the chocolatier's own counter (Marché Atwater)
  allows_walkin: boolean('allows_walkin').notNull().default(false),
  // Food popup crowd-confirm
  food_popup_status: text('food_popup_status').notNull().default('announced'), // 'announced' | 'confirmed'
  min_orders_to_confirm: integer('min_orders_to_confirm'),
  confirmed_at: timestamp('confirmed_at'),
  // Sticker store
  sticker_concept: text('sticker_concept'),
  sticker_emoji: text('sticker_emoji'),
  sticker_image_url: text('sticker_image_url'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const personalToilets = pgTable('personal_toilets', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  price_cents: integer('price_cents').notNull(),
  address: text('address').notNull(),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  instagram_handle: text('instagram_handle'),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const toiletVisits = pgTable('toilet_visits', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  business_id: integer('business_id').references(() => businesses.id), // nullable — either business or personal
  personal_toilet_id: integer('personal_toilet_id').references(() => personalToilets.id),
  fee_cents: integer('fee_cents').notNull(),
  payment_method: text('payment_method').notNull(), // 'stripe' | 'ad_balance'
  stripe_payment_intent_id: text('stripe_payment_intent_id'),
  paid: boolean('paid').notNull().default(false),
  access_code: text('access_code'),
  access_code_expires_at: timestamp('access_code_expires_at'), // hardware-ready expiry
  rating: integer('rating'), // 1-5
  review_note: text('review_note'),
  reviewed_at: timestamp('reviewed_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Health profiles (Dorotka toilet biometric data) ─────────────────────────
export const healthProfiles = pgTable('health_profiles', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id).unique(),
  // Dietary
  dietary_restrictions: text('dietary_restrictions').array().notNull().default([]),
  allergens: jsonb('allergens').$type<Record<string, boolean>>().default({}),
  // Dorotka biometric readings (0–1 scale, from home toilet analysis)
  biometric_markers: jsonb('biometric_markers').$type<{
    gut_microbiome_diversity?: number;   // 0=low, 1=high
    hydration?: number;                  // 0=dehydrated, 1=optimal
    inflammation_markers?: number;       // 0=none, 1=high
    digestive_speed?: number;            // 0=slow, 1=fast
    stress_indicators?: number;          // 0=none, 1=high
  }>().default({}),
  flavor_profile: jsonb('flavor_profile').$type<{
    umami?: number;   // preference 0–1
    sweet?: number;   // tolerance 0–1
    sour?: number;    // tolerance 0–1
    bitter?: number;  // tolerance 0–1
    spicy?: number;   // tolerance 0–1
    rich?: number;    // preference 0–1 (fat/cream/butter)
  }>().default({}),
  caloric_needs: integer('caloric_needs'),   // daily kcal estimate
  dorotka_note: text('dorotka_note'),        // Dorotka's plain-language summary
  last_reading_at: timestamp('last_reading_at'),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Itineraries ──────────────────────────────────────────────────────────────
export const itineraries = pgTable('itineraries', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'), // 'active' | 'completed'
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const itineraryDestinations = pgTable('itinerary_destinations', {
  id: serial('id').primaryKey(),
  itinerary_id: integer('itinerary_id').notNull().references(() => itineraries.id, { onDelete: 'cascade' }),
  business_id: integer('business_id').references(() => businesses.id), // platform property if known
  place_name: text('place_name').notNull(),
  city: text('city').notNull(),
  country: text('country').notNull(),
  lat: decimal('lat', { precision: 10, scale: 7 }),
  lng: decimal('lng', { precision: 10, scale: 7 }),
  arrival_date: text('arrival_date'),   // ISO date 'YYYY-MM-DD'
  departure_date: text('departure_date'),
  notes: text('notes'),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// Bespoke presence proposals — a property bids on a user's attendance
export const itineraryProposals = pgTable('itinerary_proposals', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  itinerary_id: integer('itinerary_id').references(() => itineraries.id),
  destination_id: integer('destination_id').references(() => itineraryDestinations.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  value_cents: integer('value_cents').notNull(),   // what the property pays the user to show up
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'declined'
  created_at: timestamp('created_at').notNull().defaultNow(),
  responded_at: timestamp('responded_at'),
  visit_confirmed_at: timestamp('visit_confirmed_at'), // biometric check-in (future)
});

// ─── Business menu items (what the restaurant actually serves) ───────────────
export const businessMenuItems = pgTable('business_menu_items', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(),
  description: text('description'),
  price_cents: integer('price_cents'),
  category: text('category').notNull().default('main'), // amuse/starter/main/dessert/drink/side
  allergens: jsonb('allergens').$type<Record<string, boolean>>().default({}),
  tags: text('tags').array().default([]),   // e.g. ['vegan','anti-inflammatory','umami']
  is_available: boolean('is_available').notNull().default(true),
  sort_order: integer('sort_order').notNull().default(0),
  // Nutritional data (optional — for beacon HealthKit recommendation scoring)
  calories_kcal: integer('calories_kcal'),
  protein_g: integer('protein_g'),
  carbs_g: integer('carbs_g'),
  fat_g: integer('fat_g'),
  sugar_g: integer('sugar_g'),
  fiber_g: integer('fiber_g'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Reservation offers (restaurant sponsors a full dinner for two) ───────────
export const reservationOffers = pgTable('reservation_offers', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  title: text('title').notNull(),
  description: text('description'),
  mode: text('mode').notNull().default('platform_match'), // 'platform_match' | 'user_invite'
  value_cents: integer('value_cents').notNull(),          // full meal cost — what business pays
  commission_cents: integer('commission_cents').notNull().default(0), // platform 20%
  drink_description: text('drink_description'),
  reservation_date: text('reservation_date'),             // YYYY-MM-DD
  reservation_time: text('reservation_time'),             // HH:MM
  slots_total: integer('slots_total').notNull().default(1),
  slots_remaining: integer('slots_remaining').notNull().default(1),
  status: text('status').notNull().default('active'),     // 'active' | 'paused' | 'closed'
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Reservation bookings ─────────────────────────────────────────────────────
export const reservationBookings = pgTable('reservation_bookings', {
  id: serial('id').primaryKey(),
  offer_id: integer('offer_id').notNull().references(() => reservationOffers.id),
  initiator_user_id: integer('initiator_user_id').notNull().references(() => users.id),
  guest_user_id: integer('guest_user_id').references(() => users.id),
  // seeking_pair: platform_match, waiting for second guest
  // pending_invite: user_invite, initiator must pick a contact
  // pending_guest: contact was invited, awaiting their response
  // confirmed | cancelled | expired
  status: text('status').notNull().default('seeking_pair'),
  invite_expires_at: timestamp('invite_expires_at'),
  confirmed_at: timestamp('confirmed_at'),
  strawberry_order_placed: boolean('strawberry_order_placed').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Personalized menus (Dorotka-generated per user per restaurant) ───────────
export const personalizedMenus = pgTable('personalized_menus', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  courses: jsonb('courses').notNull().$type<Array<{
    course: string;
    dish: string;
    rationale: string;
  }>>(),
  health_snapshot: jsonb('health_snapshot'), // copy of profile at generation time
  generated_at: timestamp('generated_at').notNull().defaultNow(),
  valid_until: timestamp('valid_until'),
});

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  concept: text('concept').notNull(),
  salon_id: integer('salon_id')
    .notNull()
    .references(() => businesses.id),
  paying_client_id: integer('paying_client_id')
    .references(() => businesses.id),
  date: timestamp('date').notNull(),
  total_spots: integer('total_spots').notNull(),
  spots_remaining: integer('spots_remaining').notNull(),
  status: campaignStatusEnum('status').notNull().default('upcoming'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const campaignSignups = pgTable('campaign_signups', {
  id: serial('id').primaryKey(),
  campaign_id: integer('campaign_id')
    .notNull()
    .references(() => campaigns.id),
  user_id: integer('user_id')
    .notNull()
    .references(() => users.id),
  waitlist: boolean('waitlist').notNull().default(false),
  status: campaignSignupStatusEnum('status').notNull().default('confirmed'),
  signed_up_at: timestamp('signed_up_at').notNull().defaultNow(),
}, (t) => ({
  uniq_campaign_user: unique().on(t.campaign_id, t.user_id),
}));

export const batchPreferences = pgTable('batch_preferences', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  variety_id: integer('variety_id').notNull().references(() => varieties.id),
  chocolate: chocolateEnum('chocolate').notNull(),
  finish: finishEnum('finish').notNull(),
  quantity: integer('quantity').notNull(),
  location_id: integer('location_id').notNull().references(() => locations.id),
  status: batchPreferenceStatusEnum('status').notNull().default('active'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uniq: unique().on(table.user_id, table.variety_id, table.location_id),
}));

export const legitimacyEvents = pgTable('legitimacy_events', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id')
    .notNull()
    .references(() => users.id),
  event_type: text('event_type').notNull(),
  weight: integer('weight').notNull(),
  business_id: integer('business_id')
    .references(() => businesses.id),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Popup system ────────────────────────────────────────────────────────────

export const popupRsvps = pgTable('popup_rsvps', {
  id: serial('id').primaryKey(),
  popup_id: integer('popup_id').notNull().references(() => businesses.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid' | 'cancelled'
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const popupCheckins = pgTable('popup_checkins', {
  id: serial('id').primaryKey(),
  popup_id: integer('popup_id').notNull().references(() => businesses.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  nfc_token: text('nfc_token'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const popupMerchItems = pgTable('popup_merch_items', {
  id: serial('id').primaryKey(),
  popup_id: integer('popup_id').notNull().references(() => businesses.id),
  name: text('name').notNull(),
  description: text('description'),
  price_cents: integer('price_cents').notNull(),
  image_url: text('image_url'),
  sizes: text('sizes').array().notNull().default([]), // e.g. ['XS','S','M','L','XL']
  stock_remaining: integer('stock_remaining').notNull().default(0),
  active: boolean('active').notNull().default(true),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const popupMerchOrders = pgTable('popup_merch_orders', {
  id: serial('id').primaryKey(),
  popup_id: integer('popup_id').notNull().references(() => businesses.id),
  item_id: integer('item_id').notNull().references(() => popupMerchItems.id),
  buyer_user_id: integer('buyer_user_id').notNull().references(() => users.id),
  recipient_user_id: integer('recipient_user_id').references(() => users.id), // null = donate
  donated: boolean('donated').notNull().default(false),
  size: text('size'),
  total_cents: integer('total_cents').notNull(),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid' | 'cancelled'
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const popupFoodOrders = pgTable('popup_food_orders', {
  id: serial('id').primaryKey(),
  popup_id: integer('popup_id').notNull().references(() => businesses.id),
  menu_item_id: integer('menu_item_id').notNull().references(() => businessMenuItems.id),
  buyer_user_id: integer('buyer_user_id').notNull().references(() => users.id),
  recipient_user_id: integer('recipient_user_id').references(() => users.id), // null = claimable by anyone
  quantity: integer('quantity').notNull().default(1),
  total_cents: integer('total_cents').notNull(),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid' | 'claimed' | 'cancelled'
  note: text('note'),
  claimed_at: timestamp('claimed_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const popupNominations = pgTable('popup_nominations', {
  id: serial('id').primaryKey(),
  popup_id: integer('popup_id').notNull().references(() => businesses.id),
  nominator_id: integer('nominator_id').notNull().references(() => users.id),
  nominee_id: integer('nominee_id').notNull().references(() => users.id),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const djOffers = pgTable('dj_offers', {
  id: serial('id').primaryKey(),
  popup_id: integer('popup_id').notNull().references(() => businesses.id),
  dj_user_id: integer('dj_user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'passed'
  allocation_boxes: integer('allocation_boxes').notNull().default(0),
  organizer_note: text('organizer_note'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const portraits = pgTable('portraits', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  image_url: text('image_url').notNull(),
  subject_name: text('subject_name'),
  season: text('season'),
  campaign_title: text('campaign_title'),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const campaignCommissions = pgTable('campaign_commissions', {
  id: serial('id').primaryKey(),
  popup_id: integer('popup_id').notNull().references(() => businesses.id),
  commissioner_user_id: integer('commissioner_user_id').notNull().references(() => users.id),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  invited_user_ids: jsonb('invited_user_ids').$type<number[]>().notNull().default([]),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid'
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const popupRequests = pgTable('popup_requests', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  venue_id: integer('venue_id').notNull().references(() => businesses.id),
  requested_date: text('requested_date').notNull(),
  requested_time: text('requested_time').notNull(),
  notes: text('notes'),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid' | 'approved' | 'rejected'
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Talent layer ─────────────────────────────────────────────────────────────

export const employmentContracts = pgTable('employment_contracts', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  starts_at: timestamp('starts_at').notNull(),
  ends_at: timestamp('ends_at').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'completed' | 'declined'
  note: text('note'),
  venture_id: integer('venture_id'), // nullable FK added after ventures table exists
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const contractRequests = pgTable('contract_requests', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  description: text('description'),
  desired_start: text('desired_start'),
  status: text('status').notNull().default('pending'), // 'pending' | 'filled' | 'closed'
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const businessVisits = pgTable('business_visits', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  contracted_user_id: integer('contracted_user_id').notNull().references(() => users.id),
  visitor_user_id: integer('visitor_user_id').references(() => users.id),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const userFollows = pgTable('user_follows', {
  id: serial('id').primaryKey(),
  follower_id: integer('follower_id').notNull().references(() => users.id),
  followee_id: integer('followee_id').notNull().references(() => users.id),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniq_follow: unique().on(t.follower_id, t.followee_id),
}));

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // 'nomination' | 'contract' | 'tip' | 'rsvp' | 'follow'
  title: text('title').notNull(),
  body: text('body').notNull(),
  read: boolean('read').notNull().default(false),
  data: jsonb('data').$type<Record<string, any>>().notNull().default({}),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const referralCodes = pgTable('referral_codes', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  code: text('code').notNull().unique(),
  uses: integer('uses').notNull().default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const membershipTierEnum = pgEnum('membership_tier', [
  'maison',
  'reserve',
  'atelier',
  'fondateur',
  'patrimoine',
  'souverain',
  'unnamed',
]);

export const memberships = pgTable('memberships', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  tier: membershipTierEnum('tier').notNull(),
  status: text('status').notNull().default('pending'),
  started_at: timestamp('started_at'),
  renews_at: timestamp('renews_at'),
  amount_cents: integer('amount_cents').notNull(),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  renewal_notified_at: timestamp('renewal_notified_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const membershipFunds = pgTable('membership_funds', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id).unique(),
  balance_cents: integer('balance_cents').notNull().default(0),
  cycle_start: timestamp('cycle_start').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const fundContributions = pgTable('fund_contributions', {
  id: serial('id').primaryKey(),
  from_user_id: integer('from_user_id').references(() => users.id),
  to_user_id: integer('to_user_id').notNull().references(() => users.id),
  amount_cents: integer('amount_cents').notNull(),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  note: text('note'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const editorialStatusEnum = pgEnum('editorial_status', [
  'abstract_submitted', 'abstract_declined',
  'commissioned',
  'draft', 'submitted', 'published', 'declined'
]);

export const editorialPieces = pgTable('editorial_pieces', {
  id: serial('id').primaryKey(),
  author_user_id: integer('author_user_id').notNull().references(() => users.id),
  abstract: text('abstract'),
  title: text('title'),
  body: text('body'),
  status: editorialStatusEnum('status').notNull().default('abstract_submitted'),
  commission_cents: integer('commission_cents'),
  published_at: timestamp('published_at'),
  editor_note: text('editor_note'),
  tag: text('tag'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const membershipWaitlist = pgTable('membership_waitlist', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  tier: membershipTierEnum('tier').notNull(),
  message: text('message'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const nfcPairingTokens = pgTable('nfc_pairing_tokens', {
  token: text('token').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  expires_at: timestamp('expires_at').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const nfcConnections = pgTable('nfc_connections', {
  id: serial('id').primaryKey(),
  user_a: integer('user_a').notNull().references(() => users.id),
  user_b: integer('user_b').notNull().references(() => users.id),
  location: text('location'),
  confirmed_at: timestamp('confirmed_at').notNull().defaultNow(),
});

export const explicitPortals = pgTable('explicit_portals', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id).unique(),
  opted_in: boolean('opted_in').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const portalAccess = pgTable('portal_access', {
  id: serial('id').primaryKey(),
  buyer_id: integer('buyer_id').notNull().references(() => users.id),
  owner_id: integer('owner_id').notNull().references(() => users.id),
  amount_cents: integer('amount_cents').notNull(),
  platform_cut_cents: integer('platform_cut_cents').notNull(),
  source: text('source').notNull(), // 'tap' | 'receipt'
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  expires_at: timestamp('expires_at').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const portalContent = pgTable('portal_content', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  media_url: text('media_url').notNull(),
  type: text('type').notNull(), // 'photo' | 'video'
  caption: text('caption'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const portalConsents = pgTable('portal_consents', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id).unique(),
  consented_at: timestamp('consented_at').notNull().defaultNow(),
  ip_address: text('ip_address'),
});

// ─── Token system ─────────────────────────────────────────────────────────────

export const tokens = pgTable('tokens', {
  id: serial('id').primaryKey(),
  token_number: integer('token_number').notNull(),
  variety_id: integer('variety_id').notNull().references(() => varieties.id),
  order_id: integer('order_id').notNull().references(() => orders.id),
  original_owner_id: integer('original_owner_id').notNull().references(() => users.id),
  current_owner_id: integer('current_owner_id').notNull().references(() => users.id),
  excess_amount_cents: integer('excess_amount_cents').notNull(),
  visual_size: integer('visual_size').notNull(),
  visual_color: text('visual_color').notNull(),
  visual_seeds: integer('visual_seeds').notNull(),
  visual_irregularity: integer('visual_irregularity').notNull(),
  nfc_token: text('nfc_token').unique(),
  minted_at: timestamp('minted_at').notNull().defaultNow(),
  variety_name: text('variety_name').notNull(),
  location_name: text('location_name').notNull(),
  token_type: text('token_type').notNull().default('standard'), // 'standard' | 'chocolate'
  partner_name: text('partner_name'), // for chocolate collab tokens
  location_type: text('location_type'), // 'house_chocolate' | 'collab_chocolate'
});

export const tokenTrades = pgTable('token_trades', {
  id: serial('id').primaryKey(),
  token_id: integer('token_id').notNull().references(() => tokens.id),
  from_user_id: integer('from_user_id').notNull().references(() => users.id),
  to_user_id: integer('to_user_id').notNull().references(() => users.id),
  platform_cut_cents: integer('platform_cut_cents').notNull().default(0),
  traded_at: timestamp('traded_at').notNull().defaultNow(),
  note: text('note'),
});

export const tokenTradeOffers = pgTable('token_trade_offers', {
  id: serial('id').primaryKey(),
  token_id: integer('token_id').notNull().references(() => tokens.id),
  from_user_id: integer('from_user_id').notNull().references(() => users.id),
  to_user_id: integer('to_user_id').notNull().references(() => users.id),
  note: text('note'),
  status: text('status').notNull().default('pending'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Season patronage system ──────────────────────────────────────────────────

export const seasonPatronages = pgTable('season_patronages', {
  id: serial('id').primaryKey(),
  location_id: integer('location_id').notNull().references(() => businesses.id),
  season_year: integer('season_year').notNull(),
  price_per_year_cents: integer('price_per_year_cents').notNull(),
  years_claimed: integer('years_claimed'), // null = available
  patron_user_id: integer('patron_user_id').references(() => users.id),
  platform_cut_cents: integer('platform_cut_cents').notNull().default(0),
  status: text('status').notNull().default('available'), // available | pending | claimed
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  claimed_at: timestamp('claimed_at'),
  requested_by: integer('requested_by').references(() => users.id), // operator who requested
  approved_by_admin: boolean('approved_by_admin').notNull().default(false),
  location_name: text('location_name').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const patronTokens = pgTable('patron_tokens', {
  id: serial('id').primaryKey(),
  patronage_id: integer('patronage_id').notNull().references(() => seasonPatronages.id),
  patron_user_id: integer('patron_user_id').notNull().references(() => users.id),
  season_year: integer('season_year').notNull(),
  location_name: text('location_name').notNull(),
  nfc_token: text('nfc_token').unique(),
  minted_at: timestamp('minted_at').notNull().defaultNow(),
});

// ─── Greenhouse system ────────────────────────────────────────────────────────

export const greenhouses = pgTable('greenhouses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  location: text('location').notNull(),
  description: text('description'),
  status: text('status').notNull().default('funding'), // funding | open | closed
  funding_goal_cents: integer('funding_goal_cents').notNull(),
  funded_cents: integer('funded_cents').notNull().default(0),
  founding_patron_id: integer('founding_patron_id').references(() => users.id),
  founding_years: integer('founding_years'), // 3, 5, or 10
  founding_term_ends_at: timestamp('founding_term_ends_at'),
  opened_at: timestamp('opened_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  approved_by_admin: boolean('approved_by_admin').notNull().default(false),
});

export const provenanceTokens = pgTable('provenance_tokens', {
  id: serial('id').primaryKey(),
  greenhouse_id: integer('greenhouse_id').references(() => greenhouses.id).unique(),
  // For location (business) provenance tokens
  location_id: integer('location_id').references(() => businesses.id),
  // Provenance ledger stored as JSON array of { user_id, display_name, from_year, to_year, role: 'founder' | 'patron' }
  provenance_ledger: text('provenance_ledger').notNull().default('[]'),
  nfc_token: text('nfc_token').unique(),
  minted_at: timestamp('minted_at').notNull().defaultNow(),
  greenhouse_name: text('greenhouse_name').notNull(),
  greenhouse_location: text('greenhouse_location').notNull(),
});

export const greenhouseFunding = pgTable('greenhouse_funding', {
  id: serial('id').primaryKey(),
  greenhouse_id: integer('greenhouse_id').notNull().references(() => greenhouses.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  amount_cents: integer('amount_cents').notNull(),
  years: integer('years').notNull(), // 3, 5, or 10
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  status: text('status').notNull().default('pending'), // pending | confirmed
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Messaging ────────────────────────────────────────────────────────────────

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  sender_id: integer('sender_id').notNull().references(() => users.id),
  recipient_id: integer('recipient_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  read: boolean('read').notNull().default(false),
  order_id: integer('order_id').references(() => orders.id),
  type: text('type').notNull().default('text'), // 'text' | 'offer' | 'order_confirm'
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  // E2E encryption fields — server stores ciphertext only
  encrypted: boolean('encrypted').notNull().default(false),
  ephemeral_key: text('ephemeral_key'),            // sender's ephemeral DH public key (base64)
  sender_identity_key: text('sender_identity_key'), // sender's identity public key (base64)
  one_time_pre_key_id: integer('one_time_pre_key_id'), // which OTP key was consumed
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idx_sender: index('messages_sender_idx').on(t.sender_id),
  idx_recipient: index('messages_recipient_idx').on(t.recipient_id),
}));

// ─── E2E Encryption Keys ──────────────────────────────────────────────────────

export const userKeys = pgTable('user_keys', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id).unique(),
  identity_key: text('identity_key').notNull(),          // X25519 public key, base64
  signed_pre_key: text('signed_pre_key').notNull(),      // X25519 public key, base64
  signed_pre_key_sig: text('signed_pre_key_sig').notNull(), // Ed25519 signature, base64
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const oneTimePreKeys = pgTable('one_time_pre_keys', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  key_id: integer('key_id').notNull(),
  public_key: text('public_key').notNull(), // X25519 public key, base64
  used: boolean('used').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idx_user_key: index('otpk_user_key_idx').on(t.user_id, t.key_id),
}));

// ─── BLE Beacons ─────────────────────────────────────────────────────────────

export const beacons = pgTable('beacons', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  uuid: text('uuid').notNull(),
  major: integer('major').notNull().default(1),
  minor: integer('minor').notNull().default(1),
  name: text('name'),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export const jobPostings = pgTable('job_postings', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  title: text('title').notNull(),
  description: text('description'),
  pay_cents: integer('pay_cents').notNull(),
  pay_type: text('pay_type').notNull().default('hourly'), // 'hourly' | 'salary'
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const jobApplications = pgTable('job_applications', {
  id: serial('id').primaryKey(),
  job_id: integer('job_id').notNull().references(() => jobPostings.id),
  applicant_id: integer('applicant_id').notNull().references(() => users.id),
  status: text('status').notNull().default('applied'), // 'applied' | 'scheduled' | 'hired' | 'not_hired' | 'dismissed'
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniq_application: unique().on(t.job_id, t.applicant_id),
}));

export const jobInterviews = pgTable('job_interviews', {
  id: serial('id').primaryKey(),
  application_id: integer('application_id').notNull().references(() => jobApplications.id),
  scheduled_at: timestamp('scheduled_at').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const jobLedgerEntries = pgTable('job_ledger_entries', {
  id: serial('id').primaryKey(),
  application_id: integer('application_id').notNull().references(() => jobApplications.id).unique(),
  employer_statement: text('employer_statement'),
  candidate_statement: text('candidate_statement'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Location funding (chocolate shop / house_chocolate) ──────────────────────

export const locationFunding = pgTable('location_funding', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  amount_cents: integer('amount_cents').notNull(),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  status: text('status').notNull().default('pending'), // pending | confirmed
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Collectifs ───────────────────────────────────────────────────────────────

export const collectifs = pgTable('collectifs', {
  id: serial('id').primaryKey(),
  created_by: integer('created_by').notNull().references(() => users.id),
  business_id: integer('business_id').references(() => businesses.id),
  business_name: text('business_name').notNull(),
  collectif_type: text('collectif_type').notNull().default('product'), // 'product' | 'popup'
  title: text('title').notNull(),
  description: text('description'),
  proposed_discount_pct: integer('proposed_discount_pct').notNull().default(0),
  price_cents: integer('price_cents').notNull(),
  proposed_venue: text('proposed_venue'),
  proposed_date: text('proposed_date'),
  target_quantity: integer('target_quantity').notNull(),
  current_quantity: integer('current_quantity').notNull().default(0),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('open'), // open | funded | expired | cancelled
  business_response: text('business_response').default('pending'), // pending | accepted | declined
  business_response_note: text('business_response_note'),
  responded_at: timestamp('responded_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Verification payments (initial $111 fee + annual $333 renewal) ──────────

export const verificationPayments = pgTable('verification_payments', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // 'initial' | 'renewal'
  amount_cents: integer('amount_cents').notNull(),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  stripe_client_secret: text('stripe_client_secret'),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid'
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Portal ID attestation log (append-only, never overwritten) ──────────────

export const idAttestationLog = pgTable('id_attestation_log', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  attested_by: integer('attested_by').notNull().references(() => users.id),
  attested_at: timestamp('attested_at').notNull().defaultNow(),
  outcome: text('outcome').notNull().default('pending'), // 'pending' | 'verified' | 'failed' | 'expired'
  stripe_session_id: text('stripe_session_id'),
  id_verified_name: text('id_verified_name'),
  id_verified_dob: text('id_verified_dob'),
});

export const collectifCommitments = pgTable('collectif_commitments', {
  id: serial('id').primaryKey(),
  collectif_id: integer('collectif_id').notNull().references(() => collectifs.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  quantity: integer('quantity').notNull().default(1),
  amount_paid_cents: integer('amount_paid_cents').notNull(),
  payment_intent_id: text('payment_intent_id').unique(),
  status: text('status').notNull().default('pending'), // pending | captured | refunded
  committed_at: timestamp('committed_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Content tokens (minted from portal posts) ────────────────────────────────
// Each verified creator post mints one content token. Visuals are seeded from
// the post ID; mechanics are auto-generated deterministically. Rarity is based
// on the token's sequential number within the creator's portfolio.

export const contentTokens = pgTable('content_tokens', {
  id: serial('id').primaryKey(),
  portal_post_id: integer('portal_post_id').notNull().references(() => portalContent.id).unique(),
  creator_user_id: integer('creator_user_id').notNull().references(() => users.id),
  current_owner_id: integer('current_owner_id').notNull().references(() => users.id),
  token_number: integer('token_number').notNull(), // sequential per creator
  // Visual properties (same fields as order tokens, computed at mint time)
  visual_size: integer('visual_size').notNull(),
  visual_color: text('visual_color').notNull(),
  visual_seeds: integer('visual_seeds').notNull(),
  visual_irregularity: integer('visual_irregularity').notNull(),
  // Card game mechanic (deterministic, computed at mint time)
  mechanic_archetype: text('mechanic_archetype').notNull(), // 'allure'|'power'|'grace'|'shadow'|'fire'
  mechanic_power: integer('mechanic_power').notNull(),       // 1–100
  mechanic_rarity: text('mechanic_rarity').notNull(),        // 'common'|'rare'|'legendary'
  mechanic_effect: text('mechanic_effect').notNull(),        // short text description
  // Physical card fulfillment (null = not requested)
  print_status: text('print_status'),       // null | 'requested' | 'printing' | 'shipped'
  shipping_address: text('shipping_address'), // JSON string when requested
  print_requested_at: timestamp('print_requested_at'),
  minted_at: timestamp('minted_at').notNull().defaultNow(),
});

export const contentTokenTrades = pgTable('content_token_trades', {
  id: serial('id').primaryKey(),
  token_id: integer('token_id').notNull().references(() => contentTokens.id),
  from_user_id: integer('from_user_id').notNull().references(() => users.id),
  to_user_id: integer('to_user_id').notNull().references(() => users.id),
  traded_at: timestamp('traded_at').notNull().defaultNow(),
  note: text('note'),
});

export const contentTokenTradeOffers = pgTable('content_token_trade_offers', {
  id: serial('id').primaryKey(),
  token_id: integer('token_id').notNull().references(() => contentTokens.id),
  from_user_id: integer('from_user_id').notNull().references(() => users.id),
  to_user_id: integer('to_user_id').notNull().references(() => users.id),
  note: text('note'),
  status: text('status').notNull().default('pending'), // 'pending'|'accepted'|'declined'
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Tournaments ──────────────────────────────────────────────────────────────
// In-person card game competitions. Entry fees pool into the prize pot.
// Platform takes a cut (platform_cut_bps basis points) on payout.

export const tournaments = pgTable('tournaments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  entry_fee_cents: integer('entry_fee_cents').notNull(),
  prize_pool_cents: integer('prize_pool_cents').notNull().default(0),
  platform_cut_bps: integer('platform_cut_bps').notNull().default(1000),       // 10% platform fee
  creator_play_pool_bps: integer('creator_play_pool_bps').notNull().default(1500), // 15% distributed by card plays
  creator_win_bonus_bps: integer('creator_win_bonus_bps').notNull().default(500),  // 5% split among winning deck creators
  status: text('status').notNull().default('open'), // 'open'|'in_progress'|'closed'|'paid_out'
  max_entries: integer('max_entries'),
  starts_at: timestamp('starts_at'),
  ends_at: timestamp('ends_at'),
  created_by: integer('created_by').notNull().references(() => users.id),
  winner_user_id: integer('winner_user_id').references(() => users.id),
  winner_payout_cents: integer('winner_payout_cents'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const tournamentEntries = pgTable('tournament_entries', {
  id: serial('id').primaryKey(),
  tournament_id: integer('tournament_id').notNull().references(() => tournaments.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  stripe_client_secret: text('stripe_client_secret'),
  amount_cents: integer('amount_cents').notNull(),
  status: text('status').notNull().default('pending'), // 'pending'|'paid'
  entered_at: timestamp('entered_at').notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.tournament_id, t.user_id),
}));

// ─── Tournament decks ─────────────────────────────────────────────────────────
// A user registers up to N content tokens as their "deck" before or during a
// tournament. content_token_ids is a JSONB array of contentTokens.id integers.

export const tournamentDecks = pgTable('tournament_decks', {
  id: serial('id').primaryKey(),
  tournament_id: integer('tournament_id').notNull().references(() => tournaments.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  content_token_ids: jsonb('content_token_ids').notNull().$type<number[]>(),
  registered_at: timestamp('registered_at').notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.tournament_id, t.user_id),
}));

// ─── Card play events ─────────────────────────────────────────────────────────
// Recorded each time a player NFC-taps a card during a live tournament game.
// This drives the per-play micropayment calculation at tournament close.

export const cardPlayEvents = pgTable('card_play_events', {
  id: serial('id').primaryKey(),
  tournament_id: integer('tournament_id').notNull().references(() => tournaments.id),
  player_user_id: integer('player_user_id').notNull().references(() => users.id),
  content_token_id: integer('content_token_id').notNull().references(() => contentTokens.id),
  played_at: timestamp('played_at').notNull().defaultNow(),
});

// ─── Creator earnings ─────────────────────────────────────────────────────────
// Ledger of amounts owed to creators from tournament play/win events.
// paid_out flips to true once funds have been transferred (future Stripe Connect).

export const creatorEarnings = pgTable('creator_earnings', {
  id: serial('id').primaryKey(),
  creator_user_id: integer('creator_user_id').notNull().references(() => users.id),
  tournament_id: integer('tournament_id').notNull().references(() => tournaments.id),
  content_token_id: integer('content_token_id').references(() => contentTokens.id),
  source: text('source').notNull(), // 'card_play' | 'win_bonus'
  amount_cents: integer('amount_cents').notNull(),
  paid_out: boolean('paid_out').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Creator payout requests ──────────────────────────────────────────────────
// A creator requests payout of their accumulated pending earnings.
// Admin reviews and processes manually; paid_out on creatorEarnings is set on completion.

export const creatorPayoutRequests = pgTable('creator_payout_requests', {
  id: serial('id').primaryKey(),
  creator_user_id: integer('creator_user_id').notNull().references(() => users.id),
  amount_cents: integer('amount_cents').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid'
  created_at: timestamp('created_at').notNull().defaultNow(),
  paid_at: timestamp('paid_at'),
});

// ─── Ventures ─────────────────────────────────────────────────────────────────
// Persistent work projects. ceo_type 'dorotka' = AI-led worker co-op,
// 'human' = conventional human-led org. Both coexist on the platform.

export const ventures = pgTable('ventures', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ceo_type: text('ceo_type').notNull().default('human'), // 'human' | 'dorotka'
  ceo_user_id: integer('ceo_user_id').references(() => users.id), // null when ceo_type = 'dorotka'
  created_by: integer('created_by').notNull().references(() => users.id),
  status: text('status').notNull().default('active'), // 'active' | 'closed'
  fraise_cut_bps: integer('fraise_cut_bps').notNull().default(500), // 5%
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const ventureMembers = pgTable('venture_members', {
  id: serial('id').primaryKey(),
  venture_id: integer('venture_id').notNull().references(() => ventures.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  role: text('role').notNull().default('worker'), // 'owner' | 'worker' | 'contractor'
  joined_at: timestamp('joined_at').notNull().defaultNow(),
}, (t) => ({
  uniq_member: unique().on(t.venture_id, t.user_id),
}));

export const ventureRevenueSplits = pgTable('venture_revenue_splits', {
  id: serial('id').primaryKey(),
  venture_id: integer('venture_id').notNull().references(() => ventures.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  share_bps: integer('share_bps').notNull(), // basis points of revenue after fraise cut
}, (t) => ({
  uniq_split: unique().on(t.venture_id, t.user_id),
}));

export const venturePosts = pgTable('venture_posts', {
  id: serial('id').primaryKey(),
  venture_id: integer('venture_id').notNull().references(() => ventures.id),
  author_user_id: integer('author_user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Earnings ledger ──────────────────────────────────────────────────────────

export const earningsLedger = pgTable('earnings_ledger', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  venture_id: integer('venture_id'), // which venture generated this
  order_id: integer('order_id'),     // which order triggered this credit (for idempotency)
  amount_cents: integer('amount_cents').notNull(),
  type: text('type').notNull(),      // 'credit' | 'debit'
  description: text('description'),
  stripe_transfer_id: text('stripe_transfer_id'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Ad network ───────────────────────────────────────────────────────────────

export const adCampaigns = pgTable('ad_campaigns', {
  id: serial('id').primaryKey(),
  business_id: integer('business_id').notNull().references(() => businesses.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  type: text('type').notNull().default('proximity'), // 'proximity' | 'remote'
  value_cents: integer('value_cents').notNull(),     // payout per accepted impression
  budget_cents: integer('budget_cents').notNull().default(0),
  spent_cents: integer('spent_cents').notNull().default(0),
  active: boolean('active').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const adImpressions = pgTable('ad_impressions', {
  id: serial('id').primaryKey(),
  campaign_id: integer('campaign_id').notNull().references(() => adCampaigns.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  accepted: boolean('accepted'),       // null = pending, true = accepted, false = denied
  payout_cents: integer('payout_cents').notNull(),
  responded_at: timestamp('responded_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Portrait tokens ──────────────────────────────────────────────────────────

export const portraitTokens = pgTable('portrait_tokens', {
  id: serial('id').primaryKey(),
  nfc_uid: text('nfc_uid').unique(),
  owner_id: integer('owner_id').notNull().references(() => users.id),
  original_owner_id: integer('original_owner_id').notNull().references(() => users.id),
  image_url: text('image_url').notNull(),
  shot_at: timestamp('shot_at'),
  minted_by: integer('minted_by').notNull().references(() => users.id),
  minted_at: timestamp('minted_at').notNull().defaultNow(),
  handle_visible: boolean('handle_visible').notNull().default(false),
  instagram_handle: text('instagram_handle'),
  open_to_licensing: boolean('open_to_licensing').notNull().default(true),
  status: text('status').notNull().default('active'), // 'active' | 'listed' | 'transferred'
});

export const portraitLicenseRequests = pgTable('portrait_license_requests', {
  id: serial('id').primaryKey(),
  token_id: integer('token_id').notNull().references(() => portraitTokens.id),
  requesting_businesses: jsonb('requesting_businesses').notNull().$type<Array<{ id: number; name: string; contribution_cents: number }>>(),
  scope: text('scope').notNull().default('in_app'), // 'in_app' | 'regional_print' | 'global'
  duration_months: integer('duration_months').notNull().default(3),
  total_offered_cents: integer('total_offered_cents').notNull(),
  commission_cents: integer('commission_cents').notNull().default(0),
  subject_cents: integer('subject_cents').notNull().default(0),
  handle_visible: boolean('handle_visible').notNull().default(false),
  message: text('message'),
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'declined' | 'expired'
  expires_at: timestamp('expires_at').notNull(),
  accepted_at: timestamp('accepted_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const portraitLicenses = pgTable('portrait_licenses', {
  id: serial('id').primaryKey(),
  token_id: integer('token_id').notNull().references(() => portraitTokens.id),
  request_id: integer('request_id').notNull().references(() => portraitLicenseRequests.id).unique(),
  active_from: timestamp('active_from').notNull().defaultNow(),
  active_until: timestamp('active_until').notNull(),
  scope: text('scope').notNull(),
  impression_rate_cents: integer('impression_rate_cents').notNull().default(5),
  total_impressions: integer('total_impressions').notNull().default(0),
  total_earned_cents: integer('total_earned_cents').notNull().default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const portraitTokenListings = pgTable('portrait_token_listings', {
  id: serial('id').primaryKey(),
  token_id: integer('token_id').notNull().references(() => portraitTokens.id).unique(),
  seller_user_id: integer('seller_user_id').notNull().references(() => users.id),
  asking_price_cents: integer('asking_price_cents').notNull(),
  status: text('status').notNull().default('listed'), // 'listed' | 'sold' | 'cancelled'
  buyer_user_id: integer('buyer_user_id').references(() => users.id),
  sold_at: timestamp('sold_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Evening tokens ───────────────────────────────────────────────────────────

export const eveningTokens = pgTable('evening_tokens', {
  id: serial('id').primaryKey(),
  booking_id: integer('booking_id').notNull().unique(),
  user_a_id: integer('user_a_id').notNull(),
  user_b_id: integer('user_b_id').notNull(),
  business_id: integer('business_id').notNull(),
  offer_id: integer('offer_id').notNull(),
  window_closes_at: timestamp('window_closes_at').notNull(),
  user_a_confirmed: boolean('user_a_confirmed').notNull().default(false),
  user_b_confirmed: boolean('user_b_confirmed').notNull().default(false),
  minted_at: timestamp('minted_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── fraise.market ────────────────────────────────────────────────────────────

export const marketVendors = pgTable('market_vendors', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id).unique(),
  name: text('name').notNull(),
  description: text('description'),
  instagram_handle: text('instagram_handle'),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const marketListings = pgTable('market_listings', {
  id: serial('id').primaryKey(),
  vendor_id: integer('vendor_id').notNull().references(() => marketVendors.id),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull().default('other'), // fruit/vegetable/herb/grain/dairy/other
  unit_type: text('unit_type').notNull().default('per_item'), // per_item/per_bunch/per_100g/per_kg
  unit_label: text('unit_label').notNull().default('each'), // 'each', 'bunch', '100g', 'kg'
  price_cents: integer('price_cents').notNull(),
  stock_quantity: integer('stock_quantity').notNull().default(0),
  tags: text('tags').array().default([]), // high-fiber, high-vitamin-c, high-protein, etc.
  available_from: timestamp('available_from').notNull(),
  available_until: timestamp('available_until').notNull(),
  is_available: boolean('is_available').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const marketOrders = pgTable('market_orders_v2', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'), // pending/confirmed/collected/cancelled
  total_cents: integer('total_cents').notNull().default(0),
  nfc_collected_at: timestamp('nfc_collected_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const marketOrderItems = pgTable('market_order_items', {
  id: serial('id').primaryKey(),
  order_id: integer('order_id').notNull().references(() => marketOrders.id),
  listing_id: integer('listing_id').notNull().references(() => marketListings.id),
  listing_name: text('listing_name').notNull(), // snapshot at time of order
  quantity: integer('quantity').notNull().default(1),
  unit_price_cents: integer('unit_price_cents').notNull(),
});

// ─── AR Video platform ────────────────────────────────────────────────────────

export const arVideoStatusEnum = pgEnum('ar_video_status', [
  'abstract_submitted', 'abstract_declined',
  'commissioned',
  'processing', 'processing_failed',
  'submitted', 'published', 'declined',
]);

export const arVideos = pgTable('ar_videos', {
  id: serial('id').primaryKey(),
  author_user_id: integer('author_user_id').notNull().references(() => users.id),
  variety_id: integer('variety_id').references(() => varieties.id),
  abstract: text('abstract'),
  title: text('title'),
  description: text('description'),
  tag: text('tag'),
  status: arVideoStatusEnum('status').notNull().default('abstract_submitted'),
  source_video_url: text('source_video_url'),
  luma_task_id: text('luma_task_id'),
  luma_scene_url: text('luma_scene_url'),
  splat_url: text('splat_url'),
  thumbnail_url: text('thumbnail_url'),
  commission_cents: integer('commission_cents'),
  editor_note: text('editor_note'),
  published_at: timestamp('published_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const varietyReviews = pgTable('variety_reviews', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  variety_id: integer('variety_id').notNull().references(() => varieties.id),
  rating: integer('rating').notNull(), // 1–5
  note: text('note'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const tastingFeedReactions = pgTable('tasting_feed_reactions', {
  id: serial('id').primaryKey(),
  entry_id: integer('entry_id').notNull(), // references tasting_journal.id
  user_id: integer('user_id').notNull().references(() => users.id),
  emoji: text('emoji').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Fine Art ─────────────────────────────────────────────────────────────────

export const artPitchStatusEnum = pgEnum('art_pitch_status', [
  'submitted', 'approved', 'rejected',
]);

export const artworkStatusEnum = pgEnum('artwork_status', [
  'pending_upload', 'posted', 'acquired', 'auctioned',
]);

export const artAuctionStatusEnum = pgEnum('art_auction_status', [
  'active', 'ended', 'cancelled',
]);

// User pitches a concept for a painting + grant
export const artPitches = pgTable('art_pitches', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  abstract: text('abstract').notNull(),
  reference_image_url: text('reference_image_url'),
  status: artPitchStatusEnum('status').notNull().default('submitted'),
  grant_amount_cents: integer('grant_amount_cents'),
  stripe_transfer_id: text('stripe_transfer_id'),
  admin_note: text('admin_note'),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Finished painting uploaded by artist after grant
export const artworks = pgTable('artworks', {
  id: serial('id').primaryKey(),
  pitch_id: integer('pitch_id').notNull().references(() => artPitches.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  media_url: text('media_url').notNull(),
  description: text('description'),
  status: artworkStatusEnum('status').notNull().default('posted'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Maison acquires a piece — permanent collection
export const artAcquisitions = pgTable('art_acquisitions', {
  id: serial('id').primaryKey(),
  artwork_id: integer('artwork_id').notNull().references(() => artworks.id).unique(),
  acquisition_price_cents: integer('acquisition_price_cents').notNull(),
  management_fee_annual_cents: integer('management_fee_annual_cents').notNull(),
  nfc_token_serial: text('nfc_token_serial'),
  acquired_at: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
});

// Timed auctions for non-acquired works
export const artAuctions = pgTable('art_auctions', {
  id: serial('id').primaryKey(),
  artwork_id: integer('artwork_id').notNull().references(() => artworks.id),
  reserve_price_cents: integer('reserve_price_cents').notNull(),
  starts_at: timestamp('starts_at', { withTimezone: true }).notNull(),
  ends_at: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: artAuctionStatusEnum('status').notNull().default('active'),
  winning_bid_id: integer('winning_bid_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Bids on auctions
export const artBids = pgTable('art_bids', {
  id: serial('id').primaryKey(),
  auction_id: integer('auction_id').notNull().references(() => artAuctions.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  amount_cents: integer('amount_cents').notNull(),
  stripe_payment_intent_id: text('stripe_payment_intent_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Annual management fees paid by winning collector
export const artManagementFees = pgTable('art_management_fees', {
  id: serial('id').primaryKey(),
  acquisition_id: integer('acquisition_id').notNull().references(() => artAcquisitions.id),
  collector_user_id: integer('collector_user_id').notNull().references(() => users.id),
  amount_cents: integer('amount_cents').notNull(),
  due_at: timestamp('due_at', { withTimezone: true }).notNull(),
  paid_at: timestamp('paid_at', { withTimezone: true }),
  stripe_payment_intent_id: text('stripe_payment_intent_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const batches = pgTable('batches', {
  id: serial('id').primaryKey(),
  location_id: integer('location_id').notNull().references(() => locations.id),
  variety_id: integer('variety_id').notNull().references(() => varieties.id),
  quantity_total: integer('quantity_total').notNull(),
  quantity_remaining: integer('quantity_remaining').notNull(),
  published: boolean('published').notNull().default(false),
  notes: text('notes'),
  min_quantity: integer('min_quantity').notNull().default(4),
  lead_days: integer('lead_days').notNull().default(3),
  delivery_date: date('delivery_date'),
  cutoff_at: timestamp('cutoff_at'),
  triggered_at: timestamp('triggered_at'),
  ready_at: timestamp('ready_at'),
  cancelled_at: timestamp('cancelled_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  published_at: timestamp('published_at'),
  closed_at: timestamp('closed_at'),
});

export const walkInTokens = pgTable('walk_in_tokens', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),
  location_id: integer('location_id').notNull().references(() => locations.id),
  variety_id: integer('variety_id').notNull().references(() => varieties.id),
  claimed: boolean('claimed').notNull().default(false),
  claimed_order_id: integer('claimed_order_id'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const locationStaffStatusEnum = pgEnum('location_staff_status', ['pending', 'approved', 'denied']);

export const standingOrders = pgTable('standing_orders', {
  id: serial('id').primaryKey(),
  sender_id: integer('sender_id').notNull().references(() => users.id),
  recipient_id: integer('recipient_id').references(() => users.id),
  variety_id: integer('variety_id').notNull().references(() => varieties.id),
  location_id: integer('location_id').notNull().references(() => locations.id),
  quantity: integer('quantity').notNull().default(1),
  chocolate: chocolateEnum('chocolate').notNull(),
  finish: finishEnum('finish').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'paused' | 'cancelled'
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const locationStaff = pgTable('location_staff', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  location_id: integer('location_id').notNull().references(() => locations.id),
  status: locationStaffStatusEnum('status').notNull().default('pending'),
  requested_at: timestamp('requested_at').notNull().defaultNow(),
  reviewed_at: timestamp('reviewed_at'),
}, (table) => ({
  uniq: unique().on(table.user_id, table.location_id),
}));

// ── Fraise Device System ─────────────────────────────────────────────────────

export const deviceRoleEnum = pgEnum('device_role', ['user', 'employee', 'chocolatier']);

/// Cardputer/hardware devices registered to the platform.
/// device_address is the Ethereum address derived from the device's on-chip key.
export const devices = pgTable('devices', {
  id: serial('id').primaryKey(),
  device_address: text('device_address').notNull().unique(), // lowercase 0x…
  user_id: integer('user_id').notNull().references(() => users.id),
  role: deviceRoleEnum('role').notNull().default('user'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

/// Short-lived pairing codes generated by the app and entered on the device.
export const devicePairingTokens = pgTable('device_pairing_tokens', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),
  user_id: integer('user_id').notNull().references(() => users.id),
  expires_at: timestamp('expires_at').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Sticker Gifts ────────────────────────────────────────────────────────────

export const gifts = pgTable('gifts', {
  id: serial('id').primaryKey(),
  sender_user_id: integer('sender_user_id').notNull().references(() => users.id),
  recipient_email: text('recipient_email'),           // email or phone required
  recipient_phone: text('recipient_phone'),           // E.164 format e.g. +14035551234
  gift_type: text('gift_type').notNull(),             // 'digital' | 'physical' | 'bundle'
  amount_cents: integer('amount_cents').notNull(),
  claim_token: text('claim_token').notNull().unique(),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid' | 'claimed'
  payment_intent_id: text('payment_intent_id'),
  // Physical fulfillment — collected from recipient on claim
  shipping_name: text('shipping_name'),
  shipping_address: text('shipping_address'),
  shipping_city: text('shipping_city'),
  shipping_province: text('shipping_province'),
  shipping_postal_code: text('shipping_postal_code'),
  // Sticker marketplace — which business sticker was sent
  sticker_business_id: integer('sticker_business_id').references(() => businesses.id),
  business_revenue_cents: integer('business_revenue_cents'), // 25% of amount, held for payout
  is_outreach: boolean('is_outreach').notNull().default(false), // sent to a non-platform business as an intro
  // Digital fulfillment
  claimed_by_user_id: integer('claimed_by_user_id').references(() => users.id),
  claimed_at: timestamp('claimed_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idx_sender: index('gifts_sender_user_id_idx').on(t.sender_user_id),
  idx_recipient_email: index('gifts_recipient_email_idx').on(t.recipient_email),
  idx_sticker_biz: index('gifts_sticker_business_id_idx').on(t.sticker_business_id),
}));

// ─── Platform credit ──────────────────────────────────────────────────────────

export const pendingCreditTransfers = pgTable('pending_credit_transfers', {
  id: serial('id').primaryKey(),
  from_user_id: integer('from_user_id').notNull().references(() => users.id),
  recipient_email: text('recipient_email'),
  recipient_phone: text('recipient_phone'),
  amount_cents: integer('amount_cents').notNull(),
  claim_token: text('claim_token').notNull().unique(),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid' | 'claimed'
  payment_intent_id: text('payment_intent_id').unique(),
  note: text('note'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const creditTransactions = pgTable('credit_transactions', {
  id: serial('id').primaryKey(),
  from_user_id: integer('from_user_id').references(() => users.id),   // null = platform grant
  to_user_id: integer('to_user_id').notNull().references(() => users.id),
  amount_cents: integer('amount_cents').notNull(),
  type: text('type').notNull(),  // 'transfer' | 'applied'
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  note: text('note'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Community fund ───────────────────────────────────────────────────────────

export const communityFund = pgTable('community_fund', {
  id: serial('id').primaryKey(),
  balance_cents: integer('balance_cents').notNull().default(0),
  total_raised_cents: integer('total_raised_cents').notNull().default(0),
  threshold_cents: integer('threshold_cents').notNull().default(110000),
  popup_count: integer('popup_count').notNull().default(0),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const communityFundContributions = pgTable('community_fund_contributions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => users.id),
  amount_cents: integer('amount_cents').notNull().default(200),
  order_type: text('order_type').notNull(), // 'popup_food' | 'popup_merch' | 'box_order' | 'direct'
  stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// @final-audit
