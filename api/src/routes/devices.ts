import { Router, Request, Response } from 'express';
import { eq, lt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { verifyMessage } from 'ethers';
import { db } from '../db';
import { devices, devicePairingTokens, users } from '../db/schema';
import { requireUser, requireDevice } from '../lib/auth';
import { logger } from '../lib/logger';

const router = Router();

// ── Pairing token generation (app side, user-authenticated) ──────────────────

// POST /api/devices/pair-token
// App calls this to generate a short code the user types into the device.
router.post('/pair-token', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const now = new Date();

  try {
    // Clean up expired tokens
    await db.delete(devicePairingTokens).where(lt(devicePairingTokens.expires_at, now));

    // 8-char alphanumeric code — avoids ambiguous chars (0/O, 1/I/l)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(8);
    const token = Array.from(bytes).map(b => chars[b % chars.length]).join('');

    const expiresAt = new Date(now.getTime() + 5 * 60_000); // 5 minutes
    await db.insert(devicePairingTokens).values({ token, user_id: userId, expires_at: expiresAt });

    res.json({ token, expires_at: expiresAt.toISOString() });
  } catch (err) {
    logger.error('pair-token error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// ── Device registration (device side, device-signed) ─────────────────────────

// POST /api/devices/register
// Device submits its address (via Fraise auth header) and the pairing code.
// Auth: Fraise <address>:<signature>  (signed minute timestamp)
router.post('/register', async (req: Request, res: Response) => {
  const { device_address, user_token } = req.body;

  if (!device_address || typeof device_address !== 'string' ||
      !/^0x[0-9a-fA-F]{40}$/.test(device_address)) {
    res.status(400).json({ ok: false, error: 'invalid_device_address' });
    return;
  }

  if (!user_token || typeof user_token !== 'string') {
    res.status(400).json({ ok: false, error: 'user_token_required' });
    return;
  }

  // Verify the device signed the request (same ±1 min window as requireDevice)
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Fraise ')) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const parts = auth.slice('Fraise '.length).split(':');
  if (parts.length !== 2) {
    res.status(401).json({ ok: false, error: 'malformed_auth' });
    return;
  }

  const [claimedAddress, signature] = parts;
  if (claimedAddress.toLowerCase() !== device_address.toLowerCase()) {
    res.status(401).json({ ok: false, error: 'address_mismatch' });
    return;
  }

  const nowMinute = Math.floor(Date.now() / 60_000);
  let verified = false;
  for (const minute of [nowMinute - 1, nowMinute, nowMinute + 1]) {
    try {
      const recovered = verifyMessage(String(minute), signature);
      if (recovered.toLowerCase() === device_address.toLowerCase()) {
        verified = true;
        break;
      }
    } catch { /* try next */ }
  }

  if (!verified) {
    res.status(401).json({ ok: false, error: 'invalid_signature' });
    return;
  }

  try {
    const now = new Date();
    const normalizedAddress = device_address.toLowerCase();

    // Atomically consume the token and upsert the device in one transaction.
    // Using delete-returning ensures exactly one request wins even under concurrency.
    await db.transaction(async (tx) => {
      const [tokenRow] = await tx
        .delete(devicePairingTokens)
        .where(eq(devicePairingTokens.token, user_token.toUpperCase()))
        .returning();

      if (!tokenRow) {
        throw Object.assign(new Error('invalid_token'), { status: 404 });
      }

      if (tokenRow.expires_at < now) {
        throw Object.assign(new Error('token_expired'), { status: 410 });
      }

      const [existing] = await tx
        .select({ id: devices.id })
        .from(devices)
        .where(eq(devices.device_address, normalizedAddress))
        .limit(1);

      if (existing) {
        await tx
          .update(devices)
          .set({ user_id: tokenRow.user_id })
          .where(eq(devices.device_address, normalizedAddress));
      } else {
        await tx.insert(devices).values({
          device_address: normalizedAddress,
          user_id: tokenRow.user_id,
          role: 'user',
        });
      }

      logger.info(`device registered: ${normalizedAddress} for user ${tokenRow.user_id}`);
    });

    res.json({ ok: true });
  } catch (err: any) {
    if (err.status === 404) { res.status(404).json({ ok: false, error: 'invalid_token' }); return; }
    if (err.status === 410) { res.status(410).json({ ok: false, error: 'token_expired' }); return; }
    logger.error('device register error', err);
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

// ── Device role fetch (device side, device-authenticated) ────────────────────

// GET /api/devices/me
// Device queries its own role after registration.
router.get('/me', requireDevice, async (req: Request, res: Response) => {
  const role: string = (req as any).deviceRole;
  res.json({ ok: true, role });
});

// ── Device role assignment (app side, user-authenticated) ────────────────────

// PATCH /api/devices/:address/role
// Owning user may set a device to 'user'. Only admins (users.is_admin) may
// assign 'employee' or 'chocolatier' to prevent self-elevation of privilege.
router.patch('/:address/role', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { address } = req.params;
  const { role } = req.body;

  if (!['user', 'employee', 'chocolatier'].includes(role)) {
    res.status(400).json({ error: 'invalid_role' });
    return;
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    res.status(400).json({ error: 'invalid_address' });
    return;
  }

  try {
    const [device] = await db
      .select({ id: devices.id, user_id: devices.user_id })
      .from(devices)
      .where(eq(devices.device_address, address.toLowerCase()))
      .limit(1);

    if (!device) {
      res.status(404).json({ error: 'device_not_found' });
      return;
    }

    if (device.user_id !== userId) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    // Elevated roles require admin rights — prevents self-promotion
    if (role === 'employee' || role === 'chocolatier') {
      const [user] = await db
        .select({ is_dorotka: users.is_dorotka })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user?.is_dorotka) {
        res.status(403).json({ error: 'admin_required' });
        return;
      }
    }

    await db
      .update(devices)
      .set({ role })
      .where(eq(devices.id, device.id));

    res.json({ ok: true, role });
  } catch (err) {
    logger.error('device role update error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// ── User's registered devices (app side) ─────────────────────────────────────

// GET /api/devices
// Returns all devices registered to the authenticated user.
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db
      .select({
        id: devices.id,
        device_address: devices.device_address,
        role: devices.role,
        created_at: devices.created_at,
      })
      .from(devices)
      .where(eq(devices.user_id, userId));

    res.json(rows);
  } catch (err) {
    logger.error('devices list error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/devices/attest — store App Attest key ID and attestation for a device
// The attestation proves the request came from a genuine, unmodified Box Fraise build.
// Full verification against Apple's servers can be added; for now we record the key.
router.post('/attest', async (req: Request, res: Response) => {
  const { key_id, attestation, challenge } = req.body;
  if (!key_id || !attestation) return res.status(400).json({ error: 'key_id and attestation required' });
  const userId = (req as any).userId ?? null;

  try {
    await db.execute(sql`
      INSERT INTO device_attestations (key_id, attestation, challenge, user_id, created_at)
      VALUES (${key_id}, ${attestation}, ${challenge ?? null}, ${userId}, now())
      ON CONFLICT (key_id) DO UPDATE SET attestation = EXCLUDED.attestation, user_id = EXCLUDED.user_id
    `);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
