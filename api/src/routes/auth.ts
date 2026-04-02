import { Router, Request, Response } from 'express';
import appleSignin from 'apple-signin-auth';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { logger } from '../lib/logger';
import { signToken } from '../lib/auth';

const router = Router();

async function handleAppleSignIn(req: Request, res: Response) {
  const { identityToken, firstName, lastName, email: bodyEmail } = req.body;
  if (!identityToken) {
    res.status(400).json({ error: 'identityToken is required' });
    return;
  }

  try {
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: process.env.APPLE_CLIENT_ID ?? 'com.maisonfraise.app',
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
      res.json({ user_id: byApple.id, token, is_new: false });
      return;
    }

    // 2. If email available, try to link to an existing account
    if (appleEmail) {
      const [byEmail] = await db.select().from(users).where(eq(users.email, appleEmail));
      if (byEmail) {
        await db.update(users).set({ apple_user_id: appleId }).where(eq(users.id, byEmail.id));
        const token = signToken(byEmail.id);
        res.json({ user_id: byEmail.id, token, is_new: false });
        return;
      }

      // 3. Brand new user — create account
      const [created] = await db
        .insert(users)
        .values({
          email: appleEmail,
          apple_user_id: appleId,
          ...(displayName ? { display_name: displayName } : {}),
        })
        .returning();
      const token = signToken(created.id);
      res.json({ user_id: created.id, token, is_new: true });
      return;
    }

    res.status(404).json({ error: 'Account not found and no email provided.' });
  } catch (err: unknown) {
    logger.error('Apple auth error', err);
    res.status(401).json({ error: err instanceof Error ? err.message : 'Authentication failed' });
  }
}

// POST /api/auth/apple and /api/auth/apple/verify (alias) — both accepted by iOS
router.post('/apple', handleAppleSignIn);
router.post('/apple/verify', handleAppleSignIn);

// POST /api/auth/token — issue a JWT for a given user_id (verifies user exists)
router.post('/token', async (req: Request, res: Response) => {
  const { user_id } = req.body;
  if (!user_id || typeof user_id !== 'number') {
    res.status(400).json({ error: 'user_id (number) is required' });
    return;
  }
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, user_id));
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const token = signToken(user.id);
    res.json({ token });
  } catch (err) {
    logger.error('Token generation error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/auth/push-token — update push token for an existing user
router.patch('/push-token', async (req: Request, res: Response) => {
  const { user_id, push_token } = req.body;
  if (!user_id || !push_token) {
    res.status(400).json({ error: 'user_id and push_token are required' });
    return;
  }
  try {
    await db.update(users).set({ push_token }).where(eq(users.id, user_id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
