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

export async function fetchMe(): Promise<{ portal_opted_in: boolean } | null> {
  const auth = await authHeader();
  if (!auth['Authorization']) return null;
  const r = await fetch(`${BASE_URL}/api/users/me`, { headers: auth });
  if (!r.ok) return null;
  return r.json();
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


export async function payOrderWithBalance(body: {
  variety_id: number;
  location_id: number;
  time_slot_id: number;
  chocolate: string;
  finish: string;
  quantity: number;
  is_gift: boolean;
  push_token?: string | null;
  gift_note?: string | null;
}) {
  const auth = await authHeader();
  const res = await fetch(`${BASE_URL}/api/orders/pay-with-balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    if (errBody?.error === 'insufficient_balance') throw new Error('insufficient_balance');
    if (errBody?.error === 'sold_out') throw new Error('sold_out');
    throw new Error(errBody?.error ?? 'Order could not be placed.');
  }
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

export async function submitAbstract(abstract: string, tag?: string | null): Promise<any> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/editorial/abstract`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ abstract, ...(tag ? { tag } : {}) }),
  });
  if (!r.ok) { const e = await r.json(); throw { status: r.status, ...(e) }; }
  return r.json();
}

export async function submitFullPiece(pieceId: number, title: string, body: string): Promise<any> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/editorial/${pieceId}/write`, {
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
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'fetch_failed'); }
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

export async function fetchMyPortalContent(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portal/my-content`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchIdentitySession(): Promise<{
  already_verified: boolean;
  verification_renewal_due_at?: string | null;
  identity_verified_expires_at?: string | null;
  renewal_overdue?: boolean;
  renewal_amount_cents?: number;
  fee_paid?: boolean;
  fee_client_secret?: string;
  fee_amount_cents?: number;
  identity_expired?: boolean;
  attestation_expired?: boolean;
  session?: { verificationSessionId: string; ephemeralKeySecret: string } | null;
}> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portal/identity-session`, { headers: auth });
  if (!r.ok) return { already_verified: false };
  return r.json();
}

export async function renewVerification(): Promise<{ client_secret: string; amount_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portal/renew-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'renewal_failed'); }
  return r.json();
}

export async function startIdentityVerification(userCode: string): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portal/start-identity-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ user_code: userCode, confirmed: true }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'verification_start_failed'); }
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

export async function updateVarietyTier(
  id: number,
  social_tier: 'standard' | 'reserve' | 'estate',
  time_credits_days: number,
): Promise<void> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/admin/varieties/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ social_tier, time_credits_days }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'update_failed'); }
}

export async function autoAssignVarietyTiers(): Promise<{ assigned: number; breakdown: Record<string, number> }> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/admin/varieties/assign-tiers`, {
    method: 'POST',
    headers,
  });
  if (!r.ok) throw new Error('assign_failed');
  return r.json();
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

export async function createMarketDate(
  adminPin: string,
  data: { name: string; location: string; address: string; starts_at: string; ends_at: string; notes?: string },
): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/admin/market-dates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-PIN': adminPin },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'create_failed'); }
  return r.json();
}

export async function fetchMyMarketOrders(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/my-orders`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchMyVendorStalls(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/my-stall`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function createVendorStall(data: { market_date_id: number; vendor_name: string; description?: string }): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/stalls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'create_failed'); }
  return r.json();
}

export async function addStallProduct(stallId: number, data: { name: string; description?: string; price_cents: number; unit: string; stock_quantity?: number | null }): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/stalls/${stallId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'add_failed'); }
  return r.json();
}

export async function deleteStallProduct(productId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/products/${productId}`, {
    method: 'DELETE',
    headers: { ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'delete_failed'); }
}

export async function generateVentureAiPost(ventureId: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ventures/${ventureId}/ai-post`, {
    method: 'POST',
    headers: { ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'generation_failed'); }
  return r.json();
}

// ─── Proximity ────────────────────────────────────────────────────────────────

export async function fetchProximityContext(businessId: number): Promise<{ hasVisited: boolean; proximityMessage: string | null }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/businesses/${businessId}/proximity`, { headers: auth });
  if (!r.ok) return { hasVisited: false, proximityMessage: null };
  return r.json();
}

// ─── Content tokens ────────────────────────────────────────────────────────────

export async function fetchMyContentTokens(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/content-tokens/mine`, { headers: auth });
  if (!r.ok) throw new Error('failed_to_fetch_content_tokens');
  return r.json();
}

export async function fetchContentToken(id: number): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/content-tokens/${id}`);
  if (!r.ok) throw new Error('failed_to_fetch_content_token');
  return r.json();
}

export async function fetchMyContentTokenOffers(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/content-tokens/offers/mine`, { headers: auth });
  if (!r.ok) throw new Error('failed_to_fetch_offers');
  return r.json();
}

export async function offerContentTokenTrade(
  tokenId: number,
  toUserId: number,
  note?: string,
): Promise<{ offer_id: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/content-tokens/offer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ token_id: tokenId, to_user_id: toUserId, note }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'offer_failed'); }
  return r.json();
}

export async function acceptContentTokenOffer(offerId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/content-tokens/offer/${offerId}/accept`, {
    method: 'POST', headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'accept_failed'); }
}

export async function declineContentTokenOffer(offerId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/content-tokens/offer/${offerId}/decline`, {
    method: 'POST', headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'decline_failed'); }
}

export async function requestContentTokenPrint(
  tokenId: number,
  shippingAddress: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    province: string;
    postal_code: string;
    country: string;
  },
): Promise<{ ok: boolean; print_status: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/content-tokens/${tokenId}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ shipping_address: shippingAddress }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'print_request_failed'); }
  return r.json();
}

