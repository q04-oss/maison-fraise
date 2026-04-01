import { isReviewMode } from './reviewMode';
import { API_BASE_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = API_BASE_URL;

function reviewHeaders(): Record<string, string> {
  if (!isReviewMode()) return {};
  return { 'X-Review-Mode': process.env.EXPO_PUBLIC_REVIEW_PIN ?? '' };
}

async function userHeaders(): Promise<Record<string, string>> {
  const userId = await AsyncStorage.getItem('user_id');
  return userId ? { 'X-User-ID': userId } : {};
}

export async function fetchVarieties() {
  const res = await fetch(`${BASE_URL}/api/varieties`);
  if (!res.ok) throw new Error('Failed to fetch varieties');
  return res.json();
}

export async function fetchLocations() {
  const res = await fetch(`${BASE_URL}/api/locations`);
  if (!res.ok) throw new Error('Failed to fetch locations');
  return res.json();
}

export async function fetchSlots(locationId: number, date: string) {
  const res = await fetch(`${BASE_URL}/api/slots?location_id=${locationId}&date=${date}`);
  if (!res.ok) throw new Error('Failed to fetch slots');
  return res.json();
}

export async function fetchOrdersByEmail(email: string) {
  const res = await fetch(`${BASE_URL}/api/orders?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export async function fetchBusinesses() {
  const res = await fetch(`${BASE_URL}/api/businesses`);
  if (!res.ok) throw new Error('Failed to fetch businesses');
  return res.json();
}

export async function fetchUserProfile(userId: string) {
  const res = await fetch(`${BASE_URL}/api/users/me`, {
    headers: { 'X-User-ID': userId },
  });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

export async function searchVerifiedUsers(q: string) {
  const res = await fetch(`${BASE_URL}/api/users/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('Failed to search users');
  return res.json();
}


export async function generateGiftNote(tone: string, variety_name: string, recipient_context: string) {
  const res = await fetch(`${BASE_URL}/api/gift-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tone, variety_name, recipient_context }),
  });
  if (!res.ok) throw new Error('Failed to generate note');
  return res.json() as Promise<{ note: string }>;
}

export async function createStandingOrder(body: {
  sender_id: number;
  recipient_id?: number;
  variety_id: number;
  chocolate: string;
  finish: string;
  quantity: number;
  location_id: number;
  time_slot_preference: string;
  frequency: string;
  next_order_date: string;
  gift_tone?: string;
}) {
  const headers = await userHeaders();
  const res = await fetch(`${BASE_URL}/api/standing-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to create standing order');
  }
  return res.json();
}

export async function fetchStandingOrders(userId: number) {
  const res = await fetch(`${BASE_URL}/api/standing-orders?user_id=${userId}`);
  if (!res.ok) throw new Error('Failed to fetch standing orders');
  return res.json();
}

export async function updateStandingOrder(id: number, status: 'active' | 'paused') {
  const res = await fetch(`${BASE_URL}/api/standing-orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update standing order');
  return res.json();
}

export async function cancelStandingOrder(id: number) {
  const res = await fetch(`${BASE_URL}/api/standing-orders/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to cancel standing order');
  return res.json();
}

export async function createOrder(body: {
  variety_id: number;
  location_id: number;
  time_slot_id: number;
  chocolate: string;
  finish: string;
  quantity: number;
  is_gift: boolean;
  customer_email: string;
  push_token?: string | null;
  gift_note?: string | null;
}) {
  const res = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...reviewHeaders() },
    body: JSON.stringify({ ...body, gift_note: body.gift_note ?? null }),
  });
  if (!res.ok) {
    const errBody = await res.json();
    throw new Error(JSON.stringify(errBody));
  }
  return res.json() as Promise<{ order: { id: number }; client_secret: string }>;
}

export async function askClaude(
  query: string,
  varieties: Array<{ id: number; name: string; price_cents: number; stock_remaining: number }>,
  businesses: Array<{ id: number; name: string; address: string; type: string }>,
): Promise<{ response: string; action: { type: string | null; variety_id: number | null; chocolate: string | null; finish: string | null; quantity: number | null } }> {
  const res = await fetch(`${BASE_URL}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      context: {
        available_varieties: varieties,
        businesses,
        user_order_history: [],
      },
    }),
  });
  if (!res.ok) throw new Error('Ask failed');
  return res.json();
}

export async function confirmOrder(orderId: number) {
  const res = await fetch(`${BASE_URL}/api/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { ...reviewHeaders() },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? body.error ?? 'Failed to confirm order');
  }
  return res.json() as Promise<{
    id: number;
    nfc_token: string | null;
    status: string;
    total_cents: number;
    variety_id: number;
    location_id: number;
    time_slot_id: number;
    chocolate: string;
    finish: string;
    quantity: number;
    user_db_id: number;
  }>;
}

export async function signInWithApple(identity_token: string): Promise<{ user_db_id: number; email: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity_token }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Sign in failed');
  }
  return res.json();
}

export async function verifyNfc(nfc_token: string, user_db_id: number) {
  const res = await fetch(`${BASE_URL}/api/verify/nfc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nfc_token, user_id: user_db_id }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Verification failed');
  }
  return res.json();
}
