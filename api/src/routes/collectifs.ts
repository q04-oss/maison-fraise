import { Router, Request, Response } from 'express';
import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from '../db';
import { collectifs, collectifCommitments, users } from '../db/schema';
import { requireUser } from '../lib/auth';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';

const router = Router();

// ─── Ensure tables exist ──────────────────────────────────────────────────────

db.execute(sql`
  CREATE TABLE IF NOT EXISTS collectifs (
    id serial PRIMARY KEY,
    created_by integer NOT NULL REFERENCES users(id),
    business_id integer REFERENCES businesses(id),
    business_name text NOT NULL,
    collectif_type text NOT NULL DEFAULT 'product',
    title text NOT NULL,
    description text,
    proposed_discount_pct integer NOT NULL,
    price_cents integer NOT NULL,
    proposed_venue text,
    proposed_date text,
    target_quantity integer NOT NULL,
    current_quantity integer NOT NULL DEFAULT 0,
    deadline timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'open',
    business_response text DEFAULT 'pending',
    business_response_note text,
    responded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

// Add new columns to existing tables (idempotent)
db.execute(sql`ALTER TABLE collectifs ADD COLUMN IF NOT EXISTS collectif_type text NOT NULL DEFAULT 'product'`).catch(() => {});
db.execute(sql`ALTER TABLE collectifs ADD COLUMN IF NOT EXISTS proposed_venue text`).catch(() => {});
db.execute(sql`ALTER TABLE collectifs ADD COLUMN IF NOT EXISTS proposed_date text`).catch(() => {});
db.execute(sql`ALTER TABLE collectifs ADD COLUMN IF NOT EXISTS milestone_50_sent boolean NOT NULL DEFAULT false`).catch(() => {});
db.execute(sql`ALTER TABLE collectifs ADD COLUMN IF NOT EXISTS milestone_75_sent boolean NOT NULL DEFAULT false`).catch(() => {});

db.execute(sql`
  CREATE TABLE IF NOT EXISTS collectif_commitments (
    id serial PRIMARY KEY,
    collectif_id integer NOT NULL REFERENCES collectifs(id),
    user_id integer NOT NULL REFERENCES users(id),
    quantity integer NOT NULL DEFAULT 1,
    amount_paid_cents integer NOT NULL,
    payment_intent_id text UNIQUE,
    status text NOT NULL DEFAULT 'pending',
    committed_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

// ─── Public: list open collectifs ─────────────────────────────────────────────

// GET /api/collectifs
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        c.id, c.business_name, c.collectif_type,
        c.title, c.description,
        c.proposed_discount_pct, c.price_cents,
        c.proposed_venue, c.proposed_date,
        c.target_quantity, c.current_quantity,
        c.deadline, c.status, c.created_at,
        u.display_name AS creator_display_name
      FROM collectifs c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.status = 'open'
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    logger.error('fetchCollectifs', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/collectifs/:id/share — SSR share page with OG tags
router.get('/:id/share', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const [row] = await db.execute(sql`
      SELECT c.*, u.display_name AS creator_display_name
      FROM collectifs c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ${id}
    `);
    if (!row) { res.status(404).send('<h1>Not found</h1>'); return; }

    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const r = row as any;
    const progress = r.target_quantity > 0 ? Math.min(100, Math.round(r.current_quantity / r.target_quantity * 100)) : 0;
    const isPopup = r.collectif_type === 'popup';
    const meta = isPopup
      ? `${esc(r.proposed_venue)} · ${esc(r.proposed_date)} · CA$${(r.price_cents / 100).toFixed(2)} deposit`
      : `${r.proposed_discount_pct}% off · CA$${(r.price_cents / 100).toFixed(2)}/unit`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(r.title)} — Maison Fraise</title>
  <meta name="description" content="${esc(r.business_name)} · ${meta}" />
  <meta property="og:title" content="${esc(r.title)}" />
  <meta property="og:description" content="${esc(r.business_name)} · ${meta} · ${r.current_quantity}/${r.target_quantity} committed" />
  <meta property="og:site_name" content="Maison Fraise" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 24px; color: #111; }
    h1 { font-size: 26px; margin-bottom: 8px; }
    .meta { color: #888; font-size: 13px; margin-bottom: 24px; }
    .track { background: #eee; border-radius: 4px; height: 6px; overflow: hidden; margin-bottom: 8px; }
    .fill { height: 100%; background: #b04b3a; border-radius: 4px; width: ${progress}%; }
    .label { font-size: 12px; color: #888; margin-bottom: 32px; }
    .cta { display: block; background: #111; color: #fff; text-align: center; padding: 16px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 600; }
  </style>
</head>
<body>
  <p class="meta">${esc(r.business_name)}${isPopup ? ' · popup' : ''}</p>
  <h1>${esc(r.title)}</h1>
  <p class="meta">${meta}</p>
  <div class="track"><div class="fill"></div></div>
  <p class="label">${r.current_quantity} of ${r.target_quantity} committed</p>
  <a href="https://fraise.chat" class="cta">Join on Maison Fraise →</a>
</body>
</html>`);
  } catch (err) {
    res.status(500).send('<h1>Error</h1>');
  }
});

// GET /api/collectifs/:id
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const [row] = await db.execute(sql`
      SELECT
        c.*,
        u.display_name AS creator_display_name,
        (SELECT COUNT(*) FROM collectif_commitments cc WHERE cc.collectif_id = c.id AND cc.status = 'captured') AS commitment_count
      FROM collectifs c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ${id}
    `);
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(row);
  } catch (err) {
    logger.error('fetchCollectif', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Authenticated: create collectif ─────────────────────────────────────────

// POST /api/collectifs
router.post('/', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  const [creator] = await db.select({ verified: users.verified }).from(users).where(eq(users.id, userId)).limit(1);
  if (!creator?.verified) {
    res.status(403).json({ error: 'verified_members_only' });
    return;
  }

  const { business_name, business_id, collectif_type = 'product', title, description, proposed_discount_pct, price_cents, proposed_venue, proposed_date, target_quantity, deadline } = req.body;

  if (!business_name || !title || !target_quantity || !deadline) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  const isPopup = collectif_type === 'popup';
  const isVendorInvite = collectif_type === 'vendor_invite';
  const isPrebuy = collectif_type === 'product_prebuy';
  const isMarketType = isVendorInvite || isPrebuy;

  if (isPopup || isVendorInvite) {
    if (!proposed_venue) { res.status(400).json({ error: 'proposed_venue required' }); return; }
    if (!proposed_date) { res.status(400).json({ error: 'proposed_date required' }); return; }
    if (!price_cents || price_cents < 100) { res.status(400).json({ error: 'deposit must be at least CA$1.00' }); return; }
  } else if (isPrebuy) {
    if (!proposed_date) { res.status(400).json({ error: 'proposed_date required' }); return; }
    if (!price_cents || price_cents < 100) { res.status(400).json({ error: 'price must be at least CA$1.00' }); return; }
  } else {
    if (!proposed_discount_pct || !price_cents) { res.status(400).json({ error: 'missing_fields' }); return; }
    if (proposed_discount_pct < 1 || proposed_discount_pct > 80) { res.status(400).json({ error: 'discount must be 1–80%' }); return; }
    if (price_cents < 100) { res.status(400).json({ error: 'price must be at least CA$1.00' }); return; }
  }

  if (target_quantity < 2) {
    res.status(400).json({ error: 'target must be at least 2' });
    return;
  }
  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
    res.status(400).json({ error: 'deadline must be a future date' });
    return;
  }

  try {
    const [created] = await db.insert(collectifs).values({
      created_by: userId,
      business_id: business_id ?? null,
      business_name,
      collectif_type,
      title,
      description: description ?? null,
      proposed_discount_pct: (isPopup || isMarketType) ? 0 : proposed_discount_pct,
      price_cents,
      proposed_venue: proposed_venue ?? null,
      proposed_date: proposed_date ?? null,
      target_quantity,
      deadline: deadlineDate,
    } as any).returning();
    res.status(201).json(created);
  } catch (err) {
    logger.error('createCollectif', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Authenticated: commit ────────────────────────────────────────────────────

// POST /api/collectifs/:id/commit — create Stripe PI for commitment
router.post('/:id/commit', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  const collectifId = parseInt(req.params.id, 10);
  if (isNaN(collectifId)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const [creator] = await db.select({ verified: users.verified, email: users.email, display_name: users.display_name })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!creator?.verified) {
    res.status(403).json({ error: 'verified_members_only' });
    return;
  }

  const [collectif] = await db.select().from(collectifs).where(eq(collectifs.id, collectifId)).limit(1);
  if (!collectif) { res.status(404).json({ error: 'not_found' }); return; }
  if (collectif.status !== 'open') { res.status(409).json({ error: 'collectif_not_open' }); return; }
  if (new Date(collectif.deadline) <= new Date()) { res.status(409).json({ error: 'collectif_expired' }); return; }

  // Check for existing active commitment
  const [existing] = await db.select({ id: collectifCommitments.id })
    .from(collectifCommitments)
    .where(and(
      eq(collectifCommitments.collectif_id, collectifId),
      eq(collectifCommitments.user_id, userId),
      eq(collectifCommitments.status, 'captured'),
    )).limit(1);
  if (existing) { res.status(409).json({ error: 'already_committed' }); return; }

  const quantity = Math.max(1, parseInt(req.body.quantity ?? '1', 10));
  const amount_cents = collectif.price_cents * quantity;

  try {
    const pi = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      metadata: {
        type: 'collectif_commitment',
        collectif_id: String(collectifId),
        user_id: String(userId),
        quantity: String(quantity),
        user_email: creator.email ?? '',
      },
    });

    // Insert pending commitment
    await db.insert(collectifCommitments).values({
      collectif_id: collectifId,
      user_id: userId,
      quantity,
      amount_paid_cents: amount_cents,
      payment_intent_id: pi.id,
      status: 'pending',
    });

    res.json({ client_secret: pi.client_secret, amount_cents });
  } catch (err) {
    logger.error('commitToCollectif', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Authenticated: withdraw ──────────────────────────────────────────────────

// DELETE /api/collectifs/:id/commit — refund and remove commitment
router.delete('/:id/commit', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  const collectifId = parseInt(req.params.id, 10);
  if (isNaN(collectifId)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const [collectif] = await db.select({ status: collectifs.status })
    .from(collectifs).where(eq(collectifs.id, collectifId)).limit(1);
  if (!collectif) { res.status(404).json({ error: 'not_found' }); return; }
  if (collectif.status !== 'open') { res.status(409).json({ error: 'cannot_withdraw_after_funded' }); return; }

  const [commitment] = await db.select()
    .from(collectifCommitments)
    .where(and(
      eq(collectifCommitments.collectif_id, collectifId),
      eq(collectifCommitments.user_id, userId),
      eq(collectifCommitments.status, 'captured'),
    )).limit(1);
  if (!commitment) { res.status(404).json({ error: 'no_commitment' }); return; }

  try {
    if (commitment.payment_intent_id) {
      await stripe.refunds.create({ payment_intent: commitment.payment_intent_id });
    }
    await db.update(collectifCommitments)
      .set({ status: 'refunded' })
      .where(eq(collectifCommitments.id, commitment.id));
    await db.update(collectifs)
      .set({ current_quantity: sql`${collectifs.current_quantity} - ${commitment.quantity}` })
      .where(eq(collectifs.id, collectifId));
    res.json({ ok: true });
  } catch (err) {
    logger.error('withdrawCollectif', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/collectifs/leaderboard
router.get('/leaderboard', requireUser, async (_req: Request, res: Response) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const rows = await db.execute(sql`
      SELECT c.id AS collectif_id, c.name,
        COUNT(DISTINCT CASE WHEN le.event_type='nfc_verified' AND le.created_at >= ${monthStart} THEN le.user_id END)::int AS pickup_count,
        COUNT(DISTINCT cc.user_id)::int AS member_count
      FROM collectifs c
      JOIN collectif_commitments cc ON cc.collectif_id = c.id AND cc.status = 'captured'
      LEFT JOIN legitimacy_events le ON le.user_id = cc.user_id
      GROUP BY c.id, c.name
      HAVING COUNT(DISTINCT CASE WHEN le.event_type='nfc_verified' AND le.created_at >= ${monthStart} THEN le.user_id END) > 0
      ORDER BY pickup_count DESC
      LIMIT 10
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