// ─── Tournaments ────────────────────────────────────────────────────────────────

export async function fetchTournaments(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/tournaments`);
  if (!r.ok) throw new Error('failed_to_fetch_tournaments');
  return r.json();
}

export async function fetchTournament(id: number): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/tournaments/${id}`);
  if (!r.ok) throw new Error('failed_to_fetch_tournament');
  return r.json();
}

export async function enterTournament(
  id: number,
): Promise<{ entry_id: number; client_secret: string; amount_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments/${id}/enter`, {
    method: 'POST', headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'enter_failed'); }
  return r.json();
}

export async function advanceTournamentStatus(
  tournamentId: number,
  status: 'in_progress' | 'closed',
): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments/${tournamentId}/status`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'status_update_failed'); }
}

export async function fetchMyTournamentEntry(tournamentId: number): Promise<{ entered: boolean }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments/${tournamentId}/entry`, { headers: auth });
  if (!r.ok) return { entered: false };
  return r.json();
}

export async function fetchMyDeck(tournamentId: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments/${tournamentId}/deck`, { headers: auth });
  if (!r.ok) throw new Error('failed_to_fetch_deck');
  return r.json();
}

export async function registerDeck(tournamentId: number, contentTokenIds: number[]): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments/${tournamentId}/deck`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_token_ids: contentTokenIds }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'register_deck_failed'); }
}

export async function recordCardPlay(tournamentId: number, contentTokenId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments/${tournamentId}/play`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_token_id: contentTokenId }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'play_failed'); }
}

export async function fetchCreatorEarnings(): Promise<{
  earnings: any[];
  total_cents: number;
  pending_cents: number;
}> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments/earnings/me`, { headers: auth });
  if (!r.ok) throw new Error('failed_to_fetch_earnings');
  return r.json();
}


export async function fetchAdminVarieties(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/admin/varieties`);
  if (!r.ok) throw new Error('failed_to_fetch_varieties');
  return r.json();
}

export async function fetchMyTournaments(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments/mine`, { headers: auth });
  if (!r.ok) throw new Error('failed');
  return r.json();
}

export async function createTournament(body: {
  name: string;
  description?: string;
  entry_fee_cents: number;
  max_entries?: number;
  starts_at?: string;
  ends_at?: string;
  platform_cut_bps?: number;
  creator_play_pool_bps?: number;
  creator_win_bonus_bps?: number;
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'create_failed'); }
  return r.json();
}

export async function declareWinner(tournamentId: number, winner_user_id: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments/${tournamentId}/winner`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner_user_id }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'declare_failed'); }
  return r.json();
}

export async function requestEarningsPayout(): Promise<{ ok: boolean; request: any }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tournaments/earnings/payout`, {
    method: 'POST',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'payout_failed'); }
  return r.json();
}

export async function giftContentToken(tokenId: number, toUserId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/content-tokens/${tokenId}/gift`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_user_id: toUserId }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'gift_failed'); }
}

export async function fetchVentures(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/ventures`);
  if (!r.ok) throw new Error('failed_to_fetch_ventures');
  return r.json();
}

export async function fetchMyVentures(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ventures/mine`, { headers: auth });
  if (!r.ok) throw new Error('failed_to_fetch_ventures');
  return r.json();
}

export async function fetchVenture(id: number): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/ventures/${id}`);
  if (!r.ok) throw new Error('failed_to_fetch_venture');
  return r.json();
}

export async function createVenture(body: {
  name: string;
  description?: string;
  ceo_type: 'human' | 'dorotka';
  revenue_splits?: { user_id: number; share_bps: number }[];
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ventures`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'create_failed'); }
  return r.json();
}

export async function joinVenture(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ventures/${id}/join`, {
    method: 'POST',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'join_failed'); }
}

export async function postVentureUpdate(id: number, body: string): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ventures/${id}/posts`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'post_failed'); }
  return r.json();
}

export async function leaveVenture(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ventures/${id}/leave`, {
    method: 'POST',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'leave_failed'); }
}

export async function closeVenture(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ventures/${id}/close`, {
    method: 'PATCH',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'close_failed'); }
}

export async function removeVentureMember(ventureId: number, userId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ventures/${ventureId}/members/${userId}`, {
    method: 'DELETE',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'remove_failed'); }
}

export async function changeVentureMemberRole(ventureId: number, userId: number, role: 'worker' | 'contractor'): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ventures/${ventureId}/members/${userId}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'role_change_failed'); }
}

export async function fetchVentureContracts(ventureId: number): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ventures/${ventureId}/contracts`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchDorotkaVentures(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/ventures/dorotka`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchPayoutBalance(): Promise<{ available_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/payouts/balance`, { headers: auth });
  if (!r.ok) return { available_cents: 0 };
  return r.json();
}

export async function fetchPayoutHistory(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/payouts/history`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchConnectStatus(): Promise<{ status: 'not_connected' | 'pending' | 'active' }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/payouts/connect/status`, { headers: auth });
  if (!r.ok) return { status: 'not_connected' };
  return r.json();
}

export async function createConnectLink(): Promise<{ url: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/payouts/connect`, {
    method: 'POST',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'connect_failed'); }
  return r.json();
}

export async function refreshConnectLink(): Promise<{ url: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/payouts/connect/refresh`, {
    method: 'POST',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'refresh_failed'); }
  return r.json();
}

export async function requestPayout(): Promise<{ ok: boolean; transferred_cents: number; transfer_id: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/payouts/payout`, {
    method: 'POST',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'payout_failed'); }
  return r.json();
}

// ─── Ad network ───────────────────────────────────────────────────────────────

export async function fetchAdConnectStatus(): Promise<{ has_account: boolean; onboarded: boolean }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/connect/status`, { headers: auth });
  if (!r.ok) throw new Error('failed');
  return r.json();
}

