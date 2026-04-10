import { Router, Request, Response, NextFunction } from 'express';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { orders, users, varieties, timeSlots, locations, walkInTokens, locationStaff, businessVisits } from '../db/schema';
import { sendPushNotification } from '../lib/push';
import { fireWebhook } from '../lib/webhooks';

const router = Router();

const requireStaff = async (req: Request, res: Response, next: NextFunction) => {
  const pin = req.headers['x-staff-pin'] as string | undefined;

  // Global superadmin PIN — full access, no location filter
  const globalPin = process.env.STAFF_PIN;
  if (globalPin && pin === globalPin) { next(); return; }

  // Per-location PIN — attach locationId to request
  if (pin) {
    try {
      const [loc] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.staff_pin, pin))
        .limit(1);
      if (loc) {
        (req as any).staffLocationId = loc.id;
        next();
        return;
      }
    } catch { /* fall through */ }
  }

  // JWT-based: approved location_staff entry OR legacy is_dj flag
  const authHeader = req.headers.authorization;
  if (!authHeader) { res.status(403).json({ error: 'staff_only' }); return; }
  try {
    const token = authHeader.replace('Bearer ', '');
    const { verifyToken } = await import('../lib/auth');
    const payload = verifyToken(token);
    if (!payload) { res.status(403).json({ error: 'staff_only' }); return; }

    // Check location_staff approval
    const locationId = req.query.location_id ? parseInt(req.query.location_id as string) : null;
    if (locationId) {
      const [staffEntry] = await db
        .select({ id: locationStaff.id })
        .from(locationStaff)
        .where(and(
          eq(locationStaff.user_id, payload.userId),
          eq(locationStaff.location_id, locationId),
          eq(locationStaff.status, 'approved')
        ))
        .limit(1);
      if (staffEntry) {
        (req as any).staffLocationId = locationId;
        (req as any).staffUserId = payload.userId;
        next();
        return;
      }
    }

    // Legacy fallback: is_dj flag
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
    const locationId = (req as any).staffLocationId as number | undefined;

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
      .where(and(
        gte(orders.created_at, dayStart),
        lte(orders.created_at, dayEnd),
        locationId !== undefined ? eq(timeSlots.location_id, locationId) : undefined,
      ))
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
db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address text`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS staff_sessions (
  id serial PRIMARY KEY,
  staff_user_id integer NOT NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  orders_processed integer DEFAULT 0,
  avg_prep_seconds integer,
  accuracy_pct numeric(5,2),
  UNIQUE(staff_user_id, session_date)
)`).catch(() => {});

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

