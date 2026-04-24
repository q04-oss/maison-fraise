import { Router } from 'express';
import { db } from '../db';
import { tableEvents, tableInstructors } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

const router = Router();

// Match query words against active table events
async function matchTableEvents(q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  if (!words.length) return [];

  // Build a score expression: count how many query words appear in title + description + venue_name
  const pattern = words.map(w => `%${w}%`);

  const events = await db
    .select({
      id: tableEvents.id,
      title: tableEvents.title,
      venue_name: tableEvents.venue_name,
      venue_slug: tableEvents.venue_slug,
      event_date: tableEvents.event_date,
      date_tbd: tableEvents.date_tbd,
      price_cents: tableEvents.price_cents,
      capacity: tableEvents.capacity,
      seats_taken: tableEvents.seats_taken,
      event_type: tableEvents.event_type,
      description: tableEvents.description,
      instructor_name: tableInstructors.name,
    })
    .from(tableEvents)
    .innerJoin(tableInstructors, eq(tableEvents.instructor_id, tableInstructors.id))
    .where(
      and(
        eq(tableEvents.active, true),
        sql`(
          ${sql.join(pattern.map(p => sql`(
            lower(${tableEvents.title}) LIKE ${p} OR
            lower(coalesce(${tableEvents.description}, '')) LIKE ${p} OR
            lower(${tableEvents.venue_name}) LIKE ${p}
          )`), sql` OR `)}
        )`
      )
    )
    .limit(3);

  return events;
}

// GET /api/brave?q= — proxy to Brave Search API + table event intent matching
router.get('/', async (req: any, res: any) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });

  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return res.status(503).json({ error: 'Search unavailable' });

  // Run table match and Brave search in parallel
  const [tableMatches, braveResponse] = await Promise.allSettled([
    matchTableEvents(q),
    fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&search_lang=en&country=ca&safesearch=moderate`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': key,
      },
    }),
  ]);

  const events = tableMatches.status === 'fulfilled' ? tableMatches.value : [];

  if (braveResponse.status === 'rejected') {
    return res.status(500).json({ error: 'Search failed' });
  }

  const response = braveResponse.value;
  if (!response.ok) {
    return res.status(response.status).json({ error: 'Search request failed' });
  }

  const data = await response.json() as any;
  const results = (data.web?.results ?? []).map((r: any) => ({
    title: r.title,
    url: r.url,
    description: r.description,
    display_url: r.meta_url?.hostname ?? r.url,
  }));

  res.json({ query: q, results, table_events: events });
});

export default router;
