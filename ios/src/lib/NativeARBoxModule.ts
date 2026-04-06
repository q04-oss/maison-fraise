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
  // AR Expanded 5-6: science & sensory
  personal_best_flavor?: { sweetness: number; acidity: number; aroma: number; texture: number; intensity: number } | null;
  orac_value?: number | null;
  fermentation_profile?: { jam: number; wine: number; coulis: number; vinegar: number } | null;
  hue_value?: number | null;
  folate_mcg?: number | null;
  manganese_mg?: number | null;
  potassium_mg?: number | null;
  vitamin_k_mcg?: number | null;
  // AR Expanded 5-6: farm storytelling
  farmer_name?: string | null;
  farmer_quote?: string | null;
  certifications?: string[];
  farm_founded_year?: number | null;
  farm_milestones?: Array<{ year: number; label: string }>;
  irrigation_method?: string | null;
  cover_crop?: string | null;
  terrain_type?: string | null;
  prevailing_wind?: string | null;
  ambient_audio_url?: string | null;
  mascot_id?: string | null;
  // AR Expanded 5-6: commerce
  bundle_suggestion?: { title: string; price_cents: number } | null;
  upcoming_drop_at?: string | null;
  price_drop_pct?: number | null;
  show_referral_bubble?: boolean;
  // AR Expanded 5-6: social
  tasting_word_cloud?: Array<{ word: string; count: number }>;
  batch_members?: Array<{ initial: string; colorHex: string }>;
  last_scan_date?: string | null;
  last_scan_rating?: number | null;
  last_scan_note?: string | null;
  collectif_challenge?: { title: string; description: string; progress: number; target: number } | null;
  variety_streak_leaders?: Array<{ rank: number; name: string; farmName: string; streakWeeks: number }>;
  current_user_streak_rank?: number | null;
  // AR Expanded 5-6: staff-only
  staff_expiry_orders?: Array<{ id: number; customerName: string; slotTime: string }>;
  staff_orders_today?: number;
  staff_avg_prep_seconds?: number | null;
  staff_accuracy_pct?: number | null;
  postal_heat_map?: Array<{ prefix: string; lat: number; lng: number; count: number }>;
  // AR Expanded 7
  farm_webcam_url?: string | null;
  ar_poem?: string | null;
  solar_data?: { irradiance_wm2: number; cloud_cover_pct: number; uv_index: number } | null;
  // Social expanded
  lot_companions?: Array<{ id: number; display_name: string; portrait_url: string | null; current_streak_weeks: number; social_tier: string | null }>;
  streak_milestone?: boolean;
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
  presentAR(varietyData: ARVarietyData): Promise<{ rating: number; notes: string | null; farm_visit_tapped?: boolean; note_body?: string; note_color?: string; referral_tapped?: boolean; bundle_tapped?: boolean; gift_registry_added?: boolean } | null>;
  // Feature E
  presentStaffAR(staffData: ARStaffData): Promise<{ action: string; order_id: number } | null>;
  // Feature F
  presentMarketStallAR(stallData: ARMarketStallData): Promise<void>;
  // AR Expanded: batch scan
  presentBatchScanAR(): Promise<{ order_ids: number[] } | null>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ARBoxModule');
