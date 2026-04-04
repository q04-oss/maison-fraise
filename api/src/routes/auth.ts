import { Router, Request, Response } from 'express';
import appleSignin from 'apple-signin-auth';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { logger } from '../lib/logger';
import { signToken, requireUser } from '../lib/auth';

function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function uniqueUserCode(): Promise<string> {
  let code = generateUserCode();
  let attempts = 0;
  while (attempts < 10) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.user_code, code));
    if (!existing) return code;
    code = generateUserCode();
    attempts++;
  }
  return code;
}

const router = Router();

async function handleAppleSignIn(req: Request, res: Response) {
  const { identityToken, firstName, lastName, email: bodyEmail } = req.body;
  if (!identityToken) {
    res.status(400).json({ error: 'identityToken is required' });
    return;
  }

  try {
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: 'com.maisonfraise.app',
      ignoreExpiration: false,
    });
    const appleId = payload.sub;
    const appleEmail = payload.email || bodyEmail;
    const displayName = firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(' ')
      : undefined;

    // 1. Look up by apple_user_id
    const [byApple] = await db.select().from(users).where(eq(users.apple_user_id, appleId));
    if (byApple) {
      const token = signToken(byApple.id);
      res.json({ user_id: byApple.id, token, is_new: false, email: byApple.email });
      return;
    }

    // 2. If email available, try to link to an existing account
    if (appleEmail) {
      const [byEmail] = await db.select().from(users).where(eq(users.email, appleEmail));
      if (byEmail) {
        await db.update(users).set({ apple_user_id: appleId }).where(eq(users.id, byEmail.id));
        const token = signToken(byEmail.id);
        res.json({ user_id: byEmail.id, token, is_new: false, email: byEmail.email });
        return;
      }

      // 3. Brand new user — create account
      const userCode = await uniqueUserCode();
      const [created] = await db
        .insert(users)
        .values({
          email: appleEmail,
          apple_user_id: appleId,
          user_code: userCode,
          ...(displayName ? { display_name: displayName } : {}),
        })
        .returning();
      const token = signToken(created.id);
      res.json({ user_id: created.id, token, is_new: true, email: created.email });
      return;
    }

    res.status(404).json({ error: 'Account not found and no email provided.' });
  } catch (err: unknown) {
    logger.error('Apple auth error', err);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// POST /api/auth/apple and /api/auth/apple/verify (alias) — both accepted by iOS
router.post('/apple', handleAppleSignIn);
router.post('/apple/verify', handleAppleSignIn);

// POST /api/auth/demo — demo login for Apple reviewers
router.post('/demo', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const demoEmail = process.env.DEMO_EMAIL ?? 'demo@maison-fraise.com';
  const demoPassword = process.env.DEMO_PASSWORD ?? 'demo1234';
  if (email !== demoEmail || password !== demoPassword) {
    logger.warn('Demo login rejected', { receivedEmail: email, expectedEmail: demoEmail, passwordMatch: password === demoPassword });
    res.status(401).json({ error: 'invalid_credentials' }); return;
  }
  try {
    const existing = await db.execute<{ id: number }>(sql`SELECT id FROM users WHERE email = ${demoEmail} LIMIT 1`);
    const rows = (existing as any).rows ?? existing;
    let userId: number;
    if (rows.length > 0) {
      userId = rows[0].id;
    } else {
      const inserted = await db.execute<{ id: number }>(sql`
        INSERT INTO users (email, display_name, verified) VALUES (${demoEmail}, 'Demo User', true) RETURNING id
      `);
      const insertedRows = (inserted as any).rows ?? inserted;
      userId = insertedRows[0].id;
    }
    res.json({ user_id: userId, token: signToken(userId), is_new: false });
  } catch (e) {
    logger.error('Demo login error: ' + String(e));
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/auth/push-token — update push token for the authenticated user
router.patch('/push-token', requireUser, async (req: Request, res: Response) => {
  const { push_token } = req.body;
  const userId = (req as any).userId as number;
  if (!push_token) {
    res.status(400).json({ error: 'push_token is required' });
    return;
  }
  try {
    await db.update(users).set({ push_token }).where(eq(users.id, userId));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