export async function createAdConnectOnboarding(): Promise<{ url: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/connect/onboard`, { method: 'POST', headers: auth });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fetchAdCampaigns(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/campaigns`, { headers: auth });
  if (!r.ok) throw new Error('failed');
  return r.json();
}

export async function createAdCampaign(body: { title: string; body: string; type: string; value_cents: number }): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function toggleAdCampaign(id: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/campaigns/${id}/toggle`, { method: 'PATCH', headers: auth });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fundAdCampaign(id: number, amount_cents: number): Promise<{ client_secret: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/campaigns/${id}/fund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ amount_cents }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fetchAvailableAds(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/available`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchProximityAdCampaign(businessId: number): Promise<any | null> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/proximity/${businessId}`, { headers: auth });
  if (!r.ok) return null;
  return r.json();
}

export async function createAdImpression(campaign_id: number): Promise<{ impression_id: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/impressions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ campaign_id }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function respondToAdImpression(impressionId: number, accepted: boolean): Promise<{ ok: boolean; new_balance_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/impressions/${impressionId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ accepted }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fetchAdBalance(): Promise<{ ad_balance_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ads/balance`, { headers: auth });
  if (!r.ok) throw new Error('failed');
  return r.json();
}

export async function initiateToiletVisit(business_id: number, payment_method: 'stripe' | 'ad_balance'): Promise<{ visit_id: number; client_secret?: string; access_code?: string; fee_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/toilets/visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ business_id, payment_method }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function initiatePersonalToiletVisit(personal_toilet_id: number, payment_method: 'stripe' | 'ad_balance'): Promise<{ visit_id: number; client_secret?: string; access_code?: string; fee_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/toilets/personal-visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ personal_toilet_id, payment_method }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function upsertPersonalToilet(data: { title: string; description?: string; price_cents: number; address: string; lat?: number; lng?: number; instagram_handle?: string }): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/toilets/personal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function togglePersonalToilet(): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/toilets/personal/toggle`, { method: 'PATCH', headers: auth });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fetchMyPersonalToilet(): Promise<any | null> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/toilets/personal/mine`, { headers: auth });
  if (!r.ok) return null;
  return r.json();
}

export async function fetchPersonalToilets(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/toilets/personal`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchPersonalToiletReviews(id: number): Promise<{ avg_rating: number | null; review_count: number; reviews: any[] }> {
  const r = await fetch(`${BASE_URL}/api/toilets/personal/${id}/reviews`);
  if (!r.ok) return { avg_rating: null, review_count: 0, reviews: [] };
  return r.json();
}

export async function confirmToiletVisit(visit_id: number): Promise<{ access_code: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/toilets/visits/${visit_id}/confirm`, { method: 'POST', headers: auth });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function submitToiletReview(visit_id: number, rating: number, note?: string): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/toilets/visits/${visit_id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ rating, note }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
}

export async function fetchToiletReviews(businessId: number): Promise<{ avg_rating: number | null; review_count: number; reviews: any[] }> {
  const r = await fetch(`${BASE_URL}/api/toilets/reviews/${businessId}`);
  if (!r.ok) return { avg_rating: null, review_count: 0, reviews: [] };
  return r.json();
}

// ─── Health profile ───────────────────────────────────────────────────────────

export async function fetchHealthProfile(): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/health-profile`, { headers: auth });
  if (!r.ok) return null;
  return r.json();
}

export async function updateHealthProfile(data: {
  dietary_restrictions?: string[];
  allergens?: Record<string, boolean>;
  biometric_markers?: Record<string, number>;
  flavor_profile?: Record<string, number>;
  caloric_needs?: number;
  dorotka_note?: string;
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/health-profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('Failed to update health profile');
  return r.json();
}

// ─── Itineraries ──────────────────────────────────────────────────────────────

export async function fetchItineraries(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/itineraries`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function createItinerary(data: { title: string; description?: string }): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/itineraries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fetchItineraryDetail(id: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/itineraries/${id}`, { headers: auth });
  if (!r.ok) return null;
  return r.json();
}

export async function updateItinerary(id: number, data: { title?: string; description?: string; status?: string }): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/itineraries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('failed');
  return r.json();
}

export async function deleteItinerary(id: number): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/itineraries/${id}`, { method: 'DELETE', headers: auth });
}

export async function addDestination(itineraryId: number, data: {
  place_name: string; city: string; country: string;
  lat?: number; lng?: number; arrival_date?: string; departure_date?: string; notes?: string; business_id?: number;
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/itineraries/${itineraryId}/destinations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function removeDestination(itineraryId: number, destId: number): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/itineraries/${itineraryId}/destinations/${destId}`, { method: 'DELETE', headers: auth });
}

export async function fetchMyProposals(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/itineraries/proposals/mine`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function respondToProposal(id: number, accept: boolean): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/itineraries/proposals/${id}/${accept ? 'accept' : 'decline'}`, {
    method: 'PATCH', headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

// ─── Personalized menus ───────────────────────────────────────────────────────

export async function generatePersonalizedMenu(business_id: number, party_user_ids?: number[]): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/menus/personalized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ business_id, party_user_ids }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fetchLatestPersonalizedMenu(business_id: number): Promise<any | null> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/menus/personalized/latest?business_id=${business_id}`, { headers: auth });
  if (!r.ok) return null;
  return r.json();
}

// ─── Business menu items ──────────────────────────────────────────────────────

