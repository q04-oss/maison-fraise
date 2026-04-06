import { Router, Request, Response } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { healthProfiles, personalizedMenus, businesses, users } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';

const router = Router();

db.execute(sql`
  CREATE TABLE IF NOT EXISTS personalized_menus (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    courses JSONB NOT NULL,
    health_snapshot JSONB,
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMP
  )
`).catch(() => {});

// ─── Menu generation ──────────────────────────────────────────────────────────

interface Course { course: string; dish: string; rationale: string; }
interface HealthProfile { dietary_restrictions: string[]; allergens: Record<string, boolean>; biometric_markers: Record<string, number>; flavor_profile: Record<string, number>; }

function generateMenu(profile: HealthProfile): Course[] {
  const courses: Course[] = [];
  const m = profile.biometric_markers ?? {};
  const f = profile.flavor_profile ?? {};
  const a = profile.allergens ?? {};
  const r = profile.dietary_restrictions ?? [];

  const isVegan = r.includes('vegan');
  const isVegetarian = r.includes('vegetarian') || isVegan;
  const isGlutenFree = r.includes('gluten-free');
  const isDairyFree = r.includes('dairy-free') || isVegan;
  const noFish = a.fish || a.seafood || isVegetarian;
  const noNuts = !!a.nuts;
  const noShellfish = !!a.shellfish;

  const highInflammation = (m.inflammation_markers ?? 0.3) > 0.6;
  const lowHydration = (m.hydration ?? 0.7) < 0.5;
  const slowDigestion = (m.digestive_speed ?? 0.5) < 0.4;
  const highStress = (m.stress_indicators ?? 0.2) > 0.6;
  const lowGutDiversity = (m.gut_microbiome_diversity ?? 0.7) < 0.5;
  const lovesUmami = (f.umami ?? 0.5) > 0.7;
  const lowSweet = (f.sweet ?? 0.5) < 0.3;
  const lovesRich = (f.rich ?? 0.5) > 0.7;

  // Amuse-bouche
  if (lowHydration) {
    courses.push({ course: 'Amuse-bouche', dish: 'Cucumber & elderflower water jelly, dill oil, sea salt', rationale: 'Your hydration markers are below optimal. This opens the meal with maximum cellular uptake — water-bound in gel form absorbs faster than free liquid.' });
  } else if (highInflammation) {
    courses.push({ course: 'Amuse-bouche', dish: 'Turmeric & ginger consommé, micro coriander, black pepper oil', rationale: 'Curcumin from turmeric is the most studied natural anti-inflammatory compound. Black pepper\'s piperine increases its bioavailability by 2000%. We open here deliberately.' });
  } else if (lowGutDiversity) {
    courses.push({ course: 'Amuse-bouche', dish: 'Kombucha gel, lacto-fermented radish, black sesame crisp', rationale: 'Your gut microbiome diversity reading is lower than your baseline. A probiotic opening — live cultures from both kombucha and lacto-fermentation — begins seeding broader bacterial populations before the meal continues.' });
  } else {
    courses.push({ course: 'Amuse-bouche', dish: 'Whipped miso' + (isDairyFree ? '' : ' & cultured butter') + ', sourdough tuile' + (isGlutenFree ? ' (GF buckwheat tuile)' : '') + ', nori powder', rationale: 'Glutamate-rich miso in a small format calibrates the palate\'s umami receptors early, allowing every subsequent course to feel more complex at a lower intensity.' });
  }

  // First course (cold)
  if (isVegan) {
    courses.push({ course: 'First Course', dish: lowGutDiversity ? 'Miso-glazed heritage beet, lacto-fermented apple, chicory, hazelnut' + (noNuts ? ' (omit hazelnut, add pumpkin seed)' : '') : 'Charred leek, white bean cream, preserved lemon, sorrel oil, chive', rationale: lowGutDiversity ? 'Fermented miso and lacto-fermented apple each introduce distinct bacterial strains. Chicory\'s inulin acts as prebiotic fuel for what\'s being planted.' : 'Prebiotic leek paired with sorrel\'s malic and oxalic acids — liver-supportive, and a light counterpoint to what follows.' });
  } else if (highInflammation && !noFish) {
    courses.push({ course: 'First Course', dish: 'Cured salmon, avocado mousse, yuzu gel, micro shiso, sesame', rationale: 'Salmon at this curing concentration delivers approximately 2.5g of EPA/DHA omega-3 per portion — directly antagonistic to the arachidonic acid cascade driving your inflammation reading. Avocado amplifies fat-soluble absorption.' });
  } else if (!noFish && lovesUmami) {
    courses.push({ course: 'First Course', dish: 'Smoked mackerel rillette, fennel escabeche, rye crisp' + (isGlutenFree ? ' (GF rye alternative)' : '') + ', crème fraîche' + (isDairyFree ? ' (cashew crème)' : ''), rationale: 'Mackerel has the highest omega-3 density of any accessible cold-water fish. The escabeche adds acetic acid to improve mineral absorption from subsequent courses.' });
  } else {
    courses.push({ course: 'First Course', dish: 'Burrata' + (isDairyFree ? ' (cashew burrata)' : '') + ', heritage tomato, aged balsamic 25yr, basil oil, Maldon', rationale: 'Slow-ripened heritage tomato delivers lycopene concentrations 4x higher than commercial varieties. ' + (isDairyFree ? 'Cashew burrata preserves the textural contrast without dairy.' : 'Burrata provides calcium and the fat-soluble vitamins A and K2.') });
  }

  // Second course (warm)
  if (slowDigestion) {
    courses.push({ course: 'Second Course', dish: 'Fennel & cardamom bouillon, silken' + (isVegetarian ? ' tofu' : ' poached quail egg') + ', bronze fennel frond, lemon oil', rationale: 'Anethole in fennel seed and cineole in cardamom are both proven digestive motility agents — they signal the enteric nervous system to increase peristaltic speed. The light broth format puts minimal mechanical demand on a slow tract.' });
  } else if (lovesUmami) {
    courses.push({ course: 'Second Course', dish: 'Aged mushroom dashi, hand-torn Comté' + (isDairyFree ? ' (omit, add nutritional yeast crisps)' : '') + ', crispy ' + (isGlutenFree ? 'buckwheat' : 'farro') + ', chive oil', rationale: 'Glutamate from aged mushroom stock and ' + (isDairyFree ? 'nutritional yeast' : 'Comté aged 18 months') + ' creates compound umami — the stacking of free glutamate, IMP, and GMP produces a perceived intensity far beyond any single source.' });
  } else {
    courses.push({ course: 'Second Course', dish: 'Roasted sunchoke velouté, truffle oil, crispy capers, chive, ' + (isGlutenFree ? 'GF sourdough crisp' : 'sourdough crisp'), rationale: 'Sunchoke is among the highest dietary sources of inulin — a prebiotic fiber fermented by Bifidobacterium species. Given the rest of your profile, this is the course that does the most sustained microbiome work.' });
  }

  // Main
  if (isVegan) {
    courses.push({ course: 'Main', dish: 'Koji-aged celeriac steak, black garlic jus, compressed pear, watercress, ' + (noNuts ? 'toasted pumpkin seed' : 'walnut'), rationale: 'Koji fermentation produces the same glutamate density as aged meat without animal protein. Black garlic provides 2x the allicin of raw garlic alongside prebiotic fructans. This is the course where the meal earns its depth.' });
  } else if (isVegetarian && highStress) {
    courses.push({ course: 'Main', dish: 'Stress-optimised mushroom & miso pot, silken tofu, ' + (isGlutenFree ? 'buckwheat soba' : 'soba') + ' noodles, pickled ginger, nori, sesame oil', rationale: 'Magnesium-dense silken tofu and L-theanine in the dashi directly counter cortisol load. Ginger\'s gingerols reduce the inflammatory component of the stress response. For vegetarian guests with high stress markers, recovery takes precedence over the Wellington\'s structural richness.' });
  } else if (isVegetarian) {
    courses.push({ course: 'Main', dish: 'Wild mushroom & chestnut Wellington' + (isGlutenFree ? ' (GF pastry)' : '') + ', celeriac purée, pickled walnut jus' + (noNuts ? ' (omit walnut, add tamarind jus)' : ''), rationale: 'Mixed mushroom proteins alongside chestnut provide complete amino acid coverage unusual in vegetarian mains. The Wellington format is structurally satisfying — the meal\'s centre of gravity.' });
  } else if (highStress) {
    courses.push({ course: 'Main', dish: 'Slow-braised grass-fed short rib 12hr, chamomile-infused jus, charred bitter greens, potato purée' + (isDairyFree ? ' (olive oil)' : ''), rationale: 'Collagen from long-braised connective tissue supports adrenal tissue repair. Chamomile\'s apigenin is an established cortisol modulator — we\'ve concentrated it in the jus so it absorbs with the meal\'s fat content. Bitter greens activate the liver\'s Phase II detoxification, which is suppressed under chronic cortisol load.' });
  } else if (!noFish && !noShellfish) {
    courses.push({ course: 'Main', dish: 'Wild sea bass, beurre blanc' + (isDairyFree ? ' (soy butter)' : '') + ', sea vegetables, fermented black bean, lemon verbena', rationale: 'Wild sea bass provides complete amino acids with a lean fat profile. Sea vegetables introduce fucoidans and iodine — supporting thyroid function and T-cell modulation. This is the lightest main on the menu and the right one for your current metabolic picture.' });
  } else {
    courses.push({ course: 'Main', dish: 'Heritage duck breast, Morello cherry jus, charred radicchio, ' + (isGlutenFree ? 'millet' : 'farro') + ' risotto' + (isDairyFree ? '' : ', aged Parmesan'), rationale: 'Duck provides haem iron and zinc alongside oleic acid identical in structure to olive oil. Cherry anthocyanins are direct antioxidants with a 2-hour activity window — this timing places them at peak effect during digestion of the richest course.' });
  }

  // Pre-dessert
  if (lowSweet || highInflammation) {
    courses.push({ course: 'Pre-dessert', dish: 'Frozen kefir' + (isDairyFree ? ' (coconut kefir)' : '') + ', compressed green apple, cucumber water, micro mint', rationale: 'Calibrated to your lower sweet threshold — the palate cleanser here is tart and cooling rather than sugary. Kefir continues the probiotic work through the meal\'s final arc.' });
  } else {
    courses.push({ course: 'Pre-dessert', dish: 'Lemon verbena granita, acacia honey gel, compressed white peach, bronze fennel seed', rationale: 'Verbena promotes bile flow and gastric motility before the final course. The honey delivers fructose for sustained liver glycogen replenishment through the evening.' });
  }

  // Dessert
  if (highStress) {
    courses.push({ course: 'Dessert', dish: '70% Guanaja chocolate soufflé' + (isGlutenFree ? ' (GF)' : '') + (isDairyFree ? ', oat milk base' : '') + ', ashwagandha cream, Maldon', rationale: 'Guanaja at 70% delivers 64mg magnesium per portion — the mineral most depleted by chronic cortisol production. Ashwagandha\'s withanolides are clinically shown to reduce cortisol by 27% in 60-day trials. The meal ends as a therapeutic act.' });
  } else if (isDairyFree || isVegan) {
    courses.push({ course: 'Dessert', dish: 'Tahini & white miso caramel tart' + (isGlutenFree ? ' (GF pastry)' : '') + ', coconut sesame ice cream, black sesame tuile', rationale: 'Tahini provides calcium (more per gram than milk), tryptophan — the serotonin precursor — and oleic acid. The meal closes on a neurochemically calming note without requiring dairy.' });
  } else if (lovesRich) {
    courses.push({ course: 'Dessert', dish: 'Valrhona Caraïbe marquise, Brittany salted butter caramel, crème fraîche sorbet, candied violet', rationale: 'Your flavor profile indicates strong preference for richness. Caraïbe at 66% balances the caramel\'s sweetness with enough bitterness to prevent the finish from becoming cloying. The sorbet provides a cold-acid counterpoint.' });
  } else {
    courses.push({ course: 'Dessert', dish: 'Honey & lavender panna cotta' + (isDairyFree ? ' (oat milk)' : '') + ', raspberry coulis, pistachio' + (noNuts ? ' (omit, add toasted coconut)' : '') + ', edible flower', rationale: 'Linalool from lavender is a proven anxiolytic at culinary concentrations. Honey provides fructose for liver glycogen. This is a gentle, considered close to a calibrated meal.' });
  }

  // Mignardises — always
  courses.push({ course: 'Mignardises', dish: 'Fermented dark chocolate truffle, candied ginger, chamomile & linden tea', rationale: 'Fermented cacao maximizes flavanol bioavailability. Candied ginger accelerates gastric emptying. Chamomile and linden close the nervous system loop the meal has been building toward.' });

  return courses;
}

