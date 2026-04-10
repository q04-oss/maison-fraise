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
  const now = new Date();
  if (user.identity_verified_expires_at && now > new Date(user.identity_verified_expires_at)) return false;
  if (user.verification_renewal_due_at && now > new Date(user.verification_renewal_due_at)) return false;
  return true;
}
