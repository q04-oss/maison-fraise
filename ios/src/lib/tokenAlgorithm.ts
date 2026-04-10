// ─── Content token mechanic (mirrors server — reference only, iOS renders from DB) ──

export type Archetype = 'allure' | 'power' | 'grace' | 'shadow' | 'fire';
export type Rarity = 'common' | 'rare' | 'legendary';

export interface ContentTokenMechanic {
  archetype: Archetype;
  power: number;
  rarity: Rarity;
  effect: string;
}

export const ARCHETYPE_COLORS: Record<Archetype, string> = {
  allure:  '#C2185B',
  power:   '#B71C1C',
  grace:   '#7B1FA2',
  shadow:  '#212121',
  fire:    '#E64A19',
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common:    'common',
  rare:      'rare',
  legendary: 'legendary',
};

export function composeTokenName(params: {
  token_type?: string;
  location_type?: string | null;
  partner_name?: string | null;
  variety_name: string;
}): string {
  if (params.token_type === 'chocolate') {
    if (params.location_type === 'collab_chocolate' && params.partner_name) {
      return `MAISON FRAISE × ${params.partner_name.toUpperCase()}`;
    }
    return 'MAISON FRAISE';
  }
  return params.variety_name.toUpperCase();
}

export interface TokenVisuals {
  size: number;
  color: string;
  seeds: number;
  irregularity: number;
}

// Token visuals are computed server-side and stored in the database.
// The iOS app renders directly from visual_size, visual_color, visual_seeds,
// visual_irregularity fields — this function is kept for reference only.
//
// Seed: parsed from the box's NFC chip UUID (deterministic, unique per box)
// Excess: overpayment in cents enhances the visual on a logarithmic scale
export function computeTokenVisuals(seed: number, excessCents: number): TokenVisuals {
  const rand = seededRandom(seed);

  const baseSize         = Math.round(8  + rand() * 22);
  const baseSeeds        = Math.round(3  + rand() * 12);
  const baseIrregularity = Math.round(5  + rand() * 20);
  const basePalette      = rand() * 0.15;

  const dollars = excessCents / 100;
  const logMax  = 7;
  const logVal  = Math.log10(Math.max(1, dollars));
  const ease    = excessCents > 0
    ? Math.pow(Math.min(1, Math.max(0, logVal / logMax)), 0.6)
    : 0;

  const size         = Math.round(baseSize         + ease * (100 - baseSize));
  const seeds        = Math.round(baseSeeds        + ease * (144 - baseSeeds));
  const irregularity = Math.round(baseIrregularity + ease * (100 - baseIrregularity));
  const color        = interpolateColor(ease > 0 ? ease : basePalette);

  return { size, color, seeds, irregularity };
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function interpolateColor(t: number): string {
  const stops = [
    { t: 0.0, r: 255, g: 205, b: 210 },
    { t: 0.3, r: 229, g: 115, b: 115 },
    { t: 0.6, r: 183, g: 28,  b: 28  },
    { t: 0.8, r: 123, g: 31,  b: 162 },
    { t: 1.0, r: 26,  g: 35,  b: 126 },
  ];
  let lower = stops[0], upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      lower = stops[i]; upper = stops[i + 1]; break;
    }
  }
  const range = upper.t - lower.t || 1;
  const local = (t - lower.t) / range;
  const r = Math.round(lower.r + local * (upper.r - lower.r));
  const g = Math.round(lower.g + local * (upper.g - lower.g));
  const b = Math.round(lower.b + local * (upper.b - lower.b));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
