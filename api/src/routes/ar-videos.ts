import { Router, Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { arVideos, users, earningsLedger } from '../db/schema';
import { currentBankSeconds, tierFromBalance, tierCommissionRate } from '../lib/socialTier';
import { requireUser } from '../lib/auth';
import { uploadMedia } from '../lib/upload';
import { logger } from '../lib/logger';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────

// GET /api/ar-videos — published feed
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: arVideos.id,
        title: arVideos.title,
        description: arVideos.description,
        tag: arVideos.tag,
        author_display_name: users.display_name,
        author_user_id: arVideos.author_user_id,
        thumbnail_url: arVideos.thumbnail_url,
        luma_scene_url: arVideos.luma_scene_url,
        splat_url: arVideos.splat_url,
        commission_cents: arVideos.commission_cents,
        published_at: arVideos.published_at,
      })
      .from(arVideos)
      .leftJoin(users, eq(arVideos.author_user_id, users.id))
      .where(eq(arVideos.status, 'published'))
      .orderBy(desc(arVideos.published_at));

    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/ar-videos/:id — single published video
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [video] = await db
      .select({
        id: arVideos.id,
        title: arVideos.title,
        description: arVideos.description,
        abstract: arVideos.abstract,
        tag: arVideos.tag,
        author_display_name: users.display_name,
        author_user_id: arVideos.author_user_id,
        thumbnail_url: arVideos.thumbnail_url,
        luma_scene_url: arVideos.luma_scene_url,
        splat_url: arVideos.splat_url,
        source_video_url: arVideos.source_video_url,
        commission_cents: arVideos.commission_cents,
        published_at: arVideos.published_at,
      })
      .from(arVideos)
      .leftJoin(users, eq(arVideos.author_user_id, users.id))
      .where(and(eq(arVideos.id, id), eq(arVideos.status, 'published')))
      .limit(1);

    if (!video) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(video);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── User actions ─────────────────────────────────────────────────────────────

