import jwt from 'jsonwebtoken';

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
export function requireUser(req: any, res: any, next: any) {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) {
    const payload = verifyToken(auth.slice(7));
    if (payload) { req.userId = payload.userId; return next(); }
    return res.status(401).json({ error: 'invalid_token' });
  }
  // Backwards compat: X-User-ID header
  const uid = parseInt(req.headers['x-user-id']);
  if (!isNaN(uid)) { req.userId = uid; return next(); }
  return res.status(401).json({ error: 'unauthorized' });
}
