import { Router, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { locations, timeSlots } from '../db/schema';

export const locationsRouter = Router();
export const slotsRouter = Router();

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
    const rows = await db
      .select()
      .from(timeSlots)
      .where(
        and(
          eq(timeSlots.location_id, locationIdNum),
          eq(timeSlots.date, String(date))
        )
      )
      .orderBy(timeSlots.time);

    res.json(
      rows.map((s) => ({ ...s, available: s.capacity - s.booked }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
