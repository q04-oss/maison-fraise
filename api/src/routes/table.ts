import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { tableEvents, tableInstructors, tableBookings } from '../db/schema';
import { eq, and, gt, sql } from 'drizzle-orm';
import { stripe } from '../lib/stripe';

function requirePin(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers['x-admin-pin'];
  if (!pin || pin !== process.env.ADMIN_PIN) {
    res.status(401).json({ error: 'Invalid or missing X-Admin-PIN header' });
    return;
  }
  next();
}

const router = Router();

// Fraise takes 15%, venue takes 20%, instructor takes 65%
const FRAISE_CUT = 0.15;
const VENUE_CUT = 0.20;

// GET /api/table/events — all active upcoming events with instructor
router.get('/events', async (_req, res: any) => {
  try {
    const events = await db
      .select({
        id: tableEvents.id,
        title: tableEvents.title,
        venue_name: tableEvents.venue_name,
        venue_address: tableEvents.venue_address,
        event_date: tableEvents.event_date,
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
      .where(and(eq(tableEvents.active, true), gt(tableEvents.event_date, new Date())));
    res.json(events);
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

// POST /api/table/events/:id/checkout — create Stripe payment intent
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
    if (event.seats_taken + seats > event.capacity) {
      return res.status(409).json({ error: 'Not enough seats available' });
    }

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
      },
      description: `table — ${event.title} · ${name}`,
    });

    // Reserve booking as pending
    await db.insert(tableBookings).values({
      event_id: event.id,
      name,
      email,
      seats,
      total_cents: totalCents,
      stripe_payment_intent_id: intent.id,
      status: 'pending',
    });

    res.json({ client_secret: intent.client_secret, total_cents: totalCents });
  } catch (err) {
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// POST /api/table/webhook — confirm booking on payment success
// (registered in app.ts alongside the main stripe webhook)
export async function handleTablePayment(paymentIntentId: string) {
  const [booking] = await db
    .select()
    .from(tableBookings)
    .where(eq(tableBookings.stripe_payment_intent_id, paymentIntentId))
    .limit(1);

  if (!booking || booking.status !== 'pending') return;

  await db
    .update(tableBookings)
    .set({ status: 'confirmed' })
    .where(eq(tableBookings.id, booking.id));

  await db
    .update(tableEvents)
    .set({ seats_taken: sql`${tableEvents.seats_taken} + ${booking.seats}` })
    .where(eq(tableEvents.id, booking.event_id));
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
  const { instructor_id, title, venue_name, venue_address, event_date, duration_minutes, price_cents, capacity, description } = req.body;
  if (!instructor_id || !title || !venue_name || !event_date || !price_cents) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const [event] = await db.insert(tableEvents).values({
    instructor_id,
    title,
    venue_name,
    venue_address,
    event_date: new Date(event_date),
    duration_minutes: duration_minutes ?? 120,
    price_cents,
    capacity: capacity ?? 12,
    description,
  }).returning();
  res.json(event);
});

// Admin: PATCH /api/table/events/:id
router.patch('/events/:id', requirePin, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { active, capacity, price_cents, description } = req.body;
  const updates: any = {};
  if (active !== undefined) updates.active = active;
  if (capacity !== undefined) updates.capacity = capacity;
  if (price_cents !== undefined) updates.price_cents = price_cents;
  if (description !== undefined) updates.description = description;
  const [event] = await db.update(tableEvents).set(updates).where(eq(tableEvents.id, id)).returning();
  res.json(event);
});

export default router;
