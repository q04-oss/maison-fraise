import AsyncStorage from '@react-native-async-storage/async-storage';
import { isReviewMode } from './reviewMode';
import { API_BASE_URL as BASE_URL } from '../config/api';

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem('auth_token');
}

export async function setAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem('auth_token', token);
}

export async function deleteAuthToken(): Promise<void> {
  await AsyncStorage.removeItem('auth_token');
}


async function authHeader(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

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

export async function fetchOrdersByEmail() {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/orders`, { headers: auth });
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
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/gift-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ tone, variety_name, recipient_context }),
  });
  if (!res.ok) throw new Error('Failed to generate note');
  return res.json() as Promise<{ note: string }>;
}

export async function createStandingOrder(body: {
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
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/standing-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? err.detail ?? 'Failed to create standing order');
  }
  return res.json();
}

export async function fetchStandingOrders() {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/standing-orders`, { headers: auth });
  if (!res.ok) throw new Error('Failed to fetch standing orders');
  return res.json();
}

export async function updateStandingOrder(id: number, status: 'active' | 'paused') {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/standing-orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update standing order');
  return res.json();
}

export async function cancelStandingOrder(id: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/standing-orders/${id}`, {
    method: 'DELETE',
    headers: auth,
  });
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
  excess_amount_cents?: number;
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


export async function updatePushToken(push_token: string): Promise<void> {
  const auth = await authHeader();
  if (!auth['Authorization']) return; // No token, skip silently
  await fetch(`${BASE_URL}/api/auth/push-token`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ push_token }),
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
  invited_user_ids: number[];
}) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/campaign-commissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
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

export async function submitNomination(popupId: number, nomineeId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/nominations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ nominee_id: nomineeId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to submit nomination');
  }
  return res.json();
}

export async function fetchNominationStatus(popupId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/nominations/status`, { headers: auth });
  if (!res.ok) throw new Error('Failed to fetch nomination status');
  return res.json() as Promise<{ has_nominated: boolean }>;
}

export async function fetchBusinessPortraits(businessId: number) {
  const res = await fetch(`${BASE_URL}/api/businesses/${businessId}/portraits`);
  if (!res.ok) throw new Error('Failed to fetch portraits');
  return res.json() as Promise<{ id: number; url: string; season: string; subject_name?: string }[]>;
}

export async function acceptDjOffer(popupId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/dj-accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to accept offer');
  }
  return res.json();
}

export async function passDjOffer(popupId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/dj-pass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Failed to pass offer');
  return res.json();
}

export async function fetchUserPopupRsvps(userId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/users/${userId}/popup-rsvps`, { headers: auth });
  if (!res.ok) throw new Error('Failed to fetch popup RSVPs');
  return res.json();
}

export async function fetchDjGigs(userId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/users/${userId}/dj-gigs`, { headers: auth });
  if (!res.ok) throw new Error('Failed to fetch DJ gigs');
  return res.json();
}

export async function fetchDjAllocations(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/allocations`);
  if (!res.ok) throw new Error('Failed to fetch allocations');
  return res.json();
}

export async function registerAsDj(userId: number, isDj: boolean) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/users/${userId}/dj`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ is_dj: isDj }),
  });
  if (!res.ok) throw new Error('Failed to update DJ status');
  return res.json();
}

export async function fetchPopupRsvpStatus(popupId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/rsvp-status`, { headers: auth });
  if (!res.ok) throw new Error('Failed to fetch RSVP status');
  return res.json() as Promise<{ has_rsvp: boolean }>;
}

export async function createPopupRsvp(popupId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to create RSVP');
  }
  return res.json() as Promise<{ id: number; client_secret: string }>;
}

export async function checkInPopup(popupId: number, nfc_token: string) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ nfc_token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Check-in failed');
  }
  return res.json();
}

export async function submitPopupRequest(body: {
  venue_id: number;
  date: string;
  time: string;
  notes?: string;
}) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/popup-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to submit popup request');
  }
  return res.json() as Promise<{ id: number; client_secret: string }>;
}

export async function fetchContractOffer(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/contract-offer`);
  if (!res.ok) throw new Error('Failed to fetch contract offer');
  return res.json() as Promise<{
    id: number;
    status: string;
    starts_at: string;
    ends_at: string;
    note: string | null;
    business_id: number;
    business_name: string;
    business_address: string;
    business_neighbourhood: string | null;
    business_instagram: string | null;
  } | null>;
}

