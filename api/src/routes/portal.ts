import { Router, Request, Response } from 'express';
import { eq, and, gt, desc, asc, sql } from 'drizzle-orm';
import { db } from '../db';
import { explicitPortals, portalAccess, portalContent, portalConsents, users, memberships, contentTokens } from '../db/schema';
import { requireVerifiedUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { calculateCut, isIdentityActive, VERIFICATION_FEE_CENTS, VERIFICATION_RENEWAL_CENTS } from '../lib/portal';
import { sendPushNotification } from '../lib/push';
import { computeTokenVisuals, computeContentTokenMechanic, contentTokenExcessForRarity } from '../lib/tokenAlgorithm';

const router = Router();

// Self-healing: add identity verification columns if they don't exist yet
db.execute(sql`
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS identity_verified boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS identity_session_id text,
    ADD COLUMN IF NOT EXISTS id_attested_by integer,
    ADD COLUMN IF NOT EXISTS id_attested_at timestamptz,
    ADD COLUMN IF NOT EXISTS id_attestation_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS id_verified_name text,
    ADD COLUMN IF NOT EXISTS id_verified_dob text,
    ADD COLUMN IF NOT EXISTS identity_verified_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS verification_renewal_due_at timestamptz
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS verification_payments (
    id serial PRIMARY KEY,
    user_id integer NOT NULL,
    type text NOT NULL,
    amount_cents integer NOT NULL,
    stripe_payment_intent_id text UNIQUE,
    stripe_client_secret text,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS id_attestation_log (
    id serial PRIMARY KEY,
    user_id integer NOT NULL,
    attested_by integer NOT NULL,
    attested_at timestamptz NOT NULL DEFAULT now(),
    outcome text NOT NULL DEFAULT 'pending',
    stripe_session_id text,
    id_verified_name text,
    id_verified_dob text
  )
`).catch(() => {});

// Shared opt-in logic
async function performOptIn(userId: number, ipAddress: string | undefined, res: Response): Promise<void> {
  try {
    // Upsert consent record
    await db.execute(sql`
      INSERT INTO portal_consents (user_id, ip_address)
      VALUES (${userId}, ${ipAddress ?? null})
      ON CONFLICT (user_id) DO UPDATE SET consented_at = now(), ip_address = ${ipAddress ?? null}
    `);

    // Upsert explicit_portals
    await db.execute(sql`
      INSERT INTO explicit_portals (user_id, opted_in)
      VALUES (${userId}, true)
      ON CONFLICT (user_id) DO UPDATE SET opted_in = true
    `);

    await db.update(users).set({ portal_opted_in: true }).where(eq(users.id, userId));

    const [consent] = await db.select({ consented_at: portalConsents.consented_at }).from(portalConsents).where(eq(portalConsents.user_id, userId)).limit(1);
    res.json({ ok: true, consented_at: consent?.consented_at ?? new Date() });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
}

// POST /api/portal/consent — canonical opt-in path with consent record
router.post('/consent', requireVerifiedUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { confirmed } = req.body;
  if (confirmed !== true) {
    res.status(400).json({ error: 'confirmed must be true' });
    return;
  }
  await performOptIn(userId, req.ip, res);
});

// POST /api/portal/opt-in — alias for /consent (kept for backwards compat)
router.post('/opt-in', requireVerifiedUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  await performOptIn(userId, req.ip, res);
});

