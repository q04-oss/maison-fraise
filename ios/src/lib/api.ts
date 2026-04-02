import { isReviewMode } from './reviewMode';
import { API_BASE_URL as BASE_URL } from '../config/api';

function reviewHeaders(): Record<string, string> {
  if (!isReviewMode()) return {};
  return { 'X-Review-Mode': process.env.EXPO_PUBLIC_REVIEW_PIN ?? '' };
}

export async function fetchVarieties() {
  const res = await fetch(`${BASE_URL}/api/varieties`);
  if (!res.ok) throw new Error('Failed to fetch varieties');
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
  const res = await fetch(`${BASE_URL}/api/standing-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? err.detail ?? 'Failed to create standing order');
  }
  return res.json() as Promise<{ id: number; client_secret: string }>;
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
  ordered_at_popup?: boolean;
}) {
  const res = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...reviewHeaders() },
    body: JSON.stringify({ ...body, gift_note: body.gift_note ?? null }),
  });
  if (!res.ok) {
    const errBody = await res.json();
    throw new Error(errBody?.error ?? errBody?.detail ?? 'Order could not be created.');
  }
  return res.json() as Promise<{ order: { id: number }; client_secret: string }>;
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

export async function signInWithApple(identity_token: string, push_token?: string | null, display_name?: string | null): Promise<{ user_db_id: number; email: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity_token, push_token: push_token ?? undefined, display_name: display_name ?? undefined }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Sign in failed');
  }
  return res.json();
}

export async function updatePushToken(user_id: number, push_token: string): Promise<void> {
  await fetch(`${BASE_URL}/api/auth/push-token`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, push_token }),
  });
}

export async function fetchHostedPopups(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/hosted-popups`);
  if (!res.ok) throw new Error('Failed to fetch hosted popups');
  return res.json() as Promise<{
    id: number;
    venue_name: string;
    date: string;
    is_audition: boolean;
    audition_status: 'pending' | 'passed' | 'failed' | null;
    nomination_count: number;
    threshold_met: boolean;
  }[]>;
}

export async function fetchNominationLeaderboard(popupId: number) {
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/nominations/leaderboard`);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json() as Promise<{ user_id: number; display_name: string; nomination_count: number }[]>;
}

export async function createCampaignCommission(body: {
  popup_id: number;
  user_id: number;
  invited_user_ids: number[];
}) {
  const res = await fetch(`${BASE_URL}/api/campaign-commissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to create commission');
  }
  return res.json() as Promise<{ id: number; client_secret: string }>;
}

export async function fetchPopupAttendees(popupId: number) {
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/attendees`);
  if (!res.ok) throw new Error('Failed to fetch attendees');
  return res.json() as Promise<{ user_id: number; display_name: string }[]>;
}

export async function submitNomination(popupId: number, nominatorId: number, nomineeId: number) {
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/nominations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nominator_id: nominatorId, nominee_id: nomineeId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to submit nomination');
  }
  return res.json();
}

export async function fetchNominationStatus(popupId: number, userId: number) {
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/nominations/status?user_id=${userId}`);
  if (!res.ok) throw new Error('Failed to fetch nomination status');
  return res.json() as Promise<{ has_nominated: boolean }>;
}

export async function fetchBusinessPortraits(businessId: number) {
  const res = await fetch(`${BASE_URL}/api/businesses/${businessId}/portraits`);
  if (!res.ok) throw new Error('Failed to fetch portraits');
  return res.json() as Promise<{ id: number; url: string; season: string; subject_name?: string }[]>;
}

export async function acceptDjOffer(popupId: number, userId: number) {
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/dj-accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to accept offer');
  }
  return res.json();
}

export async function passDjOffer(popupId: number, userId: number) {
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/dj-pass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error('Failed to pass offer');
  return res.json();
}

export async function fetchUserPopupRsvps(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/popup-rsvps`);
  if (!res.ok) throw new Error('Failed to fetch popup RSVPs');
  return res.json();
}

export async function fetchDjGigs(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/dj-gigs`);
  if (!res.ok) throw new Error('Failed to fetch DJ gigs');
  return res.json();
}

export async function fetchDjAllocations(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/allocations`);
  if (!res.ok) throw new Error('Failed to fetch allocations');
  return res.json();
}

export async function registerAsDj(userId: number, isDj: boolean) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/dj`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_dj: isDj }),
  });
  if (!res.ok) throw new Error('Failed to update DJ status');
  return res.json();
}

export async function fetchPopupRsvpStatus(popupId: number, userId: number) {
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/rsvp-status?user_id=${userId}`);
  if (!res.ok) throw new Error('Failed to fetch RSVP status');
  return res.json() as Promise<{ has_rsvp: boolean }>;
}

export async function createPopupRsvp(popupId: number, userId: number) {
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to create RSVP');
  }
  return res.json() as Promise<{ id: number; client_secret: string }>;
}

export async function checkInPopup(popupId: number, userId: number, nfc_token: string) {
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, nfc_token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Check-in failed');
  }
  return res.json();
}

export async function submitPopupRequest(body: {
  user_id: number;
  venue_id: number;
  date: string;
  time: string;
  notes?: string;
}) {
  const res = await fetch(`${BASE_URL}/api/popup-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to submit popup request');
  }
  return res.json() as Promise<{ id: number; client_secret: string }>;
}

export async function verifyNfc(nfc_token: string, user_db_id: number) {
  const res = await fetch(`${BASE_URL}/api/verify/nfc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nfc_token, user_id: user_db_id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Verification failed');
  }
  return res.json();
}