// GET /api/staff/orders/expiry-grid — today's uncollected orders with slot_time
router.get('/orders/expiry-grid', requireStaff, async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT o.id, o.customer_email, ts.time AS slot_time
      FROM orders o
      LEFT JOIN time_slots ts ON ts.id = o.time_slot_id
      WHERE DATE(COALESCE(ts.time, o.created_at)) = CURRENT_DATE
        AND o.status NOT IN ('collected', 'cancelled')
      ORDER BY ts.time ASC NULLS LAST
      LIMIT 50
    `);
    const data = (rows as any).rows ?? rows;
    const result = (data as any[]).map((r: any) => ({
      id: r.id,
      customerName: r.customer_email ? String(r.customer_email).charAt(0) : '?',
      slotTime: r.slot_time,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/staff/sessions/today — today's session stats for the staff user
router.get('/sessions/today', requireStaff, async (req: Request, res: Response) => {
  // requireStaff doesn't set req.userId; derive it from the JWT if present
  let userId: number | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    try {
      const { verifyToken } = await import('../lib/auth');
      const payload = verifyToken(authHeader.replace('Bearer ', ''));
      userId = payload?.userId ?? null;
    } catch { /* pin-only auth, no user id */ }
  }
  if (!userId) {
    res.json({ orders_processed: 0, avg_prep_seconds: null, accuracy_pct: null });
    return;
  }
  try {
    const rows = await db.execute(sql`
      SELECT * FROM staff_sessions
      WHERE staff_user_id = ${userId} AND session_date = CURRENT_DATE
    `);
    const row = ((rows as any).rows ?? rows)[0];
    if (!row) {
      res.json({ orders_processed: 0, avg_prep_seconds: null, accuracy_pct: null });
      return;
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/staff/postal-heatmap — delivery address postal prefix counts for today
router.get('/postal-heatmap', requireStaff, async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT SUBSTRING(o.delivery_address, 1, 3) AS prefix, COUNT(*) AS count
      FROM orders o
      LEFT JOIN time_slots ts ON ts.id = o.time_slot_id
      WHERE DATE(COALESCE(ts.time, o.created_at)) = CURRENT_DATE
        AND o.delivery_address IS NOT NULL
      GROUP BY prefix
      ORDER BY count DESC
      LIMIT 20
    `);
    const data = (rows as any).rows ?? rows;
    const result = (data as any[]).map((r: any) => ({
      prefix: r.prefix,
      lat: 45.5017,
      lng: -73.5673,
      count: Number(r.count),
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/staff/walkin-tokens — generate a walk-in token for a location + variety
router.post('/walkin-tokens', requireStaff, async (req: Request, res: Response) => {
  const { location_id, variety_id } = req.body as { location_id?: number; variety_id?: number };
  if (!location_id || !variety_id) { res.status(400).json({ error: 'location_id and variety_id required' }); return; }
  const locationId = (req as any).staffLocationId as number | undefined;
  if (locationId !== undefined && locationId !== location_id) {
    res.status(403).json({ error: 'location_mismatch' }); return;
  }
  try {
    const token = `fraise-walkin-${randomUUID()}`;
    await db.insert(walkInTokens).values({ token, location_id, variety_id });
    res.status(201).json({ token });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// Helper: check if a user has visited the business linked to a location
async function hasVisitedLocation(userId: number, locationId: number): Promise<boolean> {
  const [loc] = await db
    .select({ business_id: locations.business_id })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);
  if (!loc?.business_id) return true;
  const [visit] = await db
    .select({ id: businessVisits.id })
    .from(businessVisits)
    .where(and(
      eq(businessVisits.visitor_user_id, userId),
      eq(businessVisits.business_id, loc.business_id),
    ))
    .limit(1);
  return !!visit;
}

// POST /api/staff/request-access — authenticated user requests worker access for a location
router.post('/request-access', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const token = authHeader.replace('Bearer ', '');
    const { verifyToken } = await import('../lib/auth');
    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'unauthorized' }); return; }

    const { location_id } = req.body;
    if (!location_id) { res.status(400).json({ error: 'location_id required' }); return; }

    // Must have visited the location's business to be eligible
    const visited = await hasVisitedLocation(payload.userId, location_id);
    if (!visited) { res.status(403).json({ error: 'visit_required' }); return; }

    // Check for existing request
    const [existing] = await db
      .select({ id: locationStaff.id, status: locationStaff.status })
      .from(locationStaff)
      .where(and(eq(locationStaff.user_id, payload.userId), eq(locationStaff.location_id, location_id)))
      .limit(1);

    if (existing) {
      res.json({ status: existing.status });
      return;
    }

    await db.insert(locationStaff).values({
      user_id: payload.userId,
      location_id,
      status: 'pending',
    });
    res.json({ status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/staff/my-access — check current user's access status for a location
router.get('/my-access', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const token = authHeader.replace('Bearer ', '');
    const { verifyToken } = await import('../lib/auth');
    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'unauthorized' }); return; }

    const location_id = req.query.location_id ? parseInt(req.query.location_id as string) : null;
    if (!location_id) { res.status(400).json({ error: 'location_id required' }); return; }

    // Return ineligible if they haven't visited
    const visited = await hasVisitedLocation(payload.userId, location_id);
    if (!visited) { res.json({ status: 'ineligible' }); return; }

    const [entry] = await db
      .select({ status: locationStaff.status })
      .from(locationStaff)
      .where(and(eq(locationStaff.user_id, payload.userId), eq(locationStaff.location_id, location_id)))
      .limit(1);

    res.json({ status: entry?.status ?? 'none' });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
