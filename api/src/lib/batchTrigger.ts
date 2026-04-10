import { and, eq, sql, lt } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { orders, batches, varieties, locations } from '../db/schema';
import { stripe } from './stripe';
import { sendBatchTriggered, sendOrderCancelled } from './resend';
import { sendPushNotification } from './push';
import { logger } from './logger';

export const MIN_QUANTITY = 4;
const LEAD_DAYS = 3;
const CUTOFF_DAYS = 7;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function checkAndTriggerBatch(
  variety_id: number,
  location_id: number,
): Promise<{ triggered: boolean; deliveryDate?: string }> {
  try {
    const cutoffTime = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000);

    // Cancel stale queued orders (older than 7 days)
    const stale = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.variety_id, variety_id),
        eq(orders.location_id, location_id),
        eq(orders.status, 'queued'),
        lt(orders.queued_at, cutoffTime),
      ));

    for (const staleOrder of stale) {
      try {
        if (staleOrder.stripe_payment_intent_id && !staleOrder.stripe_payment_intent_id.startsWith('review_') && !staleOrder.stripe_payment_intent_id.startsWith('balance_')) {
          await stripe.paymentIntents.cancel(staleOrder.stripe_payment_intent_id);
        }
        await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, staleOrder.id));

        const [variety] = await db.select({ name: varieties.name }).from(varieties).where(eq(varieties.id, staleOrder.variety_id));
        sendOrderCancelled({
          to: staleOrder.customer_email,
          varietyName: variety?.name ?? 'your order',
          quantity: staleOrder.quantity,
        }).catch(() => {});

        if (staleOrder.push_token) {
          sendPushNotification(staleOrder.push_token, {
            title: 'Order cancelled',
            body: `Your queued order for ${variety?.name ?? 'strawberries'} wasn't filled. No charge was made.`,
          }).catch(() => {});
        }
      } catch (e) {
        logger.error(`Failed to cancel stale order ${staleOrder.id}: ${String(e)}`);
      }
    }

    // Atomically claim all queued orders for this batch by transitioning to 'capturing'
    // This prevents two concurrent workers from processing the same queue
    const claimResult = await db.execute(sql`
      UPDATE orders SET status = 'capturing'
      WHERE variety_id = ${variety_id}
        AND location_id = ${location_id}
        AND status = 'queued'
      RETURNING *
    `);
    const queued = (claimResult as any).rows ?? claimResult;

    const totalQueued = queued.reduce((sum: number, o: any) => sum + o.quantity, 0);
    if (totalQueued < MIN_QUANTITY) {
      // Not enough — revert claimed orders back to queued
      if (queued.length > 0) {
        const ids = queued.map((o: any) => o.id);
        await db.execute(sql`UPDATE orders SET status = 'queued' WHERE id = ANY(${ids})`);
      }
      return { triggered: false };
    }

    // Threshold met — create the batch
    const now = new Date();
    const deliveryDate = toISODate(addDays(now, LEAD_DAYS));

    const [batch] = await db.insert(batches).values({
      location_id,
      variety_id,
      quantity_total: totalQueued,
      quantity_remaining: 0,
      published: false,
      triggered_at: now,
      delivery_date: deliveryDate,
      lead_days: LEAD_DAYS,
      min_quantity: MIN_QUANTITY,
      cutoff_at: addDays(now, CUTOFF_DAYS),
    }).returning();

    const [variety] = await db.select({ name: varieties.name }).from(varieties).where(eq(varieties.id, variety_id));
    const [location] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, location_id));

    // Capture each order's payment intent and mark paid
    for (const order of queued) {
      const nfc_token = randomUUID();
      try {
        if (
          order.stripe_payment_intent_id &&
          !order.stripe_payment_intent_id.startsWith('review_') &&
          !order.stripe_payment_intent_id.startsWith('balance_')
        ) {
          await stripe.paymentIntents.capture(order.stripe_payment_intent_id);
        }
        await db.update(orders).set({
          status: 'paid',
          batch_id: batch.id,
          nfc_token,
          payment_captured: true,
        }).where(eq(orders.id, order.id));

        // Email + push
        sendBatchTriggered({
          to: order.customer_email,
          varietyName: variety?.name ?? 'strawberries',
          chocolate: order.chocolate,
          finish: order.finish,
          quantity: order.quantity,
          totalCents: order.total_cents,
          deliveryDate,
          locationName: location?.name ?? '',
        }).catch(() => {});

        if (order.push_token) {
          sendPushNotification(order.push_token, {
            title: 'Order confirmed',
            body: `Collect from ${location?.name ?? 'the shop'} from ${deliveryDate}.`,
            data: { screen: 'order-history' },
          }).catch(() => {});
        }
      } catch (e) {
        logger.error(`Failed to capture/update order ${order.id}: ${String(e)}`);
      }
    }

    logger.info(`Batch ${batch.id} triggered: ${totalQueued} boxes, delivery ${deliveryDate}`);
    return { triggered: true, deliveryDate };
  } catch (e) {
    logger.error(`checkAndTriggerBatch failed: ${String(e)}`);
    return { triggered: false };
  }
}
