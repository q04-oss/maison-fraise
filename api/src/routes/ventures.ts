import { Router, Response } from 'express';
import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../db';
import { ventures, ventureMembers, ventureRevenueSplits, venturePosts, users } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function enrichVenture(venture: any) {
  const members = await db
    .select({
      user_id: ventureMembers.user_id,
      role: ventureMembers.role,
      joined_at: ventureMembers.joined_at,
      display_name: users.display_name,
      email: users.email,
    })
    .from(ventureMembers)
    .leftJoin(users, eq(users.id, ventureMembers.user_id))
    .where(eq(ventureMembers.venture_id, venture.id))
    .orderBy(asc(ventureMembers.joined_at));

  const splits = await db
    .select()
    .from(ventureRevenueSplits)
    .where(eq(ventureRevenueSplits.venture_id, venture.id));

  const posts = await db
    .select({
      id: venturePosts.id,
      body: venturePosts.body,
      created_at: venturePosts.created_at,
      author_user_id: venturePosts.author_user_id,
      display_name: users.display_name,
      email: users.email,
    })
    .from(venturePosts)
    .leftJoin(users, eq(users.id, venturePosts.author_user_id))
    .where(eq(venturePosts.venture_id, venture.id))
    .orderBy(desc(venturePosts.created_at));

  let ceo_display_name: string | null = null;
  if (venture.ceo_type === 'human' && venture.ceo_user_id) {
    const [ceo] = await db
      .select({ display_name: users.display_name, email: users.email })
      .from(users)
      .where(eq(users.id, venture.ceo_user_id));
    ceo_display_name = ceo?.display_name ?? ceo?.email?.split('@')[0] ?? null;
  } else if (venture.ceo_type === 'dorotka') {
    ceo_display_name = 'Dorotka';
  }

  return {
    ...venture,
    ceo_display_name,
    members: members.map(m => ({
      ...m,
      display_name: m.display_name ?? m.email?.split('@')[0] ?? 'unknown',
    })),
    revenue_splits: splits,
    posts: posts.map(p => ({
      ...p,
      display_name: p.display_name ?? p.email?.split('@')[0] ?? 'unknown',
    })),
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/ventures — public directory
router.get('/', async (_req, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(ventures)
      .where(eq(ventures.status, 'active'))
      .orderBy(desc(ventures.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/ventures/mine — ventures I belong to
router.get('/mine', requireUser, async (req: any, res: Response) => {
  try {
    const memberships = await db
      .select({ venture_id: ventureMembers.venture_id })
      .from(ventureMembers)
      .where(eq(ventureMembers.user_id, req.userId));

    const ids = memberships.map(m => m.venture_id);
    if (ids.length === 0) { res.json([]); return; }

    const rows = await db
      .select()
      .from(ventures)
      .where(eq(ventures.status, 'active'))
      .orderBy(desc(ventures.created_at));

    const mine = rows.filter(v => ids.includes(v.id));
    res.json(mine);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/ventures/:id
router.get('/:id', async (req, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const [venture] = await db.select().from(ventures).where(eq(ventures.id, id));
    if (!venture) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(await enrichVenture(venture));
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/ventures — create a venture
router.post('/', requireUser, async (req: any, res: Response) => {
  const { name, description, ceo_type, revenue_splits } = req.body;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const type = ceo_type === 'dorotka' ? 'dorotka' : 'human';

  try {
    const [venture] = await db
      .insert(ventures)
      .values({
        name,
        description: description ?? null,
        ceo_type: type,
        ceo_user_id: type === 'human' ? req.userId : null,
        created_by: req.userId,
      })
      .returning();

    // Creator becomes owner-member
    await db.insert(ventureMembers).values({
      venture_id: venture.id,
      user_id: req.userId,
      role: 'owner',
    });

    // Persist revenue splits if provided
    if (Array.isArray(revenue_splits) && revenue_splits.length > 0) {
      const totalBps = revenue_splits.reduce((s: number, r: any) => s + (r.share_bps ?? 0), 0);
      if (totalBps > 10000) {
        res.status(400).json({ error: 'revenue_splits_exceed_100_percent' });
        return;
      }
      await db.insert(ventureRevenueSplits).values(
        revenue_splits.map((r: any) => ({
          venture_id: venture.id,
          user_id: r.user_id,
          share_bps: r.share_bps,
        }))
      );
    }

    res.status(201).json(await enrichVenture(venture));
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/ventures/:id/join
router.post('/:id/join', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [venture] = await db.select().from(ventures).where(eq(ventures.id, id));
    if (!venture) { res.status(404).json({ error: 'not_found' }); return; }
    if (venture.status !== 'active') { res.status(409).json({ error: 'venture_closed' }); return; }

    const [existing] = await db
      .select()
      .from(ventureMembers)
      .where(and(eq(ventureMembers.venture_id, id), eq(ventureMembers.user_id, req.userId)));
    if (existing) { res.status(409).json({ error: 'already_a_member' }); return; }

    await db.insert(ventureMembers).values({
      venture_id: id,
      user_id: req.userId,
      role: 'worker',
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/ventures/:id/posts — post an update (members only)
router.post('/:id/posts', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const { body } = req.body;
  if (!body?.trim()) { res.status(400).json({ error: 'body is required' }); return; }

  try {
    const [membership] = await db
      .select()
      .from(ventureMembers)
      .where(and(eq(ventureMembers.venture_id, id), eq(ventureMembers.user_id, req.userId)));
    if (!membership) { res.status(403).json({ error: 'not_a_member' }); return; }

    const [post] = await db
      .insert(venturePosts)
      .values({ venture_id: id, author_user_id: req.userId, body: body.trim() })
      .returning();

    res.status(201).json(post);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
