import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS collectif_challenges (
  id serial PRIMARY KEY,
  title text NOT NULL,
  description text,
  challenge_type text NOT NULL DEFAULT 'scan_farms',
  target_count integer NOT NULL DEFAULT 3,
  started_at timestamptz DEFAULT now(),
  ends_at timestamptz
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS user_challenge_progress (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  challenge_id integer NOT NULL,
  progress integer DEFAULT 0,
  completed_at timestamptz,
  UNIQUE(user_id, challenge_id)
)`).catch(() => {});

// GET /api/collectif-challenges/current — most recent active challenge with user's progress
router.get('/current', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT
        cc.*,
        COALESCE(ucp.progress, 0) AS progress,
        (ucp.completed_at IS NOT NULL) AS completed
      FROM collectif_challenges cc
      LEFT JOIN user_challenge_progress ucp
        ON ucp.challenge_id = cc.id AND ucp.user_id = ${userId}
      WHERE cc.ends_at > now() OR cc.ends_at IS NULL
      ORDER BY cc.started_at DESC
      LIMIT 1
    `);
    const challenge = ((rows as any).rows ?? rows)[0] ?? null;
    res.json({ challenge });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
