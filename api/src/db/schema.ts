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
  verified: boolean('verified').notNull().default(false),
  verified_at: timestamp('verified_at'),
  verified_by: text('verified_by'),
  photographed: boolean('photographed').notNull().default(false),
  campaign_interest: boolean('campaign_interest').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const businesses = pgTable('businesses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  hours: text('hours'),
  contact: text('contact'),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  launched_at: timestamp('launched_at').notNull(),
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
