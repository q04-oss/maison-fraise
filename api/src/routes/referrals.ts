import { Router, Request, Response } from 'express';
import { sql, eq } from 'drizzle-orm';
import { db } from '../db';
import { users, legitimacyEvents } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS referrals (
  id serial PRIMARY KEY,
  referrer_user_id integer NOT NULL REFERENCES users(id),
  referee_user_id integer NOT NULL REFERENCES users(id),
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  reward_granted_at timestamptz,
  UNIQUE(referee_user_id)
)`).catch(() => {});

// GET /api/referrals/my-code — literal before parameterized
router.get('/my-code', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [user] = await db.select({ user_code: users.user_code, display_name: users.display_name })
      .from(users).where(eq(users.id, userId));
    const code = user?.user_code ?? null;

    const rows = await db.execute(sql`
      SELECT r.*, u.display_name AS referee_name
      FROM referrals r
      JOIN users u ON u.id = r.referee_user_id
      WHERE r.referrer_user_id = ${userId}
      ORDER BY r.created_at DESC
    `);

    res.json({
      code,
      referral_url: code ? `https://fraise.app/join?ref=${code}` : null,
      referrals: (rows as any).rows ?? rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/referrals/apply
router.post('/apply', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { code } = req.body;
  if (!code) { res.status(400).json({ error: 'code required' }); return; }
  try {
    const refRows = await db.execute(sql`SELECT id FROM users WHERE user_code = ${code}`);
    const referrer = ((refRows as any).rows ?? refRows)[0];
    if (!referrer) { res.status(404).json({ error: 'invalid_code' }); return; }
    if (referrer.id === userId) { res.status(400).json({ error: 'cannot_refer_self' }); return; }

    // Idempotent insert
    const inserted = await db.execute(sql`
      INSERT INTO referrals (referrer_user_id, referee_user_id, code, completed_at, reward_granted_at)
      VALUES (${referrer.id}, ${userId}, ${code}, now(), now())
      ON CONFLICT (referee_user_id) DO NOTHING
      RETURNING id
    `);
    const newRow = ((inserted as any).rows ?? inserted)[0];
    if (newRow) {
      // Grant legitimacy points to both
      await db.insert(legitimacyEvents).values([
        { user_id: referrer.id, event_type: 'referral_completed', weight: 3 },
        { user_id: userId, event_type: 'referred_joined', weight: 3 },
      ]);
    }
    res.json({ applied: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
