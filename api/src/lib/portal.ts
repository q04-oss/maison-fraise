export const PORTAL_CUT_PERCENT = 20; // Box Fraise takes 20%

export const VERIFICATION_FEE_CENTS = 11100;   // CA$111 — one-time initiation fee
export const VERIFICATION_RENEWAL_CENTS = 33300; // CA$333 — annual renewal fee

export function calculateCut(amountCents: number): { ownerCents: number; cutCents: number } {
  const cutCents = Math.round(amountCents * (PORTAL_CUT_PERCENT / 100));
  return { ownerCents: amountCents - cutCents, cutCents };
}

export function isIdentityActive(user: {
  identity_verified: boolean | null;
  identity_verified_expires_at: Date | string | null;
  verification_renewal_due_at: Date | string | null;
}): boolean {
  if (!user.identity_verified) return false;

  // Fail closed: malformed date strings produce NaN comparisons that silently bypass expiry.
  // Parse explicitly and treat invalid dates as expired.
  const toEpoch = (value: Date | string | null): number | null => {
    if (value === null) return null;
    const ts = value instanceof Date ? value.getTime() : Date.parse(value as string);
    return Number.isFinite(ts) ? ts : NaN; // NaN signals malformed
  };

  const nowMs = Date.now();
  const expiresAt = toEpoch(user.identity_verified_expires_at);
  if (expiresAt !== null && (Number.isNaN(expiresAt) || nowMs >= expiresAt)) return false;

  const renewalDue = toEpoch(user.verification_renewal_due_at);
  if (renewalDue !== null && (Number.isNaN(renewalDue) || nowMs >= renewalDue)) return false;

  return true;
}
