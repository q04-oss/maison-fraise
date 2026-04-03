import jwt from 'jsonwebtoken';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set');
}
const SECRET = process.env.JWT_SECRET;

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

// Express middleware — requires Bearer token in Authorization header
export async function requireUser(req: any, res: any, next: any) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'invalid_token' });

  try {
    const [user] = await db.select({ id: users.id, banned: users.banned }).from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (user.banned) return res.status(403).json({ error: 'account_suspended' });
    req.userId = payload.userId;
    return next();
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
}
