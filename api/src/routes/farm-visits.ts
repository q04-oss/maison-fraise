import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS farm_visits (
  id serial PRIMARY KEY,
  farm_name text NOT NULL,
  location text NOT NULL,
  visit_date date NOT NULL,
  max_participants integer NOT NULL DEFAULT 12,
  price_cents integer NOT NULL DEFAULT 0,
  description text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS farm_visit_bookings (
  id serial PRIMARY KEY,
  visit_id integer NOT NULL REFERENCES farm_visits(id),
  user_id integer NOT NULL REFERENCES users(id),
  payment_intent_id text,
  status text NOT NULL DEFAULT 'confirmed',
  booked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(visit_id, user_id)
)`).catch(() => {});

// GET /api/farm-visits
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT fv.*,
        (SELECT COUNT(*)::int FROM farm_visit_bookings fvb WHERE fvb.visit_id = fv.id AND fvb.status='confirmed') AS participant_count,
        EXISTS(SELECT 1 FROM farm_visit_bookings fvb WHERE fvb.visit_id = fv.id AND fvb.user_id = ${userId} AND fvb.status='confirmed') AS user_booked
      FROM farm_visits fv
      WHERE fv.visit_date >= CURRENT_DATE AND fv.status != 'cancelled'
      ORDER BY fv.visit_date ASC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/farm-visits/:id/book
router.post('/:id/book', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    const visits = await db.execute(sql`SELECT * FROM farm_visits WHERE id=${id}`);
    const visit = ((visits as any).rows ?? visits)[0];
    if (!visit) { res.status(404).json({ error: 'not_found' }); return; }

    // Atomic capacity check
    const booked = await db.execute(sql`
      INSERT INTO farm_visit_bookings (visit_id, user_id)
      SELECT ${id}, ${userId}
      WHERE (SELECT COUNT(*) FROM farm_visit_bookings WHERE visit_id=${id} AND status='confirmed') < ${visit.max_participants}
      ON CONFLICT (visit_id, user_id) DO NOTHING
      RETURNING id
    `);
    const row = ((booked as any).rows ?? booked)[0];
    if (!row) { res.status(409).json({ error: 'full_or_already_booked' }); return; }

    if (visit.price_cents > 0) {
      const pi = await stripe.paymentIntents.create({
        amount: visit.price_cents,
        currency: 'cad',
        metadata: { type: 'farm_visit', visit_id: String(id), user_id: String(userId) },
      });
      await db.execute(sql`UPDATE farm_visit_bookings SET payment_intent_id=${pi.id} WHERE id=${row.id}`);
      res.json({ booked: true, client_secret: pi.client_secret });
    } else {
      res.json({ booked: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/farm-visits/:id/book
router.delete('/:id/book', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    await db.execute(sql`
      UPDATE farm_visit_bookings SET status='cancelled'
      WHERE visit_id=${id} AND user_id=${userId} AND status='confirmed'
    `);
    res.json({ cancelled: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
