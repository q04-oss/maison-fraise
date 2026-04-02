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
} from 'drizzle-orm/pg-core';

export const chocolateEnum = pgEnum('chocolate', [
  'guanaja_70',
  'caraibe_66',
  'jivara_40',
  'ivoire_blanc',
]);

export const finishEnum = pgEnum('finish', ['plain', 'fleur_de_sel', 'or_fin']);

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'preparing',
  'ready',
  'collected',
  'cancelled',
]);

export const standingOrderFrequencyEnum = pgEnum('standing_order_frequency', [
  'weekly',
  'biweekly',
  'monthly',
]);

export const standingOrderStatusEnum = pgEnum('standing_order_status', [
  'active',
  'paused',
  'cancelled',
]);

export const giftToneEnum = pgEnum('gift_tone', [
  'warm',
  'funny',
  'poetic',
  'minimal',
]);

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
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  active: boolean('active').notNull().default(true),
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
    .notNull()
    .references(() => timeSlots.id),
  chocolate: chocolateEnum('chocolate').notNull(),
  finish: finishEnum('finish').notNull(),
  quantity: integer('quantity').notNull(),
  is_gift: boolean('is_gift').notNull().default(false),
  total_cents: integer('total_cents').notNull(),
  apple_id: text('apple_id'),
  stripe_payment_intent_id: text('stripe_payment_intent_id'),
  status: orderStatusEnum('status').notNull().default('pending'),
  customer_email: text('customer_email').notNull(),
  push_token: text('push_token'),
  gift_note: text('gift_note'),
  nfc_token: text('nfc_token').unique(),
  nfc_token_used: boolean('nfc_token_used').notNull().default(false),
  nfc_verified_at: timestamp('nfc_verified_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  apple_user_id: text('apple_user_id').unique(),
  email: text('email').notNull().unique(),
  display_name: text('display_name'),
  push_token: text('push_token'),
  verified: boolean('verified').notNull().default(false),
  verified_at: timestamp('verified_at'),
  verified_by: text('verified_by'),
  is_dj: boolean('is_dj').notNull().default(false),
  photographed: boolean('photographed').notNull().default(false),
  campaign_interest: boolean('campaign_interest').notNull().default(false),
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
  created_at: timestamp('created_at').notNull().defaultNow(),
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
});

export const standingOrders = pgTable('standing_orders', {
  id: serial('id').primaryKey(),
  sender_id: integer('sender_id')
    .notNull()
    .references(() => users.id),
  recipient_id: integer('recipient_id')
    .references(() => users.id),
  variety_id: integer('variety_id')
    .notNull()
    .references(() => varieties.id),
  chocolate: chocolateEnum('chocolate').notNull(),
  finish: finishEnum('finish').notNull(),
  quantity: integer('quantity').notNull(),
  location_id: integer('location_id')
    .notNull()
    .references(() => locations.id),
  time_slot_preference: text('time_slot_preference').notNull(),
  frequency: standingOrderFrequencyEnum('frequency').notNull(),
  next_order_date: timestamp('next_order_date').notNull(),
  stripe_subscription_id: text('stripe_subscription_id'),
  gift_tone: giftToneEnum('gift_tone'),
  status: standingOrderStatusEnum('status').notNull().default('active'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

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
  stripe_payment_intent_id: text('stripe_payment_intent_id'),
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
  stripe_payment_intent_id: text('stripe_payment_intent_id'),
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
  stripe_payment_intent_id: text('stripe_payment_intent_id'),
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
});

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