export async function fetchBusinessMenuItems(businessId: number): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/menu-items/${businessId}`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchMyMenuItems(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/menu-items/my`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchMenuRecommendations(businessId: number): Promise<{ items: any[]; recommended: any[] }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/menu-items/${businessId}/recommend`, { headers: auth });
  if (!r.ok) return { items: [], recommended: [] };
  return r.json();
}

export async function createMenuItem(body: {
  name: string; description?: string; price_cents?: number;
  category: string; allergens?: Record<string, boolean>; tags?: string[]; sort_order?: number;
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/menu-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function updateMenuItem(id: number, patch: Record<string, any>): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/menu-items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(patch),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function deleteMenuItem(id: number): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/menu-items/${id}`, { method: 'DELETE', headers: auth });
}

// ─── Reservation offers ───────────────────────────────────────────────────────

export async function fetchReservationOffers(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/reservation-offers`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchMyReservationOffers(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/reservation-offers/mine`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function createReservationOffer(body: {
  title: string; description?: string; mode: string; value_cents: number;
  drink_description?: string; reservation_date?: string; reservation_time?: string; slots_total?: number;
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/reservation-offers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function updateReservationOffer(id: number, patch: Record<string, any>): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/reservation-offers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(patch),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function joinReservationOffer(offerId: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/reservation-offers/${offerId}/join`, {
    method: 'POST', headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

// ─── Reservation bookings ─────────────────────────────────────────────────────

export async function fetchMyReservationBookings(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/reservation-offers/bookings/mine`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function inviteToBooking(bookingId: number, guestUserId: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/reservation-offers/bookings/${bookingId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ guest_user_id: guestUserId }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function respondToBookingInvite(bookingId: number, accept: boolean): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/reservation-offers/bookings/${bookingId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ accept }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

// ─── Portrait tokens ──────────────────────────────────────────────────────────

export async function fetchMyPortraitTokens(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-tokens/mine`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchPortraitTokenDetail(id: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-tokens/${id}`, { headers: auth });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fetchAvailablePortraitTokens(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-tokens/available`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function updatePortraitToken(id: number, patch: { open_to_licensing?: boolean; handle_visible?: boolean }): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-tokens/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(patch),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function listPortraitToken(id: number, asking_price_cents: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-tokens/${id}/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ asking_price_cents }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function delistPortraitToken(id: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-tokens/${id}/list`, {
    method: 'DELETE',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function buyPortraitTokenListing(listingId: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-tokens/listings/${listingId}/buy`, {
    method: 'POST',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

// ─── Portrait licenses ────────────────────────────────────────────────────────

export async function createPortraitLicenseRequest(body: {
  token_id: number;
  scope: string;
  duration_months: number;
  business_contributions: Array<{ id: number | null; contribution_cents: number }>;
  handle_visible?: boolean;
  message?: string;
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-licenses/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function fetchIncomingLicenseRequests(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-licenses/incoming`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchSentLicenseRequests(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-licenses/sent`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function acceptLicenseRequest(id: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-licenses/${id}/accept`, {
    method: 'PATCH',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function declineLicenseRequest(id: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/portrait-licenses/${id}/decline`, {
    method: 'PATCH',
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function acceptDinnerInvite(messageId: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/messages/dinner-invite/${messageId}/accept`, {
    method: 'POST', headers: auth,
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'accept failed');
  return r.json();
}

export async function declineDinnerInvite(messageId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/messages/dinner-invite/${messageId}/decline`, {
    method: 'POST', headers: auth,
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'decline failed');
}

export async function confirmEveningToken(bookingId: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/evening-tokens/${bookingId}/confirm`, {
    method: 'POST', headers: auth,
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'confirm failed');
  return r.json();
}

export async function fetchEveningTokens(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/evening-tokens/mine`, { headers: auth });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchBusinessSocial(businessId: number): Promise<{ evening_count: number; portrait_license_count: number; has_menu: boolean; recent_evening_at: string | null }> {
  const r = await fetch(`${BASE_URL}/api/businesses/${businessId}/social`);
  if (!r.ok) return { evening_count: 0, portrait_license_count: 0, has_menu: false, recent_evening_at: null };
  return r.json();
}

export async function fetchDiscovery(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/discovery`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchPortraitFeed(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/portrait-tokens/feed`);
  if (!r.ok) return [];
  return r.json();
}

export async function recordPortraitView(tokenId: number): Promise<void> {
  const auth = await authHeader();
  fetch(`${BASE_URL}/api/portrait-tokens/${tokenId}/view`, { method: 'POST', headers: auth }).catch(() => {});
}

export async function fetchMyStats(): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/users/me/stats`, { headers: auth });
  if (!r.ok) return null;
  return r.json();
}

export async function fetchGreenhouseDetail(id: number): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/greenhouses/${id}`);
  if (!r.ok) throw new Error('not found');
  return r.json();
}

export async function payStandingOrderFromBalance(standingOrderId: number): Promise<{ ok: boolean; order_id: number; next_order_date: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-orders/${standingOrderId}/pay-from-balance`, {
    method: 'POST', headers: auth,
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'payment failed');
  return r.json();
}

export async function sendGift(recipientId: number, params: {
  variety_id: number; chocolate: string; finish: string; quantity: number;
  time_slot_id: number; location_id: number;
}): Promise<{ message_id: number; client_secret: string; total_cents: number }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/messages/gift`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: recipientId, ...params }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'gift failed');
  return r.json();
}

export async function confirmGift(messageId: number): Promise<{ ok: boolean; nfc_token: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/messages/gift/${messageId}/confirm`, {
    method: 'POST', headers: auth,
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'confirm failed');
  return r.json();
}

export async function fetchMenuRecommendation(
  businessId: number,
  healthContext: {
    active_energy_kcal: number;
    calories_consumed_kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    sugar_g: number;
    fiber_g: number;
    steps: number;
  },
): Promise<Array<{
  id: number;
  name: string;
  description: string | null;
  category: string;
  price_cents: number | null;
  tags: string[];
  score: number;
  reason: string;
}>> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/menu-recommendation/${businessId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(healthContext),
  });
  if (!r.ok) return [];
  return r.json();
}

export async function setBusinessBeacon(beaconUuid: string): Promise<{ ok: boolean }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/menu-recommendation/beacon`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ beacon_uuid: beaconUuid }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'failed to set beacon');
  return r.json();
}

// ─── Shop menu management (menu-recommendation items) ────────────────────────

export async function fetchMenuItems(businessId: number): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/menu-recommendation/items/${businessId}`);
  if (!r.ok) return [];
  return r.json();
}

export async function createMenuItemForShop(item: {
  name: string; description?: string; price_cents?: number;
  category: string; tags?: string[]; allergens?: Record<string, boolean>; sort_order?: number;
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/menu-recommendation/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(item),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function updateMenuItemForShop(itemId: number, patch: {
  name?: string; description?: string; price_cents?: number;
  category?: string; tags?: string[]; allergens?: Record<string, boolean>;
  is_available?: boolean; sort_order?: number;
}): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/menu-recommendation/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(patch),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'failed'); }
  return r.json();
}

export async function deleteMenuItemForShop(itemId: number): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/menu-recommendation/items/${itemId}`, {
    method: 'DELETE',
    headers: auth,
  });
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

export async function collectMarketOrderByNfc(
  nfc_token: string
): Promise<{
  ok: boolean;
  order_id: number;
  items: any[];
  vendor_info?: {
    vendor_name: string;
    vendor_description: string | null;
    instagram_handle: string | null;
    listing_name: string;
    tags: string[];
  } | null;
}> {
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

// ─── AR box ───────────────────────────────────────────────────────────────────

export async function verifyNfcReorder(nfc_token: string): Promise<{
  variety_id: number;
  variety_name: string | null;
  farm: string | null;
  harvest_date: string | null;
  chocolate: string;
  finish: string;
  quantity: number;
  location_id: number | null;
  collectif_pickups_today?: number;
  is_gift?: boolean;
  gift_note?: string | null;
  order_count?: number;
  last_variety?: { id: number; name: string; farm: string; harvest_date: string } | null;
  next_standing_order?: { variety_name: string; days_until: number } | null;
  collectif_member_names?: string[];
}> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/verify/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ nfc_token }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'reorder_failed'); }
  return r.json();
}

export async function fetchVarietyById(id: number): Promise<any> {
  const r = await fetch(`${BASE_URL}/api/varieties`);
  if (!r.ok) return null;
  const list: any[] = await r.json();
  return list.find((v: any) => v.id === id) ?? null;
}

// ─── Staff API ────────────────────────────────────────────────────────────────

export async function fetchStaffOrders(pin: string, date: string): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/staff/orders?date=${date}`, {
    headers: { 'x-staff-pin': pin, ...auth },
  });
  if (r.status === 403) throw new Error('staff_auth_failed');
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function staffMarkPrepare(pin: string, id: number): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/staff/orders/${id}/prepare`, {
    method: 'POST', headers: { 'x-staff-pin': pin, ...auth },
  });
}

export async function staffMarkReady(pin: string, id: number): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/staff/orders/${id}/ready`, {
    method: 'POST', headers: { 'x-staff-pin': pin, ...auth },
  });
}

