import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { users, businesses } from '../db/schema';
import { requireVerifiedUser } from '../lib/auth';
import { logger } from '../lib/logger';
import { randomUUID } from 'crypto';

const router = Router();

// Self-healing
db.execute(sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS allows_walkin boolean NOT NULL DEFAULT false`).catch(() => {});
db.execute(sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS approved_by_admin boolean NOT NULL DEFAULT false`).catch(() => {});
db.execute(sql`
  CREATE TABLE IF NOT EXISTS node_applications (
    id serial PRIMARY KEY,
    applicant_user_id integer NOT NULL REFERENCES users(id),
    status text NOT NULL DEFAULT 'pending',
    business_name text NOT NULL,
    address text NOT NULL,
    city text NOT NULL DEFAULT 'Montreal',
    neighbourhood text,
    description text,
    instagram_handle text,
    admin_notes text,
    reviewed_at timestamp,
    business_id integer REFERENCES businesses(id),
    created_at timestamp NOT NULL DEFAULT now()
  )
`).catch(() => {});

// POST /api/node-applications — verified user submits application
router.post('/', requireVerifiedUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { business_name, address, city, neighbourhood, description, instagram_handle } = req.body;

  if (!business_name?.trim() || !address?.trim()) {
    res.status(400).json({ error: 'business_name and address are required' });
    return;
  }

  try {
    // One pending/approved application per user
    const [existing] = await db.execute<{ id: number; status: string }>(sql`
      SELECT id, status FROM node_applications
      WHERE applicant_user_id = ${userId} AND status IN ('pending', 'approved')
      LIMIT 1
    `);
    if (existing) {
      res.status(409).json({ error: 'application_exists', status: (existing as any).status });
      return;
    }

    const [row] = await db.execute<{ id: number }>(sql`
      INSERT INTO node_applications
        (applicant_user_id, business_name, address, city, neighbourhood, description, instagram_handle)
      VALUES
        (${userId}, ${business_name.trim()}, ${address.trim()}, ${city?.trim() ?? 'Montreal'},
         ${neighbourhood?.trim() ?? null}, ${description?.trim() ?? null},
         ${instagram_handle?.trim() ?? null})
      RETURNING id
    `);

    res.status(201).json({ id: (row as any).id });
  } catch (err) {
    logger.error('node-applications POST error: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/node-applications/mine — return this user's most recent application
router.get('/mine', requireVerifiedUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const [row] = await db.execute<{
      id: number; status: string; business_name: string;
      address: string; neighbourhood: string | null;
      description: string | null; instagram_handle: string | null;
      admin_notes: string | null; business_id: number | null;
      created_at: string;
    }>(sql`
      SELECT id, status, business_name, address, neighbourhood, description,
             instagram_handle, admin_notes, business_id, created_at
      FROM node_applications
      WHERE applicant_user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 1
    `);
    res.json(row ?? null);
  } catch (err) {
    logger.error('node-applications GET /mine error: ' + String(err));
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