// POST /api/portal/request-access/:ownerId
router.post('/request-access/:ownerId', requireVerifiedUser, async (req: Request, res: Response) => {
  const buyerId: number = (req as any).userId;
  const ownerId = parseInt(req.params.ownerId, 10);

  if (isNaN(ownerId)) {
    res.status(400).json({ error: 'invalid_owner_id' });
    return;
  }

  const { source } = req.body;
  if (!source || !['tap', 'receipt'].includes(source)) {
    res.status(400).json({ error: 'invalid_source' });
    return;
  }

  try {
    // Validate owner exists and has portal opted in
    const [owner] = await db
      .select({ id: users.id, portal_opted_in: users.portal_opted_in })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);

    if (!owner) {
      res.status(404).json({ error: 'owner_not_found' });
      return;
    }

    if (!owner.portal_opted_in) {
      res.status(403).json({ error: 'owner_not_opted_in' });
      return;
    }

    // Check buyer doesn't already have valid (non-expired) access
    const now = new Date();
    const [existingAccess] = await db
      .select({ id: portalAccess.id })
      .from(portalAccess)
      .where(
        and(
          eq(portalAccess.buyer_id, buyerId),
          eq(portalAccess.owner_id, ownerId),
          gt(portalAccess.expires_at, now),
        ),
      )
      .limit(1);

    if (existingAccess) {
      res.status(409).json({ error: 'already_has_access' });
      return;
    }

    // Require active government ID verification to subscribe
    const [buyer] = await db
      .select({ identity_verified: users.identity_verified, identity_verified_expires_at: users.identity_verified_expires_at, verification_renewal_due_at: users.verification_renewal_due_at })
      .from(users)
      .where(eq(users.id, buyerId))
      .limit(1);

    if (!buyer || !isIdentityActive(buyer)) {
      res.status(403).json({ error: 'identity_verification_required' });
      return;
    }

    // Look up buyer's active membership for amount
    const [buyerMembership] = await db
      .select({ amount_cents: memberships.amount_cents })
      .from(memberships)
      .where(and(eq(memberships.user_id, buyerId), eq(memberships.status, 'active')))
      .limit(1);

    if (!buyerMembership) {
      res.status(400).json({ error: 'membership_required' });
      return;
    }

    const amount_cents = buyerMembership.amount_cents;
    const { cutCents } = calculateCut(amount_cents);

    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      metadata: {
        type: 'portal_access',
        buyer_id: String(buyerId),
        owner_id: String(ownerId),
        source,
      },
    });

    res.json({ client_secret: pi.client_secret, amount_cents });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/portal/identity-session — return pending Stripe Identity session for the user
router.get('/identity-session', requireVerifiedUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const [user] = await db
      .select({
        identity_verified: users.identity_verified,
        identity_session_id: users.identity_session_id,
        identity_verified_expires_at: users.identity_verified_expires_at,
        id_attestation_expires_at: users.id_attestation_expires_at,
        verification_renewal_due_at: users.verification_renewal_due_at,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: 'not_found' }); return; }

    // ── Already verified ──────────────────────────────────────────────────
    if (user.identity_verified) {
      const now = new Date();

      // 2-year document expiry
      if (user.identity_verified_expires_at && now > new Date(user.identity_verified_expires_at)) {
        res.json({ already_verified: false, identity_expired: true });
        return;
      }

      // Annual renewal overdue
      if (user.verification_renewal_due_at && now > new Date(user.verification_renewal_due_at)) {
        res.json({ already_verified: false, renewal_overdue: true, renewal_amount_cents: VERIFICATION_RENEWAL_CENTS });
        return;
      }

      res.json({
        already_verified: true,
        verification_renewal_due_at: user.verification_renewal_due_at,
        identity_verified_expires_at: user.identity_verified_expires_at,
      });
      return;
    }

    // ── Not yet verified — check fee then session ─────────────────────────

    // Look for a pending or paid initial verification payment
    const feeRows = await db.execute(sql`
      SELECT stripe_client_secret, status FROM verification_payments
      WHERE user_id = ${userId} AND type = 'initial' AND status IN ('pending', 'paid')
      ORDER BY created_at DESC LIMIT 1
    `);
    const feeRow = (feeRows as any)[0] ?? null;
    const feePaid = feeRow?.status === 'paid';

    if (feeRow && !feePaid) {
      // Fee exists but not yet paid — return client_secret so member can pay
      res.json({
        already_verified: false,
        fee_paid: false,
        fee_client_secret: feeRow.stripe_client_secret,
        fee_amount_cents: VERIFICATION_FEE_CENTS,
      });
      return;
    }

    if (!user.identity_session_id) {
      res.json({ already_verified: false, fee_paid: feePaid, session: null });
      return;
    }

    // Check whether the operator's 24-hour attestation window has lapsed
    if (user.id_attestation_expires_at && new Date() > new Date(user.id_attestation_expires_at)) {
      await db.execute(sql`
        UPDATE users SET identity_session_id = NULL, id_attestation_expires_at = NULL WHERE id = ${userId}
      `).catch(() => {});
      await db.execute(sql`
        UPDATE id_attestation_log SET outcome = 'expired' WHERE user_id = ${userId} AND outcome = 'pending'
      `).catch(() => {});
      res.json({ already_verified: false, attestation_expired: true, session: null });
      return;
    }

    // Guard: session exists but fee was never paid — orphaned session
    if (!feePaid) {
      res.json({ already_verified: false, fee_paid: false, session: null });
      return;
    }

    // Create a fresh ephemeral key for the existing session
    const ephemeralKey = await (stripe as any).ephemeralKeys.create(
      { verification_session: user.identity_session_id },
      { apiVersion: '2023-10-16' },
    );
    res.json({
      already_verified: false,
      fee_paid: true,
      session: {
        verificationSessionId: user.identity_session_id,
        ephemeralKeySecret: ephemeralKey.secret,
      },
    });
  } catch {
    await db.execute(sql`UPDATE users SET identity_session_id = NULL WHERE id = ${userId}`).catch(() => {});
    res.json({ already_verified: false, session: null });
  }
});