export async function staffFlagOrder(pin: string, id: number, note: string): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/staff/orders/${id}/flag`, {
    method: 'POST', headers: { 'x-staff-pin': pin, 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ note }),
  });
}

// ─── Vendor onboarding API ────────────────────────────────────────────────────

export async function fetchMyVendorProfile(): Promise<any | null> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/vendors/me`, { headers: auth });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function registerAsVendor(data: { name: string; description?: string; instagram_handle?: string }): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/vendors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'registration_failed'); }
  return r.json();
}

// ─── AR expanded features ─────────────────────────────────────────────────────

// Feature E: fetch order by NFC token for staff AR
export async function fetchStaffOrderByNfc(nfc_token: string): Promise<any> {
  const auth = await authHeader();
  const pin = await AsyncStorage.getItem('staff_pin') ?? '';
  const r = await fetch(`${BASE_URL}/api/staff/order-by-nfc?nfc_token=${encodeURIComponent(nfc_token)}`, {
    headers: { 'x-staff-pin': pin, ...auth },
  });
  if (r.status === 403) throw new Error('staff_auth_failed');
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'fetch_failed'); }
  return r.json();
}

// Feature F: fetch market stall AR data by vendor id
export async function fetchMarketStallAR(stallId: string): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/market/stalls/${encodeURIComponent(stallId)}/ar`, {
    headers: auth,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'fetch_failed'); }
  return r.json();
}

// Standing order renewal
export async function fetchRenewalStatus(): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-orders/renewal-status`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function renewStandingOrder(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-orders/${id}/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'renew_failed'); }
}

export async function giftStandingOrder(body: { recipient_email: string; note?: string }): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-orders/gift`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'gift_failed'); }
}

// Waitlist
export async function fetchWaitlistPosition(): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-order-waitlist/position`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function joinWaitlist(referral_code?: string): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-order-waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ referral_code }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'join_failed'); }
  return r.json();
}

export async function claimWaitlistSlot(): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-order-waitlist/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'claim_failed'); }
}

// Transfers
export async function fetchIncomingTransfers(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-order-transfers/incoming`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function acceptTransfer(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-order-transfers/${id}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'accept_failed'); }
}

export async function cancelTransfer(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/standing-order-transfers/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'cancel_failed'); }
}

// Drops
export async function fetchDrops(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/drops`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function claimDrop(id: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/drops/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'claim_failed'); }
  return r.json();
}