export async function fetchActiveContract(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/active-contract`);
  if (!res.ok) throw new Error('Failed to fetch active contract');
  return res.json() as Promise<{
    id: number;
    starts_at: string;
    ends_at: string;
    business_id: number;
    business_name: string;
    business_address: string;
  } | null>;
}

export async function acceptContract(contractId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/contracts/${contractId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to accept contract');
  }
  return res.json();
}

export async function declineContract(contractId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/contracts/${contractId}/decline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Failed to decline contract');
  return res.json();
}

export async function logMemberVisit(businessId: number, visitorUserId?: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/businesses/${businessId}/visits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ visitor_user_id: visitorUserId ?? null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to log visit');
  }
  return res.json();
}

export async function fetchBusinessPopupStats(businessId: number) {
  const res = await fetch(`${BASE_URL}/api/businesses/${businessId}/popup-stats`);
  if (!res.ok) throw new Error('Failed to fetch popup stats');
  return res.json() as Promise<{
    next_popup: {
      id: number;
      name: string;
      starts_at: string;
      ends_at: string | null;
      capacity: number | null;
      entrance_fee_cents: number | null;
      is_audition: boolean;
      neighbourhood: string | null;
      lat: number | null;
      lng: number | null;
    } | null;
    past_popup_count: number;
  }>;
}

export async function fetchBusinessVisitCount(businessId: number) {
  const res = await fetch(`${BASE_URL}/api/businesses/${businessId}/visits/count`);
  if (!res.ok) throw new Error('Failed to fetch visit count');
  return res.json() as Promise<{ visit_count: number }>;
}

export async function fetchFollowerCount(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/followers`);
  if (!res.ok) throw new Error('Failed to fetch followers');
  return res.json() as Promise<{ follower_count: number }>;
}

export async function verifyNfc(nfc_token: string) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/verify/nfc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ nfc_token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Verification failed');
  }
  return res.json();
}

export async function fetchPlacedHistory(businessId: number) {
  const res = await fetch(`${BASE_URL}/api/businesses/${businessId}/placed-history`);
  if (!res.ok) throw new Error('Failed to fetch placed history');
  return res.json() as Promise<{ user_id: number; display_name: string; starts_at: string; ends_at: string }[]>;
}

export async function createTip(businessId: number, amount_cents: number) {
  const res = await fetch(`${BASE_URL}/api/businesses/${businessId}/tip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount_cents }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to create tip');
  }
  return res.json() as Promise<{ client_secret: string }>;
}

export async function fetchPublicProfile(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/public-profile`);
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json() as Promise<{
    user_id: number;
    display_name: string;
    is_dj: boolean;
    follower_count: number;
    nomination_count: number;
    active_placement: { business_name: string; business_address: string; ends_at: string } | null;
    past_placements: number;
  }>;
}

export async function fetchLegitimacyBreakdown(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/legitimacy`);
  if (!res.ok) throw new Error('Failed to fetch legitimacy');
  return res.json() as Promise<{ total: number; breakdown: { event_type: string; total: number; count: number }[] }>;
}

export async function followUser(userId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/users/${userId}/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({}),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed to follow'); }
  return res.json();
}

export async function unfollowUser(userId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/users/${userId}/follow`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Failed to unfollow');
  return res.json();
}

