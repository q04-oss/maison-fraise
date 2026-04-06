import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';

const router = Router();

db.execute(sql`CREATE TABLE IF NOT EXISTS variety_profiles (
  id serial PRIMARY KEY,
  variety_id integer NOT NULL UNIQUE REFERENCES varieties(id),
  sweetness numeric(4,1) NOT NULL DEFAULT 5,
  acidity numeric(4,1) NOT NULL DEFAULT 5,
  aroma numeric(4,1) NOT NULL DEFAULT 5,
  texture numeric(4,1) NOT NULL DEFAULT 5,
  intensity numeric(4,1) NOT NULL DEFAULT 5,
  pairing_chocolate text,
  pairing_finish text,
  farm_distance_km numeric(7,1),
  tasting_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
)`).catch(() => {});

db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS brix_score numeric(4,1)`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS growing_method text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS moon_phase_at_harvest text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS parent_a text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS parent_b text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS altitude_m integer`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS soil_type text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS eat_by_days integer`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS recipe_name text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS recipe_description text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS harvest_weather_json text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS farm_photo_url text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS producer_video_url text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS farm_lat numeric(9,6)`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS farm_lng numeric(9,6)`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS co2_grams integer`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS carbon_offset_program text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS sunlight_hours numeric(5,1)`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS price_history_json text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS farm_id integer`).catch(() => {});

