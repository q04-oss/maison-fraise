/**
 * Shared geolocation utilities used by MapScreen and HomePanel.
 * Single source of truth — do not duplicate these inline.
 */

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistanceKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * Parse a plain-text hours string like "Mon–Fri 9am–6pm" or "9:00–18:00"
 * and return the current open/closed status.
 * Returns null if the string can't be parsed.
 */
export function getOpenStatus(hours: string | null | undefined): { label: string; open: boolean } | null {
  if (!hours) return null;
  const now = new Date();
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const today = dayNames[now.getDay()];
  const lc = hours.toLowerCase();
  const hasDays = /mon|tue|wed|thu|fri|sat|sun/.test(lc);
  if (hasDays && !lc.includes(today)) return { label: 'closed today', open: false };
  const timeMatch = lc.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–\-to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!timeMatch) return null;
  const toMin = (h: string, m: string, meridiem: string) => {
    let hour = parseInt(h);
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return hour * 60 + (parseInt(m) || 0);
  };
  const openMin = toMin(timeMatch[1], timeMatch[2], timeMatch[3]);
  const closeMin = toMin(timeMatch[4], timeMatch[5], timeMatch[6] || (parseInt(timeMatch[4]) < parseInt(timeMatch[1]) ? 'pm' : (timeMatch[3] ?? 'am')));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const open = nowMin >= openMin && nowMin < closeMin;
  return { label: open ? 'open now' : 'closed', open };
}

/**
 * Convert am/pm times in a hours string to 24-hour hour-only notation.
 * "Mon–Fri 9am–6pm"  →  "Mon–Fri 9–18"
 * "8am – 2pm"        →  "8–14"
 * "9:00–18:00"       →  "9–18"
 */
export function formatHours24(hours: string): string {
  // Convert HH:MM to just the hour
  let result = hours.replace(/\b(\d{1,2}):\d{2}\b/g, (_, h) => String(parseInt(h)));
  // Convert am/pm tokens to 24h
  result = result.replace(/\b(\d{1,2})\s*(am|pm)\b/gi, (_, h, mer) => {
    let hour = parseInt(h);
    if (mer.toLowerCase() === 'pm' && hour !== 12) hour += 12;
    if (mer.toLowerCase() === 'am' && hour === 12) hour = 0;
    return String(hour);
  });
  return result;
}
