import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface ARVarietyData {
  variety_id: number;
  variety_name: string | null;
  farm: string | null;
  harvest_date: string | null;
  quantity: number;
  chocolate: string;
  finish: string;
  // Feature 1: HealthKit nutrition
  vitamin_c_today_mg?: number | null;
  calories_today_kcal?: number | null;
  // Feature 2: fraise.market vendor AR
  card_type?: 'variety' | 'market' | null;
  vendor_description?: string | null;
  vendor_instagram?: string | null;
  vendor_tags?: string[];
  // Feature 3: Collectif social layer
  collectif_pickups_today?: number | null;
  // Feature 4: Gift reveal
  is_gift?: boolean;
  gift_note?: string | null;
  // Feature 5: Variety streak
  order_count?: number | null;
}

export interface Spec extends TurboModule {
  presentAR(varietyData: ARVarietyData): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ARBoxModule');
