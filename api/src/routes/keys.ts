/**
 * fraise-chat — E2E encryption key distribution routes
 *
 * Implements Signal Protocol pre-key distribution.
 * The server stores public keys only — private keys never leave the client.
 *
 * POST /api/keys/register       — upload identity key + pre-keys
 * GET  /api/keys/bundle/:userId — fetch a pre-key bundle to initiate a session
 *
 * Licensed under GPL v3 — Copyright (c) 2026 Rajzyngier Research
 */

import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { userKeys, oneTimePreKeys } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

// POST /api/keys/register
// Upload or refresh public keys. Called on first login and when pre-keys run low.
router.post('/register', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { identityKey, signedPreKey, signedPreKeySig, oneTimePreKeys: otpks } = req.body;

  if (!identityKey || !signedPreKey || !signedPreKeySig) {
    res.status(400).json({ error: 'identityKey, signedPreKey, and signedPreKeySig are required' });
    return;
  }

  try {
    // Upsert identity + signed pre-key
    await db.insert(userKeys).values({
      user_id: userId,
      identity_key: identityKey,
      signed_pre_key: signedPreKey,
      signed_pre_key_sig: signedPreKeySig,
    }).onConflictDoUpdate({
      target: userKeys.user_id,
      set: {
        signed_pre_key: signedPreKey,
        signed_pre_key_sig: signedPreKeySig,
        updated_at: new Date(),
      },
    });

    // Insert one-time pre-keys if provided
    if (Array.isArray(otpks) && otpks.length > 0) {
      await db.insert(oneTimePreKeys).values(
        otpks.map((k: { id: number; key: string }) => ({
          user_id: userId,
          key_id: k.id,
          public_key: k.key,
        }))
      ).onConflictDoNothing();
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/keys/bundle/:userId
// Returns a pre-key bundle so the caller can initiate an X3DH session.
// Consumes one one-time pre-key atomically.
router.get('/bundle/:userId', requireUser, async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.userId, 10);
  if (isNaN(targetId)) { res.status(400).json({ error: 'invalid user id' }); return; }

  try {
    const [keys] = await db
      .select()
      .from(userKeys)
      .where(eq(userKeys.user_id, targetId));

    if (!keys) {
      res.status(404).json({ error: 'no keys registered for this user' });
      return;
    }

    // Atomically claim one unused one-time pre-key
    const [otpk] = await db
      .update(oneTimePreKeys)
      .set({ used: true })
      .where(
        and(
          eq(oneTimePreKeys.user_id, targetId),
          eq(oneTimePreKeys.used, false)
        )
      )
      .returning({ key_id: oneTimePreKeys.key_id, public_key: oneTimePreKeys.public_key });

    res.json({
      userId: targetId,
      identityKey: keys.identity_key,
      signedPreKey: keys.signed_pre_key,
      signedPreKeySignature: keys.signed_pre_key_sig,
      ...(otpk ? { oneTimePreKey: otpk.public_key, oneTimePreKeyId: otpk.key_id } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
