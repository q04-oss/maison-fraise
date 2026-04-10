import { Router, Request, Response } from 'express';
import { eq, and, desc, ilike, or } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db';
import { editorialPieces, users, earningsLedger } from '../db/schema';
import { currentBankSeconds, tierFromBalance, effectiveTier, tierCommissionRate } from '../lib/socialTier';
import { requireUser } from '../lib/auth';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────

// GET /api/editorial — published feed; ?q= search, ?tag= filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : undefined;

    const conditions = [eq(editorialPieces.status, 'published')];
    if (q) {
      conditions.push(or(ilike(editorialPieces.title, `%${q}%`), ilike(editorialPieces.body, `%${q}%`))!);
    }
    if (tag) {
      conditions.push(eq(editorialPieces.tag, tag));
    }

    const rows = await db
      .select({
        id: editorialPieces.id,
        title: editorialPieces.title,
        author_display_name: users.display_name,
        published_at: editorialPieces.published_at,
        commission_cents: editorialPieces.commission_cents,
        tag: editorialPieces.tag,
      })
      .from(editorialPieces)
      .leftJoin(users, eq(editorialPieces.author_user_id, users.id))
      .where(and(...conditions))
      .orderBy(desc(editorialPieces.published_at));

    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/editorial/mine — all pieces by current user