export async function fetchFollowStatus(userId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/users/${userId}/follow-status`, { headers: auth });
  if (!res.ok) throw new Error('Failed to fetch follow status');
  return res.json() as Promise<{ is_following: boolean }>;
}

export async function fetchOrderHistory(userId: number, offset = 0, limit = 20) {
  const headers = await authHeader();
  const res = await fetch(`${BASE_URL}/api/users/me/orders?offset=${offset}&limit=${limit}`, {
    headers,
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json() as Promise<{
    id: number;
    variety_name: string;
    chocolate: string;
    finish: string;
    quantity: number;
    total_cents: number;
    status: string;
    slot_date: string;
    slot_time: string;
    created_at: string;
  }[]>;
}

export async function fetchActivityFeed(userId: number) {
  const headers = await authHeader();
  const res = await fetch(`${BASE_URL}/api/feed`, { headers });
  if (!res.ok) throw new Error('Failed to fetch feed');
  return res.json() as Promise<{
    type: string;
    actor_id: number;
    actor_name: string;
    subject: string;
    created_at: string;
  }[]>;
}

export async function fetchNotifications(userId: number) {
  const headers = await authHeader();
  const res = await fetch(`${BASE_URL}/api/notifications`, { headers });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json() as Promise<{
    id: number;
    type: string;
    title: string;
    body: string;
    read: boolean;
    created_at: string;
  }[]>;
}

export async function markNotificationRead(notificationId: number) {
  const headers = await authHeader();
  const res = await fetch(`${BASE_URL}/api/notifications/${notificationId}/read`, { method: 'PATCH', headers });
  if (!res.ok) throw new Error('Failed to mark read');
  return res.json();
}

export async function updateDisplayName(display_name: string): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/auth/display-name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ display_name }),
  });
}

export async function searchUsers(q: string) {
  const res = await fetch(`${BASE_URL}/api/users/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json() as Promise<{ id: number; display_name: string; is_dj: boolean; verified: boolean }[]>;
}

export async function fetchFollowing(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/following`);
  if (!res.ok) throw new Error('Failed to fetch following');
  return res.json() as Promise<{ id: number; display_name: string; is_dj: boolean }[]>;
}

export async function fetchFollowersList(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/followers-list`);
  if (!res.ok) throw new Error('Failed to fetch followers');
  return res.json() as Promise<{ id: number; display_name: string; is_dj: boolean }[]>;
}

export async function fetchNominationsGiven(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/nominations-given`);
  if (!res.ok) throw new Error('Failed to fetch nominations given');
  return res.json() as Promise<{ id: number; popup_name: string; popup_starts_at: string | null; nominee_id: number; nominee_name: string; created_at: string }[]>;
}

export async function fetchNominationsReceived(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/nominations-received`);
  if (!res.ok) throw new Error('Failed to fetch nominations received');
  return res.json() as Promise<{ id: number; popup_name: string; popup_starts_at: string | null; nominator_id: number; nominator_name: string; created_at: string }[]>;
}

export async function cancelPopupRsvp(popupId: number) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/popups/${popupId}/rsvp`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? 'Failed to cancel RSVP');
  }
  return res.json() as Promise<{ success: boolean; refunded: boolean }>;
}

export async function fetchTimeSlots(locationId: number, date: string): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/time-slots?location_id=${locationId}&date=${date}`);
  if (!r.ok) throw new Error('Failed to fetch time slots');
  return r.json();
}

export async function fetchUserPlacements(userId: number): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/users/${userId}/placements`);
  if (!r.ok) return [];
  return r.json();
}

export async function createOrderPaymentIntent(order: {
  variety_id: number;
  quantity: number;
  location_id: number;
  time_slot_id: number;
  chocolate: string;
  finish: string;
  is_gift: boolean;
  gift_note: string | null;
  customer_email: string;
}): Promise<{ client_secret: string; total_cents: number }> {
  const r = await fetch(`${BASE_URL}/api/orders/payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });
  if (!r.ok) throw new Error('payment_intent_failed');
  return r.json();
}


