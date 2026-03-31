import { Router, Request, Response } from 'express';
import { createPublicKey, createVerify } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { logger } from '../lib/logger';

const router = Router();
const APPLE_BUNDLE_ID = 'com.maisonfraise.app';

interface AppleJWK {
  kid: string;
  kty: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

// Verify Apple identity token using Apple's JWKS — no extra dependencies
async function verifyAppleToken(identityToken: string): Promise<{ sub: string; email?: string }> {
  const parts = identityToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));

  const jwksRes = await fetch('https://appleid.apple.com/auth/keys');
  if (!jwksRes.ok) throw new Error('Failed to fetch Apple public keys');
  const { keys } = await jwksRes.json() as { keys: AppleJWK[] };

  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Matching Apple public key not found');

  const publicKey = createPublicKey({ key: jwk as any, format: 'jwk' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  const isValid = verifier.verify(pem, signatureB64, 'base64url');
  if (!isValid) throw new Error('Invalid Apple token signature');

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));

  if (payload.iss !== 'https://appleid.apple.com') throw new Error('Invalid issuer');
  if (payload.aud !== APPLE_BUNDLE_ID) throw new Error('Invalid audience');
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');

  return { sub: payload.sub as string, email: payload.email as string | undefined };
}

// POST /api/auth/apple
// Body: { identity_token: string }
// Returns: { user_db_id: number, email: string }
router.post('/apple', async (req: Request, res: Response) => {
  const { identity_token } = req.body;
  if (!identity_token) {
    res.status(400).json({ error: 'identity_token is required' });
    return;
  }

  try {
    const { sub: appleUserId, email } = await verifyAppleToken(identity_token);

    // 1. Look up by apple_user_id first
    const [byApple] = await db.select().from(users).where(eq(users.apple_user_id, appleUserId));
    if (byApple) {
      res.json({ user_db_id: byApple.id, email: byApple.email });
      return;
    }

    // 2. If email available, try to link to an existing account created via order
    if (email) {
      const [byEmail] = await db.select().from(users).where(eq(users.email, email));
      if (byEmail) {
        const [linked] = await db
          .update(users)
          .set({ apple_user_id: appleUserId })
          .where(eq(users.id, byEmail.id))
          .returning();
        res.json({ user_db_id: linked.id, email: linked.email });
        return;
      }

      // 3. Brand new user — create account
      const [created] = await db
        .insert(users)
        .values({ email, apple_user_id: appleUserId })
        .returning();
      res.json({ user_db_id: created.id, email: created.email });
      return;
    }

    // apple_user_id not in DB and no email from token — Apple only sends email on first sign-in.
    // This means the user previously signed in on another install and their account was lost.
    res.status(404).json({ error: 'Account not found. Place an order first so we can link your Apple ID.' });
  } catch (err: unknown) {
    logger.error('Apple auth error', err);
    res.status(401).json({ error: err instanceof Error ? err.message : 'Authentication failed' });
  }
});

export default router;
