export interface Strawberry {
  id: string;
  name: string;
  farm: string;
  description: string;
  price: number;
  harvestDate: string;
  quantity: number;
  quantityLabel: string;
  tag?: string;
  tab: 'CANADIAN' | 'INTERNATIONAL' | 'SEASONS';
  flag: string;
  freshnessLevel: number;
  freshnessColor: string;
  isPreOrder?: boolean;
}

export interface Chocolate {
  id: string;
  name: string;
  source: string;
  description: string;
  tagline: string;
  swatchColor: string;
  tag?: string;
}

export interface Finish {
  id: string;
  name: string;
  description: string;
  tagline: string;
  tag?: string;
}

export interface CollectionLocation {
  id: string;
  name: string;
  detail: string;
}

export interface TimeSlot {
  time: string;
  slots: number;
}

export const STRAWBERRIES: Strawberry[] = [
  {
    id: 'greenhouse-reserve',
    name: 'Greenhouse Reserve',
    farm: 'Our greenhouse, Ontario',
    description:
      'Our own variety. Unnamed. Grown in eight plants. Unavailable anywhere else.',
    price: 8.5,
    harvestDate: 'Harvested this morning',
    quantity: 8,
    quantityLabel: '8 today · Pre-order',
    tag: 'GREENHOUSE',
    tab: 'CANADIAN',
    flag: '🇨🇦',
    freshnessLevel: 1.0,
    freshnessColor: '#007AFF',
    isPreOrder: true,
  },
  {
    id: 'jewel',
    name: 'Jewel',
    farm: 'Ferme Carpentier, Saint-Jean-sur-Richelieu, QC',
    description:
      'The great Quebec strawberry. Bright, firm, slightly tart. The one this province is built around.',
    price: 5.5,
    harvestDate: 'Harvested yesterday',
    quantity: 42,
    quantityLabel: '42 remaining',
    tab: 'CANADIAN',
    flag: '🇨🇦',
    freshnessLevel: 0.72,
    freshnessColor: '#007AFF',
  },
  {
    id: 'seascape',
    name: 'Seascape',
    farm: 'Krause Berry Farms, Langley, BC',
    description:
      'A BC strawberry. Sweeter than Jewel, more fragile. A West Coast story.',
    price: 6.0,
    harvestDate: 'Harvested two days ago',
    quantity: 18,
    quantityLabel: '18 remaining',
    tab: 'CANADIAN',
    flag: '🇨🇦',
    freshnessLevel: 0.48,
    freshnessColor: '#007AFF',
  },
];

export const CHOCOLATES: Chocolate[] = [
  {
    id: 'guanaja_70',
    name: 'Guanaja 70%',
    source: 'Valrhona, Rhône Valley',
    description: 'Complex. Slightly bitter. A long finish.',
    tagline: 'The serious choice.',
    swatchColor: '#3D1F0F',
  },
  {
    id: 'caraibe_66',
    name: 'Caraïbe 66%',
    source: 'Valrhona, Rhône Valley',
    description: 'Rounder. More forgiving.',
    tagline: 'Most people begin here.',
    swatchColor: '#7A3B12',
  },
  {
    id: 'jivara_40',
    name: 'Jivara 40% Lait',
    source: 'Valrhona, Rhône Valley',
    description: 'Milk chocolate with caramel notes.',
    tagline: 'For those who know.',
    swatchColor: '#A67C52',
  },
  {
    id: 'ivoire_blanc',
    name: 'Ivoire Blanc',
    source: 'Valrhona, Rhône Valley',
    description: 'White. Vanilla-forward.',
    tagline: 'Not on the menu. You found it.',
    swatchColor: '#D4B896',
    tag: 'HIDDEN',
  },
];

export const FINISHES: Finish[] = [
  {
    id: 'plain',
    name: 'Plain',
    description: 'The chocolate as it sets. Nothing added.',
    tagline: 'Honest.',
  },
  {
    id: 'fleur_de_sel',
    name: 'Fleur de Sel',
    description: 'Three flakes of Île de Ré salt.',
    tagline: 'Most people choose this one.',
    tag: 'RECOMMENDED',
  },
  {
    id: 'or_fin',
    name: 'Or Fin',
    description: 'A touch of gold leaf at the shoulder.',
    tagline: 'Occasions only.',
  },
];

export const QUANTITIES = [1, 4, 8, 12];

export const COLLECTION_LOCATIONS: CollectionLocation[] = [
  {
    id: 'atwater',
    name: 'Marché Atwater',
    detail: 'We are there every morning.',
  },
];

export const TIME_SLOTS: TimeSlot[] = [
  { time: '9:00', slots: 4 },
  { time: '10:00', slots: 3 },
  { time: '11:00', slots: 5 },
  { time: '12:00', slots: 2 },
  { time: '13:00', slots: 4 },
  { time: '14:00', slots: 3 },
  { time: '15:00', slots: 5 },
  { time: '16:00', slots: 3 },
  { time: '17:00', slots: 4 },
];

export function getDateOptions(): { label: string; dayNum: number; dayName: string; isoDate: string }[] {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const result = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    result.push({
      label: i === 0 ? 'TODAY' : days[d.getDay()],
      dayNum: d.getDate(),
      dayName: days[d.getDay()],
      isoDate: `${year}-${month}-${day}`,
    });
  }
  return result;
}
