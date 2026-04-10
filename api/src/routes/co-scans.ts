import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS co_scans (
  id serial PRIMARY KEY,
  variety_id integer NOT NULL,
  initiator_code text NOT NULL UNIQUE,
  user_id_a integer NOT NULL,
  user_id_b integer,
  scanned_at timestamptz DEFAULT now()
)`).catch(() => {});

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /api/co-scans/initiate — generate code and insert
router.post('/initiate', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { variety_id } = req.body;
  if (!variety_id) { res.status(400).json({ error: 'variety_id required' }); return; }
  try {
    let code = generateCode();
    // Retry on collision (extremely rare)
    let result: any;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        result = await db.execute(sql`
          INSERT INTO co_scans (variety_id, initiator_code, user_id_a)
          VALUES (${variety_id}, ${code}, ${userId})
          RETURNING id, initiator_code
        `);
        break;
      } catch {
        code = generateCode();
      }
    }
    if (!result) { res.status(500).json({ error: 'could_not_generate_code' }); return; }
    const row = ((result as any).rows ?? result)[0];
    res.json({ code: row.initiator_code, co_scan_id: row.id });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/co-scans/join — find by code where user_id_b IS NULL, set user_id_b
router.post('/join', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { code } = req.body;
  if (!code) { res.status(400).json({ error: 'code required' }); return; }
  try {
    const rows = await db.execute(sql`
      UPDATE co_scans
      SET user_id_b = ${userId}
      WHERE initiator_code = ${code}
        AND user_id_b IS NULL
        AND user_id_a != ${userId}
      RETURNING *
    `);
    const row = ((rows as any).rows ?? rows)[0];
    if (!row) { res.status(404).json({ error: 'not_found_or_already_joined' }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
