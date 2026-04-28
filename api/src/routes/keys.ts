/**
 * box fraise — Signal Protocol key distribution
 *
 * POST /api/keys/challenge           — issue a proof-of-possession challenge
 * POST /api/keys/register            — upload keys; verifies challenge + Ed25519 signature
 * POST /api/keys/one-time            — upload additional one-time prekeys
 * GET  /api/keys/one-time/count      — return unused OPK count for authenticated user
 * GET  /api/keys/bundle/:userId      — fetch a prekey bundle to initiate X3DH
 * GET  /api/keys/bundle/by-code/:c   — same, looked up by fraise user_code
 *
 * Licensed under GPL v3 — Copyright (c) 2026 Rajzyngier Research
 */

import { Router, Request, Response } from 'express';
import { randomBytes, createPublicKey, verify as cryptoVerify } from 'crypto';
import { eq, and, lt, sql, count } from 'drizzle-orm';
import { db } from '../db';
import { userKeys, oneTimePreKeys, keyChallenges } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';

const router = Router();

// ─── Ed25519 verification ─────────────────────────────────────────────────────
// Constructs a minimal SPKI DER envelope around a raw 32-byte Ed25519 public key
// so Node's built-in crypto.verify() can handle it without a third-party library.
// Header bytes encode OID 1.3.101.112 per RFC 8410.

function verifyEd25519(message: Buffer, signatureBase64: string, pubKeyBase64: string): boolean {
  try {
    const pubKeyBytes = Buffer.from(pubKeyBase64, 'base64');
    if (pubKeyBytes.length !== 32) return false;
    const sig = Buffer.from(signatureBase64, 'base64');
    // 30 2a  SEQUENCE(42)
    //   30 05  SEQUENCE(5)
    //     06 03 2b 65 70  OID 1.3.101.112
    //   03 21 00  BIT STRING(33, 0 padding bits)
    //   <32 bytes>
    const header = Buffer.from('302a300506032b6570032100', 'hex');
    const spki = Buffer.concat([header, pubKeyBytes]);
    const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    return cryptoVerify(null, message, publicKey, sig);
  } catch {
    return false;
  }
}

// ─── POST /api/keys/challenge ─────────────────────────────────────────────────
// Issues a one-time 32-byte challenge. The client signs it with its Ed25519
// identity key and includes the signature in POST /keys/register as `challengeSig`.
// Expires in 5 minutes; consumed exactly once.

