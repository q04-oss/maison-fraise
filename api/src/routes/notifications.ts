import { Router, Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { notifications } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

// GET /api/notifications — current user's notifications
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, userId))
      .orderBy(desc(notifications.created_at))
      .limit(50);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/notifications/read-all — mark all read
router.post('/read-all', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.user_id, userId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
