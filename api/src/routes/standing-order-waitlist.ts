import { Router, Request, Response } from 'express';
import { sql, eq, and } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS standing_order_waitlist (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  referred_by_user_id integer REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  claim_expires_at timestamptz,
  claimed_at timestamptz,
  status text NOT NULL DEFAULT 'waiting'
)`).catch(() => {});

// POST /api/waitlist — join
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { referral_code } = req.body;

  try {
    // Prevent duplicates
    const existing = await db.execute(sql`
      SELECT id, status FROM standing_order_waitlist WHERE user_id = ${userId}
    `);
    const existingRow = ((existing as any).rows ?? existing)[0];
    if (existingRow) {
      res.status(409).json({ error: 'already_on_waitlist', status: existingRow.status });
      return;
    }

    let referredByUserId: number | null = null;
    if (referral_code) {
      const refRows = await db.execute(sql`SELECT id FROM users WHERE user_code = ${referral_code}`);
      const refRow = ((refRows as any).rows ?? refRows)[0];
      if (refRow) referredByUserId = refRow.id;
    }

    await db.execute(sql`
      INSERT INTO standing_order_waitlist (user_id, referred_by_user_id)
      VALUES (${userId}, ${referredByUserId})
    `);

    const posRows = await db.execute(sql`
      SELECT COUNT(*)::int AS position FROM standing_order_waitlist
      WHERE status = 'waiting'
    `);
    const position = ((posRows as any).rows ?? posRows)[0]?.position ?? 1;

    res.status(201).json({ joined: true, position });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/waitlist/position
router.get('/position', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT id, status, claim_expires_at, joined_at FROM standing_order_waitlist
      WHERE user_id = ${userId}
    `);
    const row = ((rows as any).rows ?? rows)[0];
    if (!row) { res.json({ on_waitlist: false }); return; }

    const posRows = await db.execute(sql`
      SELECT COUNT(*)::int AS position FROM standing_order_waitlist
      WHERE status = 'waiting' AND joined_at <= (
        SELECT joined_at FROM standing_order_waitlist WHERE user_id = ${userId}
      )
    `);
    const position = ((posRows as any).rows ?? posRows)[0]?.position ?? null;

    const totalRows = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM standing_order_waitlist WHERE status = 'waiting'
    `);
    const total = ((totalRows as any).rows ?? totalRows)[0]?.total ?? 0;

    res.json({
      on_waitlist: true,
      status: row.status,
      position: row.status === 'waiting' ? position : null,
      total,
      claim_expires_at: row.claim_expires_at ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/waitlist/claim — claim offered slot
router.post('/claim', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT id, claim_expires_at FROM standing_order_waitlist
      WHERE user_id = ${userId} AND status = 'offered'
    `);
    const row = ((rows as any).rows ?? rows)[0];
    if (!row) { res.status(404).json({ error: 'no_offer' }); return; }
    if (row.claim_expires_at && new Date(row.claim_expires_at) < new Date()) {
      await db.execute(sql`UPDATE standing_order_waitlist SET status='expired' WHERE id=${row.id}`);
      res.status(410).json({ error: 'offer_expired' });
      return;
    }
    await db.execute(sql`
      UPDATE standing_order_waitlist SET status='claimed', claimed_at=now() WHERE id=${row.id}
    `);
    res.json({ claimed: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
