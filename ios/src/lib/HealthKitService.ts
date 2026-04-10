// Requires: npm install @kingstinct/react-native-healthkit
import HealthKit from '@kingstinct/react-native-healthkit';

export interface TodayHealthContext {
  active_energy_kcal: number;
  calories_consumed_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  steps: number;
}

// Nutritional values per single strawberry (~12g, medium)
const PER_STRAWBERRY = {
  energy_kcal: 4,
  carbs_g: 0.9,
  sugar_g: 0.6,
  fiber_g: 0.2,
  vitamin_c_mg: 7,
  protein_g: 0.08,
  fat_g: 0.04,
};

export async function requestHealthKitPermissions(): Promise<boolean> {
  try {
    await HealthKit.requestAuthorization({
      read: [
        'activeEnergyBurned',
        'dietaryEnergyConsumed',
        'dietaryProtein',
        'dietaryCarbohydrates',
        'dietaryFatTotal',
        'dietarySugar',
        'dietaryFiber',
        'stepCount',
        'dietaryVitaminC',
        'sleepAnalysis',
      ],
      share: [
        'dietaryEnergyConsumed',
        'dietaryProtein',
        'dietaryCarbohydrates',
        'dietaryFatTotal',
        'dietarySugar',
        'dietaryFiber',
        'dietaryVitaminC',
        'mindfulSession',
      ],
    });
    return true;
  } catch {
    return false;
  }
}

// Log strawberry consumption to HealthKit. quantity = number of individual strawberries.
// Returns true if logged successfully, false if HealthKit unavailable or permission denied.
export async function logStrawberries(quantity: number): Promise<boolean> {
  if (quantity <= 0) return false;
  const now = new Date();

  const nutrients: Array<[string, string, number]> = [
    ['dietaryEnergyConsumed',  'kcal', PER_STRAWBERRY.energy_kcal * quantity],
    ['dietaryCarbohydrates',   'g',    PER_STRAWBERRY.carbs_g    * quantity],
    ['dietarySugar',           'g',    PER_STRAWBERRY.sugar_g    * quantity],
    ['dietaryFiber',           'g',    PER_STRAWBERRY.fiber_g    * quantity],
    ['dietaryVitaminC',        'mg',   PER_STRAWBERRY.vitamin_c_mg * quantity],
    ['dietaryProtein',         'g',    PER_STRAWBERRY.protein_g  * quantity],
    ['dietaryFatTotal',        'g',    PER_STRAWBERRY.fat_g      * quantity],
  ];

  try {
    await Promise.all(
      nutrients.map(([type, unit, value]) =>
        HealthKit.saveQuantitySample(type, unit, value, { startDate: now, endDate: now })
      )
    );
    return true;
  } catch {
    return false;
  }
}

async function sumSamples(type: string, from: Date, to: Date): Promise<number> {
  try {
    const samples = await HealthKit.queryQuantitySamples(type, { from, to });
    return samples.reduce((acc: number, s: any) => acc + (s.quantity ?? 0), 0);
  } catch {
    return 0;
  }
}

// Returns average dietary vitamin C in mg/day over the past `days` days.
// Returns 0 if no data is available.
export async function getAverageVitaminCMgPerDay(days: number): Promise<number> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const total = await sumSamples('dietaryVitaminC', from, to);
  return total / days;
}

// Saves a mindful session category sample spanning the given time range.
// Returns true on success, false on failure.
export async function logMindfulSession(startDate: Date, endDate: Date): Promise<boolean> {
  const HKCategoryValueNotApplicable = 0;
  try {
    await HealthKit.saveCategorySample('mindfulSession', HKCategoryValueNotApplicable, { startDate, endDate });
    return true;
  } catch {
    return false;
  }
}

// Returns the average wake time (minutes after midnight) based on sleep data
// from the past `days` days, or null if fewer than 3 days of data are available.
// Wake time is proxied as the latest end time of any 'Asleep' (value === 1) sample each day.
export async function getAverageWakeTimeMinutesAfterMidnight(days: number): Promise<number | null> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  try {
    const samples = await HealthKit.queryCategorySamples('sleepAnalysis', { from, to });
    // value === 1 means Asleep
    const asleepSamples = (samples as any[]).filter((s: any) => s.value === 1);

    // Group by calendar day (using endDate), keep latest endDate per day
    const latestEndByDay = new Map<string, Date>();
    for (const s of asleepSamples) {
      const end = new Date(s.endDate);
      const dayKey = `${end.getFullYear()}-${end.getMonth()}-${end.getDate()}`;
      const existing = latestEndByDay.get(dayKey);
      if (!existing || end > existing) {
        latestEndByDay.set(dayKey, end);
      }
    }

    if (latestEndByDay.size < 3) return null;

    let totalMinutes = 0;
    for (const wakeTime of latestEndByDay.values()) {
      const minutesAfterMidnight = wakeTime.getHours() * 60 + wakeTime.getMinutes();
      totalMinutes += minutesAfterMidnight;
    }
    return totalMinutes / latestEndByDay.size;
  } catch {
    return null;
  }
}

export async function getTodayHealthContext(): Promise<TodayHealthContext> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const [
    active_energy_kcal,
    calories_consumed_kcal,
    protein_g,
    carbs_g,
    fat_g,
    sugar_g,
    fiber_g,
    steps,
  ] = await Promise.all([
    sumSamples('activeEnergyBurned', startOfDay, now),
    sumSamples('dietaryEnergyConsumed', startOfDay, now),
    sumSamples('dietaryProtein', startOfDay, now),
    sumSamples('dietaryCarbohydrates', startOfDay, now),
    sumSamples('dietaryFatTotal', startOfDay, now),
    sumSamples('dietarySugar', startOfDay, now),
    sumSamples('dietaryFiber', startOfDay, now),
    sumSamples('stepCount', startOfDay, now),
  ]);

  return {
    active_energy_kcal,
    calories_consumed_kcal,
    protein_g,
    carbs_g,
    fat_g,
    sugar_g,
    fiber_g,
    steps,
  };
}
