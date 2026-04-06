import { Router, Request, Response } from 'express';
import { eq, and, sql, avg, count, desc, isNull, isNotNull } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '../db';
import { users, businesses, toiletVisits, personalToilets } from '../db/schema';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';
import { logger } from '../lib/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
const router = Router();

const ACCESS_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes — hardware-ready expiry window

// Self-healing
db.execute(sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS has_toilet boolean NOT NULL DEFAULT false`).catch(() => {});
db.execute(sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS toilet_fee_cents integer NOT NULL DEFAULT 150`).catch(() => {});
db.execute(sql`
  CREATE TABLE IF NOT EXISTS personal_toilets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    instagram_handle TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});
db.execute(sql`
  CREATE TABLE IF NOT EXISTS toilet_visits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    business_id INTEGER REFERENCES businesses(id),
    personal_toilet_id INTEGER REFERENCES personal_toilets(id),
    fee_cents INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    stripe_payment_intent_id TEXT,
    paid BOOLEAN NOT NULL DEFAULT false,
    access_code TEXT,
    access_code_expires_at TIMESTAMP,
    rating INTEGER,
    review_note TEXT,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});
// Migrate existing toilet_visits: drop NOT NULL on business_id, add new columns
db.execute(sql`ALTER TABLE toilet_visits ALTER COLUMN business_id DROP NOT NULL`).catch(() => {});
db.execute(sql`ALTER TABLE toilet_visits ADD COLUMN IF NOT EXISTS personal_toilet_id INTEGER REFERENCES personal_toilets(id)`).catch(() => {});
db.execute(sql`ALTER TABLE toilet_visits ADD COLUMN IF NOT EXISTS access_code_expires_at TIMESTAMP`).catch(() => {});

function generateAccessCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function codeExpiry(): Date {
  return new Date(Date.now() + ACCESS_CODE_TTL_MS);
}

// ─── Personal toilet listings ─────────────────────────────────────────────────

