import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';

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

export default router;
