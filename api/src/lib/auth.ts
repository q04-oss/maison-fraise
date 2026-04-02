import jwt from 'jsonwebtoken';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const SECRET = process.env.JWT_SECRET ?? 'maison-fraise-dev-secret';

export function signToken(userId: number): string {
  return jwt.sign({ userId }, SECRET, { expiresIn: '90d' });
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    return jwt.verify(token, SECRET) as { userId: number };
  } catch {
    return null;
  }
}

// Express middleware — reads Bearer token OR falls back to X-User-ID header for backwards compat
// Also checks that the user is not banned.
export async function requireUser(req: any, res: any, next: any) {
  let userId: number | null = null;

  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) {
    const payload = verifyToken(auth.slice(7));
    if (!payload) return res.status(401).json({ error: 'invalid_token' });
    userId = payload.userId;
  } else {
    // Backwards compat: X-User-ID header
    const uid = parseInt(req.headers['x-user-id']);
    if (!isNaN(uid)) { userId = uid; }
  }

  if (userId === null) return res.status(401).json({ error: 'unauthorized' });

  try {
    const [user] = await db.select({ id: users.id, banned: users.banned }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (user.banned) return res.status(403).json({ error: 'account_suspended' });
    req.userId = userId;
    return next();
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
}
