import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { sendPushNotification } from '../lib/push';
import { logger } from '../lib/logger';

const router = Router();

// ── Schema ────────────────────────────────────────────────────────────────────

db.execute(sql`
  CREATE TABLE IF NOT EXISTS akene_purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    amount_cents INTEGER NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    confirmed BOOLEAN NOT NULL DEFAULT false,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS akene_events (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id),
    created_by_user_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ,
    capacity INTEGER NOT NULL DEFAULT 10,
    status TEXT NOT NULL DEFAULT 'inviting',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS akene_invitations (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES akene_events(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending',
    UNIQUE(event_id, user_id)
  )
`).catch(() => {});

db.execute(sql`ALTER TABLE akene_invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`).catch(() => {});

// ── Rank SQL helper ───────────────────────────────────────────────────────────
// rank_score = Σ(quantity × days_held) × (1 + events_attended × 0.1)

function rankQuery() {
  return sql`
    WITH holdings AS (
      SELECT user_id,
             SUM(quantity)::int AS akene_held,
             SUM(quantity * EXTRACT(EPOCH FROM (now() - purchased_at)) / 86400.0) AS time_score
      FROM akene_purchases WHERE confirmed = true
      GROUP BY user_id
    ),
    attended AS (
      SELECT user_id, COUNT(*)::int AS events_attended
      FROM akene_invitations WHERE status = 'accepted'
      GROUP BY user_id
    ),
    scored AS (
      SELECT u.id, u.display_name,
             h.akene_held,
             COALESCE(a.events_attended, 0) AS events_attended,
             ROUND(h.time_score * (1 + COALESCE(a.events_attended, 0) * 0.1))::bigint AS rank_score
      FROM users u
      JOIN holdings h ON h.user_id = u.id
      LEFT JOIN attended a ON a.user_id = u.id
    )
    SELECT *, ROW_NUMBER() OVER (ORDER BY rank_score DESC) AS rank_position
    FROM scored
  `;
}

// ── GET /api/akene/my ─────────────────────────────────────────────────────────

