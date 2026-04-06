export type SocialTier = 'standard' | 'reserve' | 'estate' | null;

const TIER_RANK: Record<string, number> = { standard: 1, reserve: 2, estate: 3 };

export function tierRank(tier: SocialTier): number {
  return TIER_RANK[tier ?? ''] ?? 0;
}

/** Effective tier = min(balance_tier, ceiling). */
export function effectiveTier(balanceTier: SocialTier, ceiling: SocialTier): SocialTier {
  if (!balanceTier || !ceiling) return null;
  return tierRank(balanceTier) <= tierRank(ceiling) ? balanceTier : ceiling;
}

export function tierMeets(tier: SocialTier, required: SocialTier): boolean {
  return tierRank(tier) >= tierRank(required);
}

const ESTATE_THRESHOLD_DAYS = 75;
const RESERVE_THRESHOLD_DAYS = 30;

/** Drain the bank: subtract real elapsed seconds from the stored snapshot. */
export function currentBankSeconds(
  bankSeconds: number,
  updatedAt: Date | null,
): number {
  if (!updatedAt) return 0;
  const elapsed = (Date.now() - updatedAt.getTime()) / 1000;
  return Math.max(0, bankSeconds - elapsed);
}

/** Derive tier purely from balance (before ceiling is applied). */
export function tierFromBalance(balanceSeconds: number): SocialTier {
  const days = balanceSeconds / 86400;
  if (days >= ESTATE_THRESHOLD_DAYS) return 'estate';
  if (days >= RESERVE_THRESHOLD_DAYS) return 'reserve';
  if (days > 0) return 'standard';
  return null;
}

export const TIER_COMMISSION_RATE: Record<string, number> = {
  estate: 0.80,
  reserve: 0.75,
  standard: 0.70,
};

export function tierCommissionRate(tier: SocialTier): number {
  return TIER_COMMISSION_RATE[tier ?? ''] ?? 0.70;
}
