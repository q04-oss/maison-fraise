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
      ],
    });
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