router.get('/my', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(rankQuery());
    const all  = (rows as any).rows ?? rows;
    const mine = all.find((r: any) => r.id === userId);
    if (!mine) return res.json({ akeneHeld: 0, rankScore: 0, rankPosition: null, eventsAttended: 0, totalHolders: all.length });
    const pos = all.findIndex((r: any) => r.id === userId) + 1;
    res.json({
      akeneHeld:      mine.akene_held,
      eventsAttended: mine.events_attended,
      rankScore:      Number(mine.rank_score),
      rankPosition:   pos,
      totalHolders:   all.length,
    });
  } catch (err) {
    logger.error('akene/my: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

// ── GET /api/akene/leaderboard ────────────────────────────────────────────────

router.get('/leaderboard', requireUser, async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(rankQuery());
    const all  = ((rows as any).rows ?? rows).slice(0, 100);
    res.json(all.map((r: any, i: number) => ({
      id:             r.id,
      displayName:    r.display_name,
      akeneHeld:      r.akene_held,
      eventsAttended: r.events_attended,
      rankScore:      Number(r.rank_score),
      rankPosition:   i + 1,
    })));
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ── GET /api/akene/holders/:userId ────────────────────────────────────────────

router.get('/holders/:userId', requireUser, async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.userId);
  try {
    const rows = await db.execute(rankQuery());
    const all  = (rows as any).rows ?? rows;
    const idx  = all.findIndex((r: any) => r.id === targetId);
    if (idx === -1) { res.status(404).json({ error: 'not found' }); return; }
    const r = all[idx];
    res.json({
      displayName:    r.display_name,
      akeneHeld:      r.akene_held,
      eventsAttended: r.events_attended,
      rankScore:      Number(r.rank_score),
      rankPosition:   idx + 1,
      totalHolders:   all.length,
    });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ── GET /api/akene/events/:id ─────────────────────────────────────────────────

router.get('/events/:id', requireUser, async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id);
  try {
    const row = ((await db.execute(sql`
      SELECT ae.id, ae.title, ae.description, ae.event_date, ae.capacity,
             ae.status, ae.created_at,
             b.name AS business_name,
             COUNT(ai.id) FILTER (WHERE ai.status = 'accepted')::int AS accepted_count
      FROM akene_events ae
      LEFT JOIN businesses b ON b.id = ae.business_id
      LEFT JOIN akene_invitations ai ON ai.event_id = ae.id
      WHERE ae.id = ${eventId}
      GROUP BY ae.id, b.name
    `)) as any).rows?.[0];
    if (!row) { res.status(404).json({ error: 'not found' }); return; }
    res.json({
      id:           row.id,
      title:        row.title,
      description:  row.description,
      eventDate:    row.event_date,
      capacity:     row.capacity,
      acceptedCount: row.accepted_count,
      status:       row.status,
      businessName: row.business_name,
    });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ── GET /api/akene/events/:id/attendees ───────────────────────────────────────

router.get('/events/:id/attendees', requireUser, async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id);
  try {
    // Get accepted user IDs first
    const invRows = await db.execute(sql`
      SELECT user_id FROM akene_invitations
      WHERE event_id = ${eventId} AND status = 'accepted'
    `);
    const acceptedIds: number[] = ((invRows as any).rows ?? invRows).map((r: any) => r.user_id);
    if (acceptedIds.length === 0) { res.json([]); return; }

    // Get their ranks from the full ranked list
    const rows = await db.execute(rankQuery());
    const all  = (rows as any).rows ?? rows;
    const attendees = all
      .map((r: any, i: number) => ({ ...r, rankPosition: i + 1 }))
      .filter((r: any) => acceptedIds.includes(r.id))
      .map((r: any) => ({
        id:             r.id,
        displayName:    r.display_name,
        akeneHeld:      r.akene_held,
        eventsAttended: r.events_attended,
        rankPosition:   r.rankPosition,
      }));

    res.json(attendees);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ── POST /api/akene/purchase ──────────────────────────────────────────────────

router.post('/purchase', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const quantity = Math.max(1, Math.min(10, parseInt(req.body.quantity) || 1));
  const amountCents = quantity * 12000;
  try {
    const intent = await stripe.paymentIntents.create({
      amount: amountCents, currency: 'cad',
      automatic_payment_methods: { enabled: true },
      metadata: { user_id: String(userId), quantity: String(quantity), type: 'akene' },
    });
    await db.execute(sql`
      INSERT INTO akene_purchases (user_id, quantity, amount_cents, stripe_payment_intent_id)
      VALUES (${userId}, ${quantity}, ${amountCents}, ${intent.id})
    `);
    res.json({ clientSecret: intent.client_secret, quantity, amountCents });
  } catch (err) {
    logger.error('akene/purchase: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

// ── POST /api/akene/purchase/confirm ─────────────────────────────────────────

router.post('/purchase/confirm', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { payment_intent_id } = req.body;
  if (!payment_intent_id) { res.status(400).json({ error: 'payment_intent_id required' }); return; }
  try {
    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (intent.status !== 'succeeded') { res.status(402).json({ error: 'payment not confirmed' }); return; }
    await db.execute(sql`
      UPDATE akene_purchases SET confirmed = true
      WHERE stripe_payment_intent_id = ${payment_intent_id} AND user_id = ${userId}
    `);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ── GET /api/akene/invitations ────────────────────────────────────────────────

router.get('/invitations', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT
        ai.id, ai.status, ai.sent_at, ai.expires_at, ai.responded_at,
        ae.id AS event_id, ae.title, ae.description, ae.event_date,
        ae.capacity, ae.status AS event_status,
        b.name AS business_name,
        COUNT(ai2.id) FILTER (WHERE ai2.status = 'accepted')::int AS accepted_count
      FROM akene_invitations ai
      JOIN akene_events ae ON ae.id = ai.event_id
      LEFT JOIN businesses b ON b.id = ae.business_id
      LEFT JOIN akene_invitations ai2 ON ai2.event_id = ae.id
      WHERE ai.user_id = ${userId}
      GROUP BY ai.id, ae.id, b.name
      ORDER BY ai.sent_at DESC
    `);
    res.json(((rows as any).rows ?? rows).map((r: any) => ({
      id:            r.id,
      status:        r.status,
      sentAt:        r.sent_at,
      expiresAt:     r.expires_at,
      respondedAt:   r.responded_at,
      eventId:       r.event_id,
      title:         r.title,
      description:   r.description,
      eventDate:     r.event_date,
      capacity:      r.capacity,
      acceptedCount: r.accepted_count,
      eventStatus:   r.event_status,
      businessName:  r.business_name,
    })));
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ── POST /api/akene/invitations/:id/accept ────────────────────────────────────

router.post('/invitations/:id/accept', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id);
  try {
    const inv = ((await db.execute(sql`
      SELECT ai.id, ai.status, ai.event_id, ai.expires_at,
             ae.capacity,
             COUNT(ai2.id) FILTER (WHERE ai2.status = 'accepted')::int AS accepted_count
      FROM akene_invitations ai
      JOIN akene_events ae ON ae.id = ai.event_id
      LEFT JOIN akene_invitations ai2 ON ai2.event_id = ai.event_id
      WHERE ai.id = ${id} AND ai.user_id = ${userId}
      GROUP BY ai.id, ae.capacity
      LIMIT 1
    `)) as any).rows?.[0];

    if (!inv)                                    { res.status(404).json({ error: 'not found' }); return; }
    if (inv.status !== 'pending')                { res.status(409).json({ error: 'already responded' }); return; }
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
      res.status(410).json({ error: 'invitation expired' }); return;
    }
    if (inv.accepted_count >= inv.capacity) {
      // Event full — move to waitlist
      await db.execute(sql`
        UPDATE akene_invitations SET status = 'waitlisted', responded_at = now()
        WHERE id = ${id} AND user_id = ${userId}
      `);
      res.status(200).json({ ok: true, waitlisted: true });
      return;
    }

    await db.execute(sql`
      UPDATE akene_invitations SET status = 'accepted', responded_at = now()
      WHERE id = ${id} AND user_id = ${userId}
    `);

    // Check if event just became fully seated
    const newCount = inv.accepted_count + 1;
    if (newCount >= inv.capacity) {
      await db.execute(sql`
        UPDATE akene_events SET status = 'seated' WHERE id = ${inv.event_id} AND status = 'inviting'
      `);
      // Notify the business creator
      const creator = ((await db.execute(sql`
        SELECT u.push_token FROM akene_events ae
        JOIN users u ON u.id = ae.created_by_user_id
        WHERE ae.id = ${inv.event_id} LIMIT 1
      `)) as any).rows?.[0];
      if (creator?.push_token) {
        sendPushNotification(creator.push_token, {
          title: 'all seats filled',
          body: 'every seat has been accepted. set a date to confirm the evening.',
          data: { screen: 'akene' },
        }).catch(() => {});
      }
    }

    res.json({ ok: true, waitlisted: false, seated: newCount >= inv.capacity });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ── POST /api/akene/invitations/:id/decline ───────────────────────────────────

router.post('/invitations/:id/decline', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id);
  try {
    const inv = ((await db.execute(sql`
      SELECT event_id FROM akene_invitations WHERE id = ${id} AND user_id = ${userId}
    `)) as any).rows?.[0];
    if (!inv) { res.status(404).json({ error: 'not found' }); return; }

    await db.execute(sql`
      UPDATE akene_invitations SET status = 'declined', responded_at = now()
      WHERE id = ${id} AND user_id = ${userId} AND status IN ('pending', 'accepted')
    `);

    // Promote first waitlisted user if this person was accepted
    const waiter = ((await db.execute(sql`
      SELECT ai.id, u.push_token
      FROM akene_invitations ai JOIN users u ON u.id = ai.user_id
      WHERE ai.event_id = ${inv.event_id} AND ai.status = 'waitlisted'
      ORDER BY ai.responded_at ASC LIMIT 1
    `)) as any).rows?.[0];

    if (waiter) {
      await db.execute(sql`
        UPDATE akene_invitations SET status = 'accepted', responded_at = now()
        WHERE id = ${waiter.id}
      `);
      if (waiter.push_token) {
        sendPushNotification(waiter.push_token, {
          title: 'a seat opened up',
          body: 'you\'ve been moved off the waitlist. you\'re going.',
          data: { screen: 'akene' },
        }).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ── POST /api/akene/events ────────────────────────────────────────────────────

router.post('/events', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { title, description, event_date, capacity, business_id } = req.body;
  if (!title || !capacity) { res.status(400).json({ error: 'title and capacity required' }); return; }
  try {
    const shopRow = ((await db.execute(sql`
      SELECT id FROM users WHERE id = ${userId} AND (is_shop = true OR is_dorotka = true)
    `)) as any).rows?.[0];
    if (!shopRow) { res.status(403).json({ error: 'shop access required' }); return; }

    const rows = await db.execute(sql`
      INSERT INTO akene_events (created_by_user_id, business_id, title, description, event_date, capacity)
      VALUES (${userId}, ${business_id ?? null}, ${title}, ${description ?? null},
              ${event_date ?? null}, ${capacity})
      RETURNING id, title, description, event_date, capacity, status, created_at
    `);
    res.status(201).json(((rows as any).rows ?? rows)[0]);
  } catch (err) {
    logger.error('akene/events: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

// ── POST /api/akene/events/:id/invite ────────────────────────────────────────

router.post('/events/:id/invite', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const eventId = parseInt(req.params.id);
  const { count = 20, user_ids } = req.body;

  try {
    const shopRow = ((await db.execute(sql`
      SELECT id FROM users WHERE id = ${userId} AND (is_shop = true OR is_dorotka = true)
    `)) as any).rows?.[0];
    if (!shopRow) { res.status(403).json({ error: 'shop access required' }); return; }

    let targets: { id: number; push_token: string | null }[];

    if (Array.isArray(user_ids) && user_ids.length > 0) {
      const rows = await db.execute(sql`SELECT id, push_token FROM users WHERE id = ANY(${user_ids}::int[])`);
      targets = (rows as any).rows ?? rows;
    } else {
      const rows = await db.execute(rankQuery());
      targets = ((rows as any).rows ?? rows)
        .slice(0, count)
        .map((r: any) => ({ id: r.id, push_token: null }));

      // Fetch push tokens
      const ids = targets.map((t: any) => t.id);
      if (ids.length) {
        const tokenRows = await db.execute(sql`SELECT id, push_token FROM users WHERE id = ANY(${ids}::int[])`);
        const tokenMap = new Map(((tokenRows as any).rows ?? tokenRows).map((r: any) => [r.id, r.push_token]));
        targets = targets.map((t: any) => ({ ...t, push_token: tokenMap.get(t.id) ?? null }));
      }
    }

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    let sent = 0;
    for (const t of targets) {
      try {
        await db.execute(sql`
          INSERT INTO akene_invitations (event_id, user_id, expires_at)
          VALUES (${eventId}, ${t.id}, ${expiresAt})
          ON CONFLICT (event_id, user_id) DO NOTHING
        `);
        sent++;
        if (t.push_token) {
          sendPushNotification(t.push_token, {
            title: 'you\'ve been invited',
            body: 'an evening is being planned. you have 48 hours to accept.',
            data: { screen: 'akene' },
          }).catch(() => {});
        }
      } catch {}
    }
    res.json({ sent });
  } catch (err) {
    logger.error('akene/invite: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

// ── PATCH /api/akene/events/:id/set-date ─────────────────────────────────────
// Business sets date once all seats are filled. Transitions to 'confirmed'
// and notifies all accepted guests.

router.patch('/events/:id/set-date', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const eventId = parseInt(req.params.id);
  const { event_date } = req.body;
  if (!event_date) { res.status(400).json({ error: 'event_date required' }); return; }
  try {
    const shopRow = ((await db.execute(sql`
      SELECT id FROM users WHERE id = ${userId} AND (is_shop = true OR is_dorotka = true)
    `)) as any).rows?.[0];
    if (!shopRow) { res.status(403).json({ error: 'shop access required' }); return; }

    await db.execute(sql`
      UPDATE akene_events
      SET event_date = ${event_date}, status = 'confirmed'
      WHERE id = ${eventId} AND status IN ('seated', 'inviting')
    `);

    // Notify all accepted guests
    const guests = ((await db.execute(sql`
      SELECT u.push_token FROM akene_invitations ai
      JOIN users u ON u.id = ai.user_id
      WHERE ai.event_id = ${eventId} AND ai.status = 'accepted'
        AND u.push_token IS NOT NULL
    `)) as any).rows ?? [];

    const dateLabel = new Date(event_date).toLocaleDateString('en-CA', {
      month: 'long', day: 'numeric',
    });

    for (const g of guests) {
      sendPushNotification(g.push_token, {
        title: 'evening confirmed',
        body: `the date is set: ${dateLabel}. see you there.`,
        data: { screen: 'akene' },
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ── GET /api/akene/events/mine ────────────────────────────────────────────────

router.get('/events/mine', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT ae.id, ae.title, ae.description, ae.event_date, ae.capacity, ae.status,
             ae.created_at,
             COUNT(ai.id) FILTER (WHERE ai.status = 'accepted')::int AS accepted_count,
             COUNT(ai.id) FILTER (WHERE ai.status = 'waitlisted')::int AS waitlist_count
      FROM akene_events ae
      LEFT JOIN akene_invitations ai ON ai.event_id = ae.id
      WHERE ae.created_by_user_id = ${userId}
      GROUP BY ae.id
      ORDER BY ae.created_at DESC
    `);
    res.json(((rows as any).rows ?? rows).map((r: any) => ({
      id:            r.id,
      title:         r.title,
      description:   r.description,
      eventDate:     r.event_date,
      capacity:      r.capacity,
      acceptedCount: r.accepted_count,
      waitlistCount: r.waitlist_count,
      status:        r.status,
      createdAt:     r.created_at,
    })));
  } catch { res.status(500).json({ error: 'internal' }); }
});

// ── GET /api/akene/purchases/mine ─────────────────────────────────────────────

router.get('/purchases/mine', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT id, quantity, amount_cents, purchased_at
      FROM akene_purchases
      WHERE user_id = ${userId} AND confirmed = true
      ORDER BY purchased_at DESC
    `);
    res.json(((rows as any).rows ?? rows).map((r: any) => ({
      id:          r.id,
      quantity:    r.quantity,
      amountCents: r.amount_cents,
      purchasedAt: r.purchased_at,
    })));
  } catch { res.status(500).json({ error: 'internal' }); }
});

export default router;
