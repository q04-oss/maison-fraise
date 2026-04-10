import { Router, Request, Response } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { itineraries, itineraryDestinations, itineraryProposals, users, businesses } from '../db/schema';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';
import { logger } from '../lib/logger';

const router = Router();

// Self-healing migrations
db.execute(sql`
  CREATE TABLE IF NOT EXISTS itineraries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS itinerary_destinations (
    id SERIAL PRIMARY KEY,
    itinerary_id INTEGER NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
    business_id INTEGER REFERENCES businesses(id),
    place_name TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    lat DECIMAL(10,7),
    lng DECIMAL(10,7),
    arrival_date TEXT,
    departure_date TEXT,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS itinerary_proposals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    itinerary_id INTEGER REFERENCES itineraries(id),
    destination_id INTEGER REFERENCES itinerary_destinations(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    value_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMP,
    visit_confirmed_at TIMESTAMP
  )
`).catch(() => {});

// ─── Proposals (must be registered before /:id to prevent parameter capture) ──

// GET /api/itineraries/proposals/mine — incoming proposals for this user
router.get('/proposals/mine', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const proposals = await db.select({
      id: itineraryProposals.id,
      business_id: itineraryProposals.business_id,
      business_name: businesses.name,
      itinerary_id: itineraryProposals.itinerary_id,
      destination_id: itineraryProposals.destination_id,
      title: itineraryProposals.title,
      body: itineraryProposals.body,
      value_cents: itineraryProposals.value_cents,
      status: itineraryProposals.status,
      created_at: itineraryProposals.created_at,
      responded_at: itineraryProposals.responded_at,
    }).from(itineraryProposals)
      .leftJoin(businesses, eq(itineraryProposals.business_id, businesses.id))
      .where(eq(itineraryProposals.user_id, userId))
      .orderBy(desc(itineraryProposals.created_at));
    res.json(proposals);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/itineraries/proposals — shop user sends proposal to a user
router.post('/proposals', requireUser, async (req: Request, res: Response) => {
  const senderId = (req as any).userId as number;
  const { user_id, itinerary_id, destination_id, title, body, value_cents } = req.body;
  if (!user_id || !title?.trim() || !body?.trim() || !value_cents || value_cents < 1) {
    res.status(400).json({ error: 'user_id, title, body, value_cents required' }); return;
  }
  try {
    const [sender] = await db.select({ is_shop: users.is_shop, business_id: users.business_id })
      .from(users).where(eq(users.id, senderId));
    if (!sender?.is_shop || !sender.business_id) {
      res.status(403).json({ error: 'only shop accounts can send proposals' }); return;
    }
    const [proposal] = await db.insert(itineraryProposals).values({
      user_id, business_id: sender.business_id,
      itinerary_id: itinerary_id ?? null, destination_id: destination_id ?? null,
      title: title.trim(), body: body.trim(), value_cents,
    }).returning();
    const [recipient] = await db.select({ push_token: users.push_token })
      .from(users).where(eq(users.id, user_id));
    const [biz] = await db.select({ name: businesses.name })
      .from(businesses).where(eq(businesses.id, sender.business_id));
    if (recipient?.push_token) {
      sendPushNotification(recipient.push_token, {
        title: `${biz?.name ?? 'A property'} wants you`,
        body: `${title.trim()} — CA$${(value_cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 0 })}`,
        data: { screen: 'proposals' },
      }).catch(() => {});
    }
    res.status(201).json(proposal);
  } catch (err) {
    logger.error(`Proposal create error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/itineraries/proposals/:id/accept — atomic: status guard in WHERE prevents double-accept
router.patch('/proposals/:id/accept', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    // Single atomic UPDATE — only succeeds if still pending and owned by this user
    // Prevents race condition: a concurrent request will find 0 rows updated
    const [accepted] = await db.update(itineraryProposals)
      .set({ status: 'accepted', responded_at: new Date() })
      .where(and(
        eq(itineraryProposals.id, id),
        eq(itineraryProposals.user_id, userId),
        eq(itineraryProposals.status, 'pending'),
      ))
      .returning();
    if (!accepted) { res.status(409).json({ error: 'not found or already responded' }); return; }

    // Credit balance inside transaction — if this fails, the proposal stays accepted
    // and can be manually reconciled. This is preferable to double-crediting.
    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({ ad_balance_cents: sql`${users.ad_balance_cents} + ${accepted.value_cents}` })
        .where(eq(users.id, userId));
    });

    // Notify shop — fire-and-forget
    (async () => {
      try {
        const [shopUser] = await db.select({ push_token: users.push_token })
          .from(users)
          .where(and(eq(users.is_shop, true), eq(users.business_id, accepted.business_id)))
          .limit(1);
        if (shopUser?.push_token) {
          const [recipient] = await db.select({ display_name: users.display_name })
            .from(users).where(eq(users.id, userId));
          sendPushNotification(shopUser.push_token, {
            title: 'Proposal accepted',
            body: `${recipient?.display_name ?? 'A guest'} accepted your invitation — they're coming.`,
            data: { screen: 'terminal' },
          }).catch(() => {});
        }
      } catch { /* non-fatal */ }
    })();

    res.json({ ok: true, credited_cents: accepted.value_cents });
  } catch (err) {
    logger.error(`Proposal accept error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/itineraries/proposals/:id/decline
router.patch('/proposals/:id/decline', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [updated] = await db.update(itineraryProposals)
      .set({ status: 'declined', responded_at: new Date() })
      .where(and(
        eq(itineraryProposals.id, id),
        eq(itineraryProposals.user_id, userId),
        eq(itineraryProposals.status, 'pending'),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: 'not found or already responded' }); return; }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/itineraries/region — shop users see forward-looking itinerary demand
router.get('/region', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { country, city } = req.query;
  if (!country) { res.status(400).json({ error: 'country required' }); return; }
  try {
    const [sender] = await db.select({ is_shop: users.is_shop })
      .from(users).where(eq(users.id, userId));
    if (!sender?.is_shop) { res.status(403).json({ error: 'shop accounts only' }); return; }
    const dests = await db.select({
      user_id: itineraries.user_id,
      itinerary_id: itineraryDestinations.itinerary_id,
      arrival_date: itineraryDestinations.arrival_date,
      departure_date: itineraryDestinations.departure_date,
      city: itineraryDestinations.city,
      country: itineraryDestinations.country,
    }).from(itineraryDestinations)
      .innerJoin(itineraries, and(
        eq(itineraryDestinations.itinerary_id, itineraries.id),
        eq(itineraries.status, 'active'),
      ))
      .where(
        city
          ? and(eq(itineraryDestinations.country, String(country)), eq(itineraryDestinations.city, String(city)))
          : eq(itineraryDestinations.country, String(country))
      );
    const uniqueUsers = new Set(dests.map(d => d.user_id)).size;
    res.json({ country, city: city ?? null, traveller_count: uniqueUsers, destinations: dests.length });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Itineraries CRUD ─────────────────────────────────────────────────────────

// GET /api/itineraries — list mine
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.select().from(itineraries)
      .where(eq(itineraries.user_id, userId))
      .orderBy(desc(itineraries.updated_at));

    // Attach destination count to each
    const withCounts = await Promise.all(rows.map(async (it) => {
      const dests = await db.select({ id: itineraryDestinations.id })
        .from(itineraryDestinations).where(eq(itineraryDestinations.itinerary_id, it.id));
      const proposals = await db.select({ id: itineraryProposals.id })
        .from(itineraryProposals)
        .where(and(eq(itineraryProposals.itinerary_id, it.id), eq(itineraryProposals.status, 'pending')));
      return { ...it, destination_count: dests.length, pending_proposals: proposals.length };
    }));

    res.json(withCounts);
  } catch (err) {
    logger.error(`Itinerary list error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/itineraries — create
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { title, description } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'title required' }); return; }
  try {
    const [created] = await db.insert(itineraries)
      .values({ user_id: userId, title: title.trim(), description: description?.trim() ?? null })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    logger.error(`Itinerary create error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/itineraries/:id — detail with destinations
router.get('/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [it] = await db.select().from(itineraries)
      .where(and(eq(itineraries.id, id), eq(itineraries.user_id, userId)));
    if (!it) { res.status(404).json({ error: 'not found' }); return; }

    const destinations = await db.select().from(itineraryDestinations)
      .where(eq(itineraryDestinations.itinerary_id, id))
      .orderBy(itineraryDestinations.sort_order, itineraryDestinations.arrival_date);

    const proposals = await db.select({
      id: itineraryProposals.id,
      business_id: itineraryProposals.business_id,
      business_name: businesses.name,
      destination_id: itineraryProposals.destination_id,
      title: itineraryProposals.title,
      body: itineraryProposals.body,
      value_cents: itineraryProposals.value_cents,
      status: itineraryProposals.status,
      created_at: itineraryProposals.created_at,
    }).from(itineraryProposals)
      .leftJoin(businesses, eq(itineraryProposals.business_id, businesses.id))
      .where(eq(itineraryProposals.itinerary_id, id))
      .orderBy(desc(itineraryProposals.created_at));

    res.json({ ...it, destinations, proposals });
  } catch (err) {
    logger.error(`Itinerary detail error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/itineraries/:id
router.patch('/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const { title, description, status } = req.body;
  try {
    const updates: Record<string, any> = { updated_at: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim() ?? null;
    if (status !== undefined) updates.status = status;
    const [updated] = await db.update(itineraries).set(updates)
      .where(and(eq(itineraries.id, id), eq(itineraries.user_id, userId)))
      .returning();
    if (!updated) { res.status(404).json({ error: 'not found' }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/itineraries/:id
router.delete('/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    await db.delete(itineraries)
      .where(and(eq(itineraries.id, id), eq(itineraries.user_id, userId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Destinations ─────────────────────────────────────────────────────────────

// POST /api/itineraries/:id/destinations
router.post('/:id/destinations', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const itineraryId = parseInt(req.params.id, 10);
  if (isNaN(itineraryId)) { res.status(400).json({ error: 'invalid id' }); return; }
  const { place_name, city, country, lat, lng, arrival_date, departure_date, notes, business_id } = req.body;
  if (!place_name?.trim() || !city?.trim() || !country?.trim()) {
    res.status(400).json({ error: 'place_name, city, country required' }); return;
  }
  try {
    // Verify ownership
    const [it] = await db.select({ id: itineraries.id })
      .from(itineraries).where(and(eq(itineraries.id, itineraryId), eq(itineraries.user_id, userId)));
    if (!it) { res.status(404).json({ error: 'itinerary not found' }); return; }

    // Auto sort_order = current count
    const existing = await db.select({ id: itineraryDestinations.id })
      .from(itineraryDestinations).where(eq(itineraryDestinations.itinerary_id, itineraryId));

    const [dest] = await db.insert(itineraryDestinations).values({
      itinerary_id: itineraryId,
      business_id: business_id ?? null,
      place_name: place_name.trim(),
      city: city.trim(),
      country: country.trim(),
      lat: lat ?? null,
      lng: lng ?? null,
      arrival_date: arrival_date ?? null,
      departure_date: departure_date ?? null,
      notes: notes?.trim() ?? null,
      sort_order: existing.length,
    }).returning();

    // Touch itinerary updated_at
    await db.update(itineraries).set({ updated_at: new Date() }).where(eq(itineraries.id, itineraryId));

    res.status(201).json(dest);
  } catch (err) {
    logger.error(`Destination create error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/itineraries/:id/destinations/:destId
router.patch('/:id/destinations/:destId', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const itineraryId = parseInt(req.params.id, 10);
  const destId = parseInt(req.params.destId, 10);
  if (isNaN(itineraryId) || isNaN(destId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [it] = await db.select({ id: itineraries.id })
      .from(itineraries).where(and(eq(itineraries.id, itineraryId), eq(itineraries.user_id, userId)));
    if (!it) { res.status(404).json({ error: 'itinerary not found' }); return; }

    const { place_name, city, country, lat, lng, arrival_date, departure_date, notes } = req.body;
    const updates: Record<string, any> = {};
    if (place_name !== undefined) updates.place_name = place_name.trim();
    if (city !== undefined) updates.city = city.trim();
    if (country !== undefined) updates.country = country.trim();
    if (lat !== undefined) updates.lat = lat;
    if (lng !== undefined) updates.lng = lng;
    if (arrival_date !== undefined) updates.arrival_date = arrival_date;
    if (departure_date !== undefined) updates.departure_date = departure_date;
    if (notes !== undefined) updates.notes = notes?.trim() ?? null;

    const [updated] = await db.update(itineraryDestinations).set(updates)
      .where(and(eq(itineraryDestinations.id, destId), eq(itineraryDestinations.itinerary_id, itineraryId)))
      .returning();
    if (!updated) { res.status(404).json({ error: 'destination not found' }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/itineraries/:id/destinations/:destId
router.delete('/:id/destinations/:destId', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const itineraryId = parseInt(req.params.id, 10);
  const destId = parseInt(req.params.destId, 10);
  if (isNaN(itineraryId) || isNaN(destId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [it] = await db.select({ id: itineraries.id })
      .from(itineraries).where(and(eq(itineraries.id, itineraryId), eq(itineraries.user_id, userId)));
    if (!it) { res.status(404).json({ error: 'itinerary not found' }); return; }
    await db.delete(itineraryDestinations)
      .where(and(eq(itineraryDestinations.id, destId), eq(itineraryDestinations.itinerary_id, itineraryId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
