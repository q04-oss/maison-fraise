import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
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
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