export async function searchAll(q: string): Promise<{ users: any[]; popups: any[]; varieties: any[] }> {
  const r = await fetch(`${BASE_URL}/api/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) return { users: [], popups: [], varieties: [] };
  return r.json();
}

export async function verifyAppleSignIn(params: {
  identityToken: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}): Promise<{ user_id: number; token: string; is_new: boolean; email?: string }> {
  const r = await fetch(`${BASE_URL}/api/auth/apple/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error('apple_auth_failed');
  return r.json();
}

export async function rateOrder(orderId: number, rating: number, note?: string): Promise<void> {
  const headers = await authHeader();
  const res = await fetch(`${BASE_URL}/api/orders/${orderId}/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ rating, note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to submit rating');
  }
}

export async function operatorLogin(code: string): Promise<{
  user_id: number; token: string; is_shop: boolean;
  business_id: number | null; display_name: string | null; fraise_chat_email: string | null;
}> {
  const r = await fetch(`${BASE_URL}/api/auth/operator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!r.ok) throw new Error('invalid_code');
  return r.json();
}

export async function demoLogin(): Promise<{ user_id: number; token: string }> {
  const r = await fetch(`${BASE_URL}/api/auth/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.EXPO_PUBLIC_DEMO_EMAIL ?? 'demo@maison-fraise.com',
      password: process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? 'demo1234',
    }),
  });
  if (!r.ok) throw new Error('demo_unavailable');
  return r.json();
}

export async function createCampaignCommissionIntent(params: {
  amount_cents: number;
  campaign_name: string;
  user_id: number;
}): Promise<{ client_secret: string }> {
  const r = await fetch(`${BASE_URL}/api/campaign-commissions/payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error('commission_intent_failed');
  return r.json();
}

export async function fetchSetupIntent(): Promise<{ client_secret: string; customer_id: string }> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/users/me/setup-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  if (!r.ok) throw new Error('setup_intent_failed');
  return r.json();
}

export async function savePaymentMethod(paymentMethodId: string): Promise<void> {
  const headers = await authHeader();
  await fetch(`${BASE_URL}/api/users/me/payment-method`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ payment_method_id: paymentMethodId }),
  });
}

export async function fetchMyReferralCode(): Promise<{ code: string; uses: number }> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/users/me/referral-code`, { headers });
  if (!r.ok) throw new Error('failed');
  return r.json();
}

export async function applyReferralCode(code: string): Promise<{ discount_percent: number }> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/users/me/apply-referral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ code }),
  });
  if (!r.ok) throw new Error('invalid_code');
  return r.json();
}

export async function fetchNotificationPrefs(): Promise<{ order_updates: boolean; social: boolean; popup_updates: boolean; marketing: boolean }> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/users/me/notification-prefs`, { headers });
  if (!r.ok) return { order_updates: true, social: true, popup_updates: true, marketing: true };
  return r.json();
}

export async function updateNotificationPrefs(prefs: { order_updates?: boolean; social?: boolean; popup_updates?: boolean; marketing?: boolean }): Promise<void> {
  const headers = await authHeader();
  await fetch(`${BASE_URL}/api/users/me/notification-prefs`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(prefs),
  });
}

// Membership
export async function fetchMyMembership(): Promise<{ membership: any | null; fund: { balance_cents: number; cycle_start: string } }> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/memberships/me`, { headers });
  if (!r.ok) return { membership: null, fund: { balance_cents: 0, cycle_start: new Date().toISOString() } };
  return r.json();
}

export async function createMembershipIntent(tier: string): Promise<{ client_secret: string; amount_cents: number }> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/memberships/payment-intent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ tier }),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fetchMembers(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/members`);
  if (!r.ok) return [];
  return r.json();
}

export async function createFundContributionIntent(toUserId: number, amount_cents: number, note?: string): Promise<{ client_secret: string }> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/fund/contribute/${toUserId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ amount_cents, note }),
  });
  if (!r.ok) throw new Error('failed');
  return r.json();
}

export async function fetchEditorialFeed(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/editorial`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchEditorialPiece(id: number): Promise<any | null> {
  const r = await fetch(`${BASE_URL}/api/editorial/${id}`);
  if (!r.ok) return null;
  return r.json();
}

export async function submitEditorialPiece(title: string, body: string): Promise<any> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/editorial`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ title, body }),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fetchMyPieces(): Promise<any[]> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/editorial/mine`, { headers });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchEditorialFeedFiltered(q?: string, tag?: string): Promise<any[]> {
  const params = new URLSearchParams();
  if (q && q.length >= 2) params.set('q', q);
  if (tag && tag !== 'all') params.set('tag', tag);
  const r = await fetch(`${BASE_URL}/api/editorial?${params.toString()}`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchFundHistory(): Promise<any[]> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/memberships/me/fund-history`, { headers });
  if (!r.ok) return [];
  return r.json();
}

