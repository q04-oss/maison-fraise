import { Router, Request, Response } from 'express';
import { sql, eq, and, gt, gte, desc } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';
import { users, marketVendors, marketListings, marketOrders, marketOrderItems } from '../db/schema';

const router = Router();

// ─── Self-healing tables ──────────────────────────────────────────────────────

db.execute(sql`
  CREATE TABLE IF NOT EXISTS market_dates (
    id serial PRIMARY KEY,
    name text NOT NULL,
    location text NOT NULL,
    address text NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'scheduled',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS market_stalls (
    id serial PRIMARY KEY,
    market_date_id integer NOT NULL REFERENCES market_dates(id),
    vendor_user_id integer,
    vendor_name text NOT NULL,
    description text,
    confirmed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS market_products (
    id serial PRIMARY KEY,
    stall_id integer NOT NULL REFERENCES market_stalls(id),
    name text NOT NULL,
    description text,
    price_cents integer NOT NULL,
    unit text NOT NULL DEFAULT 'unit',
    stock_quantity integer,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS market_orders (
    id serial PRIMARY KEY,
    market_date_id integer NOT NULL REFERENCES market_dates(id),
    stall_id integer NOT NULL REFERENCES market_stalls(id),
    product_id integer NOT NULL REFERENCES market_products(id),
    buyer_user_id integer NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    amount_paid_cents integer NOT NULL,
    payment_intent_id text UNIQUE,
    status text NOT NULL DEFAULT 'pending',
    collected_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

// ─── fraise.market self-healing tables ───────────────────────────────────────

db.execute(sql`
  CREATE TABLE IF NOT EXISTS market_vendors (
    id serial PRIMARY KEY,
    user_id integer NOT NULL UNIQUE REFERENCES users(id),
    name text NOT NULL,
    description text,
    instagram_handle text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS market_listings (
    id serial PRIMARY KEY,
    vendor_id integer NOT NULL REFERENCES market_vendors(id),
    name text NOT NULL,
    description text,
    category text NOT NULL DEFAULT 'other',
    unit_type text NOT NULL DEFAULT 'per_item',
    unit_label text NOT NULL DEFAULT 'each',
    price_cents integer NOT NULL,
    stock_quantity integer NOT NULL DEFAULT 0,
    tags text[] DEFAULT '{}',
    available_from timestamptz NOT NULL,
    available_until timestamptz NOT NULL,
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS market_orders_v2 (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id),
    status text NOT NULL DEFAULT 'pending',
    total_cents integer NOT NULL DEFAULT 0,
    nfc_collected_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS market_order_items (
    id serial PRIMARY KEY,
    order_id integer NOT NULL REFERENCES market_orders_v2(id),
    listing_id integer NOT NULL REFERENCES market_listings(id),
    listing_name text NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    unit_price_cents integer NOT NULL
  )
`).catch(() => {});

// ─── fraise.market scoring ────────────────────────────────────────────────────

interface HealthContext {
  active_energy_kcal: number;
  calories_consumed_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  steps: number;
}

function scoreItem(item: any, ctx: HealthContext): { score: number; reason: string } {
  const proteinGap = Math.max(0, 50 - ctx.protein_g);
  const sugarExcess = Math.max(0, ctx.sugar_g - 40);
  const fiberGap = Math.max(0, 25 - ctx.fiber_g);
  const calorieGap = Math.max(0, 2000 - ctx.calories_consumed_kcal - ctx.active_energy_kcal * 0.3);

  const tags: string[] = Array.isArray(item.tags) ? item.tags : [];
  let score = 50;

  if (tags.includes('high-protein') && ctx.protein_g < 50) score += 20;
  if (tags.includes('low-sugar') && ctx.sugar_g > 40) score += 20;
  if (tags.includes('high-fiber') && ctx.fiber_g < 15) score += 15;
  if (tags.includes('light') && calorieGap < 200) score += 10;
  if (tags.includes('indulgent') && ctx.active_energy_kcal > 400) score += 10;

  if (calorieGap > 500 && item.category === 'main') score += 10;
  if (ctx.sugar_g > 40 && item.category === 'dessert') score -= 20;

  score = Math.max(0, Math.min(100, score));

  let reason = 'Fits well with your day';
  if (ctx.protein_g < 50 && tags.includes('high-protein')) {
    reason = "You're low on protein today";
  } else if (ctx.sugar_g > 40 && tags.includes('low-sugar')) {
    reason = "You've had plenty of sugar today";
  } else if (ctx.active_energy_kcal > 400 && item.category === 'main') {
    reason = "You've been active — you've earned it";
  } else if (ctx.fiber_g < 15 && tags.includes('high-fiber')) {
    reason = 'Good source of fiber for today';
  } else if (tags.includes('high-vitamin-c')) {
    reason = 'Great source of vitamin C';
  }

  return { score, reason };
}

// ─── fraise.market routes (literal routes before parameterized) ───────────────

// 1. GET /listings/for-me
router.post('/listings/for-me', requireUser, async (req: Request, res: Response) => {
  const ctx: HealthContext = {
    active_energy_kcal: Number(req.body.active_energy_kcal) || 0,
    calories_consumed_kcal: Number(req.body.calories_consumed_kcal) || 0,
    protein_g: Number(req.body.protein_g) || 0,
    carbs_g: Number(req.body.carbs_g) || 0,
    fat_g: Number(req.body.fat_g) || 0,
    sugar_g: Number(req.body.sugar_g) || 0,
    fiber_g: Number(req.body.fiber_g) || 0,
    steps: Number(req.body.steps) || 0,
  };
  try {
    const rows = await db.select({
      id: marketListings.id,
      name: marketListings.name,
      description: marketListings.description,
      category: marketListings.category,
      unit_type: marketListings.unit_type,
      unit_label: marketListings.unit_label,
      price_cents: marketListings.price_cents,
      stock_quantity: marketListings.stock_quantity,
      tags: marketListings.tags,
      available_from: marketListings.available_from,
      available_until: marketListings.available_until,
      vendor_id: marketListings.vendor_id,
      vendor_name: marketVendors.name,
    })
    .from(marketListings)
    .innerJoin(marketVendors, eq(marketListings.vendor_id, marketVendors.id))
    .where(and(
      eq(marketListings.is_available, true),
      gt(marketListings.available_until, new Date()),
    ));
    const listings = (rows as any).rows ?? rows;
    const scored = listings.map((item: any) => {
      const { score, reason } = scoreItem(item, ctx);
      return { ...item, score, reason };
    });
    scored.sort((a: any, b: any) => b.score - a.score);
    res.json(scored);
  } catch (err) {
    logger.error('[market] POST /listings/for-me', err);
    res.status(500).json({ error: 'internal' });
  }
});

// 2. GET /listings
router.get('/listings', async (_req: Request, res: Response) => {
  try {
    const rows = await db.select({
      id: marketListings.id,
      name: marketListings.name,
      description: marketListings.description,
      category: marketListings.category,
      unit_type: marketListings.unit_type,
      unit_label: marketListings.unit_label,
      price_cents: marketListings.price_cents,
      stock_quantity: marketListings.stock_quantity,
      tags: marketListings.tags,
      available_from: marketListings.available_from,
      available_until: marketListings.available_until,
      vendor_id: marketListings.vendor_id,
      vendor_name: marketVendors.name,
    })
    .from(marketListings)
    .innerJoin(marketVendors, eq(marketListings.vendor_id, marketVendors.id))
    .where(and(
      eq(marketListings.is_available, true),
      gt(marketListings.available_until, new Date()),
    ))
    .orderBy(marketListings.category, marketListings.name);
    const listings = (rows as any).rows ?? rows;
    res.json(listings);
  } catch (err) {
    logger.error('[market] GET /listings', err);
    res.status(500).json({ error: 'internal' });
  }
});

// 3. POST /listings — vendor only
router.post('/listings', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [vendor] = await db.select({ id: marketVendors.id })
      .from(marketVendors)
      .where(and(eq(marketVendors.user_id, userId), eq(marketVendors.active, true)));
    if (!vendor) { res.status(403).json({ error: 'not_a_vendor' }); return; }
    const { name, description, category, unit_type, unit_label, price_cents, stock_quantity, tags, available_from, available_until } = req.body;
    if (!name || !category || !unit_type || !unit_label || price_cents == null || !available_from || !available_until) {
      res.status(400).json({ error: 'missing_fields' }); return;
    }
    const inserted = await db.insert(marketListings).values({
      vendor_id: vendor.id,
      name,
      description: description ?? null,
      category,
      unit_type,
      unit_label,
      price_cents,
      stock_quantity: stock_quantity ?? 0,
      tags: tags ?? [],
      available_from: new Date(available_from),
      available_until: new Date(available_until),
      is_available: true,
    }).returning();
    const result = (inserted as any).rows ?? inserted;
    res.status(201).json(result[0]);
  } catch (err) {
    logger.error('[market] POST /listings', err);
    res.status(500).json({ error: 'internal' });
  }
});

// 4. PATCH /listings/:id — vendor, must own
router.patch('/listings/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const [vendor] = await db.select({ id: marketVendors.id })
      .from(marketVendors).where(eq(marketVendors.user_id, userId));
    if (!vendor) { res.status(403).json({ error: 'not_a_vendor' }); return; }
    const [listing] = await db.select({ id: marketListings.id, vendor_id: marketListings.vendor_id })
      .from(marketListings).where(eq(marketListings.id, id));
    if (!listing || listing.vendor_id !== vendor.id) { res.status(404).json({ error: 'not_found' }); return; }
    const { name, description, price_cents, stock_quantity, tags, is_available } = req.body;
    const patch: Record<string, any> = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (price_cents !== undefined) patch.price_cents = price_cents;
    if (stock_quantity !== undefined) patch.stock_quantity = stock_quantity;
    if (tags !== undefined) patch.tags = tags;
    if (is_available !== undefined) patch.is_available = is_available;
    const updated = await db.update(marketListings).set(patch).where(eq(marketListings.id, id)).returning();
    const result = (updated as any).rows ?? updated;
    res.json(result[0]);
  } catch (err) {
    logger.error('[market] PATCH /listings/:id', err);
    res.status(500).json({ error: 'internal' });
  }
});

// 5. DELETE /listings/:id — vendor, must own (soft delete)
router.delete('/listings/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const [vendor] = await db.select({ id: marketVendors.id })
      .from(marketVendors).where(eq(marketVendors.user_id, userId));
    if (!vendor) { res.status(403).json({ error: 'not_a_vendor' }); return; }
    const [listing] = await db.select({ id: marketListings.id, vendor_id: marketListings.vendor_id })
      .from(marketListings).where(eq(marketListings.id, id));
    if (!listing || listing.vendor_id !== vendor.id) { res.status(404).json({ error: 'not_found' }); return; }
    await db.update(marketListings).set({ is_available: false }).where(eq(marketListings.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error('[market] DELETE /listings/:id', err);
    res.status(500).json({ error: 'internal' });
  }
});

// 6. GET /listings/:id
router.get('/listings/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const [listing] = await db.select({
      id: marketListings.id,
      name: marketListings.name,
      description: marketListings.description,
      category: marketListings.category,
      unit_type: marketListings.unit_type,
      unit_label: marketListings.unit_label,
      price_cents: marketListings.price_cents,
      stock_quantity: marketListings.stock_quantity,
      tags: marketListings.tags,
      available_from: marketListings.available_from,
      available_until: marketListings.available_until,
      is_available: marketListings.is_available,
      vendor_id: marketListings.vendor_id,
      vendor_name: marketVendors.name,
      vendor_instagram: marketVendors.instagram_handle,
    })
    .from(marketListings)
    .innerJoin(marketVendors, eq(marketListings.vendor_id, marketVendors.id))
    .where(eq(marketListings.id, id));
    if (!listing) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(listing);
  } catch (err) {
    logger.error('[market] GET /listings/:id', err);
    res.status(500).json({ error: 'internal' });
  }
});

// 7. GET /orders/mine
router.get('/orders/mine', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const orders = await db.select({
      id: marketOrders.id,
      status: marketOrders.status,
      total_cents: marketOrders.total_cents,
      nfc_collected_at: marketOrders.nfc_collected_at,
      created_at: marketOrders.created_at,
    })
    .from(marketOrders)
    .where(eq(marketOrders.user_id, userId))
    .orderBy(desc(marketOrders.created_at));
    const orderList = (orders as any).rows ?? orders;

    const result = await Promise.all(orderList.map(async (order: any) => {
      const items = await db.select({
        id: marketOrderItems.id,
        listing_id: marketOrderItems.listing_id,
        listing_name: marketOrderItems.listing_name,
        quantity: marketOrderItems.quantity,
        unit_price_cents: marketOrderItems.unit_price_cents,
      })
      .from(marketOrderItems)
      .where(eq(marketOrderItems.order_id, order.id));
      const itemRows = (items as any).rows ?? items;
      return { ...order, items: itemRows };
    }));

    res.json(result);
  } catch (err) {
    logger.error('[market] GET /orders/mine', err);
    res.status(500).json({ error: 'internal' });
  }
});

// 8. POST /orders
router.post('/orders', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items required' }); return;
  }
  try {
    // Validate all listings
    const now = new Date();
    const listingData: any[] = [];
    for (const item of items) {
      const [listing] = await db.select()
        .from(marketListings)
        .where(eq(marketListings.id, item.listing_id));
      if (!listing) { res.status(404).json({ error: `listing_not_found:${item.listing_id}` }); return; }
      if (!listing.is_available) { res.status(409).json({ error: `listing_unavailable:${item.listing_id}` }); return; }
      if (listing.available_until <= now) { res.status(409).json({ error: `listing_expired:${item.listing_id}` }); return; }
      if (listing.stock_quantity < item.quantity) { res.status(409).json({ error: `insufficient_stock:${item.listing_id}` }); return; }
      listingData.push({ listing, quantity: item.quantity });
    }

    const total_cents = listingData.reduce((sum, { listing, quantity }) => sum + listing.price_cents * quantity, 0);

    // Transaction via raw SQL
    const insertedOrder = await db.execute(sql`
      INSERT INTO market_orders_v2 (user_id, status, total_cents)
      VALUES (${userId}, 'pending', ${total_cents})
      RETURNING id
    `);
    const orderRows = (insertedOrder as any).rows ?? insertedOrder;
    const order_id = orderRows[0].id;

    const insertedItems: any[] = [];
    for (const { listing, quantity } of listingData) {
      await db.execute(sql`
        INSERT INTO market_order_items (order_id, listing_id, listing_name, quantity, unit_price_cents)
        VALUES (${order_id}, ${listing.id}, ${listing.name}, ${quantity}, ${listing.price_cents})
      `);
      // Decrement stock with guard
      const decremented = await db.execute(sql`
        UPDATE market_listings SET stock_quantity = stock_quantity - ${quantity}
        WHERE id = ${listing.id} AND stock_quantity >= ${quantity}
        RETURNING id
      `);
      const dRows = (decremented as any).rows ?? decremented;
      if (!dRows.length) {
        // Roll back order — must delete items first (FK constraint)
        await db.execute(sql`DELETE FROM market_order_items WHERE order_id = ${order_id}`);
        await db.execute(sql`DELETE FROM market_orders_v2 WHERE id = ${order_id}`);
        res.status(409).json({ error: `stock_depleted:${listing.id}` }); return;
      }
      insertedItems.push({ listing_id: listing.id, listing_name: listing.name, quantity, unit_price_cents: listing.price_cents });
    }

    res.status(201).json({ order_id, total_cents, items: insertedItems });
  } catch (err) {
    logger.error('[market] POST /orders', err);
    res.status(500).json({ error: 'internal' });
  }
});

// 9. POST /collect
router.post('/collect', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { nfc_token } = req.body;
  const expected = process.env.MARKET_NFC_TOKEN ?? 'fraise.market';
  if (nfc_token !== expected) { res.status(403).json({ error: 'invalid_token' }); return; }
  try {
    const orderRows = await db.execute(sql`
      SELECT id FROM market_orders_v2
      WHERE user_id = ${userId} AND status IN ('pending', 'confirmed')
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const orders = (orderRows as any).rows ?? orderRows;
    if (!orders.length) { res.status(404).json({ error: 'no_pending_order' }); return; }
    const order_id = orders[0].id;

    await db.execute(sql`
      UPDATE market_orders_v2 SET status = 'collected', nfc_collected_at = now()
      WHERE id = ${order_id}
    `);

    const itemRows = await db.execute(sql`
      SELECT listing_id, listing_name, quantity, unit_price_cents
      FROM market_order_items WHERE order_id = ${order_id}
    `);
    const items = (itemRows as any).rows ?? itemRows;

    const vendorRows = await db.execute(sql`
      SELECT mv.name AS vendor_name, mv.description AS vendor_description,
             mv.instagram_handle, ml.name AS listing_name,
             array_to_json(COALESCE(ml.tags, '{}')) AS tags
      FROM market_order_items moi
      JOIN market_listings ml ON ml.id = moi.listing_id
      JOIN market_vendors mv ON mv.id = ml.vendor_id
      WHERE moi.order_id = ${order_id}
      LIMIT 1
    `);
    const vendorInfo = ((vendorRows as any).rows ?? vendorRows)[0] ?? null;

    res.json({ ok: true, order_id, items, vendor_info: vendorInfo });
  } catch (err) {
    logger.error('[market] POST /collect', err);
    res.status(500).json({ error: 'internal' });
  }
});

