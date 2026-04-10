import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS product_bundles (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS bundle_varieties (
  id serial PRIMARY KEY,
  bundle_id integer NOT NULL REFERENCES product_bundles(id),
  variety_id integer NOT NULL REFERENCES varieties(id),
  quantity integer NOT NULL DEFAULT 1
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS bundle_orders (
  id serial PRIMARY KEY,
  bundle_id integer NOT NULL REFERENCES product_bundles(id),
  user_id integer NOT NULL REFERENCES users(id),
  payment_intent_id text,
  status text NOT NULL DEFAULT 'pending',
  location_id integer REFERENCES locations(id),
  time_slot_id integer REFERENCES time_slots(id),
  is_gift boolean NOT NULL DEFAULT false,
  gift_note text,
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

// GET /api/bundles — public
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT pb.*,
        COALESCE(json_agg(
          json_build_object('variety_id', bv.variety_id, 'variety_name', v.name, 'quantity', bv.quantity)
          ORDER BY bv.id
        ) FILTER (WHERE bv.id IS NOT NULL), '[]') AS varieties
      FROM product_bundles pb
      LEFT JOIN bundle_varieties bv ON bv.bundle_id = pb.id
      LEFT JOIN varieties v ON v.id = bv.variety_id
      WHERE pb.active = true
      GROUP BY pb.id
      ORDER BY pb.id
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/bundles/order
router.post('/order', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { bundle_id, location_id, time_slot_id, is_gift = false, gift_note } = req.body;
  if (!bundle_id) { res.status(400).json({ error: 'bundle_id required' }); return; }
  try {
    const bundles = await db.execute(sql`SELECT * FROM product_bundles WHERE id=${bundle_id} AND active=true`);
    const bundle = ((bundles as any).rows ?? bundles)[0];
    if (!bundle) { res.status(404).json({ error: 'bundle_not_found' }); return; }

    const pi = await stripe.paymentIntents.create({
      amount: bundle.price_cents,
      currency: 'cad',
      metadata: { type: 'bundle_order', bundle_id: String(bundle_id), user_id: String(userId) },
    });
    await db.execute(sql`
      INSERT INTO bundle_orders (bundle_id, user_id, payment_intent_id, location_id, time_slot_id, is_gift, gift_note)
      VALUES (${bundle_id}, ${userId}, ${pi.id}, ${location_id ?? null}, ${time_slot_id ?? null}, ${is_gift}, ${gift_note ?? null})
    `);
    res.json({ client_secret: pi.client_secret });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
