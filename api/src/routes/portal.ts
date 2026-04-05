import { Router, Request, Response } from 'express';
import { eq, and, gt, desc, asc, sql } from 'drizzle-orm';
import { db } from '../db';
import { explicitPortals, portalAccess, portalContent, portalConsents, users, memberships } from '../db/schema';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { calculateCut } from '../lib/portal';

const router = Router();

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
router.post('/consent', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { confirmed } = req.body;
  if (confirmed !== true) {
    res.status(400).json({ error: 'confirmed must be true' });
    return;
  }
  await performOptIn(userId, req.ip, res);
});

// POST /api/portal/opt-in — alias for /consent (kept for backwards compat)
router.post('/opt-in', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  await performOptIn(userId, req.ip, res);
});

// POST /api/portal/request-access/:ownerId
router.post('/request-access/:ownerId', requireUser, async (req: Request, res: Response) => {
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

// GET /api/portal/my-content — own content (no access check required)
router.get('/my-content', requireUser, async (req: Request, res: Response) => {
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
router.get('/:userId/content', requireUser, async (req: Request, res: Response) => {
  const buyerId: number = (req as any).userId;
  const ownerId = parseInt(req.params.userId, 10);

  if (isNaN(ownerId)) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }

  try {
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
router.post('/:userId/upload', requireUser, async (req: Request, res: Response) => {
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
    const [row] = await db
      .insert(portalContent)
      .values({
        user_id: requestingUserId,
        media_url,
        type,
        caption: caption ?? null,
      })
      .returning();

    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/portal/my-subscribers
router.get('/my-subscribers', requireUser, async (req: Request, res: Response) => {
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
router.get('/my-access', requireUser, async (req: Request, res: Response) => {
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

export default router;