// 10. GET /vendor/orders
router.get('/vendor/orders', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [vendor] = await db.select({ id: marketVendors.id })
      .from(marketVendors).where(eq(marketVendors.user_id, userId));
    if (!vendor) { res.status(403).json({ error: 'not_a_vendor' }); return; }
    const rows = await db.execute(sql`
      SELECT
        moi.id, moi.listing_id, moi.listing_name, moi.quantity, moi.unit_price_cents,
        mo.id AS order_id, mo.status AS order_status, mo.created_at AS ordered_at, mo.user_id AS buyer_user_id
      FROM market_order_items moi
      JOIN market_listings ml ON ml.id = moi.listing_id
      JOIN market_orders_v2 mo ON mo.id = moi.order_id
      WHERE ml.vendor_id = ${vendor.id}
        AND mo.created_at > now() - interval '7 days'
      ORDER BY mo.created_at DESC
    `);
    const result = (rows as any).rows ?? rows;
    res.json(result);
  } catch (err) {
    logger.error('[market] GET /vendor/orders', err);
    res.status(500).json({ error: 'internal' });
  }
});

// 11a. GET /vendors/me — authenticated user's vendor profile
router.get('/vendors/me', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [vendor] = await db.select().from(marketVendors).where(eq(marketVendors.user_id, userId));
    if (!vendor) { res.status(404).json({ error: 'not_a_vendor' }); return; }
    res.json(vendor);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// 11b. POST /vendors — vendor self-registration
router.post('/vendors', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { name, description, instagram_handle } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'name_required' }); return; }
  try {
    const [existing] = await db.select({ id: marketVendors.id }).from(marketVendors).where(eq(marketVendors.user_id, userId));
    if (existing) { res.status(409).json({ error: 'already_a_vendor', vendor_id: existing.id }); return; }
    const inserted = await db.insert(marketVendors).values({
      user_id: userId,
      name: name.trim(),
      description: description?.trim() ?? null,
      instagram_handle: instagram_handle?.trim() ?? null,
      active: true,
    }).returning();
    const result = (inserted as any).rows ?? inserted;
    res.status(201).json(result[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// 11. GET /vendors
router.get('/vendors', async (_req: Request, res: Response) => {
  try {
    const rows = await db.select({
      id: marketVendors.id,
      name: marketVendors.name,
      description: marketVendors.description,
      instagram_handle: marketVendors.instagram_handle,
      created_at: marketVendors.created_at,
    })
    .from(marketVendors)
    .where(eq(marketVendors.active, true))
    .orderBy(marketVendors.name);
    const vendors = (rows as any).rows ?? rows;
    res.json(vendors);
  } catch (err) {
    logger.error('[market] GET /vendors', err);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Specific paths must be registered BEFORE /:id ───────────────────────────

// GET /api/market/upcoming
router.get('/upcoming', async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        md.*,
        CAST(COUNT(DISTINCT ms.id) FILTER (WHERE ms.confirmed = true) AS int) AS confirmed_stall_count,
        CAST(COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'open') AS int) AS open_collectif_count
      FROM market_dates md
      LEFT JOIN market_stalls ms ON ms.market_date_id = md.id
      LEFT JOIN collectifs c ON c.collectif_type IN ('vendor_invite', 'product_prebuy')
        AND c.proposed_venue ILIKE '%' || md.location || '%'
      WHERE md.ends_at > now() AND md.status != 'cancelled'
      GROUP BY md.id
      ORDER BY md.starts_at ASC
    `);
    res.json(rows);
  } catch (err) {
    logger.error('[market] GET /upcoming', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/market/my-orders — must be before /:id ─────────────────────────

router.get('/my-orders', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  try {
    const rows = await db.execute(sql`
      SELECT mo.*, mp.name AS product_name, mp.unit, ms.vendor_name, md.name AS market_name, md.starts_at
      FROM market_orders mo
      JOIN market_products mp ON mp.id = mo.product_id
      JOIN market_stalls ms ON ms.id = mo.stall_id
      JOIN market_dates md ON md.id = mo.market_date_id
      WHERE mo.buyer_user_id = ${userId}
      ORDER BY mo.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/market/orders/:id/collect — must be before /:id ──────────────

router.patch('/orders/:id/collect', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const userId: number = req.userId;
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const [updated] = await db.execute(sql`
      UPDATE market_orders
      SET status = 'collected', collected_at = now()
      WHERE id = ${id} AND buyer_user_id = ${userId} AND status = 'paid'
      RETURNING id
    `);
    if (!updated) { res.status(404).json({ error: 'order_not_found_or_not_paid' }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/market/my-stall — vendor's stalls with pre-buy counts ──────────

router.get('/my-stall', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  try {
    const rows = await db.execute(sql`
      SELECT ms.*,
        md.name AS market_name, md.starts_at, md.ends_at,
        COALESCE(json_agg(
          json_build_object(
            'id', mp.id,
            'name', mp.name,
            'description', mp.description,
            'price_cents', mp.price_cents,
            'unit', mp.unit,
            'stock_quantity', mp.stock_quantity,
            'prebuy_count', (
              SELECT COUNT(*) FROM market_orders mo
              WHERE mo.product_id = mp.id AND mo.status IN ('paid', 'collected')
            )
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.id IS NOT NULL), '[]') AS products
      FROM market_stalls ms
      JOIN market_dates md ON md.id = ms.market_date_id
      LEFT JOIN market_products mp ON mp.stall_id = ms.id
      WHERE ms.vendor_user_id = ${userId}
        AND md.ends_at > now()
      GROUP BY ms.id, md.name, md.starts_at, md.ends_at
      ORDER BY md.starts_at ASC
    `);
    res.json(rows);
  } catch (err) {
    logger.error('[market] GET /my-stall', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/market/stalls — vendor claims a stall on an upcoming market ───

router.post('/stalls', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  const { market_date_id, vendor_name, description } = req.body;
  if (!market_date_id || !vendor_name?.trim()) {
    res.status(400).json({ error: 'market_date_id and vendor_name required' }); return;
  }
  try {
    const [market] = await db.execute(sql`
      SELECT id FROM market_dates WHERE id = ${market_date_id} AND ends_at > now() AND status != 'cancelled'
    `);
    if (!market) { res.status(404).json({ error: 'market_not_found_or_past' }); return; }

    const [existing] = await db.execute(sql`
      SELECT id FROM market_stalls WHERE market_date_id = ${market_date_id} AND vendor_user_id = ${userId}
    `);
    if (existing) { res.status(409).json({ error: 'stall_already_exists' }); return; }

    const [stall] = await db.execute(sql`
      INSERT INTO market_stalls (market_date_id, vendor_user_id, vendor_name, description, confirmed)
      VALUES (${market_date_id}, ${userId}, ${vendor_name.trim()}, ${description?.trim() ?? null}, false)
      RETURNING *
    `);
    res.status(201).json(stall);
  } catch (err) {
    logger.error('[market] POST /stalls', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/market/stalls/:stallId/products ────────────────────────────────

router.post('/stalls/:stallId/products', requireUser, async (req: any, res: Response) => {
  const stallId = parseInt(req.params.stallId, 10);
  const userId: number = req.userId;
  if (isNaN(stallId)) { res.status(400).json({ error: 'invalid_stall_id' }); return; }
  const { name, description, price_cents, unit, stock_quantity } = req.body;
  if (!name?.trim() || !price_cents || !unit?.trim()) {
    res.status(400).json({ error: 'name, price_cents, and unit required' }); return;
  }
  try {
    const [stall] = await db.execute(sql`
      SELECT ms.id FROM market_stalls ms
      JOIN market_dates md ON md.id = ms.market_date_id
      WHERE ms.id = ${stallId} AND ms.vendor_user_id = ${userId} AND md.ends_at > now()
    `);
    if (!stall) { res.status(403).json({ error: 'stall_not_found_or_not_yours' }); return; }

    const [product] = await db.execute(sql`
      INSERT INTO market_products (stall_id, name, description, price_cents, unit, stock_quantity)
      VALUES (${stallId}, ${name.trim()}, ${description?.trim() ?? null}, ${price_cents}, ${unit.trim()}, ${stock_quantity ?? null})
      RETURNING *
    `);
    res.status(201).json(product);
  } catch (err) {
    logger.error('[market] POST /stalls/:stallId/products', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/market/products/:productId ───────────────────────────────────

router.delete('/products/:productId', requireUser, async (req: any, res: Response) => {
  const productId = parseInt(req.params.productId, 10);
  const userId: number = req.userId;
  if (isNaN(productId)) { res.status(400).json({ error: 'invalid_product_id' }); return; }
  try {
    const [product] = await db.execute(sql`
      SELECT mp.id FROM market_products mp
      JOIN market_stalls ms ON ms.id = mp.stall_id
      WHERE mp.id = ${productId} AND ms.vendor_user_id = ${userId}
    `);
    if (!product) { res.status(403).json({ error: 'product_not_found_or_not_yours' }); return; }

    // Block deletion if there are paid/collected orders for this product
    const [activeOrders] = await db.execute(sql`
      SELECT id FROM market_orders WHERE product_id = ${productId} AND status IN ('paid', 'collected') LIMIT 1
    `);
    if (activeOrders) { res.status(409).json({ error: 'has_active_orders' }); return; }

    await db.execute(sql`DELETE FROM market_products WHERE id = ${productId}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error('[market] DELETE /products/:productId', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/market/:id ──────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const [date] = await db.execute(sql`SELECT * FROM market_dates WHERE id = ${id}`);
    if (!date) { res.status(404).json({ error: 'not_found' }); return; }

    const d = date as any;

    const stalls = await db.execute(sql`
      SELECT ms.*,
        COALESCE(json_agg(
          json_build_object(
            'id', mp.id,
            'name', mp.name,
            'description', mp.description,
            'price_cents', mp.price_cents,
            'unit', mp.unit,
            'stock_quantity', mp.stock_quantity
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.id IS NOT NULL), '[]') AS products
      FROM market_stalls ms
      LEFT JOIN market_products mp ON mp.stall_id = ms.id
      WHERE ms.market_date_id = ${id}
      GROUP BY ms.id
      ORDER BY ms.confirmed DESC, ms.created_at ASC
    `);

    // Collectifs linked to this market by proposed_venue or proposed_date
    const marketDateStr = new Date(d.starts_at).toISOString().slice(0, 10);
    const collectifs = await db.execute(sql`
      SELECT c.*, u.display_name AS creator_display_name
      FROM collectifs c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.collectif_type IN ('vendor_invite', 'product_prebuy')
        AND c.status = 'open'
        AND (
          c.proposed_date = ${marketDateStr}
          OR c.proposed_venue ILIKE ${'%' + d.location + '%'}
        )
      ORDER BY c.created_at DESC
    `);

    res.json({ ...d, stalls, collectifs });
  } catch (err) {
    logger.error('[market] GET /:id', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/market/:id/order — pre-buy a product ──────────────────────────

router.post('/:id/order', requireUser, async (req: any, res: Response) => {
  const marketDateId = parseInt(req.params.id, 10);
  const userId: number = req.userId;
  const { product_id, quantity = 1 } = req.body;
  if (isNaN(marketDateId) || !product_id) {
    res.status(400).json({ error: 'missing_fields' }); return;
  }
  try {
    const [product] = await db.execute(sql`
      SELECT mp.*, ms.id AS stall_id, ms.market_date_id, ms.confirmed
      FROM market_products mp
      JOIN market_stalls ms ON ms.id = mp.stall_id
      WHERE mp.id = ${product_id} AND ms.market_date_id = ${marketDateId}
    `);
    if (!product) { res.status(404).json({ error: 'product_not_found' }); return; }
    const p = product as any;
    if (!p.confirmed) { res.status(409).json({ error: 'stall_not_confirmed' }); return; }
    if (p.stock_quantity !== null && p.stock_quantity < quantity) {
      res.status(409).json({ error: 'insufficient_stock' }); return;
    }

    // Idempotency: return existing pending order if one exists for this user + product
    const [existing] = await db.execute(sql`
      SELECT id, payment_intent_id FROM market_orders
      WHERE product_id = ${product_id} AND buyer_user_id = ${userId} AND status = 'pending'
      LIMIT 1
    `);
    if (existing) {
      const ex = existing as any;
      const existingPi = await stripe.paymentIntents.retrieve(ex.payment_intent_id);
      res.json({ client_secret: existingPi.client_secret, amount_cents: p.price_cents * quantity });
      return;
    }

    const amount = p.price_cents * quantity;
    const pi = await stripe.paymentIntents.create({
      amount,
      currency: 'cad',
      metadata: {
        type: 'market_order',
        market_date_id: String(marketDateId),
        stall_id: String(p.stall_id),
        product_id: String(product_id),
        buyer_user_id: String(userId),
        quantity: String(quantity),
      },
    });

    await db.execute(sql`
      INSERT INTO market_orders (market_date_id, stall_id, product_id, buyer_user_id, quantity, amount_paid_cents, payment_intent_id, status)
      VALUES (${marketDateId}, ${p.stall_id}, ${product_id}, ${userId}, ${quantity}, ${amount}, ${pi.id}, 'pending')
    `);

    res.json({ client_secret: pi.client_secret, amount_cents: amount });
  } catch (err) {
    logger.error('[market] POST /:id/order', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/market/stalls/:id/ar — AR card for a market stall vendor
router.get('/stalls/:id/ar', requireUser, async (req: Request, res: Response) => {
  const vendorId = parseInt(req.params.id, 10);
  if (isNaN(vendorId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const vendorRows = await db.select({
      id: marketVendors.id,
      name: marketVendors.name,
      description: marketVendors.description,
      instagram: marketVendors.instagram_handle,
    }).from(marketVendors).where(and(eq(marketVendors.id, vendorId), eq(marketVendors.active, true)));
    const vendor = ((vendorRows as any).rows ?? vendorRows)[0];
    if (!vendor) { res.status(404).json({ error: 'not_found' }); return; }

    const listingRows = await db.select({
      id: marketListings.id,
      name: marketListings.name,
      price_cents: marketListings.price_cents,
      unit_label: marketListings.unit_label,
      tags: marketListings.tags,
      stock_quantity: marketListings.stock_quantity,
    })
    .from(marketListings)
    .where(and(
      eq(marketListings.vendor_id, vendorId),
      eq(marketListings.is_available, true),
      gt(marketListings.stock_quantity, 0),
      gt(marketListings.available_until, new Date()),
    ))
    .orderBy(desc(marketListings.stock_quantity))
    .limit(3);
    const listings = (listingRows as any).rows ?? listingRows;

    res.json({
      vendor_name: vendor.name,
      description: vendor.description ?? null,
      instagram: vendor.instagram ?? null,
      listings: listings.map((l: any) => ({
        name: l.name,
        price_cents: l.price_cents,
        unit_label: l.unit_label,
        tags: l.tags ?? [],
        stock_quantity: l.stock_quantity,
      })),
    });
  } catch (err) {
    logger.error('[market] GET /stalls/:id/ar', err);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
