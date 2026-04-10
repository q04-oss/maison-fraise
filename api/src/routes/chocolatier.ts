import { Router, Request, Response, NextFunction } from 'express';
import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { orders, batches, varieties, locations } from '../db/schema';
import { sendBatchReady } from '../lib/resend';
import { sendPushNotification } from '../lib/push';

const router = Router();

// Self-healing: add ready_at if it doesn't exist yet
db.execute(sql`ALTER TABLE batches ADD COLUMN IF NOT EXISTS ready_at timestamptz`).catch(() => {});

function requirePin(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers['x-chocolatier-pin'];
  if (!pin || pin !== process.env.CHOCOLATIER_PIN) {
    res.status(401).json({ error: 'invalid_pin' });
    return;
  }
  next();
}

router.use(requirePin);

// GET /api/chocolatier/varieties — varieties available to batch from
router.get('/varieties', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ id: varieties.id, name: varieties.name, price_cents: varieties.price_cents, description: varieties.description })
      .from(varieties)
      .where(eq(varieties.active, true))
      .orderBy(varieties.name);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/chocolatier/locations — locations this chocolatier serves
router.get('/locations', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ id: locations.id, name: locations.name, address: locations.address })
      .from(locations)
      .where(eq(locations.active, true));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/chocolatier/batches — all batches (open + recent closed)
router.get('/batches', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: batches.id,
        location_id: batches.location_id,
        location_name: locations.name,
        variety_id: batches.variety_id,
        variety_name: varieties.name,
        price_cents: varieties.price_cents,
        quantity_total: batches.quantity_total,
        quantity_remaining: batches.quantity_remaining,
        published: batches.published,
        notes: batches.notes,
        delivery_date: batches.delivery_date,
        triggered_at: batches.triggered_at,
        ready_at: batches.ready_at,
        created_at: batches.created_at,
        published_at: batches.published_at,
        closed_at: batches.closed_at,
      })
      .from(batches)
      .innerJoin(locations, eq(batches.location_id, locations.id))
      .innerJoin(varieties, eq(batches.variety_id, varieties.id))
      .orderBy(desc(batches.created_at))
      .limit(50);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/chocolatier/batches — create a new batch (unpublished)
router.post('/batches', async (req: Request, res: Response) => {
  const { location_id, variety_id, quantity, notes } = req.body as {
    location_id?: number; variety_id?: number; quantity?: number; notes?: string;
  };
  if (!location_id || !variety_id || !quantity || quantity < 1) {
    res.status(400).json({ error: 'location_id, variety_id, and quantity required' });
    return;
  }
  try {
    const [batch] = await db
      .insert(batches)
      .values({ location_id, variety_id, quantity_total: quantity, quantity_remaining: quantity, notes: notes ?? null })
      .returning();
    res.status(201).json(batch);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/chocolatier/batches/:id/publish — make batch live
router.post('/batches/:id/publish', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  try {
    const [batch] = await db
      .update(batches)
      .set({ published: true, published_at: new Date() })
      .where(and(eq(batches.id, id), eq(batches.published, false)))
      .returning();
    if (!batch) { res.status(404).json({ error: 'not_found_or_already_published' }); return; }
    res.json(batch);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/chocolatier/batches/:id/close — take batch offline
router.post('/batches/:id/close', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  try {
    const [batch] = await db
      .update(batches)
      .set({ published: false, closed_at: new Date() })
      .where(eq(batches.id, id))
      .returning();
    if (!batch) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(batch);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/chocolatier/batches/:id/ready — mark batch as ready for pickup, notify customers
router.post('/batches/:id/ready', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  try {
    const [batch] = await db
      .update(batches)
      .set({ ready_at: new Date() })
      .where(and(eq(batches.id, id), sql`${batches.triggered_at} IS NOT NULL`, sql`${batches.ready_at} IS NULL`))
      .returning();
    if (!batch) { res.status(404).json({ error: 'not_found_or_already_marked_ready' }); return; }

    // Fetch variety and location for notification copy
    const [variety] = await db.select({ name: varieties.name }).from(varieties).where(eq(varieties.id, batch.variety_id));
    const [location] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, batch.location_id));
    const deliveryDate = batch.delivery_date ?? new Date().toISOString().slice(0, 10);

    // Notify all paid orders in this batch
    const batchOrders = await db
      .select({
        id: orders.id,
        customer_email: orders.customer_email,
        push_token: orders.push_token,
        chocolate: orders.chocolate,
        finish: orders.finish,
        quantity: orders.quantity,
      })
      .from(orders)
      .where(and(eq(orders.batch_id, id), eq(orders.status, 'paid')));

    for (const order of batchOrders) {
      sendBatchReady({
        to: order.customer_email,
        varietyName: variety?.name ?? 'strawberries',
        chocolate: order.chocolate,
        finish: order.finish,
        quantity: order.quantity,
        deliveryDate,
        locationName: location?.name ?? '',
      }).catch(() => {});

      if (order.push_token) {
        sendPushNotification(order.push_token, {
          title: 'Your strawberries are ready',
          body: `Pick up at ${location?.name ?? 'the shop'} — freshly dipped and waiting.`,
          data: { screen: 'order-history' },
        }).catch(() => {});
      }
    }

    res.json({ ready: true, notified: batchOrders.length, batch });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/chocolatier/orders — today's orders across all batches
router.get('/orders', async (_req: Request, res: Response) => {
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const dayEnd   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  try {
    const rows = await db
      .select({
        id: orders.id,
        variety_name: varieties.name,
        chocolate: orders.chocolate,
        finish: orders.finish,
        quantity: orders.quantity,
        status: orders.status,
        customer_email: orders.customer_email,
        walk_in: orders.walk_in,
        nfc_token: orders.nfc_token,
        is_gift: orders.is_gift,
        gift_note: orders.gift_note,
        created_at: orders.created_at,
      })
      .from(orders)
      .innerJoin(varieties, eq(orders.variety_id, varieties.id))
      .where(and(
        sql`${orders.created_at} >= ${dayStart}`,
        sql`${orders.created_at} <= ${dayEnd}`,
        eq(orders.status, 'paid'),
      ))
      .orderBy(desc(orders.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
