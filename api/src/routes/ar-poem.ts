import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { requireUser } from '../lib/auth';

const router = Router();
const client = new Anthropic(); // uses ANTHROPIC_API_KEY env var

// POST /api/ar-poem
// Body: { variety_name, farm, brix_score, flavor_profile, terrain_type, moon_phase_at_harvest, harvest_date, growing_method, farmer_name }
// Returns: { poem: string } — a 4-line tasting poem
router.post('/', requireUser, async (req: Request, res: Response) => {
  const {
    variety_name, farm, brix_score, flavor_profile,
    terrain_type, moon_phase_at_harvest, harvest_date,
    growing_method, farmer_name
  } = req.body as Record<string, any>;

  try {
    const prompt = buildPoemPrompt({
      variety_name, farm, brix_score, flavor_profile,
      terrain_type, moon_phase_at_harvest, harvest_date,
      growing_method, farmer_name
    });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });

    const poem = (message.content[0] as any).text?.trim() ?? '';
    res.json({ poem });
  } catch (err) {
    res.status(500).json({ error: 'poem_generation_failed' });
  }
});

function buildPoemPrompt(data: Record<string, any>): string {
  const parts: string[] = [];
  if (data.variety_name) parts.push(`Variety: ${data.variety_name}`);
  if (data.farm) parts.push(`Farm: ${data.farm}`);
  if (data.brix_score) parts.push(`Brix: ${data.brix_score}°`);
  if (data.terrain_type) parts.push(`Terrain: ${data.terrain_type}`);
  if (data.moon_phase_at_harvest) parts.push(`Moon at harvest: ${data.moon_phase_at_harvest}`);
  if (data.harvest_date) parts.push(`Harvested: ${data.harvest_date}`);
  if (data.growing_method) parts.push(`Method: ${data.growing_method}`);
  if (data.farmer_name) parts.push(`Farmer: ${data.farmer_name}`);
  if (data.flavor_profile) {
    const fp = typeof data.flavor_profile === 'string' ? JSON.parse(data.flavor_profile) : data.flavor_profile;
    if (fp.sweetness) parts.push(`Sweetness: ${fp.sweetness}/10`);
    if (fp.acidity) parts.push(`Acidity: ${fp.acidity}/10`);
    if (fp.aroma) parts.push(`Aroma: ${fp.aroma}/10`);
    if (fp.tasting_notes) parts.push(`Notes: ${fp.tasting_notes}`);
  }

  return `You are a lyric poet writing tasting notes as poetry for a premium strawberry subscription box called Maison Fraise.

Write exactly 4 lines of poetry about this specific strawberry variety. The poem should be evocative, sensory, and intimate — like a sommelier's note but in verse. No title, no label, no explanation. Just the 4 lines.

${parts.join('\n')}`;
}

export default router;
