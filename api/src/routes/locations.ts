import { Router, Request, Response } from 'express';
import { and, eq, gt, lt, SQL, sql } from 'drizzle-orm';
import { db } from '../db';
import { locations, timeSlots, orders, varieties } from '../db/schema';
import { MIN_QUANTITY } from '../lib/batchTrigger';

export const locationsRouter = Router();
export const slotsRouter = Router();
export const timeSlotsPublicRouter = Router();

locationsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(locations).where(eq(locations.active, true));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

slotsRouter.get('/', async (req: Request, res: Response) => {
  const { location_id, date } = req.query;

  if (!location_id || !date) {
    res.status(400).json({ error: 'location_id and date are required' });
    return;
  }

  const locationIdNum = parseInt(String(location_id), 10);
  if (isNaN(locationIdNum)) {
    res.status(400).json({ error: 'location_id must be a number' });
    return;
  }

  try {
    let rows = await db
      .select()
      .from(timeSlots)
      .where(
        and(
          eq(timeSlots.location_id, locationIdNum),
          eq(timeSlots.date, String(date))
        )
      )
      .orderBy(timeSlots.time);

    // Generate slots on-demand if none exist for this date
    if (rows.length === 0) {
      const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
      const newSlots = hours.map((time) => ({
        location_id: locationIdNum,
        date: String(date),
        time,
        capacity: Math.floor(Math.random() * 4) + 2,
        booked: 0,
      }));
      try {
        rows = await db.insert(timeSlots).values(newSlots).returning();
      } catch {
        // Race condition: another request already inserted slots — re-fetch
        rows = await db
          .select()
          .from(timeSlots)
          .where(and(eq(timeSlots.location_id, locationIdNum), eq(timeSlots.date, String(date))))
          .orderBy(timeSlots.time);
      }
      rows.sort((a, b) => a.time.localeCompare(b.time));
    }

    res.json(
      rows.map((s) => ({ ...s, available: s.capacity - s.booked }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/locations/:id/batch-status — queued box counts per variety for a location
locationsRouter.get('/:id/batch-status', async (req: Request, res: Response) => {
  const locationId = parseInt(req.params.id, 10);
  if (isNaN(locationId)) {
    res.status(400).json({ error: 'Invalid location id' });
    return;
  }
  try {
    const [varietyRows, queuedRows] = await Promise.all([
      db.select({ id: varieties.id })
        .from(varieties)
        .where(and(eq(varieties.location_id, locationId), eq(varieties.active, true))),
      db.select({ variety_id: orders.variety_id, quantity: orders.quantity })
        .from(orders)
        .where(and(eq(orders.location_id, locationId), eq(orders.status, 'queued'))),
    ]);

    const grouped: Record<number, number> = {};
    for (const row of queuedRows) {
      grouped[row.variety_id] = (grouped[row.variety_id] ?? 0) + row.quantity;
    }

    const result = varietyRows.map(v => ({
      variety_id: v.id,
      queued_boxes: grouped[v.id] ?? 0,
      min_quantity: MIN_QUANTITY,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/time-slots?location_id=&date= — public route for available slots (capacity > 0)
timeSlotsPublicRouter.get('/', async (req: Request, res: Response) => {
  const { location_id, date } = req.query;

  try {
    const conditions: SQL[] = [gt(timeSlots.capacity, 0), sql`${timeSlots.booked} < ${timeSlots.capacity}`];

    if (location_id) {
      const locationIdNum = parseInt(String(location_id), 10);
      if (isNaN(locationIdNum)) {
        res.status(400).json({ error: 'location_id must be a number' });
        return;
      }
      conditions.push(eq(timeSlots.location_id, locationIdNum));
    }

    if (date) {
      conditions.push(eq(timeSlots.date, String(date)));
    }

    const rows = await db
      .select({
        id: timeSlots.id,
        location_id: timeSlots.location_id,
        date: timeSlots.date,
        time: timeSlots.time,
        capacity: timeSlots.capacity,
        booked: timeSlots.booked,
      })
      .from(timeSlots)
      .where(and(...(conditions as [SQL, ...SQL[]])))
      .orderBy(timeSlots.date, timeSlots.time);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
