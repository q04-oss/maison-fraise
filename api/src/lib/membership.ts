export const TIER_AMOUNTS: Record<string, number> = {
  maison:     300_000,        // $3,000
  reserve:    3_000_000,      // $30,000
  atelier:    30_000_000,     // $300,000
  fondateur:  300_000_000,    // $3,000,000
  patrimoine: 3_000_000_000,  // $30,000,000
  souverain:  30_000_000_000, // $300,000,000
  unnamed:    300_000_000_000,// $3,000,000,000
};

export const TIER_LABELS: Record<string, string> = {
  maison:     'Maison',
  reserve:    'Réserve',
  atelier:    'Atelier',
  fondateur:  'Fondateur',
  patrimoine: 'Patrimoine',
  souverain:  'Souverain',
  unnamed:    '—',
};

// Stripe max is ~$999,999 per charge for card payments
// Tiers above 'atelier' require manual/invoice payment
export const STRIPE_PAYABLE_TIERS = ['maison', 'reserve', 'atelier'];
