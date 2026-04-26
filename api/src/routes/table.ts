import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { tableEvents, tableInstructors, tableBookings, tableBookingTokens, users } from '../db/schema';
import { eq, and, sql, inArray, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { stripe } from '../lib/stripe';
import {
  sendTableBookingConfirmation, sendTableClaimEmail, sendTableDateAnnouncedWithConfirm,
  sendPoolJoinConfirmation, sendPoolCallNotification,
} from '../lib/resend';
import { requireUser } from '../lib/auth';

function requirePin(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers['x-admin-pin'];
  if (!pin || pin !== process.env.ADMIN_PIN) {
    res.status(401).json({ error: 'Invalid or missing X-Admin-PIN header' });
    return;
  }
  next();
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const router = Router();

const FRAISE_CUT = 0.15;
const VENUE_CUT = 0.20;
const EMPLOYEE_CUT = 0.65; // passes through business to employee

// GET /api/table/events — all active events, optional ?slug= filter
router.get('/events', async (req: any, res: any) => {
  const slug = req.query.slug as string | undefined;
  try {
    const where = slug
      ? and(eq(tableEvents.active, true), eq(tableEvents.venue_slug, slug))
      : eq(tableEvents.active, true);

    const events = await db
      .select({
        id: tableEvents.id,
        title: tableEvents.title,
        venue_name: tableEvents.venue_name,
        venue_address: tableEvents.venue_address,
        venue_slug: tableEvents.venue_slug,
        event_date: tableEvents.event_date,
        date_tbd: tableEvents.date_tbd,
        duration_minutes: tableEvents.duration_minutes,
        price_cents: tableEvents.price_cents,
        capacity: tableEvents.capacity,
        seats_taken: tableEvents.seats_taken,
        description: tableEvents.description,
        active: tableEvents.active,
        event_type: tableEvents.event_type,
        parent_event_id: tableEvents.parent_event_id,
        threshold: tableEvents.threshold,
        instructor_name: tableInstructors.name,
        instructor_bio: tableInstructors.bio,
        instructor_photo_url: tableInstructors.photo_url,
      })
      .from(tableEvents)
      .leftJoin(tableInstructors, eq(tableEvents.instructor_id, tableInstructors.id))
      .where(where);

    // Attach waitlist counts
    const eventIds = events.map(e => e.id);
    const waitlistCounts: Record<number, number> = {};
    if (eventIds.length) {
      const counts = await db
        .select({ event_id: tableBookings.event_id, count: sql<number>`count(*)::int` })
        .from(tableBookings)
        .where(and(eq(tableBookings.status, 'waitlisted'), inArray(tableBookings.event_id, eventIds)))
        .groupBy(tableBookings.event_id);
      for (const row of counts) waitlistCounts[row.event_id] = row.count;
    }

    res.json(events.map(e => ({ ...e, waitlist_count: waitlistCounts[e.id] ?? 0 })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/table/standing?slug= — find or create the always-on standing event for a venue
router.post('/standing', async (req: any, res: any) => {
  const slug = String(req.query.slug ?? '').trim();
  if (!slug) return res.status(400).json({ error: 'slug required' });

  try {
    // Try to find an existing active standing event for this venue
    const rows = await db.execute(sql`
      SELECT id, title, venue_name, venue_slug, price_cents, capacity, seats_taken, date_tbd, active
      FROM table_events
      WHERE active = true AND venue_slug = ${slug} AND title = 'next event'
      LIMIT 1
    `);
    const existing = ((rows as any).rows ?? rows)[0] as any;
    if (existing) return res.json(existing);

    // None exists — create one
    const created = await db.execute(sql`
      INSERT INTO table_events (title, venue_name, venue_slug, date_tbd, price_cents, capacity, event_type, active)
      VALUES ('next event', 'Kommune', ${slug}, true, 12000, 30, 'group', true)
      RETURNING id, title, venue_name, venue_slug, price_cents, capacity, seats_taken, date_tbd, active
    `);
    res.json(((created as any).rows ?? created)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/table/events/:id
router.get('/events/:id', async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const [event] = await db
      .select({
        id: tableEvents.id,
        title: tableEvents.title,
        venue_name: tableEvents.venue_name,
        venue_address: tableEvents.venue_address,
        event_date: tableEvents.event_date,
        date_tbd: tableEvents.date_tbd,
        duration_minutes: tableEvents.duration_minutes,
        price_cents: tableEvents.price_cents,
        capacity: tableEvents.capacity,
        seats_taken: tableEvents.seats_taken,
        description: tableEvents.description,
        active: tableEvents.active,
        instructor_name: tableInstructors.name,
        instructor_bio: tableInstructors.bio,
        instructor_photo_url: tableInstructors.photo_url,
      })
      .from(tableEvents)
      .innerJoin(tableInstructors, eq(tableEvents.instructor_id, tableInstructors.id))
      .where(eq(tableEvents.id, id))
      .limit(1);
    if (!event) return res.status(404).json({ error: 'Not found' });
    res.json(event);
  } catch {
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// POST /api/table/events/:id/checkout
// If seats available → pending (confirms to confirmed + increments seats_taken)
// If full → pending_waitlist (confirms to waitlisted, no seats increment)
router.post('/events/:id/checkout', async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  const { name, email, seats = 1 } = req.body;

  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid event id' });

  try {
    const [event] = await db
      .select()
      .from(tableEvents)
      .where(and(eq(tableEvents.id, id), eq(tableEvents.active, true)))
      .limit(1);

    if (!event) return res.status(404).json({ error: 'Event not found' });

    const isFull = event.seats_taken + seats > event.capacity;
    const totalCents = event.price_cents * seats;
    const fraiseCents = Math.round(totalCents * FRAISE_CUT);

    const intent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'cad',
      metadata: {
        event_id: String(event.id),
        name,
        email,
        seats: String(seats),
        fraise_cut_cents: String(fraiseCents),
        venue_cut_cents: String(Math.round(totalCents * VENUE_CUT)),
        waitlist: isFull ? 'true' : 'false',
      },
      description: `table — ${event.title} · ${name}${isFull ? ' [waitlist]' : ''}`,
    });

    await db.insert(tableBookings).values({
      event_id: event.id,
      name,
      email,
      seats,
      total_cents: totalCents,
      stripe_payment_intent_id: intent.id,
      status: isFull ? 'pending_waitlist' : 'pending',
    });

    res.json({ client_secret: intent.client_secret, total_cents: totalCents, waitlisted: isFull });
  } catch (err) {
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// POST /api/table/events/:id/refund-request — user self-service refund (confirmed or waitlisted)
router.post('/events/:id/refund-request', async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  const { email } = req.body;
  if (!email || isNaN(id)) return res.status(400).json({ error: 'Email and event id required' });

  try {
    const [booking] = await db
      .select()
      .from(tableBookings)
      .where(and(
        eq(tableBookings.event_id, id),
        eq(tableBookings.email, email),
      ))
      .limit(1);

    if (!booking || !['confirmed', 'waitlisted'].includes(booking.status)) {
      return res.status(404).json({ error: 'No refundable booking found for that email' });
    }

    await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id! });
    await db.update(tableBookings).set({ status: 'refunded' }).where(eq(tableBookings.id, booking.id));

    if (booking.status === 'confirmed') {
      await db.update(tableEvents)
        .set({ seats_taken: sql`${tableEvents.seats_taken} - ${booking.seats}` })
        .where(eq(tableEvents.id, id));
    }

    res.json({ refunded: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Refund failed' });
  }
});

// POST /api/table/webhook handler
export async function handleTablePayment(paymentIntentId: string) {
  const [booking] = await db
    .select()
    .from(tableBookings)
    .where(eq(tableBookings.stripe_payment_intent_id, paymentIntentId))
    .limit(1);

  if (!booking) return;

  if (booking.status === 'pending') {
    await db.update(tableBookings).set({ status: 'confirmed' }).where(eq(tableBookings.id, booking.id));
    await db.update(tableEvents)
      .set({ seats_taken: sql`${tableEvents.seats_taken} + ${booking.seats}` })
      .where(eq(tableEvents.id, booking.event_id));
  } else if (booking.status === 'pending_waitlist') {
    // Check for an existing next-run to absorb this booking
    const [existingNextRun] = await db
      .select({ id: tableEvents.id, seats_taken: tableEvents.seats_taken, capacity: tableEvents.capacity })
      .from(tableEvents)
      .where(and(eq(tableEvents.parent_event_id, booking.event_id), eq(tableEvents.active, true)))
      .limit(1);

    if (existingNextRun) {
      // Roll into existing next run
      await db.update(tableBookings).set({ event_id: existingNextRun.id, status: 'waitlisted' }).where(eq(tableBookings.id, booking.id));
      await db.update(tableEvents)
        .set({ seats_taken: sql`${tableEvents.seats_taken} + ${booking.seats}` })
        .where(eq(tableEvents.id, existingNextRun.id));
    } else {
      // Auto-create a new next run
      const [parent] = await db.select().from(tableEvents).where(eq(tableEvents.id, booking.event_id)).limit(1);
      if (parent) {
        const [nextRun] = await db.insert(tableEvents).values({
          instructor_id: parent.instructor_id,
          title: parent.title,
          venue_name: parent.venue_name,
          venue_address: parent.venue_address,
          venue_slug: parent.venue_slug,
          event_date: null,
          date_tbd: true,
          duration_minutes: parent.duration_minutes,
          price_cents: parent.price_cents,
          capacity: parent.capacity,
          threshold: parent.threshold,
          seats_taken: booking.seats,
          description: parent.description,
          event_type: parent.event_type as any,
          parent_event_id: parent.id,
        }).returning();
        await db.update(tableBookings).set({ event_id: nextRun.id, status: 'waitlisted' }).where(eq(tableBookings.id, booking.id));
      } else {
        await db.update(tableBookings).set({ status: 'waitlisted' }).where(eq(tableBookings.id, booking.id));
      }
    }
  }

  // Send confirmation email
  const [event] = await db
    .select({
      title: tableEvents.title,
      venue_name: tableEvents.venue_name,
      event_date: tableEvents.event_date,
      date_tbd: tableEvents.date_tbd,
      instructor_name: tableInstructors.name,
    })
    .from(tableEvents)
    .innerJoin(tableInstructors, eq(tableEvents.instructor_id, tableInstructors.id))
    .where(eq(tableEvents.id, booking.event_id))
    .limit(1);

  if (event) {
    sendTableBookingConfirmation({
      to: booking.email,
      name: booking.name,
      eventTitle: event.title,
      venueName: event.venue_name,
      instructorName: event.instructor_name,
      eventDate: event.event_date,
      dateTbd: event.date_tbd,
      seats: booking.seats,
      totalCents: booking.total_cents,
      waitlisted: booking.status === 'pending_waitlist',
    }).catch(() => {}); // fire and forget
  }
}

// POST /api/table/bookings/:id/cancel — authenticated user cancels their own booking
router.post('/bookings/:id/cancel', requireUser, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  const userId = req.userId as number;
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    // Get the user's email
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const [booking] = await db.select().from(tableBookings).where(eq(tableBookings.id, id)).limit(1);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Verify ownership — booking email must match user's email
    if (booking.email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(403).json({ error: 'Not your booking' });
    }

    if (booking.status === 'refunded') return res.status(400).json({ error: 'Already refunded' });
    if (!['confirmed', 'waitlisted'].includes(booking.status)) {
      return res.status(400).json({ error: 'Booking cannot be cancelled at this stage' });
    }
    if (!booking.stripe_payment_intent_id) return res.status(400).json({ error: 'No payment to refund' });

    await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id });
    await db.update(tableBookings).set({ status: 'refunded' }).where(eq(tableBookings.id, booking.id));

    if (booking.status === 'confirmed') {
      await db.update(tableEvents)
        .set({ seats_taken: sql`${tableEvents.seats_taken} - ${booking.seats}` })
        .where(eq(tableEvents.id, booking.event_id));
    }

    res.json({ cancelled: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Cancellation failed' });
  }
});

// Public: GET /api/table/respond/:token — email link handler
function respondPage(heading: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>box fraise · table</title><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'DM Mono',monospace;background:#F7F5F2;display:flex;min-height:100dvh;align-items:center;justify-content:center;padding:2rem}main{max-width:400px;width:100%}.eyebrow{font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:#8E8E93;margin-bottom:0.75rem}h1{font-size:1.1rem;font-weight:500;color:#1C1C1E;margin-bottom:0.5rem}p{font-size:0.78rem;color:#8E8E93;line-height:1.7;margin-bottom:1.5rem}a{font-size:0.7rem;color:#1C1C1E;text-decoration:underline;text-underline-offset:2px}</style></head><body><main><div class="eyebrow">box fraise · table</div><h1>${heading}</h1><p>${body}</p><a href="/table">← table</a></main></body></html>`;
}

router.get('/respond/:token', async (req: any, res: any) => {
  const { token } = req.params;
  try {
    const [tokenRow] = await db.select().from(tableBookingTokens).where(eq(tableBookingTokens.token, token)).limit(1);
    if (!tokenRow) return res.send(respondPage('link not found.', 'this link is invalid or has already been used.'));
    if (tokenRow.used) {
      return res.send(respondPage(
        tokenRow.action === 'confirm' ? "you're confirmed." : 'already processed.',
        tokenRow.action === 'confirm' ? 'your spot is locked in.' : 'your refund was already processed.',
      ));
    }

    const [booking] = await db.select().from(tableBookings).where(eq(tableBookings.id, tokenRow.booking_id)).limit(1);
    if (!booking) return res.send(respondPage('not found.', 'booking not found.'));

    if (tokenRow.action === 'confirm') {
      await db.update(tableBookingTokens).set({ used: true }).where(eq(tableBookingTokens.token, token));
      return res.send(respondPage("you're in.", "your spot is confirmed. see you there."));
    }

    if (tokenRow.action === 'refund') {
      if (booking.status === 'refunded') {
        return res.send(respondPage('already refunded.', 'your payment has already been returned.'));
      }
      if (!booking.stripe_payment_intent_id) {
        return res.send(respondPage('nothing to refund.', 'no payment found for this booking.'));
      }
      await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id });
      await db.update(tableBookings).set({ status: 'refunded' }).where(eq(tableBookings.id, booking.id));
      if (booking.status === 'confirmed') {
        await db.update(tableEvents)
          .set({ seats_taken: sql`${tableEvents.seats_taken} - ${booking.seats}` })
          .where(eq(tableEvents.id, booking.event_id));
      }
      await db.update(tableBookingTokens).set({ used: true }).where(eq(tableBookingTokens.token, token));
      return res.send(respondPage('refund processed.', 'your spot has been released and your payment returned.'));
    }

    res.send(respondPage('unknown action.', 'something went wrong. contact table@fraise.box.'));
  } catch {
    res.send(respondPage('something went wrong.', 'please contact table@fraise.box for help.'));
  }
});

// Admin: GET /api/table/instructors
router.get('/instructors', requirePin, async (_req: any, res: any) => {
  const instructors = await db.select().from(tableInstructors).orderBy(tableInstructors.id);
  res.json(instructors);
});

// Admin: POST /api/table/instructors
router.post('/instructors', requirePin, async (req: any, res: any) => {
  const { name, bio, photo_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const [instructor] = await db.insert(tableInstructors).values({ name, bio, photo_url }).returning();
  res.json(instructor);
});

// Admin: POST /api/table/events
router.post('/events', requirePin, async (req: any, res: any) => {
  const { instructor_id, title, venue_name, venue_address, event_date, duration_minutes, price_cents, capacity, threshold, description, event_type } = req.body;
  if (!instructor_id || !title || !venue_name || !price_cents) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const type = event_type === 'private' ? 'private' : 'group';
  const defaultCapacity = type === 'private' ? 2 : 4;
  const [event] = await db.insert(tableEvents).values({
    instructor_id,
    title,
    venue_name,
    venue_address,
    venue_slug: toSlug(venue_name),
    event_date: event_date ? new Date(event_date) : null,
    date_tbd: !event_date,
    duration_minutes: duration_minutes ?? 90,
    price_cents,
    capacity: capacity ?? defaultCapacity,
    threshold: threshold ?? null,
    description,
    event_type: type,
  }).returning();
  res.json(event);
});

// Admin: PATCH /api/table/events/:id
router.patch('/events/:id', requirePin, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { active, capacity, price_cents, description, event_date, threshold } = req.body;
  const updates: any = {};
  if (active !== undefined) updates.active = active;
  if (capacity !== undefined) updates.capacity = capacity;
  if (price_cents !== undefined) updates.price_cents = price_cents;
  if (description !== undefined) updates.description = description;
  if (threshold !== undefined) updates.threshold = threshold;
  if (event_date !== undefined) {
    updates.event_date = new Date(event_date);
    updates.date_tbd = false;
  }
  const [event] = await db.update(tableEvents).set(updates).where(eq(tableEvents.id, id)).returning();

  // If this update just confirmed a TBD date, email all confirmed+waitlisted with token links
  if (updates.event_date && updates.date_tbd === false) {
    const bookings = await db
      .select()
      .from(tableBookings)
      .where(and(eq(tableBookings.event_id, id), inArray(tableBookings.status, ['confirmed', 'waitlisted'])));

    const baseUrl = process.env.BASE_URL ?? 'https://fraise.box';

    for (const booking of bookings) {
      const confirmToken = crypto.randomBytes(16).toString('hex');
      const refundToken = crypto.randomBytes(16).toString('hex');
      await db.insert(tableBookingTokens).values([
        { token: confirmToken, booking_id: booking.id, action: 'confirm' },
        { token: refundToken, booking_id: booking.id, action: 'refund' },
      ]);
      sendTableDateAnnouncedWithConfirm({
        to: booking.email,
        name: booking.name,
        eventTitle: event.title,
        venueName: event.venue_name,
        eventDate: updates.event_date,
        seats: booking.seats,
        confirmUrl: `${baseUrl}/api/table/respond/${confirmToken}`,
        refundUrl: `${baseUrl}/api/table/respond/${refundToken}`,
      }).catch(() => {});
    }
  }

  res.json(event);
});

// Admin: POST /api/table/events/:id/next-run
// Creates a new run of an event and rolls all waitlisted bookings into it
router.post('/events/:id/next-run', requirePin, async (req: any, res: any) => {
  const parentId = parseInt(req.params.id);
  if (isNaN(parentId)) return res.status(400).json({ error: 'Invalid id' });

  const { instructor_id, event_date } = req.body;
  if (!instructor_id) return res.status(400).json({ error: 'instructor_id required' });

  const [parent] = await db.select().from(tableEvents).where(eq(tableEvents.id, parentId)).limit(1);
  if (!parent) return res.status(404).json({ error: 'Event not found' });

  // Get waitlisted bookings from the parent event
  const waitlisted = await db
    .select()
    .from(tableBookings)
    .where(and(eq(tableBookings.event_id, parentId), eq(tableBookings.status, 'waitlisted')));

  const rolledSeats = waitlisted.reduce((sum, b) => sum + b.seats, 0);

  // Create next run — capacity starts at at least the waitlisted count
  const newCapacity = Math.max(parent.capacity, rolledSeats);
  const [newEvent] = await db.insert(tableEvents).values({
    instructor_id,
    title: parent.title,
    venue_name: parent.venue_name,
    venue_address: parent.venue_address,
    event_date: event_date ? new Date(event_date) : null,
    date_tbd: !event_date,
    duration_minutes: parent.duration_minutes,
    price_cents: parent.price_cents,
    capacity: newCapacity,
    seats_taken: rolledSeats,
    description: parent.description,
    parent_event_id: parentId,
  }).returning();

  // Roll waitlisted bookings into the new event as confirmed
  if (waitlisted.length) {
    const ids = waitlisted.map(b => b.id);
    await db.update(tableBookings)
      .set({ event_id: newEvent.id, status: 'confirmed' })
      .where(inArray(tableBookings.id, ids));
  }

  res.json({ event: newEvent, rolled_over: waitlisted.length });
});

// Admin: POST /api/table/bookings/:id/claim-email — send post-session claim email
router.post('/bookings/:id/claim-email', requirePin, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const [booking] = await db.select().from(tableBookings).where(eq(tableBookings.id, id)).limit(1);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const [event] = await db
    .select({ title: tableEvents.title, venue_name: tableEvents.venue_name })
    .from(tableEvents)
    .where(eq(tableEvents.id, booking.event_id))
    .limit(1);

  if (!event) return res.status(404).json({ error: 'Event not found' });

  try {
    await sendTableClaimEmail({
      to: booking.email,
      name: booking.name,
      eventTitle: event.title,
      venueName: event.venue_name,
    });
    res.json({ sent: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to send email' });
  }
});

// Admin: GET /api/table/bookings
router.get('/bookings', requirePin, async (req: any, res: any) => {
  const event_id = req.query.event_id ? parseInt(req.query.event_id) : undefined;
  const bookings = event_id
    ? await db.select().from(tableBookings).where(eq(tableBookings.event_id, event_id)).orderBy(tableBookings.created_at)
    : await db.select().from(tableBookings).orderBy(tableBookings.created_at);
  res.json(bookings);
});

// Admin: POST /api/table/bookings/:id/refund
router.post('/bookings/:id/refund', requirePin, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const [booking] = await db.select().from(tableBookings).where(eq(tableBookings.id, id)).limit(1);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status === 'refunded') return res.status(400).json({ error: 'Already refunded' });
  if (!booking.stripe_payment_intent_id) return res.status(400).json({ error: 'No payment intent' });

  try {
    await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id });
    await db.update(tableBookings).set({ status: 'refunded' }).where(eq(tableBookings.id, booking.id));
    if (booking.status === 'confirmed') {
      await db.update(tableEvents)
        .set({ seats_taken: sql`${tableEvents.seats_taken} - ${booking.seats}` })
        .where(eq(tableEvents.id, booking.event_id));
    }
    res.json({ refunded: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Refund failed' });
  }
});

// ── Venue operator accounts ──────────────────────────────────────────────

const FRAISE_PLATFORM_FEE = 0.15; // 15% platform fee

async function requireVenueSession(req: any, res: any, next: any) {
  const token = req.headers['x-venue-token'] as string;
  if (!token) { res.status(401).json({ error: 'unauthorized' }); return; }
  const rows = await db.execute(sql`
    SELECT slug FROM table_venue_sessions
    WHERE token = ${token} AND expires_at > now()
    LIMIT 1
  `);
  const row = ((rows as any).rows ?? rows)[0] as any;
  if (!row) { res.status(401).json({ error: 'session expired' }); return; }
  req.venueSlug = row.slug;
  next();
}

// POST /api/table/venues/signup
router.post('/venues/signup', async (req: any, res: any) => {
  const displayName = String(req.body?.display_name ?? '').trim().slice(0, 200);
  const slug        = String(req.body?.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  const email       = String(req.body?.email ?? '').trim().slice(0, 200);
  const password    = String(req.body?.password ?? '');
  const priceCents  = parseInt(req.body?.price_cents) || 12000;
  if (!displayName || !slug || !email || password.length < 8) {
    return res.status(400).json({ error: 'display_name, slug, email, and password (8+ chars) required' });
  }
  try {
    const existing = await db.execute(sql`SELECT id FROM table_venues WHERE slug = ${slug} OR email = ${email} LIMIT 1`);
    if (((existing as any).rows ?? existing).length) {
      return res.status(409).json({ error: 'slug or email already taken' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.execute(sql`
      INSERT INTO table_venues (slug, display_name, email, password_hash, price_cents)
      VALUES (${slug}, ${displayName}, ${email}, ${passwordHash}, ${priceCents})
    `);
    const token = crypto.randomBytes(32).toString('hex');
    await db.execute(sql`
      INSERT INTO table_venue_sessions (slug, token, expires_at)
      VALUES (${slug}, ${token}, now() + interval '30 days')
    `);
    res.json({ ok: true, slug, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/table/venues/login
router.post('/venues/login', async (req: any, res: any) => {
  const email    = String(req.body?.email ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const rows = await db.execute(sql`SELECT slug, password_hash, display_name, price_cents, stripe_connect_onboarded FROM table_venues WHERE email = ${email} LIMIT 1`);
    const venue = ((rows as any).rows ?? rows)[0] as any;
    if (!venue) return res.status(401).json({ error: 'invalid credentials' });
    const valid = await bcrypt.compare(password, venue.password_hash);
    if (!valid) return res.status(401).json({ error: 'invalid credentials' });
    const token = crypto.randomBytes(32).toString('hex');
    await db.execute(sql`
      INSERT INTO table_venue_sessions (slug, token, expires_at)
      VALUES (${venue.slug}, ${token}, now() + interval '30 days')
    `);
    res.json({ ok: true, slug: venue.slug, display_name: venue.display_name, price_cents: venue.price_cents, stripe_connect_onboarded: venue.stripe_connect_onboarded, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/table/venues/me — operator's own venue info
router.get('/venues/me', requireVenueSession, async (req: any, res: any) => {
  const rows = await db.execute(sql`
    SELECT slug, display_name, email, price_cents, stripe_connect_account_id, stripe_connect_onboarded, created_at
    FROM table_venues WHERE slug = ${req.venueSlug} LIMIT 1
  `);
  const venue = ((rows as any).rows ?? rows)[0] as any;
  if (!venue) return res.status(404).json({ error: 'not found' });
  res.json(venue);
});

// POST /api/table/venues/connect — create Stripe Connect account + onboarding link
router.post('/venues/connect', requireVenueSession, async (req: any, res: any) => {
  const returnUrl = String(req.body?.return_url ?? 'https://fraise.box/table/admin');
  try {
    const rows = await db.execute(sql`SELECT stripe_connect_account_id FROM table_venues WHERE slug = ${req.venueSlug} LIMIT 1`);
    const venue = ((rows as any).rows ?? rows)[0] as any;
    if (!venue) return res.status(404).json({ error: 'not found' });

    let accountId = venue.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({ type: 'express' });
      accountId = account.id;
      await db.execute(sql`UPDATE table_venues SET stripe_connect_account_id = ${accountId} WHERE slug = ${req.venueSlug}`);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrl,
      return_url: returnUrl + '?connect=done',
      type: 'account_onboarding',
    });
    res.json({ url: link.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/table/venues/connect/verify — called on return from Stripe, marks onboarded
router.post('/venues/connect/verify', requireVenueSession, async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`SELECT stripe_connect_account_id FROM table_venues WHERE slug = ${req.venueSlug} LIMIT 1`);
    const venue = ((rows as any).rows ?? rows)[0] as any;
    if (!venue?.stripe_connect_account_id) return res.status(400).json({ error: 'no connect account' });
    const account = await stripe.accounts.retrieve(venue.stripe_connect_account_id);
    const onboarded = account.details_submitted;
    if (onboarded) {
      await db.execute(sql`UPDATE table_venues SET stripe_connect_onboarded = true WHERE slug = ${req.venueSlug}`);
    }
    res.json({ onboarded });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// ── Pool (table memberships) ─────────────────────────────────────────────

function poolCors(req: any, res: any, next: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
}

// GET /api/table/pool/directory — public listing of all venues with active pools
router.get('/pool/directory', async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        tm.slug,
        COALESCE(MIN(te.venue_name), tm.slug) AS display_name,
        COALESCE(MIN(te.price_cents), 12000)   AS price_cents,
        COUNT(*)::int                           AS total,
        SUM(CASE WHEN tm.status = 'waiting' THEN 1 ELSE 0 END)::int AS waiting
      FROM table_memberships tm
      LEFT JOIN table_events te
        ON te.venue_slug = tm.slug AND te.active = true
      GROUP BY tm.slug
      ORDER BY waiting DESC
    `);
    res.json({ venues: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/table/pool/checkout — create payment intent for joining the pool
router.post('/pool/checkout', poolCors, async (req: any, res: any) => {
  const slug = String(req.body?.slug ?? '').trim();
  const name = String(req.body?.name ?? '').trim().slice(0, 200);
  const email = String(req.body?.email ?? '').trim().slice(0, 200);
  const amountCents = parseInt(req.body?.amount_cents) || 0;
  if (!slug || !name || !email || amountCents < 100) {
    return res.status(400).json({ error: 'slug, name, email, and amount_cents required' });
  }
  try {
    // Check if venue has Stripe Connect set up
    const venueRows = await db.execute(sql`SELECT stripe_connect_account_id, stripe_connect_onboarded FROM table_venues WHERE slug = ${slug} LIMIT 1`);
    const venue = ((venueRows as any).rows ?? venueRows)[0] as any;

    const intentParams: any = {
      amount: amountCents,
      currency: 'cad',
      automatic_payment_methods: { enabled: true },
      metadata: { slug, name, email, type: 'table_pool' },
    };

    if (venue?.stripe_connect_onboarded && venue?.stripe_connect_account_id) {
      intentParams.application_fee_amount = Math.round(amountCents * FRAISE_PLATFORM_FEE);
      intentParams.transfer_data = { destination: venue.stripe_connect_account_id };
    }

    const intent = await stripe.paymentIntents.create(intentParams);
    res.json({ client_secret: intent.client_secret });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/table/pool/join — confirm membership after payment
router.post('/pool/join', poolCors, async (req: any, res: any) => {
  const slug = String(req.body?.slug ?? '').trim();
  const name = String(req.body?.name ?? '').trim().slice(0, 200);
  const email = String(req.body?.email ?? '').trim().slice(0, 200);
  const paymentIntentId = String(req.body?.payment_intent_id ?? '').trim();
  const amountCents = parseInt(req.body?.amount_cents) || 0;
  if (!slug || !name || !email || !paymentIntentId) {
    return res.status(400).json({ error: 'missing fields' });
  }
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return res.status(402).json({ error: 'payment not confirmed' });
    }
    await db.execute(sql`
      INSERT INTO table_memberships (slug, name, email, amount_cents, stripe_payment_intent_id, status)
      VALUES (${slug}, ${name}, ${email}, ${amountCents}, ${paymentIntentId}, 'waiting')
      ON CONFLICT (stripe_payment_intent_id) DO NOTHING
    `);
    // Get venue display name for email
    const venueRows = await db.execute(sql`SELECT display_name FROM table_venues WHERE slug = ${slug} LIMIT 1`);
    const venue = ((venueRows as any).rows ?? venueRows)[0] as any;
    const venueName = venue?.display_name ?? slug;
    sendPoolJoinConfirmation({ to: email, name, venueName }).catch(() => {});
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// GET /api/table/pool?slug= — admin: list pool members
router.get('/pool', requirePin, async (req: any, res: any) => {
  const slug = String(req.query.slug ?? '').trim();
  if (!slug) return res.status(400).json({ error: 'slug required' });
  try {
    const rows = await db.execute(sql`
      SELECT id, name, email, amount_cents, status, events_attended, last_called_at, created_at
      FROM table_memberships
      WHERE slug = ${slug}
      ORDER BY
        CASE status WHEN 'waiting' THEN 0 WHEN 'called' THEN 1 ELSE 2 END,
        created_at ASC
    `);
    const members = (rows as any).rows ?? rows;
    const waiting = members.filter((m: any) => m.status === 'waiting').length;
    res.json({ members, waiting, total: members.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/table/pool/call — admin: call N members from the pool (pin OR venue session)
router.post('/pool/call', async (req: any, res: any) => {
  // Accept either global admin PIN or a venue session token
  const pin = req.headers['x-admin-pin'];
  const venueToken = req.headers['x-venue-token'] as string;
  let authorizedSlug: string | null = null;

  if (pin && pin === process.env.ADMIN_PIN) {
    authorizedSlug = String(req.body?.slug ?? '').trim(); // global admin can call any slug
  } else if (venueToken) {
    const tokenRows = await db.execute(sql`SELECT slug FROM table_venue_sessions WHERE token = ${venueToken} AND expires_at > now() LIMIT 1`);
    const row = ((tokenRows as any).rows ?? tokenRows)[0] as any;
    if (row) authorizedSlug = row.slug; // operator can only call their own slug
  }

  if (!authorizedSlug) return res.status(401).json({ error: 'unauthorized' });

  const slug = authorizedSlug;
  const seats = parseInt(req.body?.seats) || 0;
  const note = String(req.body?.note ?? '').trim().slice(0, 500);
  if (seats < 1) return res.status(400).json({ error: 'seats required' });
  try {
    const rows = await db.execute(sql`
      SELECT id, name, email FROM table_memberships
      WHERE slug = ${slug} AND status = 'waiting'
      ORDER BY created_at ASC LIMIT ${seats}
    `);
    const members = (rows as any).rows ?? rows;
    if (!members.length) return res.status(400).json({ error: 'no waiting members' });
    const ids = members.map((m: any) => m.id);
    await db.execute(sql`UPDATE table_memberships SET status = 'called', last_called_at = now() WHERE id = ANY(${ids}::int[])`);

    // Get venue display name for emails
    const venueRows = await db.execute(sql`SELECT display_name FROM table_venues WHERE slug = ${slug} LIMIT 1`);
    const venue = ((venueRows as any).rows ?? venueRows)[0] as any;
    const venueName = venue?.display_name ?? slug;

    // Fire-and-forget notifications
    for (const m of members) {
      sendPoolCallNotification({ to: m.email, name: m.name, venueName, note: note || undefined }).catch(() => {});
    }

    res.json({ called: members, note });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

// POST /api/table/pool/attend — mark members as attended (pin or venue session)
router.post('/pool/attend', async (req: any, res: any) => {
  const pin = req.headers['x-admin-pin'];
  const venueToken = req.headers['x-venue-token'] as string;
  const isAdmin = pin && pin === process.env.ADMIN_PIN;
  if (!isAdmin && venueToken) {
    const r = await db.execute(sql`SELECT slug FROM table_venue_sessions WHERE token = ${venueToken} AND expires_at > now() LIMIT 1`);
    if (!((r as any).rows ?? r).length) return res.status(401).json({ error: 'unauthorized' });
  } else if (!isAdmin) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  // fall through to handler below
  return handleAttend(req, res);
});

async function handleAttend(req: any, res: any) {
  const ids: number[] = req.body?.ids ?? [];
  if (!ids.length) return res.status(400).json({ error: 'ids required' });
  try {
    await db.execute(sql`
      UPDATE table_memberships
      SET status = 'waiting', events_attended = events_attended + 1, last_called_at = now()
      WHERE id = ANY(${ids}::int[])
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
}

// GET /api/table/pool/slugs — admin: list all slugs that have a pool
router.get('/pool/slugs', requirePin, async (req: any, res: any) => {
  try {
    const rows = await db.execute(sql`
      SELECT slug, count(*) as total,
             sum(case when status = 'waiting' then 1 else 0 end) as waiting,
             sum(amount_cents) as total_cents
      FROM table_memberships
      GROUP BY slug
      ORDER BY slug
    `);
    res.json({ slugs: (rows as any).rows ?? rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'internal' });
  }
});

export default router;