export async function joinDropWaitlist(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/drops/${id}/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'join_failed'); }
}

export async function leaveDropWaitlist(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/drops/${id}/waitlist`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'leave_failed'); }
}

// Pre-orders
export async function fetchPreorders(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/preorders`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function createPreorder(variety_id: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/preorders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ variety_id }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'create_failed'); }
  return r.json();
}

export async function cancelPreorder(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/preorders/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'cancel_failed'); }
}

// Bundles
export async function fetchBundles(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/bundles`);
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function orderBundle(bundle_id: number): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/bundles/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ bundle_id }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'order_failed'); }
  return r.json();
}

// Corporate
export async function fetchCorporateAccount(): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/corporate/me`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function fetchCorporateMembers(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/corporate/members`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function createCorporateAccount(name: string): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/corporate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'create_failed'); }
  return r.json();
}

export async function inviteCorporateMember(user_code: string): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/corporate/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ user_code }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'invite_failed'); }
}

export async function removeCorporateMember(targetUserId: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/corporate/members/${targetUserId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'remove_failed'); }
}

// Referrals
export async function fetchReferralCode(): Promise<{ code: string }> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/referrals/my-code`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

// Collectif leaderboard
export async function fetchCollectifLeaderboard(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/collectifs/leaderboard`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

// Farm visits
export async function fetchFarmVisits(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/farm-visits`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function bookFarmVisit(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/farm-visits/${id}/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'book_failed'); }
}

export async function cancelFarmVisitBooking(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/farm-visits/${id}/book`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'cancel_failed'); }
}

// Variety passport
export async function fetchVarietyPassport(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/varieties/passport`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

// Seasons
export async function fetchSeasons(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/seasons`);
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

// Supplier harvest logs
export async function fetchHarvestLogs(): Promise<any[]> {
  const auth = await authHeader();
  const pin = await AsyncStorage.getItem('supplier_pin') ?? '';
  const r = await fetch(`${BASE_URL}/api/supplier/harvests`, {
    headers: { 'x-supplier-pin': pin, ...auth },
  });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function createHarvestLog(body: { variety_id: number; kg_harvested: number; notes?: string }): Promise<any> {
  const auth = await authHeader();
  const pin = await AsyncStorage.getItem('supplier_pin') ?? '';
  const r = await fetch(`${BASE_URL}/api/supplier/harvests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-supplier-pin': pin, ...auth },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'create_failed'); }
  return r.json();
}

export async function deleteHarvestLog(id: number): Promise<void> {
  const auth = await authHeader();
  const pin = await AsyncStorage.getItem('supplier_pin') ?? '';
  const r = await fetch(`${BASE_URL}/api/supplier/harvests/${id}`, {
    method: 'DELETE',
    headers: { 'x-supplier-pin': pin, ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'delete_failed'); }
}

// fraise.chat inbox
export async function fetchFraiseMessages(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/fraise-chat/messages`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function markMessageRead(id: number): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/fraise-chat/messages/${id}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
}

export async function deleteFraiseMessage(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/fraise-chat/messages/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'delete_failed'); }
}

// Webhooks
export async function fetchWebhooks(): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/webhooks`, { headers: auth });
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

export async function createWebhook(body: { url: string; events: string[] }): Promise<any> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'create_failed'); }
  return r.json();
}

export async function deleteWebhook(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/webhooks/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'delete_failed'); }
}

export async function testWebhook(id: number): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/webhooks/${id}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'test_failed'); }
}

// Social proof stats
export async function fetchTodayStats(): Promise<{ pickups_today: number; active_locations: number; varieties_today: number }> {
  const r = await fetch(`${BASE_URL}/api/stats/today`);
  if (!r.ok) throw new Error('fetch_failed');
  return r.json();
}

// AR Expanded: variety profile (flavor wheel, pairing, farm distance, tasting notes)
export async function fetchVarietyProfile(varietyId: number): Promise<any | null> {
  const r = await fetch(`${BASE_URL}/api/variety-profiles/${varietyId}`);
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

// AR Expanded: active drop for a variety
export async function fetchActiveDropForVariety(varietyId: number): Promise<{ id: number; title: string; price_cents: number; remaining: number } | null> {
  const r = await fetch(`${BASE_URL}/api/drops/active-for-variety/${varietyId}`);
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

// AR Expanded: bulk prepare orders (staff batch scan)
export async function bulkPrepareOrders(orderIds: number[], pin: string): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/staff/orders/bulk-prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ order_ids: orderIds, pin }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'bulk_prepare_failed'); }
}

// AR Expanded 3: user's scanned varieties with farm coordinates
export async function fetchMyScannedVarieties(): Promise<Array<{ variety_id: number; variety_name: string; farm_lat: number | null; farm_lng: number | null }>> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/variety-map/my-scanned`, { headers: auth });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}

// AR Expanded 3: user's collectif rank
export async function fetchCollectifRank(): Promise<{ rank: number; total_members: number } | null> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/collectifs/my-rank`, { headers: auth });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

// AR Expanded 3: pickup grid for staff
export async function fetchPickupGrid(): Promise<Array<{ slot_time: string; total: number; paid: number; preparing: number; ready: number }>> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/pickup-grid/today`, { headers: auth });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}

// AR Expanded 3: save tasting journal rating
export async function saveTastingRating(varietyId: number, rating: number, notes: string | null): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tasting-journal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ variety_id: varietyId, rating, notes }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'save_failed'); }
}

// AR Expanded 4: nearby AR sticky notes
export async function fetchNearbyArNotes(lat: number, lng: number): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ar-notes/nearby?lat=${lat}&lng=${lng}`, { headers: auth });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}

