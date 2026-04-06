import { Router, Request, Response } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { reservationOffers, reservationBookings, businesses, users, eveningTokens, messages } from '../db/schema';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';
import { logger } from '../lib/logger';

const router = Router();

db.execute(sql`
  CREATE TABLE IF NOT EXISTS reservation_offers (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    title TEXT NOT NULL,
    description TEXT,
    mode TEXT NOT NULL DEFAULT 'platform_match',
    value_cents INTEGER NOT NULL,
    commission_cents INTEGER NOT NULL DEFAULT 0,
    drink_description TEXT,
    reservation_date TEXT,
    reservation_time TEXT,
    slots_total INTEGER NOT NULL DEFAULT 1,
    slots_remaining INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS reservation_bookings (
    id SERIAL PRIMARY KEY,
    offer_id INTEGER NOT NULL REFERENCES reservation_offers(id),
    initiator_user_id INTEGER NOT NULL REFERENCES users(id),
    guest_user_id INTEGER REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'seeking_pair',
    invite_expires_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    strawberry_order_placed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

const COMMISSION_RATE = 0.20;

// ─── Booking routes (registered before /:id to prevent parameter capture) ─────

// GET /api/reservation-offers/bookings/mine
router.get('/bookings/mine', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const bookings = await db.select({
      id: reservationBookings.id,
      offer_id: reservationBookings.offer_id,
      status: reservationBookings.status,
      invite_expires_at: reservationBookings.invite_expires_at,
      confirmed_at: reservationBookings.confirmed_at,
      strawberry_order_placed: reservationBookings.strawberry_order_placed,
      created_at: reservationBookings.created_at,
      guest_user_id: reservationBookings.guest_user_id,
      initiator_user_id: reservationBookings.initiator_user_id,
      offer_title: reservationOffers.title,
      offer_description: reservationOffers.description,
      offer_mode: reservationOffers.mode,
      offer_value_cents: reservationOffers.value_cents,
      offer_drink_description: reservationOffers.drink_description,
      offer_reservation_date: reservationOffers.reservation_date,
      offer_reservation_time: reservationOffers.reservation_time,
      business_id: businesses.id,
      business_name: businesses.name,
    }).from(reservationBookings)
      .innerJoin(reservationOffers, eq(reservationBookings.offer_id, reservationOffers.id))
      .innerJoin(businesses, eq(reservationOffers.business_id, businesses.id))
      .where(sql`${reservationBookings.initiator_user_id} = ${userId} OR ${reservationBookings.guest_user_id} = ${userId}`)
      .orderBy(desc(reservationBookings.created_at));
    res.json(bookings);
  } catch (err) {
    logger.error(`Booking list error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/reservation-offers/bookings/:bookingId/invite — initiator picks a contact
router.post('/bookings/:bookingId/invite', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const bookingId = parseInt(req.params.bookingId, 10);
  if (isNaN(bookingId)) { res.status(400).json({ error: 'invalid id' }); return; }
  const { guest_user_id } = req.body;
  if (!guest_user_id) { res.status(400).json({ error: 'guest_user_id required' }); return; }

  try {
    const [booking] = await db.update(reservationBookings)
      .set({
        guest_user_id,
        status: 'pending_guest',
        invite_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .where(and(
        eq(reservationBookings.id, bookingId),
        eq(reservationBookings.initiator_user_id, userId),
        eq(reservationBookings.status, 'pending_invite'),
      ))
      .returning();
    if (!booking) { res.status(409).json({ error: 'booking not in invitable state' }); return; }

    // Notify guest — fire and forget
    (async () => {
      try {
        const [guest] = await db.select({ push_token: users.push_token })
          .from(users).where(eq(users.id, guest_user_id));
        const [initiator] = await db.select({ display_name: users.display_name })
          .from(users).where(eq(users.id, userId));
        const [offer] = await db.select({
          title: reservationOffers.title,
          business_id: reservationOffers.business_id,
        }).from(reservationOffers).where(eq(reservationOffers.id, booking.offer_id));
        const [biz] = offer ? await db.select({ name: businesses.name })
          .from(businesses).where(eq(businesses.id, offer.business_id)) : [null];
        if (guest?.push_token) {
          sendPushNotification(guest.push_token, {
            title: `${initiator?.display_name ?? 'Someone'} invited you to dinner`,
            body: `${offer?.title ?? 'A sponsored dinner'} at ${biz?.name ?? 'the restaurant'} — fully hosted. 24 hours to respond.`,
            data: { screen: 'reservation-booking' },
          }).catch(() => {});
        }
      } catch { /* non-fatal */ }
    })();

    res.json({ ok: true, booking_id: booking.id });
  } catch (err) {
    logger.error(`Invite error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/reservation-offers/bookings/:bookingId/respond — guest accepts or declines
router.post('/bookings/:bookingId/respond', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const bookingId = parseInt(req.params.bookingId, 10);
  if (isNaN(bookingId)) { res.status(400).json({ error: 'invalid id' }); return; }
  const { accept } = req.body;
  if (typeof accept !== 'boolean') { res.status(400).json({ error: 'accept (boolean) required' }); return; }

  try {
    if (!accept) {
      // Decline: reset to pending_invite so initiator can pick someone else
      const [updated] = await db.update(reservationBookings)
        .set({ status: 'pending_invite', guest_user_id: null, invite_expires_at: null })
        .where(and(
          eq(reservationBookings.id, bookingId),
          eq(reservationBookings.guest_user_id, userId),
          eq(reservationBookings.status, 'pending_guest'),
        ))
        .returning();
      if (!updated) { res.status(409).json({ error: 'not found or already responded' }); return; }

      (async () => {
        try {
          const [initiator] = await db.select({ push_token: users.push_token })
            .from(users).where(eq(users.id, updated.initiator_user_id));
          if (initiator?.push_token) {
            sendPushNotification(initiator.push_token, {
              title: 'Your guest declined',
              body: 'You can invite someone else from your contacts.',
              data: { screen: 'reservation-booking' },
            }).catch(() => {});
          }
        } catch { /* non-fatal */ }
      })();

      res.json({ ok: true, status: 'pending_invite' });
      return;
    }

    // Accept: atomically confirm — status guard prevents double-confirm
    const [booking] = await db.update(reservationBookings)
      .set({ status: 'confirmed', confirmed_at: new Date() })
      .where(and(
        eq(reservationBookings.id, bookingId),
        eq(reservationBookings.guest_user_id, userId),
        eq(reservationBookings.status, 'pending_guest'),
      ))
      .returning();
    if (!booking) { res.status(409).json({ error: 'not found or already responded' }); return; }

    // Debit business — fire and forget (non-fatal if insufficient balance; reconcile separately)
    db.select({ id: reservationOffers.id, business_id: reservationOffers.business_id, value_cents: reservationOffers.value_cents })
      .from(reservationOffers).where(eq(reservationOffers.id, booking.offer_id))
      .then(([offer]) => {
        if (!offer) return;
        return db.update(users)
          .set({ ad_balance_cents: sql`${users.ad_balance_cents} - ${offer.value_cents}` })
          .where(and(
            eq(users.is_shop, true),
            eq(users.business_id, offer.business_id),
            sql`${users.ad_balance_cents} >= ${offer.value_cents}`,
          ));
      })
      .catch(() => {});

    // Notify both guests and remind shop about strawberries
    confirmBookingAsync(booking).catch(() => {});

    // For platform_match mode, activate the evening token window
    (async () => {
      try {
        const [offer] = await db.select({
          mode: reservationOffers.mode,
          business_id: reservationOffers.business_id,
          reservation_date: reservationOffers.reservation_date,
        }).from(reservationOffers).where(eq(reservationOffers.id, booking.offer_id));
        if (offer?.mode === 'platform_match' && booking.guest_user_id) {
          await activateEveningTokenWindow(
            bookingId,
            booking.offer_id,
            booking.initiator_user_id,
            booking.guest_user_id,
            offer.business_id,
            offer.reservation_date ?? null,
          );
        }
      } catch { /* non-fatal */ }
    })();

    res.json({ ok: true, status: 'confirmed' });
  } catch (err) {
    logger.error(`Booking respond error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Offer routes ──────────────────────────────────────────────────────────────

// GET /api/reservation-offers/mine — shop user's own offers
router.get('/mine', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [user] = await db.select({ is_shop: users.is_shop, business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.is_shop || !user.business_id) { res.status(403).json({ error: 'shop accounts only' }); return; }

    const offers = await db.select().from(reservationOffers)
      .where(eq(reservationOffers.business_id, user.business_id))
      .orderBy(desc(reservationOffers.created_at));
    res.json(offers);
  } catch { res.status(500).json({ error: 'internal' }); }
});

// GET /api/reservation-offers — user discovery feed (active offers with slots)
router.get('/', requireUser, async (req: Request, res: Response) => {
  try {
    const offers = await db.select({
      id: reservationOffers.id,
      title: reservationOffers.title,
      description: reservationOffers.description,
      mode: reservationOffers.mode,
      value_cents: reservationOffers.value_cents,
      drink_description: reservationOffers.drink_description,
      reservation_date: reservationOffers.reservation_date,
      reservation_time: reservationOffers.reservation_time,
      slots_remaining: reservationOffers.slots_remaining,
      business_id: businesses.id,
      business_name: businesses.name,
      business_neighbourhood: businesses.neighbourhood,
    }).from(reservationOffers)
      .innerJoin(businesses, eq(reservationOffers.business_id, businesses.id))
      .where(and(
        eq(reservationOffers.status, 'active'),
        sql`${reservationOffers.slots_remaining} > 0`,
      ))
      .orderBy(desc(reservationOffers.created_at));
    res.json(offers);
  } catch (err) {
    logger.error(`Offer list error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/reservation-offers — shop user creates an offer
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { title, description, mode, value_cents, drink_description, reservation_date, reservation_time, slots_total } = req.body;
  if (!title?.trim() || !value_cents || value_cents < 1) {
    res.status(400).json({ error: 'title and value_cents required' }); return;
  }
  try {
    const [user] = await db.select({ is_shop: users.is_shop, business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.is_shop || !user.business_id) { res.status(403).json({ error: 'shop accounts only' }); return; }

    const slots = Math.max(1, parseInt(String(slots_total ?? 1), 10));
    const commission = Math.round(value_cents * COMMISSION_RATE);

    const [created] = await db.insert(reservationOffers).values({
      business_id: user.business_id,
      title: title.trim(),
      description: description?.trim() ?? null,
      mode: mode === 'user_invite' ? 'user_invite' : 'platform_match',
      value_cents,
      commission_cents: commission,
      drink_description: drink_description?.trim() ?? null,
      reservation_date: reservation_date ?? null,
      reservation_time: reservation_time ?? null,
      slots_total: slots,
      slots_remaining: slots,
    }).returning();

    if (created.mode === 'platform_match') {
      dispatchDinnerInvites(created.id, userId, user.business_id).catch(() => {});
    }

    res.status(201).json(created);
  } catch (err) {
    logger.error(`Offer create error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/reservation-offers/:id/join — user joins an offer
router.post('/:id/join', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const offerId = parseInt(req.params.id, 10);
  if (isNaN(offerId)) { res.status(400).json({ error: 'invalid id' }); return; }

  try {
    const [offer] = await db.select().from(reservationOffers)
      .where(and(eq(reservationOffers.id, offerId), eq(reservationOffers.status, 'active')));
    if (!offer) { res.status(404).json({ error: 'offer not found or inactive' }); return; }
    if (offer.slots_remaining <= 0) { res.status(409).json({ error: 'no slots remaining' }); return; }

    if (offer.mode === 'platform_match') {
      // Look for a different user already waiting
      const [waiting] = await db.select().from(reservationBookings)
        .where(and(
          eq(reservationBookings.offer_id, offerId),
          eq(reservationBookings.status, 'seeking_pair'),
        ))
        .limit(1);

      if (waiting && waiting.initiator_user_id !== userId) {
        // Pair found — confirm atomically in a transaction
        let confirmed: typeof waiting | undefined;
        await db.transaction(async (tx) => {
          const [updated] = await tx.update(reservationBookings)
            .set({ guest_user_id: userId, status: 'confirmed', confirmed_at: new Date() })
            .where(and(
              eq(reservationBookings.id, waiting.id),
              eq(reservationBookings.status, 'seeking_pair'),   // guard: prevents double-join race
            ))
            .returning();
          if (!updated) throw new Error('booking taken — race condition');
          confirmed = updated;

          await tx.update(reservationOffers)
            .set({ slots_remaining: sql`${reservationOffers.slots_remaining} - 1` })
            .where(eq(reservationOffers.id, offerId));

          // Debit the business's shop user's ad balance
          await tx.update(users)
            .set({ ad_balance_cents: sql`${users.ad_balance_cents} - ${offer.value_cents}` })
            .where(and(
              eq(users.is_shop, true),
              eq(users.business_id, offer.business_id),
              sql`${users.ad_balance_cents} >= ${offer.value_cents}`,
            ));
        });

        if (confirmed) {
          confirmBookingAsync({ ...confirmed, guest_user_id: userId }).catch(() => {});
          activateEveningTokenWindow(
            waiting.id,
            offerId,
            waiting.initiator_user_id,
            userId,
            offer.business_id,
            offer.reservation_date ?? null,
          ).catch(() => {});
        }
        res.json({ status: 'confirmed', booking_id: waiting.id });
      } else {
        // No match yet — join the pool
        const [booking] = await db.insert(reservationBookings).values({
          offer_id: offerId,
          initiator_user_id: userId,
          status: 'seeking_pair',
        }).returning();
        res.status(201).json({
          status: 'seeking_pair',
          booking_id: booking.id,
          message: 'You\'re in. We\'ll pair you with another guest.',
        });
      }
    } else {
      // user_invite — initiator picks their own guest; decrement + insert atomically
      let booking: any;
      await db.transaction(async (tx) => {
        await tx.update(reservationOffers)
          .set({ slots_remaining: sql`${reservationOffers.slots_remaining} - 1` })
          .where(eq(reservationOffers.id, offerId));
        const [created] = await tx.insert(reservationBookings).values({
          offer_id: offerId,
          initiator_user_id: userId,
          status: 'pending_invite',
        }).returning();
        booking = created;
      });

      res.status(201).json({
        status: 'pending_invite',
        booking_id: booking.id,
        message: 'Pick someone from your contacts.',
      });
    }
  } catch (err) {
    logger.error(`Join offer error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/reservation-offers/:id — shop user updates offer status/details
router.patch('/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [user] = await db.select({ business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.business_id) { res.status(403).json({ error: 'shop accounts only' }); return; }

    const { status, title, description, drink_description, reservation_date, reservation_time } = req.body;
    const patch: Record<string, any> = {};
    if (status !== undefined && ['active', 'paused', 'closed'].includes(status)) patch.status = status;
    if (title !== undefined) patch.title = String(title).trim();
    if (description !== undefined) patch.description = description?.trim() ?? null;
    if (drink_description !== undefined) patch.drink_description = drink_description?.trim() ?? null;
    if (reservation_date !== undefined) patch.reservation_date = reservation_date;
    if (reservation_time !== undefined) patch.reservation_time = reservation_time;

    const [updated] = await db.update(reservationOffers).set(patch)
      .where(and(eq(reservationOffers.id, id), eq(reservationOffers.business_id, user.business_id)))
      .returning();
    if (!updated) { res.status(404).json({ error: 'not found' }); return; }
    res.json(updated);
  } catch { res.status(500).json({ error: 'internal' }); }
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function dispatchDinnerInvites(offerId: number, shopUserId: number, businessId: number) {
  try {
    const existingInvites = await db.select({ recipient_id: messages.recipient_id })
      .from(messages)
      .where(
        and(
          eq(messages.type, 'dinner_invite'),
          sql`(${messages.metadata}->>'offer_id')::int = ${offerId}`
        )
      );
    const alreadyInvited = new Set(existingInvites.map(r => r.recipient_id));

    const [offer] = await db.select({
      title: reservationOffers.title,
      reservation_date: reservationOffers.reservation_date,
      reservation_time: reservationOffers.reservation_time,
      value_cents: reservationOffers.value_cents,
    }).from(reservationOffers).where(eq(reservationOffers.id, offerId));
    if (!offer) return;

    const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId));

    const batch = await db.select({ id: users.id, push_token: users.push_token })
      .from(users)
      .where(
        and(
          eq(users.portal_opted_in, true),
          sql`${users.id} != ${shopUserId}`,
        )
      )
      .limit(10);

    const toInvite = batch.filter(u => !alreadyInvited.has(u.id)).slice(0, 6);

    for (const user of toInvite) {
      const metadata = {
        offer_id: offerId,
        offer_title: offer.title,
        business_name: biz?.name ?? 'The restaurant',
        reservation_date: offer.reservation_date ?? null,
        reservation_time: offer.reservation_time ?? null,
        value_cents: offer.value_cents,
        status: 'pending',
        booking_id: null,
        companion_name: null,
        window_closes_at: null,
      };
      await db.insert(messages).values({
        sender_id: shopUserId,
        recipient_id: user.id,
        body: `You're invited to an evening at ${biz?.name ?? 'a restaurant'}.`,
        type: 'dinner_invite',
        metadata,
      });

      if (user.push_token) {
        sendPushNotification(user.push_token, {
          title: `An evening at ${biz?.name ?? 'a restaurant'}`,
          body: `${offer.title}${offer.reservation_date ? ' · ' + offer.reservation_date : ''}. Dinner for two, fully hosted.`,
          data: { screen: 'messages' },
        }).catch(() => {});
      }
    }
  } catch { /* non-fatal */ }
}

async function activateEveningTokenWindow(
  bookingId: number,
  offerId: number,
  userAId: number,
  userBId: number,
  businessId: number,
  reservationDate: string | null,
) {
  let windowClosesAt: Date;
  if (reservationDate) {
    windowClosesAt = new Date(reservationDate);
    windowClosesAt.setDate(windowClosesAt.getDate() + 2);
  } else {
    windowClosesAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  }

  await db.insert(eveningTokens).values({
    booking_id: bookingId,
    user_a_id: userAId,
    user_b_id: userBId,
    business_id: businessId,
    offer_id: offerId,
    window_closes_at: windowClosesAt,
  }).onConflictDoNothing();

  const [userA] = await db.select({ display_name: users.display_name, user_code: users.user_code }).from(users).where(eq(users.id, userAId));
  const [userB] = await db.select({ display_name: users.display_name, user_code: users.user_code }).from(users).where(eq(users.id, userBId));

  const nameA = userA?.display_name ?? userA?.user_code ?? 'your companion';
  const nameB = userB?.display_name ?? userB?.user_code ?? 'your companion';

  // Update userA's card: companion is B
  await db.execute(sql`
    UPDATE messages SET metadata = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
      metadata,
      '{status}', '"confirmed"'::jsonb
    ), '{companion_name}', ${JSON.stringify(nameB)}::jsonb
    ), '{booking_id}', ${bookingId}::jsonb
    ), '{window_closes_at}', ${JSON.stringify(windowClosesAt.toISOString())}::jsonb
    )
    WHERE type = 'dinner_invite'
      AND (metadata->>'offer_id')::int = ${offerId}
      AND recipient_id = ${userAId}
      AND (metadata->>'status') IN ('pending', 'accepted')
  `);

  // Update userB's card: companion is A
  await db.execute(sql`
    UPDATE messages SET metadata = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
      metadata,
      '{status}', '"confirmed"'::jsonb
    ), '{companion_name}', ${JSON.stringify(nameA)}::jsonb
    ), '{booking_id}', ${bookingId}::jsonb
    ), '{window_closes_at}', ${JSON.stringify(windowClosesAt.toISOString())}::jsonb
    )
    WHERE type = 'dinner_invite'
      AND (metadata->>'offer_id')::int = ${offerId}
      AND recipient_id = ${userBId}
      AND (metadata->>'status') IN ('pending', 'accepted')
  `);
}

export { activateEveningTokenWindow };

async function confirmBookingAsync(booking: {
  offer_id: number;
  initiator_user_id: number;
  guest_user_id: number | null;
  confirmed_at?: Date | null;
}) {
  try {
    const [offer] = await db.select({
      title: reservationOffers.title,
      reservation_date: reservationOffers.reservation_date,
      reservation_time: reservationOffers.reservation_time,
      business_id: reservationOffers.business_id,
      value_cents: reservationOffers.value_cents,
    }).from(reservationOffers).where(eq(reservationOffers.id, booking.offer_id));
    if (!offer) return;

    const [biz] = await db.select({ name: businesses.name })
      .from(businesses).where(eq(businesses.id, offer.business_id));
    const dateStr = [offer.reservation_date, offer.reservation_time].filter(Boolean).join(' at ') || 'a date TBC';

    // Notify both guests
    const userIds = [booking.initiator_user_id, booking.guest_user_id].filter(Boolean) as number[];
    for (const uid of userIds) {
      const [u] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.id, uid));
      if (u?.push_token) {
        sendPushNotification(u.push_token, {
          title: `Dinner confirmed — ${biz?.name ?? 'The restaurant'}`,
          body: `${offer.title} — ${dateStr}. Dessert: chocolate-covered strawberries. Enjoy.`,
          data: { screen: 'reservation-booking' },
        }).catch(() => {});
      }
    }

    // Remind the shop user to place a strawberry order if they don't have a standing order
    const [shopUser] = await db.select({ id: users.id, push_token: users.push_token })
      .from(users)
      .where(and(eq(users.is_shop, true), eq(users.business_id, offer.business_id)))
      .limit(1);
    if (shopUser?.push_token) {
      sendPushNotification(shopUser.push_token, {
        title: 'Reservation confirmed — order your strawberries',
        body: `${offer.title} on ${dateStr}. Chocolate-covered strawberries are the dessert. Place your order in the app.`,
        data: { screen: 'terminal' },
      }).catch(() => {});
    }
  } catch { /* non-fatal */ }
}

export default router;
