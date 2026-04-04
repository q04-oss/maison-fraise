/**
 * Auto-order helper: checks if a user's membership fund balance meets or exceeds
 * their active membership amount, and if so triggers a standing-order fulfilment
 * paid from the fund.
 *
 * Call this after any fund balance update (fund_contribution, portal_access,
 * editorial commission).
 */

import { eq, and, gte, desc, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '../db/schema';
import {
  membershipFunds,
  memberships,
  standingOrders,
  varieties,
  timeSlots,
  orders,
  users,
} from '../db/schema';
import { sendPushNotification } from './push';
import { logger } from './logger';

type DB = PostgresJsDatabase<typeof schema>;

export async function checkAndTriggerAutoOrder(userId: number, db: DB): Promise<void> {
  try {
    // 1. Get the user's fund balance
    const [fund] = await db
      .select({ balance_cents: membershipFunds.balance_cents })
      .from(membershipFunds)
      .where(eq(membershipFunds.user_id, userId))
      .limit(1);

    if (!fund) return;

    // 2. Get active membership to know the threshold
    const [membership] = await db
      .select({ amount_cents: memberships.amount_cents })
      .from(memberships)
      .where(and(eq(memberships.user_id, userId), eq(memberships.status, 'active')))
      .limit(1);

    if (!membership) return;

    if (fund.balance_cents < membership.amount_cents) return;

    // 3. Find the user's active standing order
    const [standingOrder] = await db
      .select()
      .from(standingOrders)
      .where(and(eq(standingOrders.sender_id, userId), eq(standingOrders.status, 'active')))
      .orderBy(desc(standingOrders.created_at))
      .limit(1);

    if (!standingOrder) {
      // No active standing order — find first active variety for a default order
      const [defaultVariety] = await db
        .select()
        .from(varieties)
        .where(and(eq(varieties.active, true), gte(varieties.stock_remaining, 1)))
        .limit(1);

      if (!defaultVariety) return;

      // Find next available time slot for the variety's location (or any location)
      const locationId = defaultVariety.location_id;
      if (!locationId) return;

      const now = new Date();
      const [slot] = await db
        .select()
        .from(timeSlots)
        .where(
          and(
            eq(timeSlots.location_id, locationId),
            gte(timeSlots.date, now.toISOString().slice(0, 10)),
          ),
        )
        .orderBy(timeSlots.date)
        .limit(1);

      if (!slot) return;

      const orderCost = defaultVariety.price_cents;

      // Get user email
      const [userRow] = await db
        .select({ email: users.email, push_token: users.push_token })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userRow) return;

      // Atomically deduct and insert order in a transaction
      const autoResult = await db.transaction(async (tx) => {
        const deducted = await tx.execute(sql`
          UPDATE membership_funds
          SET balance_cents = balance_cents - ${orderCost}, updated_at = now()
          WHERE user_id = ${userId} AND balance_cents >= ${orderCost}
        `);
        const rowCount = (deducted as any).rowCount ?? (deducted as any).rowsAffected ?? 0;
        if (rowCount === 0) return null;

        const stockDeducted = await tx.execute(sql`
          UPDATE varieties
          SET stock_remaining = stock_remaining - 1
          WHERE id = ${defaultVariety.id} AND stock_remaining >= 1
        `);
        const stockRows = (stockDeducted as any).rowCount ?? (stockDeducted as any).rowsAffected ?? 0;
        if (stockRows === 0) throw Object.assign(new Error('out_of_stock'), { expected: true });

        return tx.insert(orders).values({
          variety_id: defaultVariety.id,
          location_id: locationId,
          time_slot_id: slot.id,
          chocolate: 'guanaja_70',
          finish: 'plain',
          quantity: 1,
          is_gift: false,
          total_cents: orderCost,
          status: 'paid',
          customer_email: userRow.email,
          payment_method: 'fund',
        });
      });

      if (!autoResult) return;

      if (userRow.push_token) {
        sendPushNotification(userRow.push_token, {
          title: 'Your fund covered a standing order of strawberries.',
          body: 'Enjoy.',
          data: { screen: 'orders' },
        }).catch(() => {});
      }

      logger.info(`Auto-order (default variety) triggered for user ${userId}`);
      return;
    }

    // 4. Use the active standing order
    const variety_id = standingOrder.variety_id;
    const location_id = standingOrder.location_id;
    const quantity = standingOrder.quantity;

    // Get variety price
    const [variety] = await db
      .select({ price_cents: varieties.price_cents, name: varieties.name, stock_remaining: varieties.stock_remaining })
      .from(varieties)
      .where(eq(varieties.id, variety_id))
      .limit(1);

    if (!variety || variety.stock_remaining < quantity) return;

    const orderCost = variety.price_cents * quantity;

    if (fund.balance_cents < orderCost) return;

    // Find next available time slot for this location
    const now = new Date();
    const [slot] = await db
      .select()
      .from(timeSlots)
      .where(
        and(
          eq(timeSlots.location_id, location_id),
          gte(timeSlots.date, now.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(timeSlots.date)
      .limit(1);

    if (!slot) return;

    // Get user email and push token
    const [userRow] = await db
      .select({ email: users.email, push_token: users.push_token })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow) return;

    // Atomically deduct and insert order in a transaction
    const standingResult = await db.transaction(async (tx) => {
      const deducted = await tx.execute(sql`
        UPDATE membership_funds
        SET balance_cents = balance_cents - ${orderCost}, updated_at = now()
        WHERE user_id = ${userId} AND balance_cents >= ${orderCost}
      `);
      const rowCount = (deducted as any).rowCount ?? (deducted as any).rowsAffected ?? 0;
      if (rowCount === 0) return null;

      const stockDeducted = await tx.execute(sql`
        UPDATE varieties
        SET stock_remaining = stock_remaining - ${quantity}
        WHERE id = ${variety_id} AND stock_remaining >= ${quantity}
      `);
      const stockRows = (stockDeducted as any).rowCount ?? (stockDeducted as any).rowsAffected ?? 0;
      if (stockRows === 0) throw Object.assign(new Error('out_of_stock'), { expected: true });

      return tx.insert(orders).values({
        variety_id,
        location_id,
        time_slot_id: slot.id,
        chocolate: standingOrder.chocolate,
        finish: standingOrder.finish,
        quantity,
        is_gift: false,
        total_cents: orderCost,
        status: 'paid',
        customer_email: userRow.email,
        payment_method: 'fund',
      });
    });

    if (!standingResult) return;

    if (userRow.push_token) {
      sendPushNotification(userRow.push_token, {
        title: 'Your fund covered a standing order of strawberries.',
        body: 'Enjoy.',
        data: { screen: 'orders' },
      }).catch(() => {});
    }

    logger.info(`Auto-order triggered for user ${userId} via standing order ${standingOrder.id}`);
  } catch (err: any) {
    if (!err?.expected) logger.error('checkAndTriggerAutoOrder error', err);
  }
}
