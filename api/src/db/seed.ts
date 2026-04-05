import { db } from './index';
import { varieties, locations, timeSlots, users, businesses, collectifs } from './schema';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function randomCapacity(): number {
  return Math.floor(Math.random() * 4) + 2; // 2–5
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

export async function seed(): Promise<void> {
  const existing = await db.select().from(varieties).limit(1);
  if (existing.length > 0) return;

  logger.info('Seeding database...');

  // ── Collectifs tables (self-healing in case router IIFE hasn't run yet) ──────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS collectifs (
      id SERIAL PRIMARY KEY,
      created_by INTEGER NOT NULL,
      business_id INTEGER,
      business_name TEXT NOT NULL,
      collectif_type TEXT NOT NULL DEFAULT 'product',
      title TEXT NOT NULL,
      description TEXT,
      proposed_discount_pct INTEGER NOT NULL DEFAULT 0,
      price_cents INTEGER NOT NULL,
      proposed_venue TEXT,
      proposed_date TEXT,
      target_quantity INTEGER NOT NULL,
      current_quantity INTEGER NOT NULL DEFAULT 0,
      deadline TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      business_response TEXT DEFAULT 'pending',
      business_response_note TEXT,
      responded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── Seed user (needed as created_by for collectifs) ──────────────────────────
  const [seedUser] = await db
    .insert(users)
    .values({
      email: 'demo@maison-fraise.com',
      display_name: 'Maison Fraise',
      verified: true,
    })
    .returning();

  // ── Location ──────────────────────────────────────────────────────────────────
  const [loc] = await db
    .insert(locations)
    .values({ name: 'Marché Atwater', address: '138 Av. Atwater, Montréal, QC H4C 2H5', active: true })
    .returning();

  // ── Varieties ─────────────────────────────────────────────────────────────────
  await db.insert(varieties).values([
    {
      name: 'Greenhouse Reserve',
      description: 'Our finest greenhouse-grown strawberry — delicate, aromatic, and limited.',
      source_farm: 'Ferme des Quatre Vents',
      source_location: 'Laval, QC',
      price_cents: 850,
      stock_remaining: 8,
      tag: 'GREENHOUSE',
      active: true,
    },
    {
      name: 'Jewel',
      description: 'Sweet and firm — the crowd favourite, harvested at peak ripeness.',
      source_farm: 'Les Jardins Rouges',
      source_location: 'Saint-Eustache, QC',
      price_cents: 550,
      stock_remaining: 42,
      active: true,
    },
    {
      name: 'Seascape',
      description: 'An everbearing variety with a balanced sweet-tart flavour and bright finish.',
      source_farm: 'Ferme Côtière',
      source_location: 'Île-Perrot, QC',
      price_cents: 600,
      stock_remaining: 18,
      active: true,
    },
  ]);

  // ── Time slots ────────────────────────────────────────────────────────────────
  const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const slotValues: {
    location_id: number;
    date: string;
    time: string;
    capacity: number;
    booked: number;
  }[] = [];

  for (let d = 0; d < 7; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const dateStr = toDateStr(day);
    for (const time of hours) {
      slotValues.push({
        location_id: loc.id,
        date: dateStr,
        time,
        capacity: randomCapacity(),
        booked: 0,
      });
    }
  }

  await db.insert(timeSlots).values(slotValues);

  // ── Popup business ────────────────────────────────────────────────────────────
  const popupStart = daysFromNow(7);
  const popupEnd = new Date(popupStart.getTime() + 4 * 60 * 60 * 1000);

  await db.insert(businesses).values({
    name: 'Chocolaterie du Parc',
    type: 'popup',
    address: '123 Rue Laurier Ouest, Montréal, QC',
    city: 'Montréal',
    latitude: '45.5237',
    longitude: '-73.5985',
    launched_at: popupStart,
    ends_at: popupEnd,
    description: 'Single-origin chocolate pairings with natural wines.',
    neighbourhood: 'Plateau-Mont-Royal',
    instagram_handle: 'chocolaterieduparc',
    dj_name: 'DJ Soleil',
    organizer_note: 'An intimate chocolate tasting evening in the heart of the Plateau.',
    capacity: 40,
    entrance_fee_cents: 1500,
    approved_by_admin: true,
  });

  // ── Collectifs ────────────────────────────────────────────────────────────────
  await db.insert(collectifs).values([
    {
      created_by: seedUser.id,
      business_name: 'Valrhona',
      collectif_type: 'product',
      title: 'Bulk order — Guanaja 70% (1 kg bars)',
      description: 'Proposing a group order of Valrhona Guanaja 70% 1 kg professional bars. The more members commit, the better the price we can negotiate.',
      proposed_discount_pct: 20,
      price_cents: 4200,
      target_quantity: 20,
      current_quantity: 7,
      deadline: daysFromNow(30),
      status: 'open',
    },
    {
      created_by: seedUser.id,
      business_name: 'Chocolaterie Bernard',
      collectif_type: 'popup',
      title: "Valentine's popup at Café Central",
      description: "Proposing an intimate Valentine's evening with Chocolaterie Bernard at Café Central — tastings, pairings, and a limited box to take home.",
      proposed_venue: 'Café Central, 456 Rue Saint-Denis',
      proposed_date: 'Feb 14, 2027',
      price_cents: 2500,
      target_quantity: 30,
      current_quantity: 12,
      deadline: daysFromNow(45),
      status: 'open',
    },
  ]);

  logger.info('Seed complete — varieties, location, time slots, popup business, and 2 collectifs inserted.');
}
