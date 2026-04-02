import 'dotenv/config';
import cron from 'node-cron';
import { and, eq, lte, gte, sql } from 'drizzle-orm';
import app from './app';
import { db } from './db';
import { employmentContracts, standingOrders, orders, varieties, popupRsvps, users } from './db/schema';
import { seed } from './db/seed';
import { logger } from './lib/logger';
import { sendPushNotification } from './lib/push';
import { sendDailySummary } from './lib/resend';

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

        // Get sender email
        const [sender] = await db.select({ email: users.email }).from(users).where(eq(users.id, so.sender_id));
        if (!sender) continue;

        await db.insert(orders).values({
          variety_id: so.variety_id,
          location_id: so.location_id,
          time_slot_id: slot.id,
          chocolate: so.chocolate,
          finish: so.finish,
          quantity: so.quantity,
          is_gift: so.recipient_id != null,
          total_cents: priceCents * so.quantity,
          status: 'pending',
          customer_email: sender.email,
        });

        // Send push notification if sender has a token
        const [senderFull] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.id, so.sender_id));
        if (senderFull?.push_token) {
          sendPushNotification(senderFull.push_token, {
            title: 'Standing order queued',
            body: 'Your standing order has been queued for today.',
            data: { screen: 'orders' },
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

    const operatorEmail = process.env.OPERATOR_EMAIL ?? 'operator@maison-fraise.com';
    await sendDailySummary(operatorEmail, {
      orderCount: orderCountRow?.count ?? 0,
      rsvpCount: rsvpCountRow?.count ?? 0,
      lowStockVarieties: lowStockRows,
    });
    console.log('[cron] Daily summary email sent');
  } catch (e) { console.error('[cron] Daily summary error', e); }
});

async function main(): Promise<void> {
  try {
    await seed();
  } catch (err) {
    logger.warn('Seed skipped — continuing startup', err);
  }

  app.listen(PORT, () => {
    logger.info(`Maison Fraise API running on port ${PORT}`);
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
