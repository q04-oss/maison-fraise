import { Router, Request, Response } from 'express';
import { sql, eq, and } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS fraise_messages (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  from_email text NOT NULL,
  from_name text,
  subject text,
  body text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
)`).catch(() => {});

// POST /api/fraise-chat/inbound — ImprovMX webhook (no auth)
router.post('/inbound', async (req: Request, res: Response) => {
  try {
    const { to, from, subject, text: body } = req.body;
    if (!to || !body) { res.status(200).json({ ok: true }); return; }

    // Extract user_code from "alice@fraise.chat"
    const toAddr = Array.isArray(to) ? to[0] : to;
    const match = String(toAddr).match(/^([^@]+)@fraise\.chat/i);
    if (!match) { res.status(200).json({ ok: true }); return; }
    const userCode = match[1].toLowerCase();

    const userRows = await db.execute(sql`SELECT id FROM users WHERE user_code = ${userCode}`);
    const user = ((userRows as any).rows ?? userRows)[0];
    if (!user) { res.status(200).json({ ok: true }); return; }

    // Parse from field: "Name <email>" or just email
    let fromEmail = String(from ?? '');
    let fromName: string | null = null;
    const fromMatch = fromEmail.match(/^(.+?)\s*<([^>]+)>/);
    if (fromMatch) { fromName = fromMatch[1].trim(); fromEmail = fromMatch[2].trim(); }

    await db.execute(sql`
      INSERT INTO fraise_messages (user_id, from_email, from_name, subject, body)
      VALUES (${user.id}, ${fromEmail}, ${fromName}, ${subject ?? null}, ${String(body)})
    `);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(200).json({ ok: true }); // Always 200 to ImprovMX
  }
});

// GET /api/fraise-chat/messages
router.get('/messages', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT * FROM fraise_messages WHERE user_id=${userId} ORDER BY received_at DESC LIMIT 50
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/fraise-chat/messages/:id/read
router.post('/messages/:id/read', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    await db.execute(sql`
      UPDATE fraise_messages SET read_at=now() WHERE id=${id} AND user_id=${userId} AND read_at IS NULL
    `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/fraise-chat/messages/:id
router.delete('/messages/:id', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    await db.execute(sql`DELETE FROM fraise_messages WHERE id=${id} AND user_id=${userId}`);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