// AR Expanded 4: post an AR sticky note
export async function postArNote(lat: number, lng: number, body: string, color: string): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ar-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ lat, lng, body, color }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'post_failed'); }
}

// AR Expanded 4: open farm visits for a farm (by name fragment)
export async function fetchOpenFarmVisits(farmName: string): Promise<any[]> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/farm-visits/open-for-farm?farm_name=${encodeURIComponent(farmName)}`, { headers: auth });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}

// AR Expanded 4: staff quantity confirm
export async function confirmOrderQuantity(orderId: number, counted: number, pin: string): Promise<void> {
  const auth = await authHeader();
  const r = await fetch(`${BASE_URL}/api/staff/orders/${orderId}/quantity-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ counted, pin }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? 'confirm_failed'); }
}

// AR Expanded 4: compute unlocked achievements from scan data (client-side)
export function computeUnlockedAchievements(params: {
  orderCount: number;
  varietyId: number;
  farmName: string | null;
  isWinterVariety: boolean;
  streakWeeks: number;
  seenFarms: string[];
}): string[] {
  const { orderCount, isWinterVariety, streakWeeks, seenFarms } = params;
  const unlocked: string[] = [];
  const milestones: Array<[number, string]> = [[10,'order_10'],[25,'order_25'],[50,'order_50']];
  for (const [threshold, id] of milestones) {
    if (orderCount === threshold) unlocked.push(id);
  }
  if (isWinterVariety) unlocked.push('first_winter');
  if (seenFarms.length >= 3) unlocked.push('three_farms');
  if (streakWeeks >= 12) unlocked.push('full_season');
  return unlocked;
}

// AR Expanded 5-6: personal best flavor from tasting journal
export async function fetchPersonalBestFlavor(): Promise<{ sweetness: number; acidity: number; aroma: number; texture: number; intensity: number } | null> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/tasting-journal/personal-best-flavor`, { headers: auth });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  } catch { return null; }
}

// AR Expanded 5-6: tasting word cloud for a variety
export async function fetchTastingWordCloud(varietyId: number): Promise<Array<{ word: string; count: number }>> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/tasting-journal/word-cloud/${varietyId}`, { headers: auth });
    if (!r.ok) return [];
    const res = await r.json().catch(() => []);
    return Array.isArray(res) ? res : [];
  } catch { return []; }
}

// AR Expanded 5-6: who else in batch got this variety this week
export async function fetchBatchMembers(varietyId: number): Promise<Array<{ initial: string; colorHex: string }>> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/collectifs/who-got-variety?variety_id=${varietyId}`, { headers: auth });
    if (!r.ok) return [];
    const res = await r.json().catch(() => []);
    return Array.isArray(res) ? res : [];
  } catch { return []; }
}

// AR Expanded 5-6: streak leaderboard for a variety
export async function fetchVarietyStreakLeaders(varietyId: number): Promise<{ leaders: Array<{ rank: number; name: string; farmName: string; streakWeeks: number }>; my_rank: number | null }> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/collectifs/variety-streak-leaders?variety_id=${varietyId}`, { headers: auth });
    if (!r.ok) return { leaders: [], my_rank: null };
    const res = await r.json().catch(() => null);
    return res ?? { leaders: [], my_rank: null };
  } catch { return { leaders: [], my_rank: null }; }
}

// AR Expanded 5-6: current weekly collectif challenge
export async function fetchCurrentChallenge(): Promise<{ title: string; description: string; progress: number; target: number } | null> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/collectif-challenges/current`, { headers: auth });
    if (!r.ok) return null;
    const res = await r.json().catch(() => null);
    return res?.challenge ?? null;
  } catch { return null; }
}

// AR Expanded 5-6: bundle product suggestion
export async function fetchBundleSuggestion(): Promise<{ title: string; price_cents: number } | null> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/drops/bundle-suggestion`, { headers: auth });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  } catch { return null; }
}

// AR Expanded 5-6: upcoming drop for a variety
export async function fetchUpcomingDrop(varietyId: number): Promise<{ upcoming_drop_at: string } | null> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/drops/upcoming?variety_id=${varietyId}`, { headers: auth });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  } catch { return null; }
}

// AR Expanded 5-6: add to gift registry
export async function addToGiftRegistry(varietyId: number, varietyName?: string): Promise<void> {
  const auth = await authHeader();
  await fetch(`${BASE_URL}/api/gift-registry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ variety_id: varietyId, variety_name: varietyName }),
  });
}

// AR Expanded 5-6: initiate co-scan session
export async function initiateCoScan(varietyId: number): Promise<{ code: string } | null> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/co-scans/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ variety_id: varietyId }),
    });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  } catch { return null; }
}

// AR Expanded 5-6: staff order expiry grid
export async function fetchStaffExpiryGrid(): Promise<Array<{ id: number; customerName: string; slotTime: string }>> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/staff/orders/expiry-grid`, { headers: auth });
    if (!r.ok) return [];
    const res = await r.json().catch(() => []);
    return Array.isArray(res) ? res : [];
  } catch { return []; }
}

// AR Expanded 5-6: staff session stats today
export async function fetchStaffSessionToday(): Promise<{ orders_processed: number; avg_prep_seconds: number | null; accuracy_pct: number | null }> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/staff/sessions/today`, { headers: auth });
    if (!r.ok) return { orders_processed: 0, avg_prep_seconds: null, accuracy_pct: null };
    return r.json().catch(() => ({ orders_processed: 0, avg_prep_seconds: null, accuracy_pct: null }));
  } catch { return { orders_processed: 0, avg_prep_seconds: null, accuracy_pct: null }; }
}

