import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS variety_drops (
  id serial PRIMARY KEY,
  variety_id integer NOT NULL REFERENCES varieties(id),
  name text,
  description text,
  drops_at timestamptz NOT NULL,
  quantity integer NOT NULL,
  per_user_limit integer NOT NULL DEFAULT 1,
  requires_standing_order boolean NOT NULL DEFAULT true,
  price_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS drop_claims (
  id serial PRIMARY KEY,
  drop_id integer NOT NULL REFERENCES variety_drops(id),
  user_id integer NOT NULL REFERENCES users(id),
  quantity integer NOT NULL DEFAULT 1,
  payment_intent_id text,
  status text NOT NULL DEFAULT 'pending',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(drop_id, user_id)
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS drop_waitlist (
  id serial PRIMARY KEY,
  drop_id integer NOT NULL REFERENCES variety_drops(id),
  user_id integer NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(drop_id, user_id)
)`).catch(() => {});

// Marketing drops table (bundle suggestions / announcements)
db.execute(sql`CREATE TABLE IF NOT EXISTS drops (
  id serial PRIMARY KEY,
  title text NOT NULL,
  price_cents integer,
  active boolean NOT NULL DEFAULT true,
  variety_id integer,
  upcoming_drop_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`ALTER TABLE drops ADD COLUMN IF NOT EXISTS variety_id integer`).catch(() => {});
db.execute(sql`ALTER TABLE drops ADD COLUMN IF NOT EXISTS upcoming_drop_at timestamptz`).catch(() => {});

// GET /api/drops/bundle-suggestion?variety_id= — no auth, latest active marketing drop
router.get('/bundle-suggestion', async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, title, price_cents FROM drops
      WHERE active = true
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const drop = ((rows as any).rows ?? rows)[0] ?? null;
    res.json(drop);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/drops/upcoming?variety_id= — no auth, next upcoming drop for a variety
router.get('/upcoming', async (req: Request, res: Response) => {
  const varietyId = parseInt(req.query.variety_id as string, 10);
  if (isNaN(varietyId)) { res.status(400).json({ error: 'variety_id required' }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT id, title, upcoming_drop_at FROM drops
      WHERE variety_id = ${varietyId} AND upcoming_drop_at > now()
      ORDER BY upcoming_drop_at ASC
      LIMIT 1
    `);
    const drop = ((rows as any).rows ?? rows)[0] ?? null;
    res.json(drop);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/drops
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT vd.*, v.name AS variety_name, v.source_farm AS farm,
        (SELECT COUNT(*)::int FROM drop_claims dc WHERE dc.drop_id = vd.id AND dc.status != 'cancelled') AS claimed_count,
        EXISTS(SELECT 1 FROM drop_claims dc WHERE dc.drop_id = vd.id AND dc.user_id = ${userId} AND dc.status != 'cancelled') AS user_claimed,
        EXISTS(SELECT 1 FROM drop_waitlist dw WHERE dw.drop_id = vd.id AND dw.user_id = ${userId}) AS user_waitlisted
      FROM variety_drops vd
      JOIN varieties v ON v.id = vd.variety_id
      WHERE vd.status IN ('scheduled', 'open')
      ORDER BY vd.drops_at ASC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/drops/active-for-variety/:varietyId — literal before parameterized
router.get('/active-for-variety/:varietyId', requireUser, async (req: Request, res: Response) => {
  const varietyId = parseInt(req.params.varietyId, 10);
  if (isNaN(varietyId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT id, variety_id, name AS title, price_cents, quantity,
        (quantity - (SELECT COUNT(*)::int FROM drop_claims dc WHERE dc.drop_id = variety_drops.id AND dc.status != 'cancelled')) AS remaining
      FROM variety_drops
      WHERE variety_id = ${varietyId} AND status = 'open' AND quantity > 0
      ORDER BY drops_at ASC LIMIT 1
    `);
    const drop = ((rows as any).rows ?? rows)[0] ?? null;
    res.json(drop);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/drops/:id
router.get('/:id', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT vd.*, v.name AS variety_name, v.source_farm AS farm, v.harvest_date,
        (SELECT COUNT(*)::int FROM drop_claims dc WHERE dc.drop_id = vd.id AND dc.status != 'cancelled') AS claimed_count,
        EXISTS(SELECT 1 FROM drop_claims dc WHERE dc.drop_id = vd.id AND dc.user_id = ${userId} AND dc.status != 'cancelled') AS user_claimed,
        EXISTS(SELECT 1 FROM drop_waitlist dw WHERE dw.drop_id = vd.id AND dw.user_id = ${userId}) AS user_waitlisted,
        GREATEST(0, EXTRACT(EPOCH FROM (vd.drops_at - now()))::int) AS seconds_until_open
      FROM variety_drops vd
      JOIN varieties v ON v.id = vd.variety_id
      WHERE vd.id = ${id}
    `);
    const drop = ((rows as any).rows ?? rows)[0];
    if (!drop) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(drop);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/drops/:id/claim
router.post('/:id/claim', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    // Insert claim FIRST to guard idempotency — if duplicate, reject before touching stock
    const claimInsert = await db.execute(sql`
      INSERT INTO drop_claims (drop_id, user_id, payment_intent_id)
      VALUES (${id}, ${userId}, 'pending')
      ON CONFLICT (drop_id, user_id) DO NOTHING
      RETURNING id
    `);
    if (!((claimInsert as any).rows ?? claimInsert)[0]) {
      res.status(409).json({ error: 'already_claimed' });
      return;
    }

    // Atomic stock decrement
    const decremented = await db.execute(sql`
      UPDATE variety_drops SET quantity = quantity - 1
      WHERE id = ${id} AND quantity > 0 AND status = 'open'
      RETURNING id, price_cents, name
    `);
    const drop = ((decremented as any).rows ?? decremented)[0];
    if (!drop) {
      // Stock exhausted — rollback the claim placeholder and join waitlist instead
      await db.execute(sql`DELETE FROM drop_claims WHERE drop_id=${id} AND user_id=${userId} AND payment_intent_id='pending'`);
      await db.execute(sql`
        INSERT INTO drop_waitlist (drop_id, user_id) VALUES (${id}, ${userId})
        ON CONFLICT DO NOTHING
      `);
      res.json({ waitlisted: true });
      return;
    }

    const pi = await stripe.paymentIntents.create({
      amount: drop.price_cents,
      currency: 'cad',
      metadata: { type: 'drop_claim', drop_id: String(id), user_id: String(userId) },
      idempotencyKey: `drop-claim-${id}-${userId}`,
    } as any);
    await db.execute(sql`
      UPDATE drop_claims SET payment_intent_id = ${pi.id}
      WHERE drop_id = ${id} AND user_id = ${userId} AND payment_intent_id = 'pending'
    `);
    res.json({ client_secret: pi.client_secret });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/drops/:id/waitlist
router.post('/:id/waitlist', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    await db.execute(sql`
      INSERT INTO drop_waitlist (drop_id, user_id) VALUES (${id}, ${userId})
      ON CONFLICT DO NOTHING
    `);
    res.json({ waitlisted: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/drops/:id/waitlist
router.delete('/:id/waitlist', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    await db.execute(sql`DELETE FROM drop_waitlist WHERE drop_id=${id} AND user_id=${userId}`);
    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
