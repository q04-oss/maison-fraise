import { Router, Request, Response } from 'express';
import { eq, like, sum } from 'drizzle-orm';
import { db } from '../db';
import { users, legitimacyEvents } from '../db/schema';

const router = Router();

// GET /api/users/me — identified by X-User-ID header
router.get('/me', async (req: Request, res: Response) => {
  const rawId = req.headers['x-user-id'];
  const user_id = parseInt(String(rawId), 10);
  if (isNaN(user_id)) {
    res.status(400).json({ error: 'X-User-ID header is required' });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, user_id));
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [scoreRow] = await db
      .select({ total: sum(legitimacyEvents.weight) })
      .from(legitimacyEvents)
      .where(eq(legitimacyEvents.user_id, user_id));

    const legitimacy_score = Number(scoreRow?.total ?? 0);

    res.json({ ...user, legitimacy_score });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/search?q= — verified users only
router.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.status(400).json({ error: 'q query parameter is required' });
    return;
  }

  try {
    const rows = await db
      .select({ id: users.id, verified: users.verified, created_at: users.created_at })
      .from(users)
      .where(eq(users.verified, true));

    const filtered = rows.filter(u => String(u.id).includes(q));
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