router.get('/mine', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db
      .select({
        id: editorialPieces.id,
        abstract: editorialPieces.abstract,
        title: editorialPieces.title,
        status: editorialPieces.status,
        tag: editorialPieces.tag,
        editor_note: editorialPieces.editor_note,
        commission_cents: editorialPieces.commission_cents,
        published_at: editorialPieces.published_at,
        created_at: editorialPieces.created_at,
      })
      .from(editorialPieces)
      .where(eq(editorialPieces.author_user_id, userId))
      .orderBy(desc(editorialPieces.created_at));

    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/editorial/:id — full piece (published only)
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [piece] = await db
      .select({
        id: editorialPieces.id,
        title: editorialPieces.title,
        body: editorialPieces.body,
        author_display_name: users.display_name,
        author_user_id: editorialPieces.author_user_id,
        published_at: editorialPieces.published_at,
        commission_cents: editorialPieces.commission_cents,
        tag: editorialPieces.tag,
      })
      .from(editorialPieces)
      .leftJoin(users, eq(editorialPieces.author_user_id, users.id))
      .where(and(eq(editorialPieces.id, id), eq(editorialPieces.status, 'published')))
      .limit(1);

    if (!piece) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(piece);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── User actions ─────────────────────────────────────────────────────────────

// POST /api/editorial/abstract — pitch an abstract (requireUser + reserve or estate tier)
router.post('/abstract', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { abstract, tag } = req.body;

  if (!abstract || typeof abstract !== 'string' || abstract.trim().length < 50 || abstract.trim().length > 600) {
    res.status(400).json({ error: 'invalid_abstract', message: 'Abstract must be 50–600 characters.' });
    return;
  }

  try {
    const [user] = await db
      .select({
        social_time_bank_seconds: users.social_time_bank_seconds,
        social_time_bank_updated_at: users.social_time_bank_updated_at,
        social_tier: users.social_tier,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const balance = currentBankSeconds(
      user?.social_time_bank_seconds ?? 0,
      user?.social_time_bank_updated_at ?? null,
    );
    const tier = effectiveTier(tierFromBalance(balance), user?.social_tier ?? null);

    if (!tier) {
      res.status(403).json({ error: 'social_access_required', message: 'Tap a box to unlock social access.' });
      return;
    }
    if (tier !== 'reserve' && tier !== 'estate') {
      res.status(403).json({ error: 'tier_required', message: 'Reserve or estate grade required to pitch editorial pieces.' });
      return;
    }

    // One pending abstract at a time
    const [pending] = await db
      .select({ id: editorialPieces.id })
      .from(editorialPieces)
      .where(and(
        eq(editorialPieces.author_user_id, userId),
        eq(editorialPieces.status, 'abstract_submitted'),
      ))
      .limit(1);

    if (pending) {
      res.status(409).json({ error: 'abstract_pending', message: 'You already have an abstract under consideration.' });
      return;
    }

    const [piece] = await db
      .insert(editorialPieces)
      .values({
        author_user_id: userId,
        abstract: abstract.trim(),
        title: null,
        body: null,
        status: 'abstract_submitted',
        tag: tag ? String(tag) : null,
      })
      .returning({ id: editorialPieces.id, status: editorialPieces.status, created_at: editorialPieces.created_at });

    res.status(201).json(piece);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/editorial/:id/write — submit full piece for a commissioned record
router.post('/:id/write', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { title, body } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 200) {
    res.status(400).json({ error: 'invalid_title', message: 'Title is required (max 200 chars).' });
    return;
  }
  if (!body || typeof body !== 'string' || body.length < 100) {
    res.status(400).json({ error: 'invalid_body', message: 'Body must be at least 100 characters.' });
    return;
  }

  try {
    const [piece] = await db
      .select({ status: editorialPieces.status, author_user_id: editorialPieces.author_user_id })
      .from(editorialPieces)
      .where(eq(editorialPieces.id, id))
      .limit(1);

    if (!piece) { res.status(404).json({ error: 'not_found' }); return; }
    if (piece.author_user_id !== userId) { res.status(403).json({ error: 'forbidden' }); return; }
    if (piece.status !== 'commissioned' && piece.status !== 'draft') {
      res.status(409).json({ error: 'not_commissioned', message: 'This piece has not been commissioned.' });
      return;
    }

    const [updated] = await db
      .update(editorialPieces)
      .set({ title: title.trim(), body, status: 'submitted', updated_at: new Date() })
      .where(eq(editorialPieces.id, id))
      .returning({ id: editorialPieces.id, status: editorialPieces.status });

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Admin ────────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: Function) {
  const key = req.headers['x-admin-key'];
  const secret = process.env.ADMIN_SECRET;
  if (!key || !secret) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  // Timing-safe comparison to prevent timing attacks
  const keyBuf = Buffer.from(typeof key === 'string' ? key : String(key));
  const secretBuf = Buffer.from(secret);
  if (keyBuf.length !== secretBuf.length || !crypto.timingSafeEqual(keyBuf, secretBuf)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}

// GET /api/editorial/admin/queue — abstracts pending review
router.get('/admin/queue', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: editorialPieces.id,
        abstract: editorialPieces.abstract,
        tag: editorialPieces.tag,
        author_display_name: users.display_name,
        author_user_id: editorialPieces.author_user_id,
        created_at: editorialPieces.created_at,
      })
      .from(editorialPieces)
      .leftJoin(users, eq(editorialPieces.author_user_id, users.id))
      .where(eq(editorialPieces.status, 'abstract_submitted'))
      .orderBy(desc(editorialPieces.created_at));

    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/editorial/admin/submitted — full pieces pending publish decision
router.get('/admin/submitted', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: editorialPieces.id,
        title: editorialPieces.title,
        body: editorialPieces.body,
        abstract: editorialPieces.abstract,
        tag: editorialPieces.tag,
        author_display_name: users.display_name,
        author_user_id: editorialPieces.author_user_id,
        created_at: editorialPieces.created_at,
      })
      .from(editorialPieces)
      .leftJoin(users, eq(editorialPieces.author_user_id, users.id))
      .where(eq(editorialPieces.status, 'submitted'))
      .orderBy(desc(editorialPieces.created_at));

    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/editorial/admin/:id/commission — approve abstract
router.post('/admin/:id/commission', requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { editor_note } = req.body;

  try {
    const [piece] = await db
      .select({ status: editorialPieces.status })
      .from(editorialPieces)
      .where(eq(editorialPieces.id, id))
      .limit(1);

    if (!piece) { res.status(404).json({ error: 'not_found' }); return; }
    if (piece.status !== 'abstract_submitted') {
      res.status(409).json({ error: 'wrong_status' }); return;
    }

    await db
      .update(editorialPieces)
      .set({ status: 'commissioned', editor_note: editor_note ?? null, updated_at: new Date() })
      .where(eq(editorialPieces.id, id));

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/editorial/admin/:id/decline — decline abstract or full piece
router.post('/admin/:id/decline', requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { editor_note } = req.body;

  try {
    const [piece] = await db
      .select({ status: editorialPieces.status })
      .from(editorialPieces)
      .where(eq(editorialPieces.id, id))
      .limit(1);

    if (!piece) { res.status(404).json({ error: 'not_found' }); return; }

    const declinableStatuses = ['abstract_submitted', 'submitted'];
    if (!declinableStatuses.includes(piece.status)) {
      res.status(409).json({ error: 'cannot_decline_in_current_status' }); return;
    }

    const newStatus = piece.status === 'abstract_submitted' ? 'abstract_declined' : 'declined';

    await db
      .update(editorialPieces)
      .set({ status: newStatus as any, editor_note: editor_note ?? null, updated_at: new Date() })
      .where(eq(editorialPieces.id, id));

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/editorial/admin/:id/publish — publish + credit commission
router.post('/admin/:id/publish', requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { commission_cents, editor_note } = req.body;

  try {
    const [piece] = await db
      .select({ status: editorialPieces.status, author_user_id: editorialPieces.author_user_id })
      .from(editorialPieces)
      .where(eq(editorialPieces.id, id))
      .limit(1);

    if (!piece) { res.status(404).json({ error: 'not_found' }); return; }
    if (piece.status !== 'submitted') {
      res.status(409).json({ error: 'wrong_status' }); return;
    }

    // Read author's current tier to apply commission rate
    const [author] = await db
      .select({
        social_time_bank_seconds: users.social_time_bank_seconds,
        social_time_bank_updated_at: users.social_time_bank_updated_at,
        social_tier: users.social_tier,
      })
      .from(users)
      .where(eq(users.id, piece.author_user_id))
      .limit(1);
    const authorBalance = currentBankSeconds(
      author?.social_time_bank_seconds ?? 0,
      author?.social_time_bank_updated_at ?? null,
    );
    const rate = tierCommissionRate(effectiveTier(tierFromBalance(authorBalance), author?.social_tier ?? null));

    const credited = await db.transaction(async (tx) => {
      // Gate on status='submitted' inside the transaction to prevent concurrent double-publish
      const [published] = await tx
        .update(editorialPieces)
        .set({
          status: 'published',
          published_at: new Date(),
          commission_cents: commission_cents ?? null,
          editor_note: editor_note ?? null,
          updated_at: new Date(),
        })
        .where(and(eq(editorialPieces.id, id), eq(editorialPieces.status, 'submitted')))
        .returning({ id: editorialPieces.id });

      if (!published) throw Object.assign(new Error('already_published'), { status: 409 });

      if (commission_cents && typeof commission_cents === 'number' && commission_cents > 0) {
        const payout = Math.round(commission_cents * rate);
        await tx.insert(earningsLedger).values({
          user_id: piece.author_user_id,
          amount_cents: payout,
          type: 'credit',
          description: `Editorial commission — piece #${id} (${Math.round(rate * 100)}% tier rate)`,
        });
      }
      return true;
    });

    res.json({ ok: true });
  } catch (err: any) {
    if (err?.status === 409) { res.status(409).json({ error: err.message }); return; }
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
