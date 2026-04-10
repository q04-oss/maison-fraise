import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { businesses, businessMenuItems, users } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

// Self-healing migrations
db.execute(sql`
  ALTER TABLE businesses ADD COLUMN IF NOT EXISTS beacon_uuid TEXT UNIQUE;
  ALTER TABLE business_menu_items ADD COLUMN IF NOT EXISTS calories_kcal INTEGER;
  ALTER TABLE business_menu_items ADD COLUMN IF NOT EXISTS protein_g INTEGER;
  ALTER TABLE business_menu_items ADD COLUMN IF NOT EXISTS carbs_g INTEGER;
  ALTER TABLE business_menu_items ADD COLUMN IF NOT EXISTS fat_g INTEGER;
  ALTER TABLE business_menu_items ADD COLUMN IF NOT EXISTS sugar_g INTEGER;
  ALTER TABLE business_menu_items ADD COLUMN IF NOT EXISTS fiber_g INTEGER;
`).catch(() => {});
// ALTER TYPE must run outside the transaction above
db.execute(sql`ALTER TYPE chocolate ADD VALUE IF NOT EXISTS 'none'`).catch(() => {});

interface HealthContext {
  active_energy_kcal: number;
  calories_consumed_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  steps: number;
}

function scoreItem(item: any, ctx: HealthContext): { score: number; reason: string } {
  const proteinGap = Math.max(0, 50 - ctx.protein_g);
  const sugarExcess = Math.max(0, ctx.sugar_g - 40);
  const fiberGap = Math.max(0, 25 - ctx.fiber_g);
  const calorieGap = Math.max(0, 2000 - ctx.calories_consumed_kcal - ctx.active_energy_kcal * 0.3);

  const tags: string[] = Array.isArray(item.tags) ? item.tags : [];
  let score = 50;

  // Tag boosts
  if (tags.includes('high-protein') && ctx.protein_g < 50) score += 20;
  if (tags.includes('low-sugar') && ctx.sugar_g > 40) score += 20;
  if (tags.includes('high-fiber') && ctx.fiber_g < 15) score += 15;
  if (tags.includes('light') && calorieGap < 200) score += 10;
  if (tags.includes('indulgent') && ctx.active_energy_kcal > 400) score += 10;

  // Category boosts/penalties
  if (calorieGap > 500 && item.category === 'main') score += 10;
  if (ctx.sugar_g > 40 && item.category === 'dessert') score -= 20;

  // Refine with actual nutrition data if available
  if (item.calories_kcal != null) {
    // If item fills a significant calorie gap, boost it
    if (calorieGap > 200 && item.calories_kcal > 200) score += 5;
    // If we're already over 2000 net calories, penalise high-calorie items
    if (calorieGap <= 0 && item.calories_kcal > 400) score -= 10;
  }
  if (item.protein_g != null && proteinGap > 0) {
    // Boost items that cover a meaningful fraction of the gap
    if (item.protein_g >= 10) score += Math.min(10, Math.floor(item.protein_g / 5));
  }
  if (item.sugar_g != null && sugarExcess > 0 && item.sugar_g > 15) score -= 5;
  if (item.fiber_g != null && fiberGap > 0 && item.fiber_g >= 3) score += 5;

  // Clamp 0–100
  score = Math.max(0, Math.min(100, score));

  // Generate reason
  let reason = 'Fits well with your day';
  if (ctx.protein_g < 50 && tags.includes('high-protein')) {
    reason = "You're low on protein today";
  } else if (ctx.sugar_g > 40 && tags.includes('low-sugar')) {
    reason = "You've had plenty of sugar today";
  } else if (ctx.active_energy_kcal > 400 && item.category === 'main') {
    reason = "You've been active — you've earned it";
  } else if (ctx.fiber_g < 15 && tags.includes('high-fiber')) {
    reason = 'Good source of fiber for today';
  }

  return { score, reason };
}

