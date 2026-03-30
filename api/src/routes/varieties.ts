import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { varieties } from '../db/schema';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(varieties).where(eq(varieties.active, true));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