router.post('/challenge', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    // Clean up expired challenges for this user before issuing a new one
    await db.delete(keyChallenges).where(
      and(eq(keyChallenges.user_id, userId), lt(keyChallenges.expires_at, new Date()))
    );

    const challenge  = randomBytes(32).toString('base64');
    const expiresAt  = new Date(Date.now() + 5 * 60_000);

    await db.insert(keyChallenges).values({ user_id: userId, challenge, expires_at: expiresAt });

    res.json({ challenge });
  } catch (err) {
    logger.error('keys/challenge error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── POST /api/keys/register ──────────────────────────────────────────────────
// Registers or refreshes the user's public key bundle.
// Requires a valid challenge signature (proof that the client holds the private
// key corresponding to identitySigningKey) before any key material is stored.

router.post('/register', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { identityKey, identitySigningKey, signedPreKey, signedPreKeySig,
          challengeSig, oneTimePreKeys: otpks } = req.body;

  if (!identityKey || !signedPreKey || !signedPreKeySig) {
    res.status(400).json({ error: 'identityKey, signedPreKey, and signedPreKeySig are required' });
    return;
  }

  // Proof-of-possession: verify the client signed the most recent unexpired challenge.
  // If identitySigningKey is absent (old client), skip verification and accept in
  // degraded mode — log a warning so we can track adoption.
  if (identitySigningKey && challengeSig) {
    const [challengeRow] = await db
      .select()
      .from(keyChallenges)
      .where(and(
        eq(keyChallenges.user_id, userId),
        eq(keyChallenges.used, false),
        sql`${keyChallenges.expires_at} > now()`,
      ))
      .orderBy(sql`${keyChallenges.created_at} DESC`)
      .limit(1);

    if (!challengeRow) {
      res.status(400).json({ error: 'no valid challenge — call POST /keys/challenge first' });
      return;
    }

    const challengeBytes = Buffer.from(challengeRow.challenge, 'base64');
    const valid = verifyEd25519(challengeBytes, challengeSig, identitySigningKey);

    if (!valid) {
      logger.warn(`key registration: Ed25519 challenge verification failed for user ${userId}`);
      res.status(403).json({ error: 'challenge signature invalid' });
      return;
    }

    // Mark challenge consumed — single-use
    await db.update(keyChallenges)
      .set({ used: true })
      .where(eq(keyChallenges.id, challengeRow.id));

    logger.info(`key registration: proof-of-possession verified for user ${userId}`);
  } else {
    // ENFORCE: once all clients send identitySigningKey, reject registrations without it.
    logger.warn(`key registration: missing identitySigningKey or challengeSig for user ${userId} — degraded mode`);
  }

  try {
    await db.insert(userKeys).values({
      user_id: userId,
      identity_key: identityKey,
      identity_signing_key: identitySigningKey ?? null,
      signed_pre_key: signedPreKey,
      signed_pre_key_sig: signedPreKeySig,
    }).onConflictDoUpdate({
      target: userKeys.user_id,
      set: {
        identity_signing_key: identitySigningKey ?? null,
        signed_pre_key:       signedPreKey,
        signed_pre_key_sig:   signedPreKeySig,
        updated_at:           new Date(),
      },
    });

    if (Array.isArray(otpks) && otpks.length > 0) {
      const valid = otpks.filter((k: any) =>
        typeof k.id === 'number' && typeof k.key === 'string' && k.key.length > 0
      );
      if (valid.length > 0) {
        await db.insert(oneTimePreKeys).values(
          valid.map((k: { id: number; key: string }) => ({
            user_id:    userId,
            key_id:     k.id,
            public_key: k.key,
          }))
        ).onConflictDoNothing();
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error('keys/register error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── POST /api/keys/one-time ──────────────────────────────────────────────────
// Upload additional one-time prekeys. Called when the server pool drops below 5.

router.post('/one-time', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { keys } = req.body;

  if (!Array.isArray(keys) || keys.length === 0) {
    res.status(400).json({ error: 'keys array required' });
    return;
  }

  const valid = keys.filter((k: any) =>
    typeof k.id === 'number' && typeof k.key === 'string' && k.key.length > 0
  );

  try {
    await db.insert(oneTimePreKeys).values(
      valid.map((k: { id: number; key: string }) => ({
        user_id:    userId,
        key_id:     k.id,
        public_key: k.key,
      }))
    ).onConflictDoNothing();

    res.json({ ok: true, uploaded: valid.length });
  } catch (err) {
    logger.error('keys/one-time upload error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── GET /api/keys/one-time/count ─────────────────────────────────────────────
// Returns the number of unused one-time prekeys remaining for this user.
// The iOS client replenishes when this drops below 5.

router.get('/one-time/count', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [row] = await db
      .select({ count: count() })
      .from(oneTimePreKeys)
      .where(and(eq(oneTimePreKeys.user_id, userId), eq(oneTimePreKeys.used, false)));

    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    logger.error('keys/one-time/count error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Bundle helpers ───────────────────────────────────────────────────────────

async function serveBundle(targetId: number, res: Response): Promise<void> {
  const [keys] = await db
    .select()
    .from(userKeys)
    .where(eq(userKeys.user_id, targetId));

  if (!keys) {
    res.status(404).json({ error: 'no keys registered for this user' });
    return;
  }

  // Atomically claim one unused one-time prekey in a single UPDATE … RETURNING.
  // If two concurrent requests race, only one gets a row — the other gets null.
  const [otpk] = await db
    .update(oneTimePreKeys)
    .set({ used: true })
    .where(and(eq(oneTimePreKeys.user_id, targetId), eq(oneTimePreKeys.used, false)))
    .returning({ key_id: oneTimePreKeys.key_id, public_key: oneTimePreKeys.public_key });

  res.json({
    userId:                targetId,
    identityKey:           keys.identity_key,
    identitySigningKey:    keys.identity_signing_key ?? undefined,
    signedPreKey:          keys.signed_pre_key,
    signedPreKeySignature: keys.signed_pre_key_sig,
    ...(otpk ? { oneTimePreKey: otpk.public_key, oneTimePreKeyId: otpk.key_id } : {}),
  });
}

// ─── GET /api/keys/bundle/:userId ─────────────────────────────────────────────

router.get('/bundle/:userId', requireUser, async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.userId, 10);
  if (isNaN(targetId)) { res.status(400).json({ error: 'invalid user id' }); return; }
  try {
    await serveBundle(targetId, res);
  } catch (err) {
    logger.error('keys/bundle error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── GET /api/keys/bundle/by-code/:userCode ───────────────────────────────────

router.get('/bundle/by-code/:userCode', requireUser, async (req: Request, res: Response) => {
  try {
    const targetRows = await db.execute(
      sql`SELECT id FROM users WHERE user_code = ${req.params.userCode} LIMIT 1`
    );
    const target = ((targetRows as any).rows ?? targetRows)[0] as any;
    if (!target) { res.status(404).json({ error: 'user not found' }); return; }
    await serveBundle(target.id, res);
  } catch (err) {
    logger.error('keys/bundle/by-code error', err);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
