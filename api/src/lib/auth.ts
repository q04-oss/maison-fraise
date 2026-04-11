import jwt from 'jsonwebtoken';
import { verifyMessage } from 'ethers';
import { db } from '../db';
import { users, devices } from '../db/schema';
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

// Express middleware — requires in-person NFC verification (users.verified = true)
export async function requireVerifiedUser(req: any, res: any, next: any) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'invalid_token' });

  try {
    const [user] = await db
      .select({ id: users.id, banned: users.banned, verified: users.verified })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (user.banned) return res.status(403).json({ error: 'account_suspended' });
    if (!user.verified) return res.status(403).json({ error: 'verification_required' });
    req.userId = payload.userId;
    return next();
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
}

// Express middleware — authenticates a Cardputer/hardware device.
// Devices sign the current unix minute with their on-chip key (EIP-191 personal_sign).
// Header format: Authorization: Fraise <address>:<hex_signature>
// Allows a ±1 minute clock skew window.
export async function requireDevice(req: any, res: any, next: any) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Fraise ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const parts = auth.slice('Fraise '.length).split(':');
  if (parts.length !== 2) return res.status(401).json({ error: 'malformed_auth' });

  const [claimedAddress, signature] = parts;
  if (!/^0x[0-9a-fA-F]{40}$/.test(claimedAddress)) {
    return res.status(401).json({ error: 'invalid_address' });
  }

  // Verify the signature covers the current minute (±1 min skew allowed)
  const nowMinute = Math.floor(Date.now() / 60_000);
  let verified = false;
  for (const minute of [nowMinute - 1, nowMinute, nowMinute + 1]) {
    try {
      const recovered = verifyMessage(String(minute), signature);
      if (recovered.toLowerCase() === claimedAddress.toLowerCase()) {
        verified = true;
        break;
      }
    } catch {
      // invalid signature format — try next minute
    }
  }
  if (!verified) return res.status(401).json({ error: 'invalid_signature' });

  try {
    const [device] = await db
      .select({ id: devices.id, role: devices.role, user_id: devices.user_id })
      .from(devices)
      .where(eq(devices.device_address, claimedAddress.toLowerCase()))
      .limit(1);

    if (!device) return res.status(401).json({ error: 'device_not_registered' });

    req.deviceId      = device.id;
    req.deviceAddress = claimedAddress.toLowerCase();
    req.deviceRole    = device.role;
    req.deviceUserId  = device.user_id;
    return next();
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
}

// @final-audit