// AR Expanded 5-6: staff postal pickup heat map
export async function fetchPostalHeatMap(): Promise<Array<{ prefix: string; lat: number; lng: number; count: number }>> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/staff/postal-heatmap`, { headers: auth });
    if (!r.ok) return [];
    const res = await r.json().catch(() => []);
    return Array.isArray(res) ? res : [];
  } catch { return []; }
}


// AR Expanded 7: generative tasting poem
export async function fetchArPoem(params: {
  variety_name?: string | null;
  farm?: string | null;
  harvest_date?: string | null;
  brix_score?: number | null;
  terrain_type?: string | null;
  moon_phase_at_harvest?: string | null;
  growing_method?: string | null;
  farmer_name?: string | null;
  flavor_profile?: { sweetness?: number; acidity?: number; aroma?: number; tasting_notes?: string } | null;
}): Promise<string | null> {
  try {
    const auth = await authHeader();
    const r = await fetch(`${BASE_URL}/api/ar-poem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(params),
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    return data?.poem ?? null;
  } catch { return null; }
}

// ─── Missing features additions ──────────────────────────────────────────────

export async function fetchUserProfile(userId: number): Promise<any | null> {
  const r = await fetch(`${BASE_URL}/api/profiles/${userId}`);
  if (!r.ok) return null;
  return r.json();
}

export async function fetchTastingJournal(): Promise<any[]> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tasting-journal`, { headers });
  if (!r.ok) return [];
  return r.json();
}

export async function addTastingEntry(variety_id: number, rating: number, notes?: string): Promise<any> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/tasting-journal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ variety_id, rating, notes }),
  });
  if (!r.ok) throw new Error('failed');
  return r.json();
}

export async function markAllNotificationsRead(): Promise<void> {
  const headers = await authHeader();
  await fetch(`${BASE_URL}/api/notifications/read-all`, { method: 'POST', headers });
}

export async function fetchMyDjGigs(userId: number): Promise<any[]> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/users/${userId}/dj-gigs`, { headers });
  if (!r.ok) return [];
  return r.json();
}

// AR Expanded 7: real-time solar irradiance from Open-Meteo
export async function fetchSolarIrradiance(lat: number, lng: number): Promise<{ irradiance_wm2: number; cloud_cover_pct: number; uv_index: number } | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=direct_radiation,cloud_cover,uv_index&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    const current = data?.current;
    if (!current) return null;
    return {
      irradiance_wm2: Math.round(current.direct_radiation ?? 0),
      cloud_cover_pct: Math.round(current.cloud_cover ?? 0),
      uv_index: parseFloat((current.uv_index ?? 0).toFixed(1)),
    };
  } catch { return null; }
}

// ─── Social access ────────────────────────────────────────────────────────────

export async function fetchSocialAccess(): Promise<{
  active: boolean;
  tier: string | null;
  bank_days: number;
  lifetime_days: number;
}> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/users/me/social-access`, { headers });
  if (!r.ok) return { active: false, tier: null, bank_days: 0, lifetime_days: 0 };
  return r.json();
}

// ─── AR Videos ───────────────────────────────────────────────────────────────

export async function fetchARVideoFeed(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/ar-videos`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchARVideo(id: number): Promise<any | null> {
  const r = await fetch(`${BASE_URL}/api/ar-videos/${id}`);
  if (!r.ok) return null;
  return r.json();
}

export async function fetchMyARVideos(): Promise<any[]> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ar-videos/mine`, { headers });
  if (!r.ok) return [];
  return r.json();
}

export async function submitARVideoAbstract(abstract: string, tag?: string | null): Promise<any> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ar-videos/abstract`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ abstract, ...(tag ? { tag } : {}) }),
  });
  if (!r.ok) { const e = await r.json(); throw { status: r.status, ...e }; }
  return r.json();
}

export async function uploadARVideo(
  videoId: number,
  title: string,
  description: string,
  videoBase64: string,
  thumbnailBase64?: string,
): Promise<any> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/ar-videos/${videoId}/upload`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ title, description, video_base64: videoBase64, thumbnail_base64: thumbnailBase64 }),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? 'upload_failed'); }
  return r.json();
}

// ─── Social feed ─────────────────────────────────────────────────────────────

export async function fetchVarietyReviews(varietyId: number): Promise<{
  reviews: any[];
  avg_rating: number | null;
  review_count: number;
}> {
  const r = await fetch(`${BASE_URL}/api/social/varieties/${varietyId}/reviews`);
  if (!r.ok) return { reviews: [], avg_rating: null, review_count: 0 };
  return r.json();
}

export async function submitVarietyReview(varietyId: number, rating: number, note?: string): Promise<void> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/social/varieties/${varietyId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ rating, note: note ?? null }),
  });
  if (!r.ok) { const e = await r.json(); throw { status: r.status, ...e }; }
}

export async function fetchVarietyARVideos(varietyId: number): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/social/varieties/${varietyId}/ar-videos`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchLotCompanions(varietyId: number): Promise<any[]> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/social/varieties/${varietyId}/companions`, { headers });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchTastingFeed(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/social/tasting-feed`);
  if (!r.ok) return [];
  return r.json();
}

export async function reactToTastingEntry(entryId: number, emoji: string): Promise<{ reacted: boolean }> {
  const headers = await authHeader();
  const r = await fetch(`${BASE_URL}/api/social/tasting-feed/${entryId}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ emoji }),
  });
  if (!r.ok) throw new Error('react_failed');
  return r.json();
}

export async function fetchBoxWall(userId: number): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/social/users/${userId}/box-wall`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchHarvestDispatches(): Promise<any[]> {
  const r = await fetch(`${BASE_URL}/api/social/harvest-dispatches`);
  if (!r.ok) return [];
  return r.json();
}