// POST /api/menus/personalized — generate for requesting user (+ optional party)
router.post('/personalized', requireUser, async (req: Request, res: Response) => {
  const requesterId = (req as any).userId as number;
  const { business_id, party_user_ids } = req.body;
  if (!business_id) { res.status(400).json({ error: 'business_id required' }); return; }

  try {
    const [biz] = await db.select({ id: businesses.id, name: businesses.name })
      .from(businesses).where(eq(businesses.id, business_id));
    if (!biz) { res.status(404).json({ error: 'business not found' }); return; }

    const userIds: number[] = [requesterId, ...(party_user_ids ?? []).filter((id: number) => id !== requesterId)];
    const validUntil = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4hr window

    const results = await Promise.all(userIds.map(async (userId) => {
      const [rawProfile] = await db.select().from(healthProfiles)
        .where(eq(healthProfiles.user_id, userId));

      const profile: HealthProfile = {
        dietary_restrictions: rawProfile?.dietary_restrictions ?? [],
        allergens: (rawProfile?.allergens ?? {}) as Record<string, boolean>,
        biometric_markers: (rawProfile?.biometric_markers ?? {}) as Record<string, number>,
        flavor_profile: (rawProfile?.flavor_profile ?? {}) as Record<string, number>,
      };

      const courses = generateMenu(profile);
      const healthSnapshot = rawProfile ?? null;

      const [saved] = await db.insert(personalizedMenus).values({
        business_id, user_id: userId, courses, health_snapshot: healthSnapshot, valid_until: validUntil,
      }).returning();

      const [user] = await db.select({ display_name: users.display_name })
        .from(users).where(eq(users.id, userId));

      return { user_id: userId, display_name: user?.display_name ?? null, menu_id: saved.id, courses, valid_until: validUntil };
    }));

    res.status(201).json({ business_name: biz.name, menus: results });
  } catch (err) {
    logger.error(`Menu generation error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/menus/personalized/latest?business_id= — latest menu for me at this business
router.get('/personalized/latest', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const businessId = parseInt(req.query.business_id as string, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'business_id required' }); return; }
  try {
    const [menu] = await db.select().from(personalizedMenus)
      .where(and(eq(personalizedMenus.user_id, userId), eq(personalizedMenus.business_id, businessId)))
      .orderBy(desc(personalizedMenus.generated_at))
      .limit(1);
    res.json(menu ?? null);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
