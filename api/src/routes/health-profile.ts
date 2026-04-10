import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { healthProfiles } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';

const router = Router();

// Self-healing migration
db.execute(sql`
  CREATE TABLE IF NOT EXISTS health_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    dietary_restrictions TEXT[] NOT NULL DEFAULT '{}',
    allergens JSONB DEFAULT '{}',
    biometric_markers JSONB DEFAULT '{}',
    flavor_profile JSONB DEFAULT '{}',
    caloric_needs INTEGER,
    dorotka_note TEXT,
    last_reading_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

// GET /api/health-profile — get my profile (creates empty one if none exists)
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const [profile] = await db.select().from(healthProfiles).where(eq(healthProfiles.user_id, userId));
    if (profile) { res.json(profile); return; }
    // Create empty profile on first access
    const [created] = await db.insert(healthProfiles).values({ user_id: userId }).returning();
    res.json(created);
  } catch (err) {
    logger.error(`Health profile fetch error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/health-profile — update (from Dorotka toilet sync or manual input)
router.patch('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const {
    dietary_restrictions,
    allergens,
    biometric_markers,
    flavor_profile,
    caloric_needs,
    dorotka_note,
    last_reading_at,
  } = req.body;

  try {
    const [existing] = await db.select({ id: healthProfiles.id })
      .from(healthProfiles).where(eq(healthProfiles.user_id, userId));

    const updates: Record<string, any> = { updated_at: new Date() };
    if (dietary_restrictions !== undefined) updates.dietary_restrictions = dietary_restrictions;
    if (allergens !== undefined) updates.allergens = allergens;
    if (biometric_markers !== undefined) updates.biometric_markers = biometric_markers;
    if (flavor_profile !== undefined) updates.flavor_profile = flavor_profile;
    if (caloric_needs !== undefined) updates.caloric_needs = caloric_needs;
    if (dorotka_note !== undefined) updates.dorotka_note = dorotka_note;
    if (last_reading_at !== undefined) updates.last_reading_at = new Date(last_reading_at);

    let result;
    if (existing) {
      [result] = await db.update(healthProfiles).set(updates)
        .where(eq(healthProfiles.user_id, userId)).returning();
    } else {
      [result] = await db.insert(healthProfiles).values({ user_id: userId, ...updates }).returning();
    }
    res.json(result);
  } catch (err) {
    logger.error(`Health profile update error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
