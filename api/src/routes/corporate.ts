import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireUser } from '../lib/auth';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS corporate_accounts (
  id serial PRIMARY KEY,
  name text NOT NULL,
  billing_email text NOT NULL,
  admin_user_id integer NOT NULL REFERENCES users(id),
  stripe_customer_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`CREATE TABLE IF NOT EXISTS corporate_members (
  id serial PRIMARY KEY,
  corporate_id integer NOT NULL REFERENCES corporate_accounts(id),
  user_id integer NOT NULL REFERENCES users(id),
  standing_order_id integer REFERENCES standing_orders(id),
  invited_by_user_id integer REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(corporate_id, user_id)
)`).catch(() => {});

// GET /api/corporate/me — literal before parameterized
router.get('/me', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    // Check if admin
    const adminRows = await db.execute(sql`
      SELECT ca.* FROM corporate_accounts ca WHERE ca.admin_user_id = ${userId} AND ca.active = true LIMIT 1
    `);
    const asAdmin = ((adminRows as any).rows ?? adminRows)[0];
    if (asAdmin) { res.json({ ...asAdmin, role: 'admin' }); return; }

    // Check if member
    const memberRows = await db.execute(sql`
      SELECT ca.*, cm.standing_order_id FROM corporate_accounts ca
      JOIN corporate_members cm ON cm.corporate_id = ca.id
      WHERE cm.user_id = ${userId} AND ca.active = true LIMIT 1
    `);
    const asMember = ((memberRows as any).rows ?? memberRows)[0];
    if (asMember) { res.json({ ...asMember, role: 'member' }); return; }

    res.json(null);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/corporate/members
router.get('/members', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const acctRows = await db.execute(sql`
      SELECT id FROM corporate_accounts WHERE admin_user_id = ${userId} AND active = true LIMIT 1
    `);
    const acct = ((acctRows as any).rows ?? acctRows)[0];
    if (!acct) { res.status(403).json({ error: 'not_admin' }); return; }

    const rows = await db.execute(sql`
      SELECT cm.*, u.display_name, u.email, u.user_code, u.verified
      FROM corporate_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.corporate_id = ${acct.id}
      ORDER BY cm.joined_at ASC
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/corporate — create account
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { name, billing_email } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: 'name required' }); return;
  }
  try {
    const result = await db.execute(sql`
      INSERT INTO corporate_accounts (name, billing_email, admin_user_id)
      VALUES (${name.trim()}, ${billing_email?.trim() ?? ''}, ${userId})
      RETURNING *
    `);
    res.status(201).json(((result as any).rows ?? result)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/corporate/invite
router.post('/invite', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { user_code } = req.body;
  if (!user_code) { res.status(400).json({ error: 'user_code required' }); return; }
  try {
    const acctRows = await db.execute(sql`
      SELECT id FROM corporate_accounts WHERE admin_user_id = ${userId} AND active = true LIMIT 1
    `);
    const acct = ((acctRows as any).rows ?? acctRows)[0];
    if (!acct) { res.status(403).json({ error: 'not_admin' }); return; }

    const userRows = await db.execute(sql`SELECT id FROM users WHERE user_code = ${user_code}`);
    const target = ((userRows as any).rows ?? userRows)[0];
    if (!target) { res.status(404).json({ error: 'user_not_found' }); return; }

    await db.execute(sql`
      INSERT INTO corporate_members (corporate_id, user_id, invited_by_user_id)
      VALUES (${acct.id}, ${target.id}, ${userId})
      ON CONFLICT (corporate_id, user_id) DO NOTHING
    `);
    res.json({ invited: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /api/corporate/members/:userId
router.delete('/members/:targetUserId', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const targetUserId = parseInt(req.params.targetUserId, 10);
  if (isNaN(targetUserId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const acctRows = await db.execute(sql`
      SELECT id FROM corporate_accounts WHERE admin_user_id = ${userId} AND active = true LIMIT 1
    `);
    const acct = ((acctRows as any).rows ?? acctRows)[0];
    if (!acct) { res.status(403).json({ error: 'not_admin' }); return; }

    await db.execute(sql`
      DELETE FROM corporate_members WHERE corporate_id=${acct.id} AND user_id=${targetUserId}
    `);
    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
