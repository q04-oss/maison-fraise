import { Router, Request, Response } from 'express';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  businesses, users, popupRsvps, popupCheckins,
  popupNominations, djOffers, legitimacyEvents,
} from '../db/schema';
import { stripe } from '../lib/stripe';
import { sendPushNotification } from '../lib/push';
import { sendNominationReceived } from '../lib/resend';
import { logger } from '../lib/logger';
import { requireUser } from '../lib/auth';

const router = Router();

// GET /api/popups/:id/rsvp-status
router.get('/:id/rsvp-status', requireUser, async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  const user_id: number = (req as any).userId;
  if (isNaN(popup_id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  try {
    const [rsvp] = await db
      .select()
      .from(popupRsvps)
      .where(and(eq(popupRsvps.popup_id, popup_id), eq(popupRsvps.user_id, user_id), ne(popupRsvps.status, 'cancelled')));

    res.json({ has_rsvp: !!rsvp, status: rsvp?.status ?? null });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/popups/:id/rsvp
router.post('/:id/rsvp', requireUser, async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  const user_id: number = (req as any).userId;
  if (isNaN(popup_id)) {
    res.status(400).json({ error: 'Invalid popup id' });
    return;
  }

  try {
    const [popup] = await db.select().from(businesses).where(eq(businesses.id, popup_id));
    if (!popup) {
      res.status(404).json({ error: 'Popup not found' });
      return;
    }

    // Check for existing non-cancelled RSVP
    const [existing] = await db
      .select()
      .from(popupRsvps)
      .where(and(eq(popupRsvps.popup_id, popup_id), eq(popupRsvps.user_id, user_id), ne(popupRsvps.status, 'cancelled')));
    if (existing) {
      res.status(409).json({ error: 'Already RSVPed' });
      return;
    }

    // Check capacity — if full, add to waitlist (free, no payment)
    if (popup.capacity) {
      const [{ paid_count }] = await db
        .select({ paid_count: sql<number>`cast(count(*) as int)` })
        .from(popupRsvps)
        .where(and(eq(popupRsvps.popup_id, popup_id), eq(popupRsvps.status, 'paid')));
      if (paid_count >= popup.capacity) {
        const [rsvp] = await db.insert(popupRsvps).values({
          popup_id, user_id, status: 'waitlist',
        }).returning();
        return res.status(201).json({ id: rsvp.id, client_secret: null, waitlisted: true });
      }
    }

    const fee = popup.entrance_fee_cents ?? 0;

    let stripePaymentIntentId: string | null = null;
    let clientSecret: string | null = null;

    if (fee > 0) {
      const pi = await stripe.paymentIntents.create({
        amount: fee,
        currency: 'cad',
        metadata: { type: 'popup_rsvp', popup_id: String(popup_id), user_id: String(user_id) },
      });
      stripePaymentIntentId = pi.id;
      clientSecret = pi.client_secret;
    }

    const [rsvp] = await db
      .insert(popupRsvps)
      .values({
        popup_id,
        user_id,
        stripe_payment_intent_id: stripePaymentIntentId,
        status: fee > 0 ? 'pending' : 'paid',
      })
      .returning();

    res.status(201).json({ id: rsvp.id, client_secret: clientSecret ?? '' });
  } catch (err) {
    logger.error('RSVP creation error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/popups/:id/rsvp — cancel own RSVP
router.delete('/:id/rsvp', requireUser, async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  const user_id: number = (req as any).userId;
  if (isNaN(popup_id)) {
    res.status(400).json({ error: 'Invalid popup id' });
    return;
  }
  try {
    const [rsvp] = await db
      .select()
      .from(popupRsvps)
      .where(and(eq(popupRsvps.popup_id, popup_id), eq(popupRsvps.user_id, user_id), ne(popupRsvps.status, 'cancelled')));
    if (!rsvp) {
      res.status(404).json({ error: 'RSVP not found' });
      return;
    }
    // Refund if paid
    if (rsvp.status === 'paid' && rsvp.stripe_payment_intent_id) {
      try {
        await stripe.refunds.create({ payment_intent: rsvp.stripe_payment_intent_id });
      } catch (refundErr) {
        logger.error('Refund failed', refundErr);
      }
    }
    await db.update(popupRsvps).set({ status: 'cancelled' }).where(eq(popupRsvps.id, rsvp.id));

    // Promote first waitlisted user if this was a paid RSVP
    if (rsvp.status === 'paid') {
      try {
        const [nextWaitlisted] = await db
          .select()
          .from(popupRsvps)
          .where(and(eq(popupRsvps.popup_id, popup_id), eq(popupRsvps.status, 'waitlist')))
          .orderBy(popupRsvps.created_at)
          .limit(1);

        if (nextWaitlisted) {
          // Atomically claim the waitlist slot — only proceed if we won the race
          const [popup] = await db.select().from(businesses).where(eq(businesses.id, popup_id));
          const fee = popup?.entrance_fee_cents ?? 0;

          if (fee > 0) {
            const pi = await stripe.paymentIntents.create({
              amount: fee,
              currency: 'cad',
              metadata: { type: 'popup_rsvp', popup_id: String(popup_id), user_id: String(nextWaitlisted.user_id) },
            });
            const promoted = await db.update(popupRsvps)
              .set({ status: 'pending', stripe_payment_intent_id: pi.id })
              .where(and(eq(popupRsvps.id, nextWaitlisted.id), eq(popupRsvps.status, 'waitlist')))
              .returning();
            if (promoted.length === 0) return; // Another request already promoted this entry
          } else {
            const promoted = await db.update(popupRsvps)
              .set({ status: 'paid' })
              .where(and(eq(popupRsvps.id, nextWaitlisted.id), eq(popupRsvps.status, 'waitlist')))
              .returning();
            if (promoted.length === 0) return; // Another request already promoted this entry
          }

          // Notify the promoted user
          const [promotedUser] = await db.select().from(users).where(eq(users.id, nextWaitlisted.user_id));
          if (promotedUser?.push_token) {
            sendPushNotification(promotedUser.push_token, {
              title: 'A spot just opened up.',
              body: `You're off the waitlist for ${popup?.name ?? 'the popup'}. ${fee > 0 ? 'Open the app to complete your RSVP.' : 'You\'re confirmed!'}`,
              data: { screen: 'popup-detail', popupId: popup_id },
            }).catch(() => {});
          }
        }
      } catch (promoteErr) {
        logger.error('Waitlist promotion failed', promoteErr);
      }
    }

    res.json({ success: true, refunded: rsvp.status === 'paid' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/popups/:id/checkin
router.post('/:id/checkin', requireUser, async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  const user_id: number = (req as any).userId;
  const { nfc_token } = req.body;
  if (isNaN(popup_id)) {
    res.status(400).json({ error: 'Invalid popup id' });
    return;
  }

  try {
    const [popup] = await db.select().from(businesses).where(eq(businesses.id, popup_id));
    if (!popup) {
      res.status(404).json({ error: 'Popup not found' });
      return;
    }

    // Verify NFC token matches the popup's checkin token (if configured)
    if (popup.checkin_token && nfc_token && popup.checkin_token !== nfc_token) {
      res.status(403).json({ error: 'Invalid check-in token' });
      return;
    }

    // Verify user has a paid RSVP
    const [rsvp] = await db
      .select()
      .from(popupRsvps)
      .where(and(eq(popupRsvps.popup_id, popup_id), eq(popupRsvps.user_id, user_id), eq(popupRsvps.status, 'paid')));
    if (!rsvp) {
      res.status(403).json({ error: 'No paid RSVP found for this user' });
      return;
    }

    // Idempotent — upsert checkin
    const [existing] = await db
      .select()
      .from(popupCheckins)
      .where(and(eq(popupCheckins.popup_id, popup_id), eq(popupCheckins.user_id, user_id)));
    if (!existing) {
      await db.insert(popupCheckins).values({ popup_id, user_id, nfc_token: nfc_token ?? null });

      // Award legitimacy for attending
      await db.insert(legitimacyEvents).values({
        user_id,
        event_type: 'popup_attended',
        weight: 3,
        business_id: popup_id,
      });
    }

    res.json({ checked_in: true });
  } catch (err) {
    logger.error('Checkin error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/popups/:id/attendees  — users who checked in, for nomination selection
router.get('/:id/attendees', async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  if (isNaN(popup_id)) {
    res.status(400).json({ error: 'Invalid popup id' });
    return;
  }

  try {
    const rows = await db
      .select({
        user_id: popupCheckins.user_id,
        display_name: users.display_name,
        email: users.email,
      })
      .from(popupCheckins)
      .innerJoin(users, eq(popupCheckins.user_id, users.id))
      .where(eq(popupCheckins.popup_id, popup_id));

    res.json(rows.map(r => ({
      user_id: r.user_id,
      display_name: r.display_name ?? r.email.split('@')[0],
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/popups/:id/nominations/leaderboard
router.get('/:id/nominations/leaderboard', async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  if (isNaN(popup_id)) {
    res.status(400).json({ error: 'Invalid popup id' });
    return;
  }

  try {
    const rows = await db
      .select({
        user_id: popupNominations.nominee_id,
        display_name: users.display_name,
        email: users.email,
        nomination_count: sql<number>`cast(count(*) as int)`,
      })
      .from(popupNominations)
      .innerJoin(users, eq(popupNominations.nominee_id, users.id))
      .where(eq(popupNominations.popup_id, popup_id))
      .groupBy(popupNominations.nominee_id, users.display_name, users.email)
      .orderBy(sql`count(*) desc`);

    res.json(rows.map(r => ({
      user_id: r.user_id,
      display_name: r.display_name ?? r.email.split('@')[0],
      nomination_count: r.nomination_count,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/popups/:id/nominations/status
router.get('/:id/nominations/status', requireUser, async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  const user_id: number = (req as any).userId;
  if (isNaN(popup_id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  try {
    const nominations = await db
      .select()
      .from(popupNominations)
      .where(and(eq(popupNominations.popup_id, popup_id), eq(popupNominations.nominator_id, user_id)));

    res.json({ has_nominated: nominations.length > 0, nomination_count: nominations.length, nominations_remaining: Math.max(0, 3 - nominations.length) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/popups/:id/nominations
router.post('/:id/nominations', requireUser, async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  const nominator_id: number = (req as any).userId;
  const { nominee_id } = req.body;
  if (isNaN(popup_id) || !nominee_id) {
    res.status(400).json({ error: 'nominee_id is required' });
    return;
  }
  if (nominator_id === nominee_id) {
    res.status(400).json({ error: 'Cannot nominate yourself' });
    return;
  }

  try {
    // Check nominator checked in
    const [checkin] = await db
      .select()
      .from(popupCheckins)
      .where(and(eq(popupCheckins.popup_id, popup_id), eq(popupCheckins.user_id, nominator_id)));
    if (!checkin) {
      res.status(403).json({ error: 'Must be checked in to nominate' });
      return;
    }

    // Max 3 nominations per nominator per popup, each to a different nominee
    const existingNominations = await db
      .select()
      .from(popupNominations)
      .where(and(eq(popupNominations.popup_id, popup_id), eq(popupNominations.nominator_id, nominator_id)));
    if (existingNominations.length >= 3) {
      res.status(429).json({ error: 'Nomination limit reached (3 per popup)' });
      return;
    }
    if (existingNominations.some(n => n.nominee_id === nominee_id)) {
      res.status(409).json({ error: 'Already nominated this person' });
      return;
    }

    // Look up popup, nominee, and nominator for notifications
    const [[popup], [nominee], [nominator]] = await Promise.all([
      db.select().from(businesses).where(eq(businesses.id, popup_id)),
      db.select({ push_token: users.push_token, display_name: users.display_name, email: users.email }).from(users).where(eq(users.id, nominee_id)),
      db.select({ display_name: users.display_name, email: users.email }).from(users).where(eq(users.id, nominator_id)),
    ]);

    await db.insert(popupNominations).values({ popup_id, nominator_id, nominee_id });

    // Notify nominee via push (fire-and-forget)
    if (nominee?.push_token) {
      const name = nominee.display_name ?? nominee.email.split('@')[0];
      sendPushNotification(nominee.push_token, {
        title: 'Maison Fraise',
        body: `You've been nominated at tonight's popup, ${name}.`,
        data: { screen: 'nomination-history', popup_id },
      }).catch(() => {});
    }

    // Notify nominee via email (fire-and-forget)
    if (nominee?.email && popup) {
      const popupDateStr = popup.starts_at
        ? new Date(popup.starts_at).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
        : null;
      sendNominationReceived({
        to: nominee.email,
        nominatorName: nominator?.display_name ?? nominator?.email?.split('@')[0] ?? 'Someone',
        popupName: popup.name,
        popupDate: popupDateStr,
      }).catch(() => {});
    }

    res.status(201).json({ success: true });
  } catch (err) {
    logger.error('Nomination error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/popups/:id/dj-accept
router.post('/:id/dj-accept', requireUser, async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  const user_id: number = (req as any).userId;
  if (isNaN(popup_id)) {
    res.status(400).json({ error: 'Invalid popup id' });
    return;
  }

  try {
    const [offer] = await db
      .select()
      .from(djOffers)
      .where(and(eq(djOffers.popup_id, popup_id), eq(djOffers.dj_user_id, user_id)));

    if (!offer) {
      res.status(404).json({ error: 'Offer not found' });
      return;
    }

    await db.update(djOffers).set({ status: 'accepted' }).where(eq(djOffers.id, offer.id));

    // Update businesses.dj_name with user's display name
    const [user] = await db.select().from(users).where(eq(users.id, user_id));
    if (user) {
      const name = user.display_name ?? user.email.split('@')[0];
      await db.update(businesses).set({ dj_name: name }).where(eq(businesses.id, popup_id));
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('DJ accept error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/popups/:id/dj-pass
router.post('/:id/dj-pass', requireUser, async (req: Request, res: Response) => {
  const popup_id = parseInt(req.params.id, 10);
  const user_id: number = (req as any).userId;
  if (isNaN(popup_id)) {
    res.status(400).json({ error: 'Invalid popup id' });
    return;
  }

  try {
    const [offer] = await db
      .select()
      .from(djOffers)
      .where(and(eq(djOffers.popup_id, popup_id), eq(djOffers.dj_user_id, user_id)));

    if (offer) {
      await db.update(djOffers).set({ status: 'passed' }).where(eq(djOffers.id, offer.id));
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
