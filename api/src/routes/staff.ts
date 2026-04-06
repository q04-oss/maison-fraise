import { Router, Request, Response, NextFunction } from 'express';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { orders, users, varieties, timeSlots } from '../db/schema';
import { sendPushNotification } from '../lib/push';
import { fireWebhook } from '../lib/webhooks';

const router = Router();

const requireStaff = async (req: Request, res: Response, next: NextFunction) => {
  const pin = req.headers['x-staff-pin'] as string | undefined;
  const staffPin = process.env.STAFF_PIN;
  if (staffPin && pin === staffPin) { next(); return; }
  // Fallback: authenticated user with is_dj flag
  const authHeader = req.headers.authorization;
  if (!authHeader) { res.status(403).json({ error: 'staff_only' }); return; }
  try {
    const token = authHeader.replace('Bearer ', '');
    const { verifyToken } = await import('../lib/auth');
    const payload = verifyToken(token);
    if (!payload) { res.status(403).json({ error: 'staff_only' }); return; }
    const [user] = await db.select({ is_dj: users.is_dj }).from(users).where(eq(users.id, payload.userId));
    if (!user?.is_dj) { res.status(403).json({ error: 'staff_only' }); return; }
    next();
  } catch { res.status(403).json({ error: 'staff_only' }); }
};

// GET /api/staff/order-by-nfc — find order by NFC token (literal route before parameterized)
router.get('/order-by-nfc', requireStaff, async (req: Request, res: Response) => {
  const nfc_token = req.query.nfc_token as string | undefined;
  if (!nfc_token) { res.status(400).json({ error: 'nfc_token is required' }); return; }
  try {
    const rows = await db
      .select({
        id: orders.id,
        status: orders.status,
        variety_name: varieties.name,
        customer_email: orders.customer_email,
        quantity: orders.quantity,
        chocolate: orders.chocolate,
        finish: orders.finish,
        is_gift: orders.is_gift,
        gift_note: orders.gift_note,
        slot_time: timeSlots.time,
        push_token: orders.push_token,
      })
      .from(orders)
      .innerJoin(varieties, eq(orders.variety_id, varieties.id))
      .innerJoin(timeSlots, eq(orders.time_slot_id, timeSlots.id))
      .where(eq(orders.nfc_token, nfc_token));
    const row = ((rows as any).rows ?? rows)[0];
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/staff/orders — today's orders grouped by slot
router.get('/orders', requireStaff, async (req: Request, res: Response) => {
  try {
    const dateParam = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const dayStart = new Date(`${dateParam}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateParam}T23:59:59.999Z`);

    const rows = await db
      .select({
        id: orders.id,
        variety_id: orders.variety_id,
        variety_name: varieties.name,
        time_slot_id: orders.time_slot_id,
        slot_time: timeSlots.time,
        slot_date: timeSlots.date,
        chocolate: orders.chocolate,
        finish: orders.finish,
        quantity: orders.quantity,
        status: orders.status,
        customer_email: orders.customer_email,
        push_token: orders.push_token,
        nfc_token: orders.nfc_token,
        is_gift: orders.is_gift,
        gift_note: orders.gift_note,
        created_at: orders.created_at,
      })
      .from(orders)
      .innerJoin(varieties, eq(orders.variety_id, varieties.id))
      .innerJoin(timeSlots, eq(orders.time_slot_id, timeSlots.id))
      .where(and(gte(orders.created_at, dayStart), lte(orders.created_at, dayEnd)))
      .orderBy(timeSlots.time, orders.created_at);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/staff/orders/bulk-prepare — literal before /:id
router.post('/orders/bulk-prepare', requireStaff, async (req: Request, res: Response) => {
  const { order_ids } = req.body as { order_ids?: number[] };
  if (!Array.isArray(order_ids) || order_ids.length === 0) {
    res.status(400).json({ error: 'order_ids array required' }); return;
  }
  try {
    await db.execute(sql`
      UPDATE orders SET status = 'preparing'
      WHERE id = ANY(${order_ids}::int[]) AND status = 'paid'
    `);
    res.json({ ok: true, updated: order_ids.length });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/staff/orders/:id/prepare — mark preparing
router.post('/orders/:id/prepare', requireStaff, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    await db
      .update(orders)
      .set({ status: 'preparing' })
      .where(and(eq(orders.id, id), eq(orders.status, 'paid')));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/staff/orders/:id/ready — mark ready + send push notification
router.post('/orders/:id/ready', requireStaff, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const updated = await db
      .update(orders)
      .set({ status: 'ready' })
      .where(and(eq(orders.id, id)))
      .returning({ push_token: orders.push_token });

    const result = (updated as any).rows ?? updated;
    const row = result[0];
    if (row?.push_token) {
      sendPushNotification(row.push_token, {
        title: 'Your order is ready',
        body: 'Come pick up your strawberries.',
        data: { order_id: id },
      }).catch(() => {});
    }
    // Fire webhook for order.ready — look up user_id via apple_id
    const orderRows = await db.execute(sql`
      SELECT u.id AS user_id FROM orders o
      JOIN users u ON u.apple_user_id = o.apple_id
      WHERE o.id = ${id} LIMIT 1
    `).catch(() => null);
    if (orderRows) {
      const orderRow = ((orderRows as any).rows ?? orderRows)[0];
      if (orderRow?.user_id) {
        fireWebhook(orderRow.user_id, 'order.ready', { order_id: id }).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/staff/orders/:id/flag — flag an issue
router.post('/orders/:id/flag', requireStaff, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const { note } = req.body as { note?: string };
  try {
    await db
      .update(orders)
      .set({ status: 'cancelled', rating_note: note ?? null })
      .where(eq(orders.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity_confirmed integer`).catch(() => {});
db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity_confirmed_at timestamptz`).catch(() => {});

// POST /api/staff/orders/:id/quantity-confirm — record physically counted quantity
router.post('/orders/:id/quantity-confirm', requireStaff, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const { counted } = req.body as { counted?: number };
  if (typeof counted !== 'number') { res.status(400).json({ error: 'counted (number) required' }); return; }
  try {
    await db.execute(sql`
      UPDATE orders SET quantity_confirmed = ${counted}, quantity_confirmed_at = now() WHERE id = ${id}
    `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
