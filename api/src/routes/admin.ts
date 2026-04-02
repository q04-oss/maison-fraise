import { Router, Request, Response, NextFunction } from 'express';
import { eq, isNull, sql, and, lte, sum, gte, desc, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { orders, varieties, timeSlots, campaigns, campaignSignups, businesses, users, legitimacyEvents, locations, popupRsvps, popupNominations, djOffers, portraits, popupRequests, employmentContracts, contractRequests, businessVisits, referralCodes, editorialPieces, membershipFunds, memberships, membershipWaitlist, portalAccess, portalContent } from '../db/schema';
import { logger } from '../lib/logger';
import { sendOrderReady, sendContractOffer, sendAuditionResult } from '../lib/resend';
import { sendPushNotification } from '../lib/push';
import { randomUUID } from 'crypto';
import { stripe } from '../lib/stripe';

const router = Router();

const VALID_STATUSES = ['pending', 'paid', 'preparing', 'ready', 'collected', 'cancelled'] as const;

function requirePin(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers['x-admin-pin'];
  if (!pin || pin !== process.env.ADMIN_PIN) {
    res.status(401).json({ error: 'Invalid or missing X-Admin-PIN header' });
    return;
  }
  next();
}

// POST /api/admin/campaign-commission/payment-intent — public, no PIN required
router.post('/campaign-commission/payment-intent', async (req: Request, res: Response) => {
  const { amount_cents, campaign_name, user_id } = req.body;
  if (!amount_cents || !campaign_name) { res.status(400).json({ error: 'missing_fields' }); return; }
  try {
    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      metadata: { type: 'campaign_commission', campaign_name, user_id: String(user_id ?? '') },
    });
    res.json({ client_secret: pi.client_secret });
  } catch (e) {
    res.status(500).json({ error: 'stripe_error' });
  }
});

router.use(requirePin);

// GET /api/admin/orders — all orders enriched with variety name, slot time, and worker info
router.get('/orders', async (_req: Request, res: Response) => {
  try {
    const workerAlias = { display_name: users.display_name, portal_opted_in: users.portal_opted_in };
    const rows = await db
      .select({
        id: orders.id,
        variety_id: orders.variety_id,
        variety_name: varieties.name,
        location_id: orders.location_id,
        time_slot_id: orders.time_slot_id,
        slot_date: timeSlots.date,
        slot_time: timeSlots.time,
        chocolate: orders.chocolate,
        finish: orders.finish,
        quantity: orders.quantity,
        is_gift: orders.is_gift,
        total_cents: orders.total_cents,
        stripe_payment_intent_id: orders.stripe_payment_intent_id,
        status: orders.status,
        customer_email: orders.customer_email,
        rating: orders.rating,
        rating_note: orders.rating_note,
        worker_id: orders.worker_id,
        worker_display_name: users.display_name,
        worker_portal_opted_in: users.portal_opted_in,
        created_at: orders.created_at,
      })
      .from(orders)
      .leftJoin(varieties, eq(orders.variety_id, varieties.id))
      .leftJoin(timeSlots, eq(orders.time_slot_id, timeSlots.id))
      .leftJoin(users, eq(orders.worker_id, users.id))
      .orderBy(orders.created_at);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function sendReadyNotification(pushToken: string, orderSummary: string) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title: 'Your order is ready.',
        body: `${orderSummary} — ready for collection at Marché Atwater.`,
        sound: 'default',
      }),
    });
  } catch (err) {
    logger.error('Push notification failed', err);
  }
}

