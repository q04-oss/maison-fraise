import { isReviewMode } from './reviewMode';

const BASE_URL = 'https://maison-fraise-v2-production.up.railway.app';

function reviewHeaders(): Record<string, string> {
  if (!isReviewMode()) return {};
  return { 'X-Review-Mode': process.env.EXPO_PUBLIC_REVIEW_PIN ?? '' };
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
}) {
  const res = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...reviewHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json();
    throw new Error(JSON.stringify(errBody));
  }
  return res.json() as Promise<{ order: { id: number }; client_secret: string }>;
}

export async function confirmOrder(orderId: number) {
  const res = await fetch(`${BASE_URL}/api/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { ...reviewHeaders() },
  });
  if (!res.ok) throw new Error('Failed to confirm order');
  return res.json();
}
