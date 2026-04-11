import { Router, Request, Response } from 'express';
import { eq, or, and, desc, lt, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db } from '../db';
import { nfcConnections, nfcPairingTokens, users, memberships } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';

const router = Router();

// Ensure unique constraint on canonical (user_a, user_b) pair — inserts canonicalize to (min, max).
// If this fails (e.g. legacy duplicate pairs exist) log loudly — onConflictDoNothing() depends on it.
db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS nfc_connections_pair_unique
  ON nfc_connections (LEAST(user_a, user_b), GREATEST(user_a, user_b))
`).catch((err) => {
  logger.error('CRITICAL: failed to create nfc_connections_pair_unique index — duplicate NFC connections are possible until this is resolved', err);
});

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(6);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

// POST /api/nfc/initiate
router.post('/initiate', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const now = new Date();

  // Clean up expired tokens
  await db.delete(nfcPairingTokens).where(lt(nfcPairingTokens.expires_at, now));

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + 120_000);
  await db.insert(nfcPairingTokens).values({ token, user_id: userId, expires_at: expiresAt });

  res.json({ token });
});

// POST /api/nfc/confirm
router.post('/confirm', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { token, location } = req.body;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'token_required' });
    return;
  }

  const now = new Date();
  const [entry] = await db.select().from(nfcPairingTokens).where(eq(nfcPairingTokens.token, token)).limit(1);

  if (!entry) {
    res.status(404).json({ error: 'invalid_token' });
    return;
  }

  if (entry.expires_at < now) {
    await db.delete(nfcPairingTokens).where(eq(nfcPairingTokens.token, token));
    res.status(410).json({ error: 'token_expired' });
    return;
  }

  const otherUserId = entry.user_id;

  if (otherUserId === userId) {
    res.status(400).json({ error: 'cannot_connect_self' });
    return;
  }

  try {
    // Atomically consume the token and insert the connection in one transaction.
    // This prevents the race where two concurrent confirmers both read the same token,
    // pass validation, and each insert a connection before either deletes the token.
    let inserted: { id: number } | undefined;
    try {
      inserted = await db.transaction(async (tx) => {
        // Claim the token by deleting it atomically, re-checking expiry inside the transaction
        // so a token that expires between the pre-check and the claim is correctly rejected
        const deleted = await tx.delete(nfcPairingTokens)
          .where(and(
            eq(nfcPairingTokens.token, token),
            sql`${nfcPairingTokens.expires_at} >= NOW()`,
          ))
          .returning({ id: nfcPairingTokens.id, user_id: nfcPairingTokens.user_id });
        if (deleted.length === 0) throw Object.assign(new Error('already_connected'), { status: 409 });

        // Canonicalize pair order (min, max) so the unique index covers both directions
        const claimedOtherUserId = deleted[0].user_id;
        const canonA = Math.min(userId, claimedOtherUserId);
        const canonB = Math.max(userId, claimedOtherUserId);
        const [conn] = await tx.insert(nfcConnections).values({
          user_a: canonA,
          user_b: canonB,
          location: location ?? null,
        }).onConflictDoNothing().returning({ id: nfcConnections.id });
        if (!conn) throw Object.assign(new Error('already_connected'), { status: 409 });
        return conn;
      });
    } catch (txErr: any) {
      if (txErr?.status === 409) { res.status(409).json({ error: 'already_connected' }); return; }
      throw txErr;
    }

    if (!inserted) {
      res.status(409).json({ error: 'already_connected' });
      return;
    }

    // Get the other user's profile
    const [otherUser] = await db
      .select({
        id: users.id,
        display_name: users.display_name,
        portrait_url: users.portrait_url,
      })
      .from(users)
      .where(eq(users.id, otherUserId))
      .limit(1);

    const [activeMembership] = await db
      .select({ tier: memberships.tier })
      .from(memberships)
      .where(and(eq(memberships.user_id, otherUserId), eq(memberships.status, 'active')))
      .limit(1);

    res.json({
      connected: true,
      user: {
        id: otherUser?.id ?? otherUserId,
        display_name: otherUser?.display_name ?? null,
        membership_tier: activeMembership?.tier ?? null,
        portrait_url: otherUser?.portrait_url ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;

// ─── Contacts router (GET /api/contacts) ─────────────────────────────────────

export const contactsRouter = Router();

contactsRouter.get('/', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;

  try {
    const connections = await db
      .select({
        id: nfcConnections.id,
        user_a: nfcConnections.user_a,
        user_b: nfcConnections.user_b,
        confirmed_at: nfcConnections.confirmed_at,
        location: nfcConnections.location,
      })
      .from(nfcConnections)
      .where(or(eq(nfcConnections.user_a, userId), eq(nfcConnections.user_b, userId)))
      .orderBy(desc(nfcConnections.confirmed_at));

    const results = await Promise.all(
      connections.map(async (conn) => {
        const otherUserId = conn.user_a === userId ? conn.user_b : conn.user_a;

        const [otherUser] = await db
          .select({
            id: users.id,
            display_name: users.display_name,
            portrait_url: users.portrait_url,
            worker_status: users.worker_status,
          })
          .from(users)
          .where(eq(users.id, otherUserId))
          .limit(1);

        const [activeMembership] = await db
          .select({ tier: memberships.tier })
          .from(memberships)
          .where(and(eq(memberships.user_id, otherUserId), eq(memberships.status, 'active')))
          .limit(1);

        return {
          id: otherUser?.id ?? otherUserId,
          display_name: otherUser?.display_name ?? null,
          membership_tier: activeMembership?.tier ?? null,
          portrait_url: otherUser?.portrait_url ?? null,
          worker_status: otherUser?.worker_status ?? null,
          confirmed_at: conn.confirmed_at,
          location: conn.location,
        };
      }),
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});
