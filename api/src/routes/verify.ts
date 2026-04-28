import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { orders, users, legitimacyEvents, varieties, batches } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';
import { fireWebhook } from '../lib/webhooks';
import { currentBankSeconds, tierFromBalance, effectiveTier } from '../lib/socialTier';

const router = Router();

// POST /api/verify/nfc
router.post('/nfc', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const { nfc_token } = req.body;
  if (!nfc_token) {
    res.status(400).json({ error: 'nfc_token is required' });
    return;
  }

  try {
    const [order] = await db.select().from(orders).where(eq(orders.nfc_token, nfc_token));

    if (!order) {
      res.status(403).json({ error: 'This token is invalid or has already been used.' });
      return;
    }

    const now = new Date();

    const [currentUser] = await db.select({ user_code: users.user_code, is_dj: users.is_dj }).from(users).where(eq(users.id, user_id));
    const fraiseChatEmail = currentUser?.user_code ? `${currentUser.user_code}@fraise.chat` : null;

    // Read variety's time credits and tier ceiling before transaction
    const [varietyRow] = await db
      .select({ time_credits_days: varieties.time_credits_days, social_tier: varieties.social_tier })
      .from(varieties).where(eq(varieties.id, order.variety_id));
    const creditsDays = varietyRow?.time_credits_days ?? 30;
    const creditsSeconds = creditsDays * 86400;
    const varietyCeiling = varietyRow?.social_tier ?? null;

    // Read current bank balance + streak before transaction
    const [bankRow] = await db
      .select({
        social_time_bank_seconds: users.social_time_bank_seconds,
        social_time_bank_updated_at: users.social_time_bank_updated_at,
        social_lifetime_credits_seconds: users.social_lifetime_credits_seconds,
        current_streak_weeks: users.current_streak_weeks,
        longest_streak_weeks: users.longest_streak_weeks,
        last_tap_week: users.last_tap_week,
      })
      .from(users).where(eq(users.id, user_id));

    const currentBalance = currentBankSeconds(
      bankRow?.social_time_bank_seconds ?? 0,
      bankRow?.social_time_bank_updated_at ?? null,
    );
    const newBalance = currentBalance + creditsSeconds;
    const newLifetime = (bankRow?.social_lifetime_credits_seconds ?? 0) + creditsSeconds;

    // Compute ISO week string: e.g. "2026-W14"
    const getISOWeek = (d: Date): string => {
      const jan4 = new Date(d.getFullYear(), 0, 4);
      const weekNum = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    };
    const thisWeek = getISOWeek(now);
    const lastWeek = bankRow?.last_tap_week ?? null;
    const prevStreak = bankRow?.current_streak_weeks ?? 0;
    const longestStreak = bankRow?.longest_streak_weeks ?? 0;
    let newStreak = prevStreak;
    if (lastWeek === null) {
      newStreak = 1;
    } else if (lastWeek === thisWeek) {
      newStreak = prevStreak; // already tapped this week
    } else {
      // check if last tap was the immediately preceding week
      const lastDate = new Date(now);
      lastDate.setDate(lastDate.getDate() - 7);
      const prevWeekStr = getISOWeek(lastDate);
      newStreak = lastWeek === prevWeekStr ? prevStreak + 1 : 1;
    }
    const newLongest = Math.max(longestStreak, newStreak);

    await db.transaction(async (tx) => {
      // Atomic claim: only succeeds if token not yet used AND order is paid (not already collected)
      const [claimed] = await tx.update(orders)
        .set({ nfc_token_used: true, nfc_verified_at: now, status: 'collected' })
        .where(and(eq(orders.id, order.id), eq(orders.nfc_token_used, false), eq(orders.status, 'paid')))
        .returning({ id: orders.id });

      if (!claimed) {
        throw Object.assign(new Error('already_used'), { code: 'already_used' });
      }

      await tx.update(users)
        .set({
          verified: true,
          verified_at: now,
          verified_by: 'nfc',
          social_time_bank_seconds: Math.round(newBalance),
          social_time_bank_updated_at: now,
          social_lifetime_credits_seconds: Math.round(newLifetime),
          social_tier: varietyCeiling,
          current_streak_weeks: newStreak,
          longest_streak_weeks: newLongest,
          last_tap_week: thisWeek,
          ...(fraiseChatEmail ? { fraise_chat_email: fraiseChatEmail } : {}),
        })
        .where(eq(users.id, user_id));

      await tx.insert(legitimacyEvents).values({
        user_id,
        event_type: 'nfc_verified',
        weight: 5,
      });
    });

    // Create per-user forwarding rule in ImprovMX
    if (fraiseChatEmail && currentUser?.user_code) {
      const appleEmail = order.customer_email;
      if (appleEmail && process.env.IMPROVMX_API_KEY) {
        fetch('https://api.improvmx.com/v3/domains/fraise.chat/aliases/', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`api:${process.env.IMPROVMX_API_KEY}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ alias: currentUser.user_code, forward: appleEmail }),
        }).catch((err) => { logger.error('ImprovMX alias creation failed', err); });
      }
    }

    const [variety] = await db.select({
      id: varieties.id,
      name: varieties.name,
      source_farm: varieties.source_farm,
      harvest_date: varieties.harvest_date,
    }).from(varieties).where(eq(varieties.id, order.variety_id));

    // Look up the shop user for this pickup location
    const shopRow = ((await db.execute(sql`
      SELECT u.user_code AS business_user_code, b.name AS business_name
      FROM users u
      JOIN businesses b ON b.id = u.business_id
      WHERE u.is_shop = true
        AND u.business_id = (SELECT business_id FROM locations WHERE id = ${order.location_id})
      LIMIT 1
    `)) as any).rows?.[0] ?? null;

    const tier = effectiveTier(tierFromBalance(newBalance), varietyCeiling);
    res.json({
      verified: true, user_id,
      fraise_chat_email: fraiseChatEmail,
      is_dj: currentUser?.is_dj ?? false,
      unlocked: ['standing_orders', 'campaigns'],
      quantity: order.quantity,
      variety_id: order.variety_id, variety_name: variety?.name ?? null,
      farm: variety?.source_farm ?? null, harvest_date: variety?.harvest_date ?? null,
      // Time bank
      tier,
      bank_days: Math.floor(newBalance / 86400),
      credits_added_days: creditsDays,
      lifetime_days: Math.floor(newLifetime / 86400),
      streak_weeks: newStreak,
      streak_milestone: newStreak > prevStreak && newStreak % 4 === 0,
      // Business contact
      business_user_code: shopRow?.business_user_code ?? null,
      business_name: shopRow?.business_name ?? null,
    });
  } catch (err: any) {
    if (err?.code === 'already_used') {
      res.status(403).json({ error: 'This token is invalid or has already been used.' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/verify/reorder
router.post('/reorder', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const { nfc_token } = req.body;
  if (!nfc_token) {
    res.status(400).json({ error: 'nfc_token is required' });
    return;
  }

  try {
    const [order] = await db.select().from(orders).where(eq(orders.nfc_token, nfc_token));

    if (!order || !order.nfc_token_used) {
      logger.warn(`verify/reorder: token not found or not used — token=${nfc_token.substring(0, 8)}... user=${user_id}`);
      res.status(403).json({ error: 'This token is invalid or has already been used.' });
      return;
    }

    const [user] = await db.select({ email: users.email, verified: users.verified }).from(users).where(eq(users.id, user_id));
    if (!user || !user.verified) {
      logger.warn(`verify/reorder: user not verified — user=${user_id}`);
      res.status(403).json({ error: 'This token is invalid or has already been used.' });
      return;
    }

    if (order.customer_email !== user.email) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const [variety] = await db.select({
      id: varieties.id,
      name: varieties.name,
      source_farm: varieties.source_farm,
      harvest_date: varieties.harvest_date,
    }).from(varieties).where(eq(varieties.id, order.variety_id));

    // Batch info for AR storytelling
    let batchInfo: { delivery_date: string | null; triggered_at: Date | null; notes: string | null } | null = null;
    if (order.batch_id) {
      const [batchRow] = await db.select({
        delivery_date: batches.delivery_date,
        triggered_at: batches.triggered_at,
        notes: batches.notes,
      }).from(batches).where(eq(batches.id, order.batch_id));
      if (batchRow) batchInfo = batchRow;
    }

    // Feature 3: Collectif pickups today (via collectif_commitments as membership proxy)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const collectifRows = await db.execute(sql`
      SELECT COUNT(DISTINCT le.user_id)::int AS pickup_count
      FROM legitimacy_events le
      JOIN collectif_commitments cc_self ON cc_self.user_id = ${user_id}
        AND cc_self.status = 'captured'
      JOIN collectif_commitments cc_other ON cc_other.collectif_id = cc_self.collectif_id
        AND cc_other.user_id = le.user_id
        AND cc_other.user_id != ${user_id}
        AND cc_other.status = 'captured'
      WHERE le.event_type = 'nfc_verified'
        AND le.created_at >= ${todayStart}
    `).catch(() => ({ rows: [] }));
    const collectifData = ((collectifRows as any).rows ?? collectifRows)[0];
    const collectifPickupsToday = (collectifData ?? {}).pickup_count ?? 0;

    // Feature 5: Variety streak — count collected orders for this variety by this user
    const countRows = await db.execute(sql`
      SELECT COUNT(*)::int AS order_count
      FROM orders o
      JOIN users u ON u.apple_user_id = o.apple_id
      WHERE u.id = ${user_id}
        AND o.variety_id = ${order.variety_id}
        AND o.status = 'collected'
    `).catch(() => ({ rows: [] }));
    const orderCount = (((countRows as any).rows ?? countRows)[0]?.order_count) ?? 0;

    // Feature B: last variety (most recent previous collected order with different variety or older)
    const lastVarietyRows = await db.execute(sql`
      SELECT o.variety_id, v.name, v.source_farm, v.harvest_date
      FROM orders o
      JOIN users u ON u.apple_user_id = o.apple_id
      JOIN varieties v ON v.id = o.variety_id
      WHERE u.id = ${user_id}
        AND o.id != ${order.id}
        AND o.status = 'collected'
      ORDER BY o.created_at DESC
      LIMIT 1
    `).catch(() => ({ rows: [] }));
    const lastVarietyRow = ((lastVarietyRows as any).rows ?? lastVarietyRows)[0] ?? null;
    const lastVariety = lastVarietyRow ? {
      id: lastVarietyRow.variety_id,
      name: lastVarietyRow.name,
      farm: lastVarietyRow.source_farm ?? null,
      harvest_date: lastVarietyRow.harvest_date ?? null,
    } : null;

    // Feature C: next standing order for this user
    const standingRows = await db.execute(sql`
      SELECT so.next_order_date, v.name AS variety_name
      FROM standing_orders so
      JOIN varieties v ON v.id = so.variety_id
      WHERE so.sender_id = ${user_id}
        AND so.status = 'active'
      ORDER BY so.next_order_date ASC
      LIMIT 1
    `).catch(() => ({ rows: [] }));
    const standingRow = ((standingRows as any).rows ?? standingRows)[0] ?? null;
    let nextStandingOrder: { variety_name: string; days_until: number } | null = null;
    if (standingRow?.next_order_date) {
      const nextDate = new Date(standingRow.next_order_date);
      const now = new Date();
      const diffMs = nextDate.getTime() - now.getTime();
      const daysUntil = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      nextStandingOrder = { variety_name: standingRow.variety_name, days_until: daysUntil };
    }

    // Webhook: pickup.completed
    fireWebhook(user_id, 'pickup.completed', {
      variety_name: variety?.name ?? null,
      farm: variety?.source_farm ?? null,
      quantity: order.quantity,
    }).catch(() => {});

    // Feature D: collectif member display names (up to 3)
    const collectifNameRows = await db.execute(sql`
      SELECT u.display_name
      FROM legitimacy_events le
      JOIN users u ON u.id = le.user_id
      JOIN collectif_commitments cc_self ON cc_self.user_id = ${user_id} AND cc_self.status = 'captured'
      JOIN collectif_commitments cc_other ON cc_other.collectif_id = cc_self.collectif_id
        AND cc_other.user_id = le.user_id AND cc_other.user_id != ${user_id} AND cc_other.status = 'captured'
      WHERE le.event_type = 'nfc_verified' AND le.created_at >= ${todayStart}
      LIMIT 3
    `).catch(() => ({ rows: [] }));
    const collectifMemberNames: string[] = ((collectifNameRows as any).rows ?? collectifNameRows)
      .map((r: any) => r.display_name)
      .filter((n: string | null) => !!n) as string[];

    res.json({
      variety_id: order.variety_id,
      variety_name: variety?.name ?? null,
      farm: variety?.source_farm ?? null,
      harvest_date: variety?.harvest_date ?? null,
      chocolate: order.chocolate,
      finish: order.finish,
      quantity: order.quantity,
      location_id: order.location_id,
      // Feature 3
      collectif_pickups_today: collectifPickupsToday,
      // Feature 4
      is_gift: order.is_gift ?? false,
      gift_note: order.is_gift ? (order.gift_note ?? null) : null,
      // Feature 5
      order_count: orderCount,
      // Feature B: last variety comparison
      last_variety: lastVariety,
      // Feature C: next standing order
      next_standing_order: nextStandingOrder,
      // Feature D: collectif member names
      collectif_member_names: collectifMemberNames,
      // Batch provenance
      batch_delivery_date: batchInfo?.delivery_date ?? null,
      batch_triggered_at: batchInfo?.triggered_at ?? null,
      batch_notes: batchInfo?.notes ?? null,
    });
  } catch (err) {
    logger.error('verify/reorder error: ' + String(err));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Order split migration
db.execute(sql`CREATE TABLE IF NOT EXISTS order_splits (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id),
  split_user_id integer NOT NULL REFERENCES users(id),
  split_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, split_user_id)
)`).catch(() => {});

// POST /api/verify/split
router.post('/split', requireUser, async (req: Request, res: Response) => {
  const user_id = (req as any).userId as number;
  const { nfc_token } = req.body;
  if (!nfc_token) { res.status(400).json({ error: 'nfc_token required' }); return; }
  try {
    const [order] = await db.select().from(orders).where(eq(orders.nfc_token, nfc_token));
    if (!order || !order.nfc_token_used) {
      res.status(404).json({ error: 'order_not_found' }); return;
    }

    if (!order.apple_id) {
      res.status(403).json({ error: 'not_same_collectif' }); return;
    }

    // Verify both users share a collectif
    const sharedRows = await db.execute(sql`
      SELECT 1 FROM collectif_commitments cc1
      JOIN collectif_commitments cc2 ON cc2.collectif_id = cc1.collectif_id AND cc2.user_id = ${user_id}
      JOIN users u ON u.id = cc1.user_id AND u.apple_user_id = ${order.apple_id}
      WHERE cc1.status = 'captured' AND cc2.status = 'captured'
      LIMIT 1
    `);
    if (!((sharedRows as any).rows ?? sharedRows)[0]) {
      res.status(403).json({ error: 'not_same_collectif' }); return;
    }

    await db.execute(sql`
      INSERT INTO order_splits (order_id, split_user_id) VALUES (${order.id}, ${user_id})
      ON CONFLICT DO NOTHING
    `);
    await db.insert(legitimacyEvents).values({ user_id, event_type: 'split_pickup', weight: 1 });

    const [variety] = await db.select({ name: varieties.name, source_farm: varieties.source_farm })
      .from(varieties).where(eq(varieties.id, order.variety_id));

    res.json({ split: true, variety_name: variety?.name ?? null, farm: variety?.source_farm ?? null, quantity: order.quantity });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;

// @final-audit
