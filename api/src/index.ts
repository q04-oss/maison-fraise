import 'dotenv/config';
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? '',
  tracesSampleRate: 0.2,
  environment: process.env.NODE_ENV ?? 'production',
});

const REQUIRED_ENV = ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

import cron from 'node-cron';
import { and, eq, lte, gte, sql, isNull } from 'drizzle-orm';
import app from './app';
import { db } from './db';
import { employmentContracts, standingOrders, orders, varieties, popupRsvps, users, membershipFunds, memberships } from './db/schema';
import { seed } from './db/seed';
import { logger } from './lib/logger';
import { sendPushNotification } from './lib/push';
import { sendDailySummary } from './lib/resend';
import { stripe } from './lib/stripe';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

// Run every day at 02:00 — mark expired active contracts as completed
cron.schedule('0 2 * * *', async () => {
  try {
    await db.update(employmentContracts)
      .set({ status: 'completed' })
      .where(and(eq(employmentContracts.status, 'active'), lte(employmentContracts.ends_at, new Date())));
    console.log('[cron] Expired contracts completed');
  } catch (e) { console.error('[cron] contract expire error', e); }
});

// Run every day at 08:00 — process standing orders + send daily summary
cron.schedule('0 8 * * *', async () => {
  // ── Standing orders ──────────────────────────────────────────────────────
  try {
    const activeStanding = await db
      .select()
      .from(standingOrders)
      .where(eq(standingOrders.status, 'active'));

    for (const so of activeStanding) {
      try {
        // Find the first time slot for this location today, if any
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);

        const [variety] = await db.select({ price_cents: varieties.price_cents }).from(varieties).where(eq(varieties.id, so.variety_id));
        const priceCents = variety?.price_cents ?? 0;

        // Get a default time slot for the location (first available today)
        const [slot] = await db
          .select({ id: sql<number>`id` })
          .from(sql`time_slots`)
          .where(sql`location_id = ${so.location_id} AND date = ${todayStr}`)
          .limit(1) as { id: number }[];

        // We need a time_slot_id — skip if none found for today
        if (!slot) {
          logger.warn(`[cron] No time slot found for standing order ${so.id} location ${so.location_id} on ${todayStr}`);
          continue;
        }

        // Get sender info
        const [sender] = await db.select({ email: users.email, push_token: users.push_token, stripe_customer_id: users.stripe_customer_id }).from(users).where(eq(users.id, so.sender_id));
        if (!sender) continue;

        const totalCents = priceCents * so.quantity;

        const [newOrder] = await db.insert(orders).values({
          variety_id: so.variety_id,
          location_id: so.location_id,
          time_slot_id: slot.id,
          chocolate: so.chocolate,
          finish: so.finish,
          quantity: so.quantity,
          is_gift: so.recipient_id != null,
          total_cents: totalCents,
          status: 'pending',
          customer_email: sender.email,
        }).returning();

        // Attempt Stripe off-session charge if customer has a saved payment method
        if (sender.stripe_customer_id) {
          try {
            const customer = await stripe.customers.retrieve(sender.stripe_customer_id) as import('stripe').Stripe.Customer;
            const defaultPm = customer.invoice_settings?.default_payment_method;
            if (defaultPm) {
              const pi = await stripe.paymentIntents.create({
                amount: totalCents,
                currency: 'cad',
                customer: sender.stripe_customer_id,
                payment_method: typeof defaultPm === 'string' ? defaultPm : defaultPm.id,
                confirm: true,
                off_session: true,
                metadata: { type: 'standing_order', order_id: String(newOrder.id) },
              });
              if (pi.status === 'succeeded') {
                await db.update(orders).set({ status: 'paid', stripe_payment_intent_id: pi.id }).where(eq(orders.id, newOrder.id));
              }
            }
          } catch (payErr) {
            logger.error(`[cron] Stripe charge failed for standing order ${so.id}`, payErr);
            if (sender.push_token) {
              sendPushNotification(sender.push_token, {
                title: 'Payment failed',
                body: 'Payment failed for your standing order. Please update your payment method.',
                data: { screen: 'order-history' },
              }).catch((e: unknown) => logger.error('[cron] Push notification error', e));
            }
          }
        }

        // Send push notification if sender has a token
        if (sender.push_token) {
          sendPushNotification(sender.push_token, {
            title: 'Standing order queued',
            body: 'Your standing order has been queued for today.',
            data: { screen: 'order-history' },
          }).catch((e: unknown) => logger.error('[cron] Push notification error', e));
        }
      } catch (soErr) {
        logger.error(`[cron] Standing order ${so.id} processing error`, soErr);
      }
    }
    console.log(`[cron] Standing orders processed (${activeStanding.length})`);
  } catch (e) { console.error('[cron] Standing orders error', e); }

  // ── Daily summary email ──────────────────────────────────────────────────
  try {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const [orderCountRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(orders)
      .where(gte(orders.created_at, todayMidnight));

    const [rsvpCountRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(popupRsvps)
      .where(and(eq(popupRsvps.status, 'paid'), gte(popupRsvps.created_at, todayMidnight)));

    const lowStockRows = await db
      .select({ name: varieties.name, stock_remaining: varieties.stock_remaining })
      .from(varieties)
      .where(lte(varieties.stock_remaining, 3));

    const operatorEmail = process.env.OPERATOR_EMAIL ?? 'operator@box-fraise.com';
    await sendDailySummary(operatorEmail, {
      orderCount: orderCountRow?.count ?? 0,
      rsvpCount: rsvpCountRow?.count ?? 0,
      lowStockVarieties: lowStockRows,
    });
    console.log('[cron] Daily summary email sent');
  } catch (e) { console.error('[cron] Daily summary error', e); }
});

// Run every day at 09:00 — send membership renewal reminders for memberships expiring within 30 days
cron.schedule('0 9 * * *', async () => {
  try {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in29Days = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000);

    // Find active memberships expiring between 29 and 30 days from now (send only once at this threshold)
    const expiring = await db
      .select({
        id: memberships.id,
        user_id: memberships.user_id,
        renews_at: memberships.renews_at,
        renewal_notified_at: memberships.renewal_notified_at,
      })
      .from(memberships)
      .where(
        and(
          eq(memberships.status, 'active'),
          lte(memberships.renews_at, in30Days),
          gte(memberships.renews_at, in29Days),
          isNull(memberships.renewal_notified_at),
        ),
      );

    for (const m of expiring) {
      try {
        const [user] = await db
          .select({ push_token: users.push_token })
          .from(users)
          .where(eq(users.id, m.user_id))
          .limit(1);

        if (user?.push_token && m.renews_at) {
          const daysLeft = Math.ceil((new Date(m.renews_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          await sendPushNotification(user.push_token, {
            title: 'Membership renewing soon',
            body: `Your Box Fraise membership renews in ${daysLeft} days. Tap to review.`,
            data: { screen: 'membership' },
          });
        }

        await db
          .update(memberships)
          .set({ renewal_notified_at: now })
          .where(eq(memberships.id, m.id));
      } catch (e) { logger.error(`[cron] renewal notify error for membership ${m.id}`, e); }
    }

    console.log(`[cron] Renewal reminders sent (${expiring.length})`);
  } catch (e) { console.error('[cron] renewal reminder error', e); }
});

// Run January 1st at 00:01 — reset membership fund balances and expire memberships
cron.schedule('1 0 1 1 *', async () => {
  try {
    await db.update(membershipFunds).set({ balance_cents: 0, cycle_start: new Date(), updated_at: new Date() });
    await db.update(memberships).set({ status: 'expired' }).where(and(eq(memberships.status, 'active'), lte(memberships.renews_at, new Date())));
    console.log('[cron] Annual membership fund reset complete');
  } catch (e) { console.error('[cron] fund reset error', e); }
});

async function main(): Promise<void> {
  try {
    await seed();
  } catch (err) {
    logger.warn('Seed skipped — continuing startup', err);
  }

  app.listen(PORT, () => {
    logger.info(`Box Fraise API running on port ${PORT}`);
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