// POST /api/portal/start-identity-verification — operator-only: initiate Stripe Identity for a member
// Called from the shop terminal in-person; member completes document scan on their device
router.post('/start-identity-verification', requireVerifiedUser, async (req: Request, res: Response) => {
  const operatorId: number = (req as any).userId;

  try {
    const [operator] = await db
      .select({ is_shop: users.is_shop })
      .from(users)
      .where(eq(users.id, operatorId))
      .limit(1);

    if (!operator?.is_shop) {
      res.status(403).json({ error: 'shop_operators_only' });
      return;
    }

    const { user_code, confirmed } = req.body;
    if (!user_code || typeof user_code !== 'string') {
      res.status(400).json({ error: 'user_code is required' });
      return;
    }

    if (confirmed !== true) {
      res.status(400).json({ error: 'operator_attestation_required' });
      return;
    }

    const [targetUser] = await db
      .select({ id: users.id, verified: users.verified, identity_verified: users.identity_verified, push_token: users.push_token })
      .from(users)
      .where(eq(users.user_code, user_code.toUpperCase().trim()))
      .limit(1);

    if (!targetUser) { res.status(404).json({ error: 'user_not_found' }); return; }
    if (!targetUser.verified) { res.status(400).json({ error: 'user_must_be_nfc_verified_first' }); return; }
    if (targetUser.identity_verified) { res.json({ ok: true, already_verified: true }); return; }

    // Guard: operator cannot attest for themselves
    if (operatorId === targetUser.id) {
      res.status(403).json({ error: 'cannot_self_attest' });
      return;
    }

    // Rate limit: max 10 attestations per operator per hour
    const rateRows = await db.execute(sql`
      SELECT COUNT(*) AS count FROM id_attestation_log
      WHERE attested_by = ${operatorId} AND attested_at > now() - interval '1 hour'
    `);
    const attestCount = parseInt((rateRows as any)[0]?.count ?? '0', 10);
    if (attestCount >= 10) {
      res.status(429).json({ error: 'attestation_rate_limit_exceeded' });
      return;
    }

    // Mark any stale pending log entries and fee PIs as expired before creating new ones
    await db.execute(sql`
      UPDATE id_attestation_log SET outcome = 'expired'
      WHERE user_id = ${targetUser.id} AND outcome = 'pending'
    `);
    await db.execute(sql`
      UPDATE verification_payments SET status = 'expired'
      WHERE user_id = ${targetUser.id} AND type = 'initial' AND status = 'pending'
    `).catch(() => {});

    // Record operator attestation — the employee physically examined the ID
    // Attestation is valid for 24 hours; member must complete the Stripe scan in that window
    await db.execute(sql`
      UPDATE users
      SET id_attested_by = ${operatorId}, id_attested_at = now(),
          id_attestation_expires_at = now() + interval '24 hours'
      WHERE id = ${targetUser.id}
    `);

    const session = await (stripe as any).identity.verificationSessions.create({
      type: 'document',
      options: {
        document: {
          allowed_types: ['driving_license', 'passport'],
          require_live_capture: true,
          require_matching_selfie: true,
        },
      },
      metadata: { user_id: String(targetUser.id) },
    });

    await db.execute(sql`UPDATE users SET identity_session_id = ${session.id} WHERE id = ${targetUser.id}`);

    // Append to immutable attestation log
    await db.execute(sql`
      INSERT INTO id_attestation_log (user_id, attested_by, stripe_session_id)
      VALUES (${targetUser.id}, ${operatorId}, ${session.id})
    `);

    // Create verification fee PaymentIntent (CA$111) — member pays before scanning ID
    const feePi = await stripe.paymentIntents.create({
      amount: VERIFICATION_FEE_CENTS,
      currency: 'cad',
      metadata: { type: 'verification_fee', user_id: String(targetUser.id) },
    });
    await db.execute(sql`
      INSERT INTO verification_payments (user_id, type, amount_cents, stripe_payment_intent_id, stripe_client_secret)
      VALUES (${targetUser.id}, 'initial', ${VERIFICATION_FEE_CENTS}, ${feePi.id}, ${feePi.client_secret})
      ON CONFLICT (stripe_payment_intent_id) DO NOTHING
    `);

    if (targetUser.push_token) {
      sendPushNotification(targetUser.push_token, {
        title: 'Verification ready',
        body: `Open your app to pay the CA$${VERIFICATION_FEE_CENTS / 100} verification fee and scan your ID.`,
        data: { screen: 'portal' },
      }).catch(() => {});
    }

    res.json({ ok: true, user_id: targetUser.id });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/portal/my-content — own content (no access check required)
router.get('/my-content', requireVerifiedUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const content = await db
      .select()
      .from(portalContent)
      .where(eq(portalContent.user_id, userId))
      .orderBy(desc(portalContent.created_at));
    res.json(content);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/portal/:userId/content
router.get('/:userId/content', requireVerifiedUser, async (req: Request, res: Response) => {
  const buyerId: number = (req as any).userId;
  const ownerId = parseInt(req.params.userId, 10);

  if (isNaN(ownerId)) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }

  try {
    // Require active government ID verification to view content
    const [buyer] = await db
      .select({ identity_verified: users.identity_verified, identity_verified_expires_at: users.identity_verified_expires_at, verification_renewal_due_at: users.verification_renewal_due_at })
      .from(users)
      .where(eq(users.id, buyerId))
      .limit(1);

    if (!buyer || !isIdentityActive(buyer)) {
      res.status(403).json({ error: 'identity_verification_required' });
      return;
    }

    const now = new Date();
    const [access] = await db
      .select({ id: portalAccess.id })
      .from(portalAccess)
      .where(
        and(
          eq(portalAccess.buyer_id, buyerId),
          eq(portalAccess.owner_id, ownerId),
          gt(portalAccess.expires_at, now),
        ),
      )
      .limit(1);

    if (!access) {
      res.status(403).json({ error: 'access_required' });
      return;
    }

    const content = await db
      .select()
      .from(portalContent)
      .where(eq(portalContent.user_id, ownerId))
      .orderBy(desc(portalContent.created_at));

    res.json(content);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/portal/:userId/upload
router.post('/:userId/upload', requireVerifiedUser, async (req: Request, res: Response) => {
  const requestingUserId: number = (req as any).userId;
  const targetUserId = parseInt(req.params.userId, 10);

  if (isNaN(targetUserId)) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }

  if (requestingUserId !== targetUserId) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const { media_url, type, caption } = req.body;

  if (!media_url || !type || !['photo', 'video'].includes(type)) {
    res.status(400).json({ error: 'media_url and valid type required' });
    return;
  }

  try {
    // Require active government ID verification to post content
    const [creator] = await db
      .select({ identity_verified: users.identity_verified, identity_verified_expires_at: users.identity_verified_expires_at, verification_renewal_due_at: users.verification_renewal_due_at })
      .from(users)
      .where(eq(users.id, requestingUserId))
      .limit(1);

    if (!creator || !isIdentityActive(creator)) {
      res.status(403).json({ error: 'identity_verification_required' });
      return;
    }

    const [row] = await db
      .insert(portalContent)
      .values({
        user_id: requestingUserId,
        media_url,
        type,
        caption: caption ?? null,
      })
      .returning();

    // Mint a content token for this post (fire-and-forget, never blocks the response)
    mintContentToken(row.id, requestingUserId).catch(() => {});

    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/portal/my-subscribers
router.get('/my-subscribers', requireVerifiedUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;

  try {
    const now = new Date();
    const rows = await db
      .select({
        id: portalAccess.id,
        buyer_id: portalAccess.buyer_id,
        buyer_display_name: users.display_name,
        amount_cents: portalAccess.amount_cents,
        platform_cut_cents: portalAccess.platform_cut_cents,
        source: portalAccess.source,
        expires_at: portalAccess.expires_at,
        created_at: portalAccess.created_at,
      })
      .from(portalAccess)
      .leftJoin(users, eq(portalAccess.buyer_id, users.id))
      .where(and(eq(portalAccess.owner_id, userId), gt(portalAccess.expires_at, now)))
      .orderBy(desc(portalAccess.created_at));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/portal/my-access
router.get('/my-access', requireVerifiedUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;

  try {
    const now = new Date();
    const rows = await db
      .select({
        id: portalAccess.id,
        owner_id: portalAccess.owner_id,
        owner_display_name: users.display_name,
        owner_portrait_url: users.portrait_url,
        amount_cents: portalAccess.amount_cents,
        source: portalAccess.source,
        expires_at: portalAccess.expires_at,
        created_at: portalAccess.created_at,
      })
      .from(portalAccess)
      .leftJoin(users, eq(portalAccess.owner_id, users.id))
      .where(and(eq(portalAccess.buyer_id, userId), gt(portalAccess.expires_at, now)))
      .orderBy(asc(portalAccess.expires_at));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/portal/renew-verification — member pays CA$333 annual renewal (no operator needed)
router.post('/renew-verification', requireVerifiedUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    // Return existing pending renewal PI if one already exists (idempotent)
    const existing = await db.execute(sql`
      SELECT stripe_client_secret FROM verification_payments
      WHERE user_id = ${userId} AND type = 'renewal' AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1
    `);
    const existingRow = (existing as any)[0] ?? null;
    if (existingRow) {
      res.json({ client_secret: existingRow.stripe_client_secret, amount_cents: VERIFICATION_RENEWAL_CENTS });
      return;
    }

    const pi = await stripe.paymentIntents.create({
      amount: VERIFICATION_RENEWAL_CENTS,
      currency: 'cad',
      metadata: { type: 'verification_renewal', user_id: String(userId) },
    });

    await db.execute(sql`
      INSERT INTO verification_payments (user_id, type, amount_cents, stripe_payment_intent_id, stripe_client_secret)
      VALUES (${userId}, 'renewal', ${VERIFICATION_RENEWAL_CENTS}, ${pi.id}, ${pi.client_secret})
    `);

    res.json({ client_secret: pi.client_secret, amount_cents: VERIFICATION_RENEWAL_CENTS });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Content token minting ────────────────────────────────────────────────────
// Called async after a portal post is inserted. Never throws — errors are swallowed
// so the upload response is never affected.

async function mintContentToken(postId: number, creatorUserId: number): Promise<void> {
  // Idempotency: the portal_post_id column is UNIQUE — if a token already exists
  // for this post (e.g. webhook retry), skip silently.
  const [existing] = await db
    .select({ id: contentTokens.id })
    .from(contentTokens)
    .where(eq(contentTokens.portal_post_id, postId));
  if (existing) return;

  // Atomic token_number: use a transaction with a count query inside it so no
  // two concurrent mints for the same creator can claim the same number.
  let tokenNumber = 0;
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: contentTokens.id })
      .from(contentTokens)
      .where(eq(contentTokens.creator_user_id, creatorUserId))
      .for('update'); // row-level lock on all existing rows for this creator
    tokenNumber = rows.length + 1;

    const mechanic = computeContentTokenMechanic(postId, tokenNumber);
    const excessCents = contentTokenExcessForRarity(mechanic.rarity);
    const visuals = computeTokenVisuals(postId, excessCents);

    await tx.insert(contentTokens).values({
      portal_post_id: postId,
      creator_user_id: creatorUserId,
      current_owner_id: creatorUserId,
      token_number: tokenNumber,
      visual_size: visuals.size,
      visual_color: visuals.color,
      visual_seeds: visuals.seeds,
      visual_irregularity: visuals.irregularity,
      mechanic_archetype: mechanic.archetype,
      mechanic_power: mechanic.power,
      mechanic_rarity: mechanic.rarity,
      mechanic_effect: mechanic.effect,
    });
  });

  // Push notification to creator
  const [creator] = await db
    .select({ push_token: users.push_token })
    .from(users)
    .where(eq(users.id, creatorUserId));

  if (creator?.push_token) {
    sendPushNotification(creator.push_token, {
      title: `Card #${tokenNumber} minted`,
      body: mechanic.rarity === 'legendary'
        ? `Your post minted a legendary ${mechanic.archetype} card — power ${mechanic.power}.`
        : `Your post minted a ${mechanic.rarity} ${mechanic.archetype} card.`,
      data: { screen: 'tokens' },
    }).catch(() => {});
  }
}

export default router;