// GET /items/:businessId — public, returns all available menu items for a business
router.get('/items/:businessId', async (req: Request, res: Response) => {
  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const rows = await db.select().from(businessMenuItems)
      .where(and(
        eq(businessMenuItems.business_id, businessId),
        eq(businessMenuItems.is_available, true),
      ));
    const items = (rows as any).rows ?? rows;
    items.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    res.json(items);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /items — auth, is_shop only, create a menu item
router.post('/items', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [user] = await db.select({ is_shop: users.is_shop, business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.is_shop || !user.business_id) {
      res.status(403).json({ error: 'shop accounts only' });
      return;
    }
    const { name, description, price_cents, category, tags, allergens, sort_order } = req.body;
    if (!name || !category) {
      res.status(400).json({ error: 'name and category required' });
      return;
    }
    const inserted = await db.insert(businessMenuItems).values({
      business_id: user.business_id,
      name,
      description: description ?? null,
      price_cents: price_cents ?? null,
      category,
      tags: tags ?? [],
      allergens: allergens ?? {},
      sort_order: sort_order ?? null,
      is_available: true,
    }).returning();
    const rows = (inserted as any).rows ?? inserted;
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /items/:itemId — auth, is_shop, must own the item
router.patch('/items/:itemId', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const itemId = parseInt(req.params.itemId, 10);
  if (isNaN(itemId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [user] = await db.select({ is_shop: users.is_shop, business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.is_shop || !user.business_id) {
      res.status(403).json({ error: 'shop accounts only' });
      return;
    }
    const [existing] = await db.select({ id: businessMenuItems.id, business_id: businessMenuItems.business_id })
      .from(businessMenuItems).where(eq(businessMenuItems.id, itemId));
    if (!existing || existing.business_id !== user.business_id) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const { name, description, price_cents, category, tags, allergens, is_available, sort_order } = req.body;
    const patch: Record<string, any> = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (price_cents !== undefined) patch.price_cents = price_cents;
    if (category !== undefined) patch.category = category;
    if (tags !== undefined) patch.tags = tags;
    if (allergens !== undefined) patch.allergens = allergens;
    if (is_available !== undefined) patch.is_available = is_available;
    if (sort_order !== undefined) patch.sort_order = sort_order;
    const updated = await db.update(businessMenuItems).set(patch)
      .where(eq(businessMenuItems.id, itemId)).returning();
    const rows = (updated as any).rows ?? updated;
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// DELETE /items/:itemId — auth, is_shop, must own the item (soft delete)
router.delete('/items/:itemId', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const itemId = parseInt(req.params.itemId, 10);
  if (isNaN(itemId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [user] = await db.select({ is_shop: users.is_shop, business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.is_shop || !user.business_id) {
      res.status(403).json({ error: 'shop accounts only' });
      return;
    }
    const [existing] = await db.select({ id: businessMenuItems.id, business_id: businessMenuItems.business_id })
      .from(businessMenuItems).where(eq(businessMenuItems.id, itemId));
    if (!existing || existing.business_id !== user.business_id) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    await db.update(businessMenuItems).set({ is_available: false })
      .where(eq(businessMenuItems.id, itemId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /:businessId — auth required, recommend menu items based on HealthKit context
router.post('/:businessId', requireUser, async (req: Request, res: Response) => {
  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'invalid id' }); return; }

  const ctx: HealthContext = {
    active_energy_kcal: Number(req.body.active_energy_kcal) || 0,
    calories_consumed_kcal: Number(req.body.calories_consumed_kcal) || 0,
    protein_g: Number(req.body.protein_g) || 0,
    carbs_g: Number(req.body.carbs_g) || 0,
    fat_g: Number(req.body.fat_g) || 0,
    sugar_g: Number(req.body.sugar_g) || 0,
    fiber_g: Number(req.body.fiber_g) || 0,
    steps: Number(req.body.steps) || 0,
  };

  try {
    const items = await db.select().from(businessMenuItems)
      .where(and(
        eq(businessMenuItems.business_id, businessId),
        eq(businessMenuItems.is_available, true),
      ));

    const scored = items.map(item => {
      const { score, reason } = scoreItem(item, ctx);
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        price_cents: item.price_cents,
        tags: Array.isArray(item.tags) ? item.tags : [],
        score,
        reason,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    res.json(scored.slice(0, 3));
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
