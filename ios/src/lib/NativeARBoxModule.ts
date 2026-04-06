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
  // Feature B: Variety comparison
  last_variety?: { id: number; name: string; farm: string; harvest_date: string } | null;
  // Feature C: Standing order preview
  next_standing_order_label?: string | null;
  // Feature D: Collectif member names
  collectif_member_names?: string[];
  // AR Expanded 2: enrichment data
  flavor_profile?: {
    sweetness: number;
    acidity: number;
    aroma: number;
    texture: number;
    intensity: number;
    pairing_chocolate?: string | null;
    pairing_finish?: string | null;
    tasting_notes?: string | null;
    farm_distance_km?: number | null;
  } | null;
  farm_distance_km?: number | null;
  season_start?: string | null;
  season_end?: string | null;
  active_drop?: { title: string; price_cents: number; id: number } | null;
  is_first_variety?: boolean;
  // AR Expanded 3: new enrichment fields
  brix_score?: number | null;
  growing_method?: string | null;
  moon_phase_at_harvest?: string | null;
  parent_a?: string | null;
  parent_b?: string | null;
  altitude_m?: number | null;
  soil_type?: string | null;
  eat_by_days?: number | null;
  recipe_name?: string | null;
  recipe_description?: string | null;
  harvest_weather_json?: string | null;
  farm_photo_url?: string | null;
  producer_video_url?: string | null;
  streak_weeks?: number | null;
  collectif_rank?: number | null;
  collectif_total_members?: number | null;
  scanned_varieties?: Array<{ variety_id: number; variety_name: string; farm_lat?: number | null; farm_lng?: number | null; order_count?: number }>;
  // AR Expanded 4
  fiber_today_g?: number | null;
  allergy_flags?: string[];
  unlocked_achievements?: string[];
  collectif_milestone_pct?: number | null;
  co2_grams?: number | null;
  carbon_offset_program?: string | null;
  sunlight_hours?: number | null;
  price_history_json?: string | null;
  open_farm_visit?: { visit_date: string; spots_left: number; visit_id: number } | null;
  nearby_ar_notes?: Array<{ id: number; body: string; author_name: string; color: string; created_at: string }>;
}

// Feature E: Staff AR
export interface ARStaffData {
  id: number;
  status: string;
  variety_name: string;
  customer_email: string;
  quantity: number;
  chocolate: string;
  finish: string;
  is_gift?: boolean;
  gift_note?: string | null;
  slot_time?: string | null;
  push_token?: string | null;
  // AR Expanded 3: pickup grid for staff
  pickup_slots?: Array<{ slot_time: string; total: number; paid: number; preparing: number; ready: number }>;
}

// Feature F: Market stall AR
export interface ARMarketStallListing {
  name: string;
  price_cents: number;
  unit_label: string;
  tags: string[];
  stock_quantity: number;
}

export interface ARMarketStallData {
  vendor_name: string;
  description?: string | null;
  instagram?: string | null;
  listings: ARMarketStallListing[];
}

export interface Spec extends TurboModule {
  presentAR(varietyData: ARVarietyData): Promise<{ rating: number; notes: string | null; farm_visit_tapped?: boolean; note_body?: string; note_color?: string } | null>;
  // Feature E
  presentStaffAR(staffData: ARStaffData): Promise<{ action: string; order_id: number } | null>;
  // Feature F
  presentMarketStallAR(stallData: ARMarketStallData): Promise<void>;
  // AR Expanded: batch scan
  presentBatchScanAR(): Promise<{ order_ids: number[] } | null>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ARBoxModule');
