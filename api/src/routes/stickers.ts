import { Router, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { fal } from '@fal-ai/client';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { businesses } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';

const router = Router();
const anthropic = new Anthropic();

fal.config({ credentials: process.env.FAL_KEY });

// GET /api/stickers
router.get('/', async (_req, res: Response) => {
  try {
    const rows = await db.select({
      id: businesses.id,
      name: businesses.name,
      type: businesses.type,
      neighbourhood: businesses.neighbourhood,
      description: businesses.description,
      sticker_concept: businesses.sticker_concept,
      sticker_emoji: businesses.sticker_emoji,
      sticker_image_url: businesses.sticker_image_url,
    }).from(businesses).where(eq(businesses.type, 'collection'));
    res.json(rows);
  } catch (err) {
    logger.error('Failed to fetch stickers:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/stickers/generate/:business_id
// Step 1: Claude Haiku writes the concept + emoji
// Step 2: fal.ai Flux generates the sticker image from the concept
router.post('/generate/:business_id', requireUser, async (req: any, res: Response) => {
  const bizId = parseInt(req.params.business_id, 10);
  if (isNaN(bizId)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, bizId)).limit(1);
    if (!biz) { res.status(404).json({ error: 'not_found' }); return; }

    const context = [
      `Name: ${biz.name}`,
      biz.type ? `Type: ${biz.type}` : null,
      biz.neighbourhood ? `Neighbourhood: ${biz.neighbourhood}` : null,
      biz.description ? `About: ${biz.description}` : null,
    ].filter(Boolean).join('\n');

    // Step 1 — concept + emoji via Claude Haiku
    const conceptPrompt = `You are designing a small, collectible die-cut vinyl sticker for a location.

${context}

Respond with exactly two lines:
Line 1: A single emoji that best represents this location (one character only).
Line 2: A vivid 1-sentence image generation prompt for a die-cut sticker — specific, bold, graphic art style. Reference the location's identity. Max 20 words.

No labels, no punctuation after the emoji, nothing else.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{ role: 'user', content: conceptPrompt }],
    });

    const raw = (message.content[0] as any)?.text?.trim() ?? '';
    const lines = raw.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const emoji = lines[0] ?? '🍓';
    const concept = lines[1] ?? `A die-cut sticker celebrating ${biz.name}.`;

    // Step 2 — image generation via fal.ai Flux Schnell
    const imagePrompt = `Die-cut vinyl sticker: ${concept} White background, bold graphic illustration, clean thick white border, collectible sticker style, no text.`;

    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt: imagePrompt,
        image_size: 'square_hd',
        num_images: 1,
        num_inference_steps: 4,
      },
    }) as any;

    const imageUrl: string | null = result?.data?.images?.[0]?.url ?? null;

    await db.update(businesses)
      .set({ sticker_emoji: emoji, sticker_concept: concept, sticker_image_url: imageUrl })
      .where(eq(businesses.id, bizId));

    logger.info(`Sticker generated for business ${bizId}: ${emoji} — image: ${imageUrl ? 'ok' : 'failed'}`);
    res.json({ id: bizId, sticker_emoji: emoji, sticker_concept: concept, sticker_image_url: imageUrl });
  } catch (err) {
    logger.error('Failed to generate sticker:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/stickers/generate-all
// Bulk-generates for all collection businesses. Admin use.
router.post('/generate-all', requireUser, async (req: any, res: Response) => {
  try {
    const rows = await db.select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.type, 'collection'));

    res.json({ queued: rows.length, message: 'Generation started in background.' });

    (async () => {
      for (const { id } of rows) {
        try {
          await fetch(`http://localhost:${process.env.PORT ?? 3000}/api/stickers/generate/${id}`, {
            method: 'POST',
            headers: { Authorization: req.headers.authorization ?? '' },
          });
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          logger.error(`generate-all: failed for business ${id}`, e);
        }
      }
      logger.info('generate-all: done');
    })();
  } catch (err) {
    logger.error('generate-all failed:', err);
  }
});

export default router;
