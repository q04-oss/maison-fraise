import { Router, Request, Response } from 'express';
import { eq, and, asc, sql } from 'drizzle-orm';
import { db } from '../db';
import { businessMenuItems, businesses, users, healthProfiles } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';

const router = Router();

db.execute(sql`
  CREATE TABLE IF NOT EXISTS business_menu_items (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER,
    category TEXT NOT NULL DEFAULT 'main',
    allergens JSONB NOT NULL DEFAULT '{}',
    tags TEXT[] NOT NULL DEFAULT '{}',
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

// GET /api/menu-items/my — shop user fetches their own business's items (must be before /:businessId)
router.get('/my', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [user] = await db.select({ is_shop: users.is_shop, business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.is_shop || !user.business_id) { res.status(403).json({ error: 'shop accounts only' }); return; }
    const items = await db.select().from(businessMenuItems)
      .where(eq(businessMenuItems.business_id, user.business_id))
      .orderBy(asc(businessMenuItems.sort_order), asc(businessMenuItems.created_at));
    res.json(items);
  } catch { res.status(500).json({ error: 'internal' }); }
});

// GET /api/menu-items/:businessId — public menu listing
router.get('/:businessId', async (req: Request, res: Response) => {
  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const items = await db.select().from(businessMenuItems)
      .where(and(eq(businessMenuItems.business_id, businessId), eq(businessMenuItems.is_available, true)))
      .orderBy(asc(businessMenuItems.sort_order), asc(businessMenuItems.created_at));
    res.json(items);
  } catch { res.status(500).json({ error: 'internal' }); }
});

// GET /api/menu-items/:businessId/recommend — personalized recommendations (auth)
router.get('/:businessId/recommend', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [profile] = await db.select().from(healthProfiles).where(eq(healthProfiles.user_id, userId));
    const items = await db.select().from(businessMenuItems)
      .where(and(eq(businessMenuItems.business_id, businessId), eq(businessMenuItems.is_available, true)))
      .orderBy(asc(businessMenuItems.sort_order));

    if (!profile || !items.length) { res.json({ items, recommended: [] }); return; }

    const m = (profile.biometric_markers as Record<string, number>) ?? {};
    const f = (profile.flavor_profile as Record<string, number>) ?? {};
    const a = (profile.allergens as Record<string, boolean>) ?? {};
    const r = (profile.dietary_restrictions as string[]) ?? [];

    const isVegan = r.includes('vegan');
    const isVegetarian = r.includes('vegetarian') || isVegan;
    const isGlutenFree = r.includes('gluten-free');
    const highInflammation = (m.inflammation_markers ?? 0.3) > 0.6;
    const highStress = (m.stress_indicators ?? 0.2) > 0.6;
    const lowHydration = (m.hydration ?? 0.7) < 0.5;
    const lowGutDiversity = (m.gut_microbiome_diversity ?? 0.7) < 0.5;

    const scored = items.map(item => {
      const tags = (item.tags as string[]) ?? [];
      const allergens = (item.allergens as Record<string, boolean>) ?? {};

      // Hard exclusions — allergens and dietary restrictions
      if (a.nuts && allergens.nuts) return null;
      if (a.shellfish && allergens.shellfish) return null;
      if ((a.fish || a.seafood) && (allergens.fish || allergens.seafood)) return null;
      if (isVegetarian && tags.includes('meat')) return null;
      if (isVegan && (tags.includes('meat') || tags.includes('dairy') || tags.includes('fish'))) return null;
      if (isGlutenFree && allergens.gluten && !tags.includes('gf-available')) return null;

      let score = 0;
      if (highInflammation && tags.includes('anti-inflammatory')) score += 3;
      if (highStress && tags.includes('adaptogenic')) score += 3;
      if (lowHydration && tags.includes('hydrating')) score += 2;
      if (lowGutDiversity && (tags.includes('probiotic') || tags.includes('prebiotic'))) score += 2;
      if ((f.umami ?? 0.5) > 0.7 && tags.includes('umami')) score += 1;
      if ((f.rich ?? 0.5) > 0.7 && tags.includes('rich')) score += 1;
      if ((f.light ?? 0.5) > 0.7 && tags.includes('light')) score += 1;

      return { item, score };
    }).filter(Boolean) as { item: typeof items[number]; score: number }[];

    scored.sort((a, b) => b.score - a.score);

    // Top recommendation per category
    const byCategory: Record<string, any> = {};
    for (const { item, score } of scored) {
      if (!byCategory[item.category]) {
        byCategory[item.category] = { ...item, recommendation_score: score };
      }
    }

    res.json({ items, recommended: Object.values(byCategory) });
  } catch (err) {
    logger.error(`Menu recommend error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/menu-items — shop user adds item
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { name, description, price_cents, category, allergens, tags, sort_order } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
  try {
    const [user] = await db.select({ is_shop: users.is_shop, business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.is_shop || !user.business_id) { res.status(403).json({ error: 'shop accounts only' }); return; }

    const [created] = await db.insert(businessMenuItems).values({
      business_id: user.business_id,
      name: name.trim(),
      description: description?.trim() ?? null,
      price_cents: price_cents ?? null,
      category: category ?? 'main',
      allergens: allergens ?? {},
      tags: tags ?? [],
      sort_order: sort_order ?? 0,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    logger.error(`Menu item create error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/menu-items/:id
router.patch('/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [user] = await db.select({ business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.business_id) { res.status(403).json({ error: 'shop accounts only' }); return; }

    const { name, description, price_cents, category, allergens, tags, is_available, sort_order } = req.body;
    const patch: Record<string, any> = {};
    if (name !== undefined) patch.name = String(name).trim();
    if (description !== undefined) patch.description = description?.trim() ?? null;
    if (price_cents !== undefined) patch.price_cents = price_cents;
    if (category !== undefined) patch.category = category;
    if (allergens !== undefined) patch.allergens = allergens;
    if (tags !== undefined) patch.tags = tags;
    if (is_available !== undefined) patch.is_available = Boolean(is_available);
    if (sort_order !== undefined) patch.sort_order = sort_order;

    const [updated] = await db.update(businessMenuItems).set(patch)
      .where(and(eq(businessMenuItems.id, id), eq(businessMenuItems.business_id, user.business_id)))
      .returning();
    if (!updated) { res.status(404).json({ error: 'not found' }); return; }
    res.json(updated);
  } catch { res.status(500).json({ error: 'internal' }); }
});

// DELETE /api/menu-items/:id
router.delete('/:id', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    const [user] = await db.select({ business_id: users.business_id })
      .from(users).where(eq(users.id, userId));
    if (!user?.business_id) { res.status(403).json({ error: 'shop accounts only' }); return; }

    await db.delete(businessMenuItems)
      .where(and(eq(businessMenuItems.id, id), eq(businessMenuItems.business_id, user.business_id)));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal' }); }
});

export default router;
