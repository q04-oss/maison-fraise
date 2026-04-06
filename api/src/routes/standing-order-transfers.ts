import { Router, Request, Response } from 'express';
import { sql, eq, and } from 'drizzle-orm';
import { db } from '../db';
import { standingOrders, users } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS standing_order_transfers (
  id serial PRIMARY KEY,
  standing_order_id integer NOT NULL REFERENCES standing_orders(id),
  from_user_id integer NOT NULL REFERENCES users(id),
  to_user_id integer REFERENCES users(id),
  to_user_code text,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
)`).catch(() => {});

// POST /api/transfers — initiate
router.post('/', requireUser, async (req: Request, res: Response) => {
  const fromUserId = (req as any).userId as number;
  const { standing_order_id, to_user_code } = req.body;
  if (!standing_order_id || !to_user_code) {
    res.status(400).json({ error: 'standing_order_id and to_user_code required' }); return;
  }
  try {
    const [so] = await db.select().from(standingOrders).where(eq(standingOrders.id, standing_order_id));
    if (!so) { res.status(404).json({ error: 'not_found' }); return; }
    if (so.sender_id !== fromUserId) { res.status(403).json({ error: 'not_yours' }); return; }
    if (so.status !== 'active') { res.status(409).json({ error: 'not_active' }); return; }

    const recipientRows = await db.execute(sql`SELECT id FROM users WHERE user_code = ${to_user_code}`);
    const recipient = ((recipientRows as any).rows ?? recipientRows)[0];
    if (!recipient) { res.status(404).json({ error: 'recipient_not_found' }); return; }

    const result = await db.execute(sql`
      INSERT INTO standing_order_transfers (standing_order_id, from_user_id, to_user_id, to_user_code)
      VALUES (${standing_order_id}, ${fromUserId}, ${recipient.id}, ${to_user_code})
      RETURNING *
    `);
    res.status(201).json(((result as any).rows ?? result)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/transfers/incoming — literal before parameterized
router.get('/incoming', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT t.*, so.variety_id, v.name AS variety_name, so.quantity, so.frequency,
             u.display_name AS from_display_name, u.user_code AS from_user_code
      FROM standing_order_transfers t
      JOIN standing_orders so ON so.id = t.standing_order_id
      JOIN varieties v ON v.id = so.variety_id
      JOIN users u ON u.id = t.from_user_id
      WHERE t.to_user_id = ${userId} AND t.status = 'pending'
      ORDER BY t.initiated_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/transfers/:id/accept
router.post('/:id/accept', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT * FROM standing_order_transfers WHERE id = ${id} AND to_user_id = ${userId} AND status = 'pending'
    `);
    const transfer = ((rows as any).rows ?? rows)[0];
    if (!transfer) { res.status(404).json({ error: 'not_found' }); return; }

    await db.execute(sql`
      UPDATE standing_orders SET sender_id = ${userId} WHERE id = ${transfer.standing_order_id}
    `);
    await db.execute(sql`
      UPDATE standing_order_transfers SET status = 'accepted', accepted_at = now() WHERE id = ${id}
    `);
    res.json({ accepted: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/transfers/:id/cancel
router.post('/:id/cancel', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    await db.execute(sql`
      UPDATE standing_order_transfers SET status='cancelled', cancelled_at=now()
      WHERE id = ${id} AND (from_user_id = ${userId} OR to_user_id = ${userId}) AND status='pending'
    `);
    res.json({ cancelled: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
