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

export async function acceptContract(contractId: number, userId: number) {
  const res = await fetch(`${BASE_URL}/api/contracts/${contractId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to accept contract');
  }
  return res.json();
}

export async function declineContract(contractId: number, userId: number) {
  const res = await fetch(`${BASE_URL}/api/contracts/${contractId}/decline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error('Failed to decline contract');
  return res.json();
}

export async function logMemberVisit(businessId: number, contractedUserId: number) {
  const res = await fetch(`${BASE_URL}/api/businesses/${businessId}/visits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contracted_user_id: contractedUserId }),
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

export async function followUser(userId: number, followerId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ follower_id: followerId }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed to follow'); }
  return res.json();
}

export async function unfollowUser(userId: number, followerId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/follow`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ follower_id: followerId }),
  });
  if (!res.ok) throw new Error('Failed to unfollow');
  return res.json();
}

export async function fetchFollowStatus(userId: number, followerId: number) {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/follow-status?follower_id=${followerId}`);
  if (!res.ok) throw new Error('Failed to fetch follow status');
  return res.json() as Promise<{ is_following: boolean }>;
}

export async function fetchOrderHistory(userId: number) {
  const res = await fetch(`${BASE_URL}/api/users/me/orders`, {
    headers: { 'X-User-ID': String(userId) },
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
  const res = await fetch(`${BASE_URL}/api/feed?user_id=${userId}`);
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
  const res = await fetch(`${BASE_URL}/api/notifications?user_id=${userId}`);
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
  const res = await fetch(`${BASE_URL}/api/notifications/${notificationId}/read`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to mark read');
  return res.json();
}
