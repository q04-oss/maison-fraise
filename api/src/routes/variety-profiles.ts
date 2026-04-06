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
        updated_at
      )
      VALUES (
        ${variety_id}, ${sweetness ?? 5}, ${acidity ?? 5}, ${aroma ?? 5}, ${texture ?? 5}, ${intensity ?? 5},
        ${pairing_chocolate ?? null}, ${pairing_finish ?? null}, ${farm_distance_km ?? null}, ${tasting_notes ?? null},
        ${brix_score ?? null}, ${growing_method ?? null}, ${moon_phase_at_harvest ?? null}, ${parent_a ?? null}, ${parent_b ?? null},
        ${altitude_m ?? null}, ${soil_type ?? null}, ${eat_by_days ?? null}, ${recipe_name ?? null}, ${recipe_description ?? null},
        ${harvest_weather_json ?? null}, ${farm_photo_url ?? null}, ${producer_video_url ?? null}, ${farm_lat ?? null}, ${farm_lng ?? null},
        ${co2_grams ?? null}, ${carbon_offset_program ?? null}, ${sunlight_hours ?? null}, ${price_history_json ?? null}, ${farm_id ?? null},
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
        updated_at = now()
      RETURNING *
    `);
    res.json(((result as any).rows ?? result)[0]);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
