import { db } from './index';
import { varieties, locations, timeSlots } from './schema';
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

export async function seed(): Promise<void> {
  const existing = await db.select().from(varieties).limit(1);
  if (existing.length > 0) return;

  logger.info('Seeding database...');

  const [loc] = await db
    .insert(locations)
    .values({ name: 'Marché Atwater', address: '138 Av. Atwater, Montréal, QC H4C 2H5', active: true })
    .returning();

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

  logger.info('Seed complete — 3 varieties, 1 location, 63 time slots inserted.');
}