export async function renewMembership(): Promise<{ client_secret: string; amount_cents: number }> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/memberships/renew`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
  });
  if (!r.ok) throw new Error('renew_failed');
  return r.json();
}

export async function joinMembershipWaitlist(tier: string, message?: string): Promise<void> {
  const headers = await authHeader();
  await fetch(`${BASE_URL}/api/memberships/waitlist`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ tier, message }),
  });
}

// NFC pairing
export async function initiateNfcPairing(): Promise<{ token: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/nfc/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'nfc_initiate_failed'); }
  return r.json();
}

export async function confirmNfcPairing(
  token: string,
  location?: string,
): Promise<{ connected: boolean; user: { id: number; display_name: string; membership_tier: string; portrait_url?: string } }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/nfc/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ token, location }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'nfc_confirm_failed'); }
  return r.json();
}

// Contacts
export async function fetchContacts(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/contacts`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

// Profile
export async function fetchProfile(userId: number): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/profiles/${userId}`);
  if (!r.ok) throw new Error('profile_not_found');
  return r.json();
}

// Portal
export async function optInToPortal(): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/portal/opt-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
}

export async function requestPortalAccess(
  ownerId: number,
  source: 'tap' | 'receipt',
): Promise<{ client_secret: string; amount_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portal/request-access/${ownerId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ source }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'portal_access_failed'); }
  return r.json();
}

export async function fetchPortalContent(userId: number): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portal/${userId}/content`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function uploadPortalContent(
  mediaUrl: string,
  type: 'photo' | 'video',
  caption?: string,
): Promise<any> {
  const auth = await authHeader();
  const storedId = await AsyncStorage.getItem('user_db_id');
  if (!storedId) throw new Error('not_logged_in');
  const r = await fetch(`${BASE_URL}/api/portal/${storedId}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ media_url: mediaUrl, type, caption }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'upload_failed'); }
  return r.json();
}

export async function fetchMySubscribers(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portal/my-subscribers`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchMyPortalAccess(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portal/my-access`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function uploadToCloudinary(base64: string, type: 'image' | 'video'): Promise<string> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ data: base64, type }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'upload_failed'); }
  const { url } = await r.json();
  return url as string;
}

export async function givePortalConsent(): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portal/consent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ confirmed: true }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'consent_failed'); }
}

export async function fetchOrderReceipt(orderId: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/orders/${orderId}/receipt`, { headers: auth });
  if (!r.ok) throw new Error('receipt_not_found');
  return r.json();
}

// ─── Token API ────────────────────────────────────────────────────────────────

export async function fetchMyTokens(): Promise<any[]> {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/tokens/mine`, { headers: auth });
  if (!res.ok) throw new Error('Failed to fetch tokens');
  return res.json();
}

export async function fetchToken(tokenId: number): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/tokens/${tokenId}`);
  if (!res.ok) throw new Error('Failed to fetch token');
  return res.json();
}

export async function fetchTokensByVariety(varietyId: number): Promise<any[]> {
  const res = await fetch(`${BASE_URL}/api/tokens/variety/${varietyId}`);
  if (!res.ok) throw new Error('Failed to fetch tokens by variety');
  return res.json();
}

export async function offerTokenTrade(
  tokenId: number,
  toUserId: number,
  note?: string,
): Promise<{ offer_id: number }> {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/tokens/offer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ token_id: tokenId, to_user_id: toUserId, note: note ?? null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to create trade offer');
  }
  return res.json();
}

export async function acceptTokenOffer(offerId: number): Promise<void> {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/tokens/offer/${offerId}/accept`, {
    method: 'POST',
    headers: auth,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to accept offer');
  }
}

export async function declineTokenOffer(offerId: number): Promise<void> {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/tokens/offer/${offerId}/decline`, {
    method: 'POST',
    headers: auth,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to decline offer');
  }
}

