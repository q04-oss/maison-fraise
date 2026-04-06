import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_fired_at timestamptz,
  last_status_code integer
)`).catch(() => {});

// GET /api/webhooks
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`
      SELECT id, url, events, active, created_at, last_fired_at, last_status_code
      FROM webhook_subscriptions WHERE user_id=${userId} ORDER BY created_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/webhooks
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { url, events } = req.body;
  if (!url || !Array.isArray(events) || events.length === 0) {
    res.status(400).json({ error: 'url and events[] required' }); return;
  }
  try {
    const secret = crypto.randomBytes(24).toString('hex');
    const result = await db.execute(sql`
      INSERT INTO webhook_subscriptions (user_id, url, events, secret)
      VALUES (${userId}, ${url}, ${events}, ${secret})
      RETURNING *
    `);
    res.status(201).json(((result as any).rows ?? result)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/webhooks/:id
router.delete('/:id', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    await db.execute(sql`DELETE FROM webhook_subscriptions WHERE id=${id} AND user_id=${userId}`);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/webhooks/:id/test
router.post('/:id/test', requireUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const userId = (req as any).userId as number;
  try {
    const rows = await db.execute(sql`SELECT * FROM webhook_subscriptions WHERE id=${id} AND user_id=${userId}`);
    const sub = ((rows as any).rows ?? rows)[0];
    if (!sub) { res.status(404).json({ error: 'not_found' }); return; }

    const body = JSON.stringify({ event: 'test', data: { message: 'Webhook test from Maison Fraise' }, fired_at: new Date().toISOString() });
    const sig = 'sha256=' + crypto.createHmac('sha256', sub.secret).update(body).digest('hex');
    const r = await fetch(sub.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Fraise-Event': 'test', 'X-Fraise-Signature': sig },
      body,
    }).catch(() => null);

    const statusCode = r?.status ?? 0;
    await db.execute(sql`UPDATE webhook_subscriptions SET last_fired_at=now(), last_status_code=${statusCode} WHERE id=${id}`);
    res.json({ delivered: !!r, status_code: statusCode });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
