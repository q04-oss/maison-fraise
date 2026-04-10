export interface TokenVisuals {
  size: number;          // 1–100
  color: string;         // hex
  seeds: number;         // 3–144
  irregularity: number;  // 1–100
}

// Every box mints a token. The NFC chip's unique identifier seeds the base visual —
// so each token has a distinct, deterministic appearance tied to that physical object.
// Overpaying enhances the token: deeper color, more seeds, larger, more irregular.
//
// Base range (no excess):  size 8–30, pale pink family, 3–15 seeds, low irregularity
// With excess, logarithmic scale:
//   CA$1 over   → subtle shift toward rose
//   CA$100      → noticeably richer, mid red
//   CA$1,000    → deep red, dense seeds
//   CA$10,000+  → dramatic — burgundy-purple into near-black blue

export function computeTokenVisuals(seed: number, excessCents: number): TokenVisuals {
  const rand = seededRandom(seed);

  // Base visual from the physical box's identity — each box has its own character
  const baseSize         = Math.round(8  + rand() * 22); // 8–30
  const baseSeeds        = Math.round(3  + rand() * 12); // 3–15
  const baseIrregularity = Math.round(5  + rand() * 20); // 5–25
  const basePalette      = rand() * 0.15;                // 0–0.15: stays in pale-pink family

  // Enhancement from excess — logarithmic, felt not linear
  // log10(1 + dollars) ensures CA$0.01 and CA$1 have distinct values (no plateau)
  const dollars = excessCents / 100;
  const logMax  = Math.log10(1 + 10_000_000); // saturates at $10M
  const logVal  = Math.log10(1 + Math.max(0, dollars));
  const ease    = excessCents > 0
    ? Math.pow(Math.min(1, Math.max(0, logVal / logMax)), 0.6)
    : 0;

  const size         = Math.round(baseSize         + ease * (100 - baseSize));
  const seeds        = Math.round(baseSeeds        + ease * (144 - baseSeeds));
  const irregularity = Math.round(baseIrregularity + ease * (100 - baseIrregularity));
  const color        = interpolateColor(ease > 0 ? ease : basePalette);

  return { size, color, seeds, irregularity };
}

// Deterministic PRNG — same seed always produces the same token appearance
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function interpolateColor(t: number): string {
  const stops = [
    { t: 0.0, r: 255, g: 205, b: 210 }, // pale pink
    { t: 0.3, r: 229, g: 115, b: 115 }, // rose
    { t: 0.6, r: 183, g: 28,  b: 28  }, // deep red
    { t: 0.8, r: 123, g: 31,  b: 162 }, // burgundy-purple
    { t: 1.0, r: 26,  g: 35,  b: 126 }, // near black-blue
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

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Content token mechanic ───────────────────────────────────────────────────
// Fully deterministic — same post ID always produces the same card.
// Rarity is based on the creator's sequential token_number (first posts = legendary).

export type Archetype = 'allure' | 'power' | 'grace' | 'shadow' | 'fire';
export type Rarity = 'common' | 'rare' | 'legendary';

export interface ContentTokenMechanic {
  archetype: Archetype;
  power: number;    // 1–100
  rarity: Rarity;
  effect: string;
}

const EFFECTS: Record<Archetype, string[]> = {
  allure:  ['draw 2 cards', 'steal opponent\'s top card', 'power +20 this turn'],
  power:   ['deal 30 damage', 'double next attack', 'immunity this round'],
  grace:   ['heal 25 HP', 'nullify next attack', 'restore a discarded card'],
  shadow:  ['opponent discards a card', 'power −15 to opponent', 'skip opponent\'s next turn'],
  fire:    ['deal 50 damage', 'burn: −10 HP/turn for 3 turns', 'destroy a trap card'],
};

const ARCHETYPES: Archetype[] = ['allure', 'power', 'grace', 'shadow', 'fire'];

export function computeContentTokenMechanic(
  postId: number,
  tokenNumber: number,
): ContentTokenMechanic {
  const rand = seededRandom(postId);

  const archetype = ARCHETYPES[Math.floor(rand() * ARCHETYPES.length)];
  const power = Math.round(1 + rand() * 99);
  const effects = EFFECTS[archetype];
  const effect = effects[Math.floor(rand() * effects.length)];

  const rarity: Rarity =
    tokenNumber <= 3  ? 'legendary' :
    tokenNumber <= 15 ? 'rare'      :
                        'common';

  return { archetype, power, rarity, effect };
}

// Map rarity to a synthetic excessCents so computeTokenVisuals produces the right colour
// legendary uses 10,000,000_00 (logMax=7 saturates at $10M) to guarantee max visual tier
const RARITY_EXCESS: Record<Rarity, number> = {
  common:    0,
  rare:      5000_00,        // ~$5,000 → mid-red
  legendary: 10_000_000_00,  // $10,000,000 → saturates at max (near black-blue)
};

export function contentTokenExcessForRarity(rarity: Rarity): number {
  return RARITY_EXCESS[rarity];
}

export async function getNextTokenNumber(
  varietyId: number,
  db: any,
  tokensTable: any,
  eq: any,
  sql: any,
): Promise<number> {
  // pg_advisory_xact_lock serializes concurrent allocations for the same variety.
  // The lock is held until the surrounding transaction commits, so the MAX+1 read
  // and the subsequent INSERT are atomic from the perspective of other callers.
  // Callers MUST invoke this function inside db.transaction().
  await db.execute(sql`SELECT pg_advisory_xact_lock(${varietyId}::bigint)`);
  const [result] = await db
    .select({ maxNum: sql`COALESCE(MAX(${tokensTable.token_number}), 0)` })
    .from(tokensTable)
    .where(eq(tokensTable.variety_id, varietyId));
  return (result?.maxNum ?? 0) + 1;
}

export function composeTokenName(params: {
  token_type: string;
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