export async function fetchMyTokenOffers(): Promise<any[]> {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/tokens/offers/mine`, { headers: auth });
  if (!res.ok) throw new Error('Failed to fetch token offers');
  return res.json();
}

// ──────────────────────────────────────────────────────────────────────────────

export async function placeStandingOrderFromFund(
  varietyId: number,
  quantity: number,
  locationId: number,
  timeSlotId: number,
  chocolate: string,
  finish: string,
): Promise<{ ok: boolean; order_id: number; new_balance_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-orders/from-fund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ variety_id: varietyId, quantity, location_id: locationId, time_slot_id: timeSlotId, chocolate, finish }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'fund_order_failed'); }
  return r.json();
}

// ─── Greenhouse API ───────────────────────────────────────────────────────────

export async function fetchGreenhouses(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/greenhouses`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchGreenhouse(id: number): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/greenhouses/${id}`);
  if (!r.ok) throw new Error('greenhouse_not_found');
  return r.json();
}

export async function fundGreenhouse(
  id: number,
  years: 3 | 5 | 10,
): Promise<{ client_secret: string; amount_cents: number; years: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/greenhouses/${id}/fund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ years }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'fund_failed'); }
  return r.json();
}

// ─── Patronage API ────────────────────────────────────────────────────────────

export async function fetchPatronages(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/patronages`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchPatronage(id: number): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/patronages/${id}`);
  if (!r.ok) throw new Error('patronage_not_found');
  return r.json();
}

export async function claimPatronage(
  id: number,
  years: 1 | 2 | 3 | 5 | 10,
): Promise<{ client_secret: string; total_cents: number; years: number; price_per_year_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/patronages/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ years }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'claim_failed'); }
  return r.json();
}

// ─── Chocolate Location API ───────────────────────────────────────────────────

export async function fetchChocolateLocations(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/business-locations`);
  if (!r.ok) return [];
  const all: any[] = await r.json();
  return all.filter((loc: any) =>
    loc.location_type === 'house_chocolate' || loc.location_type === 'collab_chocolate',
  );
}

export async function updateVarietySortOrder(id: number, sort_order: number, adminPin: string): Promise<void> {
  const r = await fetch(`${BASE_URL}/api/admin/varieties/${id}/sort-order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Admin-PIN': adminPin },
    body: JSON.stringify({ sort_order }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'sort_order_update_failed'); }
}

export async function fundChocolateLocation(
  businessId: number,
): Promise<{ client_secret: string; amount_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/business-locations/${businessId}/fund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'fund_failed'); }
  return r.json();
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function fetchConversations(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/messages/conversations`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchThread(userId: number): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/messages/${userId}`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function sendMessage(recipientId: number, body: string): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ recipient_id: recipientId, body }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'send_failed'); }
  return r.json();
}

// ─── Beacons ──────────────────────────────────────────────────────────────────

export async function fetchBeacons(): Promise<Array<{ uuid: string; major: number; minor: number; business_id: number; business_name: string }>> {
  const r = await fetch(`${BASE_URL}/api/beacons`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchBeaconShopUser(businessId: number): Promise<{ id: number; display_name: string | null; user_code: string | null } | null> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/beacons/shop/${businessId}`, { headers: auth });
  if (!r.ok) return null;
  return r.json();
}

export async function acceptOffer(messageId: number, customerEmail: string, pushToken?: string): Promise<{ client_secret: string; payment_intent_id: string; total_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/messages/offer/${messageId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ customer_email: customerEmail, push_token: pushToken }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'accept_failed'); }
  return r.json();
}

export async function confirmOfferPayment(messageId: number): Promise<{ order_id: number; nfc_token: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/messages/offer/${messageId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'confirm_failed'); }
  return r.json();
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export interface JobPosting {
  id: number;
  title: string;
  description: string | null;
  pay_cents: number;
  pay_type: 'hourly' | 'salary';
  business_id: number;
  business_name: string | null;
}

export interface LedgerEntry {
  application_id: number;
  job_title: string;
  pay_cents: number;
  pay_type: string;
  applicant_name: string | null;
  applicant_code: string | null;
  status: string;
  employer_statement: string | null;
  candidate_statement: string | null;
  applied_at: string;
}

export async function fetchNearbyJobs(businessId: number): Promise<JobPosting[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/jobs/nearby?business_id=${businessId}`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function applyForJob(jobId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/jobs/${jobId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'apply_failed'); }
}

export async function fetchBusinessLedger(businessId: number): Promise<LedgerEntry[]> {
  const r = await fetch(`${BASE_URL}/api/jobs/ledger/${businessId}`);
  if (!r.ok) return [];
  return r.json();
}

export async function addJobStatement(applicationId: number, statement: string): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/jobs/applications/${applicationId}/statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ statement }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'statement_failed'); }
}

export async function fetchMyJobHistory(): Promise<LedgerEntry[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/jobs/my-history`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchUserJobHistory(userId: number): Promise<LedgerEntry[]> {
  const r = await fetch(`${BASE_URL}/api/jobs/history/${userId}`);
  if (!r.ok) return [];
  return r.json();
}

// ─── Collectifs ───────────────────────────────────────────────────────────────

export async function fetchCollectifs(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/collectifs`);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'fetch_failed'); }
  return r.json();
}

export async function fetchCollectif(id: number): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/collectifs/${id}`);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'fetch_failed'); }
  return r.json();
}