// PATCH /api/admin/orders/:id/status — update order status
router.patch('/orders/:id/status', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid order id' });
    return;
  }

  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }

  try {
    const [updated] = await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    // Send push notification + email when order becomes ready
    if (status === 'ready') {
      const [variety] = await db.select({ name: varieties.name }).from(varieties).where(eq(varieties.id, updated.variety_id));
      const [slot] = await db.select({ time: timeSlots.time }).from(timeSlots).where(eq(timeSlots.id, updated.time_slot_id));
      const varietyName = variety?.name ?? 'your order';

      // Try push token from order first; fall back to user's push token
      let pushToken: string | null | undefined = updated.push_token;
      if (!pushToken && updated.apple_id) {
        const [orderUser] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.apple_user_id, updated.apple_id));
        pushToken = orderUser?.push_token;
      }
      if (!pushToken) {
        const [emailUser] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.email, updated.customer_email));
        pushToken = emailUser?.push_token;
      }

      if (pushToken) {
        sendPushNotification(pushToken, {
          title: 'Your order is ready.',
          body: 'Your order is ready for pickup.',
          data: { screen: 'order-history', order_id: updated.id },
        }).catch((err: unknown) => logger.error('Push notification failed', err));
      }

      sendOrderReady({
        to: updated.customer_email,
        varietyName,
        quantity: updated.quantity,
        slotTime: slot?.time ?? '',
      }).catch(err => logger.error('Ready email failed', err));
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/orders/:id/worker — assign a worker to an order
router.patch('/orders/:id/worker', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid order id' }); return; }
  const { worker_id } = req.body;
  if (typeof worker_id !== 'number') { res.status(400).json({ error: 'worker_id must be a number' }); return; }
  try {
    const [updated] = await db.update(orders).set({ worker_id }).where(eq(orders.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/verify-nfc — look up an order by its NFC token
router.post('/verify-nfc', async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'token is required' });
    return;
  }
  try {
    const [row] = await db
      .select({
        order_id: orders.id,
        status: orders.status,
        variety_name: varieties.name,
        quantity: orders.quantity,
        customer_email: orders.customer_email,
        created_at: orders.created_at,
      })
      .from(orders)
      .leftJoin(varieties, eq(orders.variety_id, varieties.id))
      .where(eq(orders.nfc_token, token));

    if (!row) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/orders/:id/collect — mark order as collected
router.patch('/orders/:id/collect', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid order id' });
    return;
  }
  try {
    const [updated] = await db
      .update(orders)
      .set({ status: 'collected' })
      .where(eq(orders.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/varieties — create a variety
router.post('/varieties', async (req: Request, res: Response) => {
  const { name, description, source_farm, source_location, price_cents, stock_remaining, tag } = req.body;
  if (!name || !price_cents) {
    res.status(400).json({ error: 'name and price_cents are required' });
    return;
  }
  try {
    const [variety] = await db.insert(varieties).values({
      name,
      description: description ?? null,
      source_farm: source_farm ?? null,
      source_location: source_location ?? null,
      price_cents,
      stock_remaining: stock_remaining ?? 0,
      tag: tag ?? null,
    }).returning();
    res.status(201).json(variety);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/varieties/:id/stock — update stock level
router.patch('/varieties/:id/stock', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid variety id' });
    return;
  }

  const { stock_remaining } = req.body;
  if (typeof stock_remaining !== 'number' || !Number.isInteger(stock_remaining) || stock_remaining < 0) {
    res.status(400).json({ error: 'stock_remaining must be a non-negative integer' });
    return;
  }

  try {
    const [updated] = await db
      .update(varieties)
      .set({ stock_remaining })
      .where(eq(varieties.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'Variety not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/varieties — all varieties with location info and ratings
router.get('/varieties', async (_req: Request, res: Response) => {
  try {
    const vars = await db.select().from(varieties);

    const ratings = await db.execute<{ variety_id: number; avg_rating: number; rating_count: number }>(sql`
      SELECT variety_id,
        ROUND(AVG(rating)::numeric, 1)::float as avg_rating,
        COUNT(*)::int as rating_count
      FROM orders
      WHERE rating IS NOT NULL AND variety_id IS NOT NULL
      GROUP BY variety_id
    `);
    const ratingMap = Object.fromEntries(
      (ratings as any[]).map(r => [r.variety_id, { avg_rating: r.avg_rating, rating_count: r.rating_count }])
    );
    const result = vars.map(v => ({ ...v, ...(ratingMap[v.id] ?? { avg_rating: null, rating_count: 0 }) }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/varieties/:id — update variety fields
router.patch('/varieties/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  const allowed = ['name', 'description', 'price_cents', 'active', 'location_id', 'tag', 'source_farm'];
  const body: any = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) body[key] = req.body[key];
  }
  if (Object.keys(body).length === 0) { res.status(400).json({ error: 'No valid fields to update' }); return; }
  try {
    const [updated] = await db.update(varieties).set(body).where(eq(varieties.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Variety not found' }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/campaigns
router.post('/campaigns', async (req: Request, res: Response) => {
  const { title, concept, salon_id, paying_client_id, date, total_spots } = req.body;
  if (!title || !concept || !salon_id || !date || !total_spots) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    const [campaign] = await db.insert(campaigns).values({
      title,
      concept,
      salon_id,
      paying_client_id: paying_client_id ?? null,
      date: new Date(date),
      total_spots,
      spots_remaining: total_spots,
      status: 'upcoming',
    }).returning();
    res.status(201).json(campaign);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/campaigns/:id
router.patch('/campaigns/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const [updated] = await db.update(campaigns).set(req.body).where(eq(campaigns.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/campaigns/:id/signups
router.get('/campaigns/:id/signups', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const rows = await db.select().from(campaignSignups).where(eq(campaignSignups.campaign_id, id));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/nfc-pending
router.get('/nfc-pending', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: orders.id,
        nfc_token: orders.nfc_token,
        nfc_token_used: orders.nfc_token_used,
        customer_email: orders.customer_email,
        created_at: orders.created_at,
      })
      .from(orders)
      .where(eq(orders.nfc_token_used, false));
    const pending = rows.filter(r => r.nfc_token !== null);
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/locations
router.post('/locations', async (req: Request, res: Response) => {
  const { name, address } = req.body;
  if (!name || !address) {
    res.status(400).json({ error: 'name and address are required' });
    return;
  }
  try {
    const [location] = await db.insert(locations).values({ name, address }).returning();
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/locations
router.get('/locations', async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(locations);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/businesses
router.post('/businesses', async (req: Request, res: Response) => {
  const { name, type, address, city, hours, contact, latitude, longitude, launched_at,
          description, instagram_handle, neighbourhood, starts_at, ends_at, dj_name,
          organizer_note, capacity, entrance_fee_cents, is_audition, partner_business_id,
          host_user_id, checkin_token } = req.body;
  if (!name || !type || !address || !city || !launched_at) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    const [business] = await db.insert(businesses).values({
      name, type, address, city,
      hours: hours ?? null,
      contact: contact ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      launched_at: new Date(launched_at),
      description: description ?? null,
      instagram_handle: instagram_handle ?? null,
      neighbourhood: neighbourhood ?? null,
      starts_at: starts_at ? new Date(starts_at) : null,
      ends_at: ends_at ? new Date(ends_at) : null,
      dj_name: dj_name ?? null,
      organizer_note: organizer_note ?? null,
      capacity: capacity ?? null,
      entrance_fee_cents: entrance_fee_cents ?? null,
      is_audition: is_audition ?? false,
      partner_business_id: partner_business_id ?? null,
      host_user_id: host_user_id ?? null,
      checkin_token: checkin_token ?? randomUUID(),
    }).returning();
    res.status(201).json(business);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/businesses/:id
router.patch('/businesses/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const body = { ...req.body };
    if (body.starts_at) body.starts_at = new Date(body.starts_at);
    if (body.ends_at) body.ends_at = new Date(body.ends_at);
    const [updated] = await db.update(businesses).set(body).where(eq(businesses.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }

    // Notify host user of audition result
    if (req.body.audition_status === 'passed' || req.body.audition_status === 'failed') {
      try {
        const [biz] = await db.select().from(businesses).where(eq(businesses.id, id));
        if (biz?.host_user_id) {
          const [host] = await db.select().from(users).where(eq(users.id, biz.host_user_id));
          if (host?.push_token) {
            const passed = req.body.audition_status === 'passed';
            sendPushNotification(host.push_token, {
              title: passed ? 'Your popup passed.' : 'Audition result.',
              body: passed
                ? `${biz.name} has been approved. Start inviting guests.`
                : `${biz.name} wasn't approved this time.`,
              data: { screen: 'home' },
            }).catch(() => {});
          }
          if (host?.email) {
            const biz2 = biz;
            const passed = req.body.audition_status === 'passed';
            sendAuditionResult({
              to: host.email,
              popupName: biz2.name,
              passed,
            }).catch(() => {});
          }
        }
      } catch {}
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/popups — all popups with RSVP + nomination counts
router.get('/popups', async (_req: Request, res: Response) => {
  try {
    const popups = await db.select().from(businesses).where(eq(businesses.type, 'popup'));

    const enriched = await Promise.all(popups.map(async p => {
      const [rsvpRow] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(popupRsvps)
        .where(and(eq(popupRsvps.popup_id, p.id), eq(popupRsvps.status, 'paid')));

      const [nomRow] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(popupNominations)
        .where(eq(popupNominations.popup_id, p.id));

      const offers = await db.select().from(djOffers).where(eq(djOffers.popup_id, p.id));

      return {
        ...p,
        lat: p.latitude ? parseFloat(String(p.latitude)) : null,
        lng: p.longitude ? parseFloat(String(p.longitude)) : null,
        rsvp_count: rsvpRow?.total ?? 0,
        nomination_count: nomRow?.total ?? 0,
        dj_offers: offers,
      };
    }));

    res.json(enriched.sort((a, b) =>
      (b.starts_at?.getTime() ?? 0) - (a.starts_at?.getTime() ?? 0)
    ));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/popups/:id/nominations
router.get('/popups/:id/nominations', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const rows = await db
      .select({
        nominee_id: popupNominations.nominee_id,
        display_name: users.display_name,
        email: users.email,
        nomination_count: sql<number>`cast(count(*) as int)`,
      })
      .from(popupNominations)
      .innerJoin(users, eq(popupNominations.nominee_id, users.id))
      .where(eq(popupNominations.popup_id, id))
      .groupBy(popupNominations.nominee_id, users.display_name, users.email)
      .orderBy(sql`count(*) desc`);

    res.json(rows.map(r => ({
      user_id: r.nominee_id,
      display_name: r.display_name ?? r.email.split('@')[0],
      nomination_count: r.nomination_count,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/popups/:id — edit popup fields (partial update)
router.patch('/popups/:id', requirePin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { name, address, neighbourhood, hours, capacity, launched_at, ends_at, organizer_note, entrance_fee_cents, dj_name, contact } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (neighbourhood !== undefined) updates.neighbourhood = neighbourhood;
  if (hours !== undefined) updates.hours = hours;
  if (capacity !== undefined) updates.capacity = capacity;
  if (launched_at !== undefined) updates.launched_at = new Date(launched_at);
  if (ends_at !== undefined) updates.ends_at = new Date(ends_at);
  if (organizer_note !== undefined) updates.organizer_note = organizer_note;
  if (entrance_fee_cents !== undefined) updates.entrance_fee_cents = entrance_fee_cents;
  if (dj_name !== undefined) updates.dj_name = dj_name;
  if (contact !== undefined) updates.contact = contact;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: 'no_fields' }); return; }
  try {
    const [updated] = await db.update(businesses).set(updates).where(eq(businesses.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/admin/popups/:id/dj-offer — send DJ offer + push notification
router.post('/popups/:id/dj-offer', async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  const { dj_user_id, allocation_boxes, organizer_note } = req.body;
  if (isNaN(popup_id) || !dj_user_id) {
    res.status(400).json({ error: 'dj_user_id is required' });
    return;
  }
  try {
    const [popup] = await db.select().from(businesses).where(eq(businesses.id, popup_id));
    if (!popup) { res.status(404).json({ error: 'Popup not found' }); return; }

    const [offer] = await db.insert(djOffers).values({
      popup_id,
      dj_user_id,
      allocation_boxes: allocation_boxes ?? 0,
      organizer_note: organizer_note ?? null,
      status: 'pending',
    }).returning();

    // Push notification to DJ
    const [djUser] = await db.select().from(users).where(eq(users.id, dj_user_id));
    if (djUser?.push_token) {
      sendPushNotification(djUser.push_token, {
        title: 'You\'ve been invited.',
        body: `${popup.name} wants you for their popup. Open the app to accept or pass.`,
        data: { screen: 'dj-offer', popup_id },
      }).catch(() => {});
    }

    res.status(201).json(offer);
  } catch (err) {
    logger.error('DJ offer error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/popup-requests
router.get('/popup-requests', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: popupRequests.id,
        user_id: popupRequests.user_id,
        venue_id: popupRequests.venue_id,
        venue_name: businesses.name,
        requested_date: popupRequests.requested_date,
        requested_time: popupRequests.requested_time,
        notes: popupRequests.notes,
        status: popupRequests.status,
        created_at: popupRequests.created_at,
        user_email: users.email,
        user_display_name: users.display_name,
      })
      .from(popupRequests)
      .innerJoin(businesses, eq(popupRequests.venue_id, businesses.id))
      .innerJoin(users, eq(popupRequests.user_id, users.id))
      .orderBy(popupRequests.created_at);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/popup-requests/:id — approve or reject
router.patch('/popup-requests/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body; // 'approved' | 'rejected'
  if (isNaN(id) || !['approved', 'rejected'].includes(status)) {
    res.status(400).json({ error: 'status must be approved or rejected' });
    return;
  }
  try {
    const [updated] = await db.update(popupRequests).set({ status }).where(eq(popupRequests.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }

    // Notify requester
    const [requester] = await db.select().from(users).where(eq(users.id, updated.user_id));
    if (requester?.push_token) {
      const msg = status === 'approved'
        ? 'Your popup request has been approved. We\'ll be in touch.'
        : 'Your popup request was not approved this time.';
      sendPushNotification(requester.push_token, {
        title: 'Maison Fraise',
        body: msg,
        data: { screen: 'home' },
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/portraits — add a portrait
router.post('/portraits', async (req: Request, res: Response) => {
  const { business_id, image_url, subject_name, season, campaign_title, sort_order } = req.body;
  if (!business_id || !image_url) {
    res.status(400).json({ error: 'business_id and image_url are required' });
    return;
  }
  try {
    const [portrait] = await db.insert(portraits).values({
      business_id,
      image_url,
      subject_name: subject_name ?? null,
      season: season ?? null,
      campaign_title: campaign_title ?? null,
      sort_order: sort_order ?? 0,
    }).returning();
    res.status(201).json(portrait);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/portraits/:id — update sort_order or other fields
router.patch('/portraits/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { sort_order, subject_name, season, campaign_title } = req.body;
  const body: any = {};
  if (sort_order !== undefined) body.sort_order = sort_order;
  if (subject_name !== undefined) body.subject_name = subject_name;
  if (season !== undefined) body.season = season;
  if (campaign_title !== undefined) body.campaign_title = campaign_title;
  if (Object.keys(body).length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  try {
    const [updated] = await db.update(portraits).set(body).where(eq(portraits.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/portraits/:id
router.delete('/portraits/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    await db.delete(portraits).where(eq(portraits.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/portraits?business_id=
router.get('/portraits', async (req: Request, res: Response) => {
  const business_id = parseInt(String(req.query.business_id), 10);
  if (isNaN(business_id)) { res.status(400).json({ error: 'business_id required' }); return; }
  try {
    const rows = await db.select().from(portraits).where(eq(portraits.business_id, business_id));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:userId/portrait
router.patch('/users/:userId/portrait', async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) { res.status(400).json({ error: 'Invalid userId' }); return; }
  const { portrait_url } = req.body;
  if (!portrait_url || typeof portrait_url !== 'string') {
    res.status(400).json({ error: 'portrait_url is required' });
    return;
  }
  try {
    const [updated] = await db.update(users).set({ portrait_url }).where(eq(users.id, userId)).returning();
    if (!updated) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users/:userId/ban
router.post('/users/:userId/ban', async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) { res.status(400).json({ error: 'Invalid userId' }); return; }
  const { reason } = req.body;
  try {
    const [updated] = await db.update(users)
      .set({ banned: true, ban_reason: reason ?? null })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id/photographed
router.patch('/users/:id/photographed', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const [updated] = await db.update(users)
      .set({ photographed: true })
      .where(eq(users.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    await db.insert(legitimacyEvents).values({
      user_id: id,
      event_type: 'photographed',
      weight: 4,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/migrate — create missing tables and columns
router.post('/migrate', async (_req: Request, res: Response) => {
  try {
    // Orders columns
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS nfc_token text UNIQUE`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS nfc_token_used boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS nfc_verified_at timestamp`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS push_token text`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_note text`);

    // Users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id serial PRIMARY KEY,
        apple_user_id text UNIQUE,
        email text NOT NULL UNIQUE,
        verified boolean NOT NULL DEFAULT false,
        verified_at timestamp,
        verified_by text,
        photographed boolean NOT NULL DEFAULT false,
        campaign_interest boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    // Legitimacy events table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS legitimacy_events (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        event_type text NOT NULL,
        weight integer NOT NULL,
        business_id integer REFERENCES businesses(id),
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    // User follows table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_follows (
        id serial PRIMARY KEY,
        follower_id integer NOT NULL REFERENCES users(id),
        followee_id integer NOT NULL REFERENCES users(id),
        created_at timestamp NOT NULL DEFAULT now(),
        UNIQUE(follower_id, followee_id)
      )
    `);

    // Notifications table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        type text NOT NULL,
        title text NOT NULL,
        body text NOT NULL,
        read boolean NOT NULL DEFAULT false,
        data jsonb NOT NULL DEFAULT '{}',
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`ALTER TABLE varieties ADD COLUMN IF NOT EXISTS location_id integer REFERENCES locations(id)`);
    await db.execute(sql`ALTER TABLE varieties ADD COLUMN IF NOT EXISTS image_url TEXT`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_id TEXT`);

    // Referral system
    await db.execute(sql`CREATE TABLE IF NOT EXISTS referral_codes (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), code TEXT NOT NULL UNIQUE, uses INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT NOW())`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_code TEXT`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_applied BOOLEAN NOT NULL DEFAULT FALSE`);

    // Stripe customer ID + order ratings
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating INTEGER`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating_note TEXT`);

    // Membership + editorial enums (use DO block for idempotency)
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_tier') THEN
          CREATE TYPE membership_tier AS ENUM ('maison','reserve','atelier','fondateur','patrimoine','souverain','unnamed');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'editorial_status') THEN
          CREATE TYPE editorial_status AS ENUM ('draft','submitted','commissioned','published','declined');
        END IF;
      END $$
    `);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS memberships (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), tier membership_tier NOT NULL, status TEXT NOT NULL DEFAULT 'pending', started_at TIMESTAMP, renews_at TIMESTAMP, amount_cents INTEGER NOT NULL, stripe_payment_intent_id TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW())`);
    await db.execute(sql`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS renewal_notified_at TIMESTAMP`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS membership_funds (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE, balance_cents INTEGER NOT NULL DEFAULT 0, cycle_start TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS fund_contributions (id SERIAL PRIMARY KEY, from_user_id INTEGER REFERENCES users(id), to_user_id INTEGER NOT NULL REFERENCES users(id), amount_cents INTEGER NOT NULL, stripe_payment_intent_id TEXT, note TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW())`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS editorial_pieces (id SERIAL PRIMARY KEY, author_user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL, status editorial_status NOT NULL DEFAULT 'draft', commission_cents INTEGER, published_at TIMESTAMP, editor_note TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`);
    await db.execute(sql`ALTER TABLE editorial_pieces ADD COLUMN IF NOT EXISTS tag TEXT`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS membership_waitlist (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), tier membership_tier NOT NULL, message TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW())`);

    // Portal / NFC additions
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS portal_opted_in boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS portrait_url text`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS worker_status text`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS nfc_connections (
        id serial PRIMARY KEY,
        user_a integer NOT NULL REFERENCES users(id),
        user_b integer NOT NULL REFERENCES users(id),
        location text,
        confirmed_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS explicit_portals (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) UNIQUE,
        opted_in boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS portal_access (
        id serial PRIMARY KEY,
        buyer_id integer NOT NULL REFERENCES users(id),
        owner_id integer NOT NULL REFERENCES users(id),
        amount_cents integer NOT NULL,
        platform_cut_cents integer NOT NULL,
        source text NOT NULL,
        stripe_payment_intent_id text,
        expires_at timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS portal_content (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        media_url text NOT NULL,
        type text NOT NULL,
        caption text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    // Worker ID on orders + payment_method
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS worker_id integer REFERENCES users(id)`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text`);

    // Banned users
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason text`);

    // Portal consents
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS portal_consents (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) UNIQUE,
        consented_at timestamp NOT NULL DEFAULT now(),
        ip_address text
      )
    `);

    res.json({ ok: true, message: 'Migration complete' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Talent layer ─────────────────────────────────────────────────────────────

// GET /api/admin/talent — relevance leaderboard
router.get('/talent', async (_req: Request, res: Response) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        display_name: users.display_name,
        email: users.email,
        verified: users.verified,
        is_dj: users.is_dj,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.verified, true));

    const enriched = await Promise.all(allUsers.map(async u => {
      const [nomRow] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(popupNominations)
        .where(eq(popupNominations.nominee_id, u.id));

      const [followerRow] = await db
        .select({ total: sql<number>`cast(count(distinct ${popupNominations.nominator_id}) as int)` })
        .from(popupNominations)
        .where(eq(popupNominations.nominee_id, u.id));

      const [contractRow] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(employmentContracts)
        .where(and(eq(employmentContracts.user_id, u.id), eq(employmentContracts.status, 'completed')));

      const [portraitRow] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(portraits)
        .where(sql`${portraits.subject_name} is not null`);

      const activeContract = await db
        .select({ business_name: businesses.name, ends_at: employmentContracts.ends_at })
        .from(employmentContracts)
        .innerJoin(businesses, eq(employmentContracts.business_id, businesses.id))
        .where(and(eq(employmentContracts.user_id, u.id), eq(employmentContracts.status, 'active')))
        .then(r => r[0] ?? null);

      const nomination_count = nomRow?.total ?? 0;
      const follower_count   = followerRow?.total ?? 0;
      const contracts_completed = contractRow?.total ?? 0;
      const relevance_score = nomination_count * 3 + contracts_completed * 10 + follower_count;

      return {
        ...u,
        display_name: u.display_name ?? u.email.split('@')[0],
        nomination_count,
        follower_count,
        contracts_completed,
        relevance_score,
        active_contract: activeContract,
      };
    }));

    res.json(enriched.sort((a, b) => b.relevance_score - a.relevance_score));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/contracts — send contract offer to a user
router.post('/contracts', async (req: Request, res: Response) => {
  const { business_id, user_id, starts_at, ends_at, note } = req.body;
  if (!business_id || !user_id || !starts_at || !ends_at) {
    res.status(400).json({ error: 'business_id, user_id, starts_at, ends_at are required' });
    return;
  }
  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, business_id));
    if (!business) { res.status(404).json({ error: 'Business not found' }); return; }

    const [contract] = await db.insert(employmentContracts).values({
      business_id,
      user_id,
      starts_at: new Date(starts_at),
      ends_at: new Date(ends_at),
      note: note ?? null,
      status: 'pending',
    }).returning();

    const [user] = await db.select().from(users).where(eq(users.id, user_id));
    if (user?.push_token) {
      sendPushNotification(user.push_token, {
        title: 'Maison Fraise is placing you.',
        body: `You've been offered a placement at ${business.name}. Open the app to review.`,
        data: { screen: 'contract-offer', contract_id: contract.id },
      }).catch(() => {});
    }

    if (user?.email) {
      sendContractOffer({
        to: user.email,
        businessName: business.name,
        neighbourhood: business.neighbourhood ?? null,
        startsAt: new Date(starts_at),
        endsAt: new Date(ends_at),
      }).catch(() => {});
    }

    res.status(201).json(contract);
  } catch (err) {
    logger.error('Contract create error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/contracts — all contracts
router.get('/contracts', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: employmentContracts.id,
        status: employmentContracts.status,
        starts_at: employmentContracts.starts_at,
        ends_at: employmentContracts.ends_at,
        note: employmentContracts.note,
        created_at: employmentContracts.created_at,
        business_name: businesses.name,
        business_id: employmentContracts.business_id,
        user_id: employmentContracts.user_id,
        user_display_name: users.display_name,
        user_email: users.email,
      })
      .from(employmentContracts)
      .innerJoin(businesses, eq(employmentContracts.business_id, businesses.id))
      .innerJoin(users, eq(employmentContracts.user_id, users.id))
      .orderBy(employmentContracts.created_at);

    res.json(rows.map(r => ({
      ...r,
      user_display_name: r.user_display_name ?? r.user_email.split('@')[0],
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/contracts/:id — update status (e.g. mark completed)
router.patch('/contracts/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [updated] = await db.update(employmentContracts).set(req.body).where(eq(employmentContracts.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/contract-requests — business placement requests
router.get('/contract-requests', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: contractRequests.id,
        description: contractRequests.description,
        desired_start: contractRequests.desired_start,
        status: contractRequests.status,
        created_at: contractRequests.created_at,
        business_name: businesses.name,
        business_id: contractRequests.business_id,
      })
      .from(contractRequests)
      .innerJoin(businesses, eq(contractRequests.business_id, businesses.id))
      .orderBy(contractRequests.created_at);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/contract-requests/:id
router.patch('/contract-requests/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [updated] = await db.update(contractRequests).set(req.body).where(eq(contractRequests.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/revenue — aggregate revenue summary
router.get('/revenue', async (_req: Request, res: Response) => {
  try {
    const PAID_STATUSES: Array<'paid' | 'preparing' | 'ready' | 'collected'> = ['paid', 'preparing', 'ready', 'collected'];

    const [orderAgg] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
        total_cents: sum(orders.total_cents),
      })
      .from(orders)
      .where(inArray(orders.status, PAID_STATUSES));

    const [rsvpAgg] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(popupRsvps)
      .where(eq(popupRsvps.status, 'paid'));

    const recentOrders = await db
      .select({
        id: orders.id,
        variety_name: varieties.name,
        total_cents: orders.total_cents,
        customer_email: orders.customer_email,
        created_at: orders.created_at,
      })
      .from(orders)
      .leftJoin(varieties, eq(orders.variety_id, varieties.id))
      .where(inArray(orders.status, PAID_STATUSES))
      .orderBy(desc(orders.created_at))
      .limit(10);

    res.json({
      orders: {
        count: orderAgg?.count ?? 0,
        total_cents: Number(orderAgg?.total_cents ?? 0),
      },
      rsvps: {
        paid_count: rsvpAgg?.count ?? 0,
      },
      recent_orders: recentOrders,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/contracts/expiring-soon — active contracts ending within 14 days
router.get('/contracts/expiring-soon', async (_req: Request, res: Response) => {
  const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  try {
    const rows = await db
      .select({
        id: employmentContracts.id,
        user_id: employmentContracts.user_id,
        display_name: users.display_name,
        email: users.email,
        business_name: businesses.name,
        business_id: employmentContracts.business_id,
        ends_at: employmentContracts.ends_at,
      })
      .from(employmentContracts)
      .innerJoin(users, eq(employmentContracts.user_id, users.id))
      .innerJoin(businesses, eq(employmentContracts.business_id, businesses.id))
      .where(and(
        eq(employmentContracts.status, 'active'),
        lte(employmentContracts.ends_at, twoWeeksFromNow),
      ));

    res.json(rows.map(r => ({
      ...r,
      display_name: r.display_name ?? r.email.split('@')[0],
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/time-slots?location_id=&date=
router.get('/time-slots', async (req: Request, res: Response) => {
  const location_id = req.query.location_id ? parseInt(String(req.query.location_id), 10) : null;
  const date = req.query.date ? String(req.query.date) : null;
  try {
    let query = db.select({
      id: timeSlots.id,
      location_id: timeSlots.location_id,
      location_name: locations.name,
      date: timeSlots.date,
      time: timeSlots.time,
      capacity: timeSlots.capacity,
      booked: timeSlots.booked,
      created_at: timeSlots.created_at,
    })
    .from(timeSlots)
    .innerJoin(locations, eq(timeSlots.location_id, locations.id));

    const conditions = [];
    if (location_id) conditions.push(eq(timeSlots.location_id, location_id));
    if (date) conditions.push(eq(timeSlots.date, date));

    const rows = conditions.length > 0
      ? await query.where(and(...conditions as [any, ...any[]])).orderBy(timeSlots.date, timeSlots.time)
      : await query.orderBy(timeSlots.date, timeSlots.time);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/time-slots — create time slot(s)
router.post('/time-slots', async (req: Request, res: Response) => {
  const { location_id, date, time, capacity } = req.body;
  if (!location_id || !date || !time || !capacity) {
    res.status(400).json({ error: 'location_id, date, time, capacity are required' });
    return;
  }
  try {
    const [slot] = await db.insert(timeSlots).values({ location_id, date, time, capacity, booked: 0 }).returning();
    res.status(201).json(slot);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/time-slots/:id
router.patch('/time-slots/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { capacity, booked } = req.body;
  const body: any = {};
  if (capacity !== undefined) body.capacity = capacity;
  if (booked !== undefined) body.booked = booked;
  if (Object.keys(body).length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  try {
    const [updated] = await db.update(timeSlots).set(body).where(eq(timeSlots.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/time-slots/:id
router.delete('/time-slots/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    await db.delete(timeSlots).where(eq(timeSlots.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/contracts/complete-expired — mark contracts completed where ends_at < now
router.post('/contracts/complete-expired', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const expired = await db
      .select({ id: employmentContracts.id })
      .from(employmentContracts)
      .where(and(eq(employmentContracts.status, 'active'), lte(employmentContracts.ends_at, now)));

    if (expired.length === 0) {
      res.json({ completed: 0 });
      return;
    }

    const ids = expired.map(r => r.id);
    await db.update(employmentContracts)
      .set({ status: 'completed' })
      .where(inArray(employmentContracts.id, ids));

    res.json({ completed: ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/popups/:id/rsvps — list of RSVPs for a popup with user info
router.get('/popups/:id/rsvps', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid popup id' }); return; }
  try {
    const rows = await db
      .select({
        id: popupRsvps.id,
        user_id: popupRsvps.user_id,
        status: popupRsvps.status,
        display_name: users.display_name,
        email: users.email,
        created_at: popupRsvps.created_at,
      })
      .from(popupRsvps)
      .innerJoin(users, eq(popupRsvps.user_id, users.id))
      .where(eq(popupRsvps.popup_id, id))
      .orderBy(popupRsvps.created_at);

    res.json(rows.map(r => ({ ...r, display_name: r.display_name ?? r.email.split('@')[0] })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/revenue/daily — daily order counts and totals for the last N days
router.get('/revenue/daily', async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt(String(req.query.days ?? '14'), 10) || 14, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const PAID_STATUSES: Array<'paid' | 'preparing' | 'ready' | 'collected'> = ['paid', 'preparing', 'ready', 'collected'];

    const rows = await db
      .select({
        date: sql<string>`date(${orders.created_at})`,
        order_count: sql<number>`cast(count(*) as int)`,
        total_cents: sql<number>`cast(coalesce(sum(${orders.total_cents}),0) as int)`,
      })
      .from(orders)
      .where(and(inArray(orders.status, PAID_STATUSES), gte(orders.created_at, since)))
      .groupBy(sql`date(${orders.created_at})`)
      .orderBy(sql`date(${orders.created_at})`);

    // Build a full date array so every day is represented
    const result: { date: string; order_count: number; total_cents: number }[] = [];
    const rowMap = new Map(rows.map(r => [r.date, r]));
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const row = rowMap.get(key);
      result.push({ date: key, order_count: row?.order_count ?? 0, total_cents: row?.total_cents ?? 0 });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/customers/export — export customers with orders as CSV
router.get('/customers/export', async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute<{
      email: string;
      display_name: string | null;
      order_count: number;
      total_spent_cents: number;
      first_order_date: string;
    }>(sql`
      SELECT
        u.email,
        u.display_name,
        COUNT(o.id)::int AS order_count,
        COALESCE(SUM(o.total_cents), 0)::int AS total_spent_cents,
        MIN(o.created_at)::date::text AS first_order_date
      FROM users u
      INNER JOIN orders o ON o.customer_email = u.email
      GROUP BY u.id, u.email, u.display_name
      HAVING COUNT(o.id) > 0
      ORDER BY u.email ASC
    `);

    const escape = (v: string | null | undefined) =>
      `"${(v ?? '').replace(/"/g, '""')}"`;

    const header = 'email,display_name,order_count,total_spent_cents,first_order_date';
    const lines = rows.map(r =>
      [
        escape(r.email),
        escape(r.display_name),
        String(r.order_count),
        String(r.total_spent_cents),
        escape(r.first_order_date),
      ].join(',')
    );

    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/broadcast — send push to all users or popup RSVPs
router.post('/broadcast', async (req: Request, res: Response) => {
  const { message, popup_id } = req.body;
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    let tokens: string[] = [];

    if (popup_id != null) {
      // Send to users with confirmed/paid RSVP for this popup
      const rows = await db
        .select({ push_token: users.push_token })
        .from(popupRsvps)
        .innerJoin(users, eq(popupRsvps.user_id, users.id))
        .where(and(
          eq(popupRsvps.popup_id, parseInt(String(popup_id), 10)),
          inArray(popupRsvps.status, ['confirmed', 'paid']),
          isNotNull(users.push_token),
        ));
      tokens = rows.map(r => r.push_token).filter((t): t is string => t != null);
    } else {
      // Send to all users with a push token
      const rows = await db
        .select({ push_token: users.push_token })
        .from(users)
        .where(isNotNull(users.push_token));
      tokens = rows.map(r => r.push_token).filter((t): t is string => t != null);
    }

    await Promise.allSettled(
      tokens.map(token =>
        sendPushNotification(token, { title: 'Maison Fraise', body: message })
      )
    );

    res.json({ sent: tokens.length });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/referrals — referral leaderboard (top 20 by uses)
router.get('/referrals', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        code: referralCodes.code,
        uses: referralCodes.uses,
        user_email: users.email,
        display_name: users.display_name,
      })
      .from(referralCodes)
      .innerJoin(users, eq(referralCodes.user_id, users.id))
      .orderBy(desc(referralCodes.uses))
      .limit(20);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/editorial — all editorial pieces with author info
router.get('/editorial', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: editorialPieces.id,
        title: editorialPieces.title,
        status: editorialPieces.status,
        author_display_name: users.display_name,
        author_email: users.email,
        commission_cents: editorialPieces.commission_cents,
        created_at: editorialPieces.created_at,
        published_at: editorialPieces.published_at,
        editor_note: editorialPieces.editor_note,
      })
      .from(editorialPieces)
      .innerJoin(users, eq(editorialPieces.author_user_id, users.id))
      .orderBy(desc(editorialPieces.created_at));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/editorial/:id — review/update an editorial piece
router.patch('/editorial/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const { status, commission_cents, editor_note, tag } = req.body;

  try {
    // Fetch current piece + author
    const [piece] = await db
      .select({
        id: editorialPieces.id,
        author_user_id: editorialPieces.author_user_id,
        status: editorialPieces.status,
        commission_cents: editorialPieces.commission_cents,
      })
      .from(editorialPieces)
      .where(eq(editorialPieces.id, id));

    if (!piece) { res.status(404).json({ error: 'Not found' }); return; }

    const updates: Record<string, any> = {};
    if (status !== undefined) updates.status = status;
    if (commission_cents !== undefined) updates.commission_cents = commission_cents;
    if (editor_note !== undefined) updates.editor_note = editor_note;
    if (tag !== undefined) updates.tag = tag;
    updates.updated_at = new Date();

    if (status === 'published') {
      updates.published_at = new Date();
    }

    const [updated] = await db
      .update(editorialPieces)
      .set(updates)
      .where(eq(editorialPieces.id, id))
      .returning();

    // Post-update side-effects
    const authorId = piece.author_user_id;
    const [author] = await db.select().from(users).where(eq(users.id, authorId));

    if (status === 'published') {
      const effectiveCommission = commission_cents ?? piece.commission_cents ?? 0;
      if (effectiveCommission > 0) {
        await db
          .insert(membershipFunds)
          .values({ user_id: authorId, balance_cents: effectiveCommission })
          .onConflictDoUpdate({
            target: membershipFunds.user_id,
            set: {
              balance_cents: sql`${membershipFunds.balance_cents} + ${effectiveCommission}`,
              updated_at: new Date(),
            },
          });
      }
      if (author?.push_token) {
        sendPushNotification(author.push_token, {
          title: 'Your piece has been published',
          body: 'Your piece has been published',
          data: { screen: 'editorial' },
        }).catch(() => {});
      }
    } else if (status === 'declined') {
      if (author?.push_token) {
        const noteBody = editor_note ? editor_note : 'Your submission was reviewed';
        sendPushNotification(author.push_token, {
          title: 'Your submission was reviewed',
          body: noteBody,
          data: { screen: 'editorial' },
        }).catch(() => {});
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/memberships — all memberships with user info and fund balance
router.get('/memberships', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: memberships.id,
        user_id: memberships.user_id,
        display_name: users.display_name,
        email: users.email,
        tier: memberships.tier,
        status: memberships.status,
        started_at: memberships.started_at,
        renews_at: memberships.renews_at,
        amount_cents: memberships.amount_cents,
        fund_balance: membershipFunds.balance_cents,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.user_id, users.id))
      .leftJoin(membershipFunds, eq(memberships.user_id, membershipFunds.user_id))
      .orderBy(desc(memberships.tier), memberships.started_at);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/memberships/waitlist — all waitlist entries with user info
router.get('/memberships/waitlist', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: membershipWaitlist.id,
        display_name: users.display_name,
        email: users.email,
        tier: membershipWaitlist.tier,
        message: membershipWaitlist.message,
        created_at: membershipWaitlist.created_at,
      })
      .from(membershipWaitlist)
      .innerJoin(users, eq(membershipWaitlist.user_id, users.id))
      .orderBy(membershipWaitlist.tier, membershipWaitlist.created_at);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/portal/content — all portal content with user info
router.get('/portal/content', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: portalContent.id,
        user_id: portalContent.user_id,
        media_url: portalContent.media_url,
        type: portalContent.type,
        caption: portalContent.caption,
        created_at: portalContent.created_at,
        display_name: users.display_name,
        portrait_url: users.portrait_url,
      })
      .from(portalContent)
      .leftJoin(users, eq(portalContent.user_id, users.id))
      .orderBy(desc(portalContent.created_at))
      .limit(100);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/portal/content/:id — delete portal content
router.delete('/portal/content/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    await db.delete(portalContent).where(eq(portalContent.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/portal/activity
router.get('/portal/activity', async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    // Aggregates
    const [stats] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE expires_at > ${now}) AS total_subscribers,
        COALESCE(SUM(amount_cents), 0) AS total_revenue_cents,
        COALESCE(SUM(platform_cut_cents), 0) AS total_cut_cents
      FROM portal_access
    `);

    const [optedInRow] = await db.execute(sql`
      SELECT COUNT(*) AS opted_in_count FROM users WHERE portal_opted_in = true
    `);

    // Last 20 portal_access rows with buyer and owner names
    const recent = await db.execute(sql`
      SELECT
        pa.id,
        pa.buyer_id,
        bu.display_name AS buyer_display_name,
        pa.owner_id,
        ou.display_name AS owner_display_name,
        pa.amount_cents,
        pa.platform_cut_cents,
        pa.source,
        pa.expires_at,
        pa.created_at
      FROM portal_access pa
      LEFT JOIN users bu ON bu.id = pa.buyer_id
      LEFT JOIN users ou ON ou.id = pa.owner_id
      ORDER BY pa.created_at DESC
      LIMIT 20
    `);

    res.json({
      total_subscribers: Number((stats as any).total_subscribers ?? 0),
      total_revenue_cents: Number((stats as any).total_revenue_cents ?? 0),
      total_cut_cents: Number((stats as any).total_cut_cents ?? 0),
      opted_in_count: Number((optedInRow as any).opted_in_count ?? 0),
      recent,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
