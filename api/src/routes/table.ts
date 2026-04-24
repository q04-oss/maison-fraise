import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { tableEvents, tableInstructors, tableBookings } from '../db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { stripe } from '../lib/stripe';
import { sendTableBookingConfirmation, sendTableClaimEmail } from '../lib/resend';

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
        instructor_name: tableInstructors.name,
        instructor_bio: tableInstructors.bio,
        instructor_photo_url: tableInstructors.photo_url,
      })
      .from(tableEvents)
      .innerJoin(tableInstructors, eq(tableEvents.instructor_id, tableInstructors.id))
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
    await db.update(tableBookings).set({ status: 'waitlisted' }).where(eq(tableBookings.id, booking.id));
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
  const { instructor_id, title, venue_name, venue_address, event_date, duration_minutes, price_cents, capacity, description, event_type } = req.body;
  if (!instructor_id || !title || !venue_name || !price_cents) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const type = event_type === 'private' ? 'private' : 'group';
  // group: max 4 seats (2 per employee, up to 2 employees)
  // private: exactly 2 seats (couple + 1 employee)
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
    description,
    event_type: type,
  }).returning();
  res.json(event);
});

// Admin: PATCH /api/table/events/:id
router.patch('/events/:id', requirePin, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { active, capacity, price_cents, description, event_date } = req.body;
  const updates: any = {};
  if (active !== undefined) updates.active = active;
  if (capacity !== undefined) updates.capacity = capacity;
  if (price_cents !== undefined) updates.price_cents = price_cents;
  if (description !== undefined) updates.description = description;
  if (event_date !== undefined) {
    updates.event_date = new Date(event_date);
    updates.date_tbd = false;
  }
  const [event] = await db.update(tableEvents).set(updates).where(eq(tableEvents.id, id)).returning();
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

export default router;