// GET /api/ar-videos/mine — all submissions by current user
router.get('/mine', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db
      .select()
      .from(arVideos)
      .where(eq(arVideos.author_user_id, userId))
      .orderBy(desc(arVideos.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/ar-videos/abstract — pitch (requireUser + active membership + social access)
router.post('/abstract', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { abstract, tag } = req.body;

  if (!abstract || typeof abstract !== 'string' || abstract.trim().length < 50 || abstract.trim().length > 800) {
    res.status(400).json({ error: 'invalid_abstract', message: 'Abstract must be 50–800 characters.' });
    return;
  }

  try {
    const [user] = await db
      .select({
        social_time_bank_seconds: users.social_time_bank_seconds,
        social_time_bank_updated_at: users.social_time_bank_updated_at,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const balance = currentBankSeconds(
      user?.social_time_bank_seconds ?? 0,
      user?.social_time_bank_updated_at ?? null,
    );
    const tier = tierFromBalance(balance);

    if (!tier) {
      res.status(403).json({ error: 'social_access_required', message: 'Tap a box to unlock social access.' });
      return;
    }
    if (tier !== 'reserve' && tier !== 'estate') {
      res.status(403).json({ error: 'tier_required', message: 'Reserve or estate grade required to pitch AR videos.' });
      return;
    }

    // One pending abstract at a time
    const [pending] = await db
      .select({ id: arVideos.id })
      .from(arVideos)
      .where(and(eq(arVideos.author_user_id, userId), eq(arVideos.status, 'abstract_submitted')))
      .limit(1);

    if (pending) {
      res.status(409).json({ error: 'abstract_pending', message: 'You already have an abstract under consideration.' });
      return;
    }

    const [video] = await db
      .insert(arVideos)
      .values({
        author_user_id: userId,
        abstract: abstract.trim(),
        tag: tag ? String(tag) : null,
        status: 'abstract_submitted',
      })
      .returning({ id: arVideos.id, status: arVideos.status, created_at: arVideos.created_at });

    res.status(201).json(video);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/ar-videos/:id/upload — upload video for a commissioned record
// Accepts base64 video body, uploads to Cloudinary, then triggers Luma processing
router.post('/:id/upload', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { title, description, video_base64, thumbnail_base64 } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'invalid_title' }); return;
  }
  if (!video_base64 || typeof video_base64 !== 'string') {
    res.status(400).json({ error: 'video_required' }); return;
  }

  try {
    const [video] = await db
      .select({ status: arVideos.status, author_user_id: arVideos.author_user_id })
      .from(arVideos)
      .where(eq(arVideos.id, id))
      .limit(1);

    if (!video) { res.status(404).json({ error: 'not_found' }); return; }
    if (video.author_user_id !== userId) { res.status(403).json({ error: 'forbidden' }); return; }
    if (video.status !== 'commissioned') {
      res.status(409).json({ error: 'not_commissioned' }); return;
    }

    // Upload source video to Cloudinary
    const sourceUrl = await uploadMedia(video_base64, 'video');

    // Upload thumbnail if provided
    let thumbnailUrl: string | null = null;
    if (thumbnail_base64) {
      thumbnailUrl = await uploadMedia(thumbnail_base64, 'image');
    }

    // Kick off Luma AI processing
    const lumaTaskId = await submitToLuma(sourceUrl, id);

    await db
      .update(arVideos)
      .set({
        title: title.trim(),
        description: description ?? null,
        source_video_url: sourceUrl,
        thumbnail_url: thumbnailUrl,
        luma_task_id: lumaTaskId,
        status: lumaTaskId ? 'processing' : 'submitted',
        updated_at: new Date(),
      })
      .where(eq(arVideos.id, id));

    res.json({ ok: true, processing: !!lumaTaskId });
  } catch (err) {
    logger.error('AR video upload error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/ar-videos/:id/luma-webhook — Luma AI task completion callback
router.post('/:id/luma-webhook', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { status, scene_url, splat_url } = req.body;

  try {
    if (status === 'completed') {
      await db
        .update(arVideos)
        .set({
          status: 'submitted',
          luma_scene_url: scene_url ?? null,
          splat_url: splat_url ?? null,
          updated_at: new Date(),
        })
        .where(eq(arVideos.id, id));
    } else if (status === 'failed') {
      await db
        .update(arVideos)
        .set({ status: 'processing_failed', updated_at: new Date() })
        .where(eq(arVideos.id, id));
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Admin ────────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: Function) {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_SECRET) {
    res.status(403).json({ error: 'forbidden' }); return;
  }
  next();
}

// GET /api/ar-videos/admin/queue — abstract review queue
router.get('/admin/queue', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: arVideos.id,
        abstract: arVideos.abstract,
        tag: arVideos.tag,
        author_display_name: users.display_name,
        author_user_id: arVideos.author_user_id,
        created_at: arVideos.created_at,
      })
      .from(arVideos)
      .leftJoin(users, eq(arVideos.author_user_id, users.id))
      .where(eq(arVideos.status, 'abstract_submitted'))
      .orderBy(desc(arVideos.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/ar-videos/admin/submitted — processed videos awaiting publish
router.get('/admin/submitted', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: arVideos.id,
        title: arVideos.title,
        description: arVideos.description,
        abstract: arVideos.abstract,
        tag: arVideos.tag,
        author_display_name: users.display_name,
        luma_scene_url: arVideos.luma_scene_url,
        splat_url: arVideos.splat_url,
        source_video_url: arVideos.source_video_url,
        status: arVideos.status,
        created_at: arVideos.created_at,
      })
      .from(arVideos)
      .leftJoin(users, eq(arVideos.author_user_id, users.id))
      .where(eq(arVideos.status, 'submitted'))
      .orderBy(desc(arVideos.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/ar-videos/admin/:id/commission
router.post('/admin/:id/commission', requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const { editor_note } = req.body;
  try {
    const [v] = await db.select({ status: arVideos.status }).from(arVideos).where(eq(arVideos.id, id)).limit(1);
    if (!v) { res.status(404).json({ error: 'not_found' }); return; }
    if (v.status !== 'abstract_submitted') { res.status(409).json({ error: 'wrong_status' }); return; }
    await db.update(arVideos).set({ status: 'commissioned', editor_note: editor_note ?? null, updated_at: new Date() }).where(eq(arVideos.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/ar-videos/admin/:id/decline
router.post('/admin/:id/decline', requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const { editor_note } = req.body;
  try {
    const [v] = await db.select({ status: arVideos.status }).from(arVideos).where(eq(arVideos.id, id)).limit(1);
    if (!v) { res.status(404).json({ error: 'not_found' }); return; }
    const newStatus = v.status === 'abstract_submitted' ? 'abstract_declined' : 'declined';
    await db.update(arVideos).set({ status: newStatus as any, editor_note: editor_note ?? null, updated_at: new Date() }).where(eq(arVideos.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/ar-videos/admin/:id/publish — publish + credit commission
router.post('/admin/:id/publish', requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }
  const { commission_cents, editor_note } = req.body;
  try {
    const [v] = await db.select({ status: arVideos.status, author_user_id: arVideos.author_user_id }).from(arVideos).where(eq(arVideos.id, id)).limit(1);
    if (!v) { res.status(404).json({ error: 'not_found' }); return; }
    if (v.status !== 'submitted') { res.status(409).json({ error: 'wrong_status' }); return; }

    // Read author's current tier to apply commission rate
    const [author] = await db
      .select({
        social_time_bank_seconds: users.social_time_bank_seconds,
        social_time_bank_updated_at: users.social_time_bank_updated_at,
      })
      .from(users)
      .where(eq(users.id, v.author_user_id))
      .limit(1);
    const authorBalance = currentBankSeconds(
      author?.social_time_bank_seconds ?? 0,
      author?.social_time_bank_updated_at ?? null,
    );
    const rate = tierCommissionRate(tierFromBalance(authorBalance));

    await db.update(arVideos).set({
      status: 'published',
      published_at: new Date(),
      commission_cents: commission_cents ?? null,
      editor_note: editor_note ?? null,
      updated_at: new Date(),
    }).where(eq(arVideos.id, id));

    if (commission_cents && typeof commission_cents === 'number' && commission_cents > 0) {
      const payout = Math.round(commission_cents * rate);
      await db.insert(earningsLedger).values({
        user_id: v.author_user_id,
        amount_cents: payout,
        type: 'credit',
        description: `AR video commission — #${id} (${Math.round(rate * 100)}% tier rate)`,
      });
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── Luma AI integration ──────────────────────────────────────────────────────

async function submitToLuma(videoUrl: string, videoId: number): Promise<string | null> {
  const apiKey = process.env.LUMA_API_KEY;
  if (!apiKey) {
    logger.warn('LUMA_API_KEY not set — skipping Luma processing');
    return null;
  }

  try {
    const r = await fetch('https://webapp.engineeringlumalabs.com/api/v2/capture', {
      method: 'POST',
      headers: {
        'Authorization': `luma-api-key=${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `maison-fraise-ar-${videoId}`,
        sourceVideoUrl: videoUrl,
        webhookUrl: `${process.env.API_BASE_URL}/api/ar-videos/${videoId}/luma-webhook`,
      }),
    });

    if (!r.ok) {
      logger.error('Luma API error', await r.text());
      return null;
    }

    const data = await r.json() as { id?: string; slug?: string };
    return data.id ?? data.slug ?? null;
  } catch (err) {
    logger.error('Luma submission failed', err);
    return null;
  }
}

export default router;