export async function fetchCollectifsByBusiness(businessName: string): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/collectifs`);
  if (!r.ok) return [];
  const all: any[] = await r.json();
  return all.filter((c: any) => c.business_name.toLowerCase() === businessName.toLowerCase());
}

export async function createCollectif(payload: {
  business_name: string;
  business_id?: number;
  collectif_type?: 'product' | 'popup' | 'vendor_invite' | 'product_prebuy';
  title: string;
  description?: string;
  proposed_discount_pct?: number;
  price_cents: number;
  proposed_venue?: string;
  proposed_date?: string;
  target_quantity: number;
  deadline: string;
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/collectifs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(payload),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'create_failed'); }
  return r.json();
}

export async function commitToCollectif(
  collectifId: number,
  quantity: number,
): Promise<{ client_secret: string; amount_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/collectifs/${collectifId}/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ quantity }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'commit_failed'); }
  return r.json();
}

export async function withdrawCollectif(collectifId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/collectifs/${collectifId}/commit`, {
    method: 'DELETE',
    headers: { ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'withdraw_failed'); }
}

// ─── Market ───────────────────────────────────────────────────────────────────

export async function fetchUpcomingMarkets(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/market/upcoming`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchMarket(id: number): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/market/${id}`);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'fetch_failed'); }
  return r.json();
}

export async function createMarketOrder(
  marketDateId: number,
  productId: number,
  quantity: number,
): Promise<{ client_secret: string; amount_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/${marketDateId}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ product_id: productId, quantity }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'order_failed'); }
  return r.json();
}

export async function collectMarketOrder(orderId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/orders/${orderId}/collect`, {
    method: 'PATCH',
    headers: { ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'collect_failed'); }
}

// ─── Proximity ────────────────────────────────────────────────────────────────

export async function fetchProximityContext(businessId: number): Promise<{ hasVisited: boolean; proximityMessage: string | null }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/businesses/${businessId}/proximity`, { headers: auth });
  if (!r.ok) return { hasVisited: false, proximityMessage: null };
  return r.json();
}

// ─── fraise.market ────────────────────────────────────────────────────────────

export async function fetchMarketListings(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/market/listings`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchMarketListingsForMe(healthContext: {
  active_energy_kcal: number;
  calories_consumed_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  steps: number;
}): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/listings/for-me`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(healthContext),
  });
  if (!r.ok) return [];
  return r.json();
}

export async function placeMarketOrder(
  items: Array<{ listing_id: number; quantity: number }>
): Promise<{ order_id: number; total_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ items }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed to place order'); }
  return r.json();
}

export async function fetchMyMarketOrders(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/orders/mine`, {
    headers: auth,
  });
  if (!r.ok) return [];
  return r.json();
}

export async function collectMarketOrderByNfc(
  nfc_token: string
): Promise<{ ok: boolean; order_id: number; items: any[] }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ nfc_token }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'collect failed'); }
  return r.json();
}

export async function createVendorListing(listing: {
  name: string;
  description?: string;
  category: string;
  unit_type: string;
  unit_label: string;
  price_cents: number;
  stock_quantity: number;
  tags?: string[];
  available_from: string;
  available_until: string;
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(listing),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed to create listing'); }
  return r.json();
}

export async function updateVendorListing(
  id: number,
  patch: Partial<{
    name: string;
    description: string;
    price_cents: number;
    stock_quantity: number;
    tags: string[];
    is_available: boolean;
  }>
): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/listings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(patch),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed to update listing'); }
  return r.json();
}

export async function deleteVendorListing(id: number): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/market/listings/${id}`, {
    method: 'DELETE',
    headers: auth,
  });
}
