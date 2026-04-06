export type SocialTier = 'standard' | 'reserve' | 'estate' | null;

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

/** Derive access tier from a live bank balance (in seconds). */
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
