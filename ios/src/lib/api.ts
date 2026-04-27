import * as SecureStore from 'expo-secure-store';

const API = 'https://fraise.box/api/fraise';
const TOKEN_KEY = 'fraise_member_token';

// ─── Token ────────────────────────────────────────────────────────────────────

export async function getMemberToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setMemberToken(t: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, t);
}
export async function deleteMemberToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FraiseMember {
  id?: number;
  name: string;
  email: string;
  credit_balance: number;
  credits_purchased: number;
  standing?: number;
  events_attended?: number;
  response_rate?: number | null;
  created_at?: string;
  token?: string;
}

export interface FraiseMemberPublic {
  id: number;
  name: string;
  standing: number;
  events_attended: number;
  created_at: string;
}

export interface FraiseInvitation {
  id: number;
  status: 'pending' | 'accepted' | 'declined' | 'confirmed';
  created_at: string;
  responded_at: string | null;
  event_id: number;
  title: string;
  description: string | null;
  price_cents: number;
  min_seats: number;
  max_seats: number;
  seats_claimed: number;
  event_status: string;
  event_date: string | null;
  business_name: string;
  business_slug: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const t = await getMemberToken();
  return t ? { 'x-member-token': t } : {};
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function memberLogin(email: string, password: string): Promise<FraiseMember> {
  return apiFetch('/members/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function memberSignup(name: string, email: string, password: string): Promise<FraiseMember> {
  return apiFetch('/members/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export async function fraiseAppleSignin(params: {
  identityToken: string;
  name?: string;
  email?: string;
}): Promise<FraiseMember> {
  return apiFetch('/members/apple-signin', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function fetchMe(): Promise<FraiseMember | null> {
  const headers = await authHeaders();
  if (!headers['x-member-token']) return null;
  return apiFetch('/members/me', { headers }).catch(() => null);
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function fetchInvitations(): Promise<FraiseInvitation[]> {
  const headers = await authHeaders();
  if (!headers['x-member-token']) return [];
  const data = await apiFetch('/members/invitations', { headers });
  return data.invitations ?? [];
}

export async function acceptInvitation(eventId: number): Promise<{ credit_balance: number; seats_claimed: number }> {
  const headers = await authHeaders();
  return apiFetch(`/members/invitations/${eventId}/accept`, { method: 'POST', headers });
}

export async function declineInvitation(eventId: number): Promise<{ credit_balance: number; credit_returned: boolean }> {
  const headers = await authHeaders();
  return apiFetch(`/members/invitations/${eventId}/decline`, { method: 'POST', headers });
}

// ─── Credits ──────────────────────────────────────────────────────────────────

export async function creditsCheckout(credits: number): Promise<{ client_secret: string; amount_cents: number }> {
  const headers = await authHeaders();
  return apiFetch('/members/credits/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({ credits }),
  });
}

export async function creditsConfirm(paymentIntentId: string): Promise<{ credit_balance: number }> {
  const headers = await authHeaders();
  return apiFetch('/members/credits/confirm', {
    method: 'POST',
    headers,
    body: JSON.stringify({ payment_intent_id: paymentIntentId }),
  });
}

// ─── Members directory ────────────────────────────────────────────────────────

export async function fetchMembersDirectory(): Promise<FraiseMemberPublic[]> {
  const headers = await authHeaders();
  if (!headers['x-member-token']) return [];
  const data = await apiFetch('/members/directory', { headers });
  return data.members ?? [];
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function forgotPassword(email: string): Promise<void> {
  await apiFetch('/members/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(email: string, code: string, password: string): Promise<void> {
  await apiFetch('/members/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, password }),
  });
}

// ─── Push token ───────────────────────────────────────────────────────────────

export async function updatePushToken(pushToken: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers['x-member-token']) return;
  await apiFetch('/members/push-token', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ push_token: pushToken }),
  });
}