// POST /api/toilets/personal — create or update your listing
router.post('/personal', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { title, description, price_cents, address, lat, lng, instagram_handle } = req.body;
  if (!title?.trim() || !address?.trim() || !price_cents || price_cents < 1) {
    res.status(400).json({ error: 'title, address, price_cents required' }); return;
  }
  try {
    const [existing] = await db.select({ id: personalToilets.id })
      .from(personalToilets).where(eq(personalToilets.user_id, userId));
    if (existing) {
      const [updated] = await db.update(personalToilets).set({
        title: title.trim(),
        description: description?.trim() || null,
        price_cents,
        address: address.trim(),
        latitude: lat ?? null,
        longitude: lng ?? null,
        instagram_handle: instagram_handle?.trim() || null,
      }).where(eq(personalToilets.id, existing.id)).returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(personalToilets).values({
        user_id: userId,
        title: title.trim(),
        description: description?.trim() || null,
        price_cents,
        address: address.trim(),
        latitude: lat ?? null,
        longitude: lng ?? null,
        instagram_handle: instagram_handle?.trim() || null,
      }).returning();
      res.json(created);
    }
  } catch (err) {
    logger.error(`Personal toilet upsert error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/toilets/personal/toggle — toggle active
router.patch('/personal/toggle', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [listing] = await db.select({ id: personalToilets.id, active: personalToilets.active })
      .from(personalToilets).where(eq(personalToilets.user_id, userId));
    if (!listing) { res.status(404).json({ error: 'no listing' }); return; }
    const [updated] = await db.update(personalToilets).set({ active: !listing.active })
      .where(eq(personalToilets.id, listing.id)).returning();
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/toilets/personal/mine — your own listing + earnings + recent reviews
router.get('/personal/mine', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [listing] = await db.select().from(personalToilets)
      .where(eq(personalToilets.user_id, userId));
    if (!listing) { res.json(null); return; }

    const [summary] = await db.select({
      avg_rating: avg(toiletVisits.rating),
      visit_count: count(toiletVisits.id),
    }).from(toiletVisits)
      .where(and(eq(toiletVisits.personal_toilet_id, listing.id), eq(toiletVisits.paid, true)));

    const [earnings] = await db.select({ ad_balance_cents: users.ad_balance_cents })
      .from(users).where(eq(users.id, userId));

    const recent = await db.select({
      id: toiletVisits.id,
      rating: toiletVisits.rating,
      review_note: toiletVisits.review_note,
      reviewed_at: toiletVisits.reviewed_at,
    }).from(toiletVisits)
      .where(and(eq(toiletVisits.personal_toilet_id, listing.id), isNotNull(toiletVisits.rating)))
      .orderBy(desc(toiletVisits.reviewed_at))
      .limit(5);

    res.json({
      listing: {
        ...listing,
        lat: listing.latitude ? parseFloat(String(listing.latitude)) : null,
        lng: listing.longitude ? parseFloat(String(listing.longitude)) : null,
      },
      avg_rating: summary?.avg_rating ? parseFloat(String(summary.avg_rating)) : null,
      visit_count: Number(summary?.visit_count ?? 0),
      ad_balance_cents: earnings?.ad_balance_cents ?? 0,
      recent_reviews: recent,
    });
  } catch (err) {
    logger.error(`Personal toilet mine error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/toilets/personal — all active listings for map (auth required)
router.get('/personal', requireUser, async (req: Request, res: Response) => {
  try {
    const listings = await db.select({
      id: personalToilets.id,
      title: personalToilets.title,
      description: personalToilets.description,
      price_cents: personalToilets.price_cents,
      address: personalToilets.address,
      latitude: personalToilets.latitude,
      longitude: personalToilets.longitude,
      instagram_handle: personalToilets.instagram_handle,
      user_id: personalToilets.user_id,
      display_name: users.display_name,
    }).from(personalToilets)
      .innerJoin(users, eq(personalToilets.user_id, users.id))
      .where(and(eq(personalToilets.active, true), isNotNull(personalToilets.latitude)));

    res.json(listings.map(l => ({
      ...l,
      lat: l.latitude ? parseFloat(String(l.latitude)) : null,
      lng: l.longitude ? parseFloat(String(l.longitude)) : null,
    })));
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/toilets/personal/:id/reviews
router.get('/personal/:id/reviews', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [summary] = await db.select({
      avg_rating: avg(toiletVisits.rating),
      review_count: count(toiletVisits.id),
    }).from(toiletVisits)
      .where(and(eq(toiletVisits.personal_toilet_id, id), isNotNull(toiletVisits.rating)));

    const recent = await db.select({
      id: toiletVisits.id,
      rating: toiletVisits.rating,
      review_note: toiletVisits.review_note,
      reviewed_at: toiletVisits.reviewed_at,
    }).from(toiletVisits)
      .where(and(eq(toiletVisits.personal_toilet_id, id), isNotNull(toiletVisits.rating)))
      .orderBy(desc(toiletVisits.reviewed_at))
      .limit(5);

    res.json({
      avg_rating: summary?.avg_rating ? parseFloat(String(summary.avg_rating)) : null,
      review_count: Number(summary?.review_count ?? 0),
      reviews: recent,
    });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Business toilet visit ────────────────────────────────────────────────────

// POST /api/toilets/visit — body: { business_id, payment_method }
router.post('/visit', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { business_id, payment_method } = req.body;
  if (!business_id || !['stripe', 'ad_balance'].includes(payment_method)) {
    res.status(400).json({ error: 'business_id and payment_method (stripe|ad_balance) required' }); return;
  }
  try {
    const [biz] = await db.select({ id: businesses.id, has_toilet: businesses.has_toilet, toilet_fee_cents: businesses.toilet_fee_cents })
      .from(businesses).where(eq(businesses.id, business_id));
    if (!biz?.has_toilet) { res.status(404).json({ error: 'no_toilet' }); return; }
    const feeCents = biz.toilet_fee_cents;
    const expires = codeExpiry();

    if (payment_method === 'ad_balance') {
      const deducted = await db.update(users)
        .set({ ad_balance_cents: sql`${users.ad_balance_cents} - ${feeCents}` })
        .where(and(eq(users.id, userId), sql`${users.ad_balance_cents} >= ${feeCents}`))
        .returning({ ad_balance_cents: users.ad_balance_cents });
      if (!deducted.length) { res.status(402).json({ error: 'insufficient_balance' }); return; }
      const code = generateAccessCode();
      const [visit] = await db.insert(toiletVisits).values({
        user_id: userId, business_id, fee_cents: feeCents,
        payment_method: 'ad_balance', paid: true, access_code: code, access_code_expires_at: expires,
      }).returning();
      res.json({ visit_id: visit.id, access_code: code, fee_cents: feeCents });
    } else {
      const [visit] = await db.insert(toiletVisits).values({
        user_id: userId, business_id, fee_cents: feeCents, payment_method: 'stripe', paid: false,
      }).returning();
      const pi = await stripe.paymentIntents.create({
        amount: feeCents, currency: 'cad',
        metadata: { type: 'toilet_visit', visit_id: String(visit.id), user_id: String(userId) },
      });
      await db.update(toiletVisits).set({ stripe_payment_intent_id: pi.id }).where(eq(toiletVisits.id, visit.id));
      res.json({ visit_id: visit.id, client_secret: pi.client_secret, fee_cents: feeCents });
    }
  } catch (err) {
    logger.error(`Toilet visit error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Personal toilet visit ────────────────────────────────────────────────────

// POST /api/toilets/personal-visit — body: { personal_toilet_id, payment_method }
router.post('/personal-visit', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { personal_toilet_id, payment_method } = req.body;
  if (!personal_toilet_id || !['stripe', 'ad_balance'].includes(payment_method)) {
    res.status(400).json({ error: 'personal_toilet_id and payment_method required' }); return;
  }
  try {
    const [listing] = await db.select({
      id: personalToilets.id,
      user_id: personalToilets.user_id,
      price_cents: personalToilets.price_cents,
      active: personalToilets.active,
      title: personalToilets.title,
    }).from(personalToilets).where(eq(personalToilets.id, personal_toilet_id));

    if (!listing?.active) { res.status(404).json({ error: 'not_available' }); return; }
    if (listing.user_id === userId) { res.status(400).json({ error: 'cannot_visit_own' }); return; }

    const feeCents = listing.price_cents;
    const expires = codeExpiry();

    if (payment_method === 'ad_balance') {
      const deducted = await db.update(users)
        .set({ ad_balance_cents: sql`${users.ad_balance_cents} - ${feeCents}` })
        .where(and(eq(users.id, userId), sql`${users.ad_balance_cents} >= ${feeCents}`))
        .returning({ ad_balance_cents: users.ad_balance_cents });
      if (!deducted.length) { res.status(402).json({ error: 'insufficient_balance' }); return; }

      const code = generateAccessCode();
      const [visit] = await db.insert(toiletVisits).values({
        user_id: userId, personal_toilet_id, fee_cents: feeCents,
        payment_method: 'ad_balance', paid: true, access_code: code, access_code_expires_at: expires,
      }).returning();

      // Credit host
      await db.update(users)
        .set({ ad_balance_cents: sql`${users.ad_balance_cents} + ${feeCents}` })
        .where(eq(users.id, listing.user_id));

      // Notify host
      const [host] = await db.select({ push_token: users.push_token })
        .from(users).where(eq(users.id, listing.user_id));
      if (host?.push_token) {
        sendPushNotification(host.push_token, {
          title: 'Someone is visiting your toilet',
          body: `CA$${(feeCents / 100).toFixed(2)} earned from "${listing.title}"`,
          data: { screen: 'terminal' },
        }).catch(() => {});
      }

      res.json({ visit_id: visit.id, access_code: code, fee_cents: feeCents });
    } else {
      const [visit] = await db.insert(toiletVisits).values({
        user_id: userId, personal_toilet_id, fee_cents: feeCents, payment_method: 'stripe', paid: false,
      }).returning();
      const pi = await stripe.paymentIntents.create({
        amount: feeCents, currency: 'cad',
        metadata: {
          type: 'personal_toilet_visit',
          visit_id: String(visit.id),
          user_id: String(userId),
          host_user_id: String(listing.user_id),
          listing_title: listing.title,
        },
      });
      await db.update(toiletVisits).set({ stripe_payment_intent_id: pi.id }).where(eq(toiletVisits.id, visit.id));
      res.json({ visit_id: visit.id, client_secret: pi.client_secret, fee_cents: feeCents });
    }
  } catch (err) {
    logger.error(`Personal toilet visit error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Shared visit endpoints ───────────────────────────────────────────────────

// POST /api/toilets/visits/:id/confirm — client-side Stripe confirmation fallback
// Also the endpoint a hardware lock will call to verify entry
router.post('/visits/:id/confirm', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const visitId = parseInt(req.params.id, 10);
  if (isNaN(visitId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [visit] = await db.select().from(toiletVisits)
      .where(and(eq(toiletVisits.id, visitId), eq(toiletVisits.user_id, userId)));
    if (!visit) { res.status(404).json({ error: 'not found' }); return; }

    if (visit.paid && visit.access_code) {
      // Check expiry (hardware gate)
      if (visit.access_code_expires_at && new Date() > visit.access_code_expires_at) {
        res.status(410).json({ error: 'code_expired' }); return;
      }
      res.json({ access_code: visit.access_code, expires_at: visit.access_code_expires_at }); return;
    }

    if (!visit.stripe_payment_intent_id) { res.status(400).json({ error: 'no_payment_intent' }); return; }
    const pi = await stripe.paymentIntents.retrieve(visit.stripe_payment_intent_id);
    if (pi.status !== 'succeeded') { res.status(402).json({ error: 'not_paid' }); return; }

    const code = generateAccessCode();
    const expires = codeExpiry();
    await db.update(toiletVisits).set({ paid: true, access_code: code, access_code_expires_at: expires })
      .where(eq(toiletVisits.id, visitId));
    res.json({ access_code: code, expires_at: expires });
  } catch (err) {
    logger.error(`Toilet confirm error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/toilets/visits/:id/review
router.post('/visits/:id/review', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const visitId = parseInt(req.params.id, 10);
  const { rating, note } = req.body;
  if (isNaN(visitId) || !rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'rating (1-5) required' }); return;
  }
  try {
    const [visit] = await db.select({ id: toiletVisits.id, paid: toiletVisits.paid, reviewed_at: toiletVisits.reviewed_at })
      .from(toiletVisits).where(and(eq(toiletVisits.id, visitId), eq(toiletVisits.user_id, userId)));
    if (!visit) { res.status(404).json({ error: 'not found' }); return; }
    if (!visit.paid) { res.status(402).json({ error: 'not_paid' }); return; }
    if (visit.reviewed_at) { res.status(409).json({ error: 'already_reviewed' }); return; }
    await db.update(toiletVisits).set({
      rating, review_note: note?.trim() || null, reviewed_at: new Date(),
    }).where(eq(toiletVisits.id, visitId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Business toilet reviews ──────────────────────────────────────────────────

// GET /api/toilets/reviews/:businessId
router.get('/reviews/:businessId', async (req: Request, res: Response) => {
  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [summary] = await db.select({
      avg_rating: avg(toiletVisits.rating),
      review_count: count(toiletVisits.id),
    }).from(toiletVisits)
      .where(and(eq(toiletVisits.business_id, businessId), isNotNull(toiletVisits.rating)));

    const recent = await db.select({
      id: toiletVisits.id, rating: toiletVisits.rating,
      review_note: toiletVisits.review_note, reviewed_at: toiletVisits.reviewed_at,
    }).from(toiletVisits)
      .where(and(eq(toiletVisits.business_id, businessId), isNotNull(toiletVisits.rating)))
      .orderBy(desc(toiletVisits.reviewed_at)).limit(5);

    res.json({
      avg_rating: summary?.avg_rating ? parseFloat(String(summary.avg_rating)) : null,
      review_count: Number(summary?.review_count ?? 0),
      reviews: recent,
    });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