// AR expanded 5-6 columns
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS orac_value integer`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS fermentation_profile_json text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS hue_value integer`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS farmer_name text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS farmer_quote text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS certifications_json text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS farm_founded_year integer`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS farm_milestones_json text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS irrigation_method text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS cover_crop text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS terrain_type text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS prevailing_wind text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS ambient_audio_url text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS mascot_id text`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS folate_mcg numeric(8,2)`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS manganese_mg numeric(8,3)`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS potassium_mg numeric(8,1)`).catch(() => {});
db.execute(sql`ALTER TABLE variety_profiles ADD COLUMN IF NOT EXISTS vitamin_k_mcg numeric(8,2)`).catch(() => {});

// drops table
db.execute(sql`ALTER TABLE drops ADD COLUMN IF NOT EXISTS upcoming_drop_at timestamptz`).catch(() => {});

// GET /api/variety-profiles/:varietyId — public
router.get('/:varietyId', async (req: Request, res: Response) => {
  const varietyId = parseInt(req.params.varietyId, 10);
  if (isNaN(varietyId)) { res.status(400).json({ error: 'invalid_id' }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT * FROM variety_profiles WHERE variety_id = ${varietyId}
    `);
    const row = ((rows as any).rows ?? rows)[0] ?? null;
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/variety-profiles — admin upsert
router.post('/', async (req: Request, res: Response) => {
  const adminKey = req.headers['x-admin-key'] as string | undefined;
  if (adminKey !== process.env.ADMIN_KEY) { res.status(403).json({ error: 'forbidden' }); return; }
  const {
    variety_id, sweetness, acidity, aroma, texture, intensity,
    pairing_chocolate, pairing_finish, farm_distance_km, tasting_notes,
    brix_score, growing_method, moon_phase_at_harvest, parent_a, parent_b,
    altitude_m, soil_type, eat_by_days, recipe_name, recipe_description,
    harvest_weather_json, farm_photo_url, producer_video_url, farm_lat, farm_lng,
    co2_grams, carbon_offset_program, sunlight_hours, price_history_json, farm_id,
    orac_value, fermentation_profile_json, hue_value, farmer_name, farmer_quote,
    certifications_json, farm_founded_year, farm_milestones_json, irrigation_method,
    cover_crop, terrain_type, prevailing_wind, ambient_audio_url, mascot_id,
    folate_mcg, manganese_mg, potassium_mg, vitamin_k_mcg,
  } = req.body;
  if (!variety_id) { res.status(400).json({ error: 'variety_id required' }); return; }
  try {
    const result = await db.execute(sql`
      INSERT INTO variety_profiles (
        variety_id, sweetness, acidity, aroma, texture, intensity,
        pairing_chocolate, pairing_finish, farm_distance_km, tasting_notes,
        brix_score, growing_method, moon_phase_at_harvest, parent_a, parent_b,
        altitude_m, soil_type, eat_by_days, recipe_name, recipe_description,
        harvest_weather_json, farm_photo_url, producer_video_url, farm_lat, farm_lng,
        co2_grams, carbon_offset_program, sunlight_hours, price_history_json, farm_id,
        orac_value, fermentation_profile_json, hue_value, farmer_name, farmer_quote,
        certifications_json, farm_founded_year, farm_milestones_json, irrigation_method,
        cover_crop, terrain_type, prevailing_wind, ambient_audio_url, mascot_id,
        folate_mcg, manganese_mg, potassium_mg, vitamin_k_mcg,
        updated_at
      )
      VALUES (
        ${variety_id}, ${sweetness ?? 5}, ${acidity ?? 5}, ${aroma ?? 5}, ${texture ?? 5}, ${intensity ?? 5},
        ${pairing_chocolate ?? null}, ${pairing_finish ?? null}, ${farm_distance_km ?? null}, ${tasting_notes ?? null},
        ${brix_score ?? null}, ${growing_method ?? null}, ${moon_phase_at_harvest ?? null}, ${parent_a ?? null}, ${parent_b ?? null},
        ${altitude_m ?? null}, ${soil_type ?? null}, ${eat_by_days ?? null}, ${recipe_name ?? null}, ${recipe_description ?? null},
        ${harvest_weather_json ?? null}, ${farm_photo_url ?? null}, ${producer_video_url ?? null}, ${farm_lat ?? null}, ${farm_lng ?? null},
        ${co2_grams ?? null}, ${carbon_offset_program ?? null}, ${sunlight_hours ?? null}, ${price_history_json ?? null}, ${farm_id ?? null},
        ${orac_value ?? null}, ${fermentation_profile_json ?? null}, ${hue_value ?? null}, ${farmer_name ?? null}, ${farmer_quote ?? null},
        ${certifications_json ?? null}, ${farm_founded_year ?? null}, ${farm_milestones_json ?? null}, ${irrigation_method ?? null},
        ${cover_crop ?? null}, ${terrain_type ?? null}, ${prevailing_wind ?? null}, ${ambient_audio_url ?? null}, ${mascot_id ?? null},
        ${folate_mcg ?? null}, ${manganese_mg ?? null}, ${potassium_mg ?? null}, ${vitamin_k_mcg ?? null},
        now()
      )
      ON CONFLICT (variety_id) DO UPDATE SET
        sweetness = EXCLUDED.sweetness,
        acidity = EXCLUDED.acidity,
        aroma = EXCLUDED.aroma,
        texture = EXCLUDED.texture,
        intensity = EXCLUDED.intensity,
        pairing_chocolate = EXCLUDED.pairing_chocolate,
        pairing_finish = EXCLUDED.pairing_finish,
        farm_distance_km = EXCLUDED.farm_distance_km,
        tasting_notes = EXCLUDED.tasting_notes,
        brix_score = EXCLUDED.brix_score,
        growing_method = EXCLUDED.growing_method,
        moon_phase_at_harvest = EXCLUDED.moon_phase_at_harvest,
        parent_a = EXCLUDED.parent_a,
        parent_b = EXCLUDED.parent_b,
        altitude_m = EXCLUDED.altitude_m,
        soil_type = EXCLUDED.soil_type,
        eat_by_days = EXCLUDED.eat_by_days,
        recipe_name = EXCLUDED.recipe_name,
        recipe_description = EXCLUDED.recipe_description,
        harvest_weather_json = EXCLUDED.harvest_weather_json,
        farm_photo_url = EXCLUDED.farm_photo_url,
        producer_video_url = EXCLUDED.producer_video_url,
        farm_lat = EXCLUDED.farm_lat,
        farm_lng = EXCLUDED.farm_lng,
        co2_grams = EXCLUDED.co2_grams,
        carbon_offset_program = EXCLUDED.carbon_offset_program,
        sunlight_hours = EXCLUDED.sunlight_hours,
        price_history_json = EXCLUDED.price_history_json,
        farm_id = EXCLUDED.farm_id,
        orac_value = EXCLUDED.orac_value,
        fermentation_profile_json = EXCLUDED.fermentation_profile_json,
        hue_value = EXCLUDED.hue_value,
        farmer_name = EXCLUDED.farmer_name,
        farmer_quote = EXCLUDED.farmer_quote,
        certifications_json = EXCLUDED.certifications_json,
        farm_founded_year = EXCLUDED.farm_founded_year,
        farm_milestones_json = EXCLUDED.farm_milestones_json,
        irrigation_method = EXCLUDED.irrigation_method,
        cover_crop = EXCLUDED.cover_crop,
        terrain_type = EXCLUDED.terrain_type,
        prevailing_wind = EXCLUDED.prevailing_wind,
        ambient_audio_url = EXCLUDED.ambient_audio_url,
        mascot_id = EXCLUDED.mascot_id,
        folate_mcg = EXCLUDED.folate_mcg,
        manganese_mg = EXCLUDED.manganese_mg,
        potassium_mg = EXCLUDED.potassium_mg,
        vitamin_k_mcg = EXCLUDED.vitamin_k_mcg,
        updated_at = now()
      RETURNING *
    `);
    res.json(((result as any).rows ?? result)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
