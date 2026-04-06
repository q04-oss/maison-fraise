import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { readNfcToken, cancelNfc } from '../../lib/nfc';
import { verifyNfc, collectMarketOrderByNfc, verifyNfcReorder, fetchStaffOrderByNfc, fetchMarketStallAR, staffMarkPrepare, staffMarkReady, staffFlagOrder, fetchVarietyProfile, fetchActiveDropForVariety, bulkPrepareOrders, fetchMyScannedVarieties, fetchCollectifRank, fetchPickupGrid, saveTastingRating, fetchNearbyArNotes, postArNote, fetchOpenFarmVisits, computeUnlockedAchievements, fetchPersonalBestFlavor, fetchTastingWordCloud, fetchBatchMembers, fetchVarietyStreakLeaders, fetchCurrentChallenge, fetchBundleSuggestion, fetchUpcomingDrop, addToGiftRegistry, fetchStaffExpiryGrid, fetchStaffSessionToday, fetchPostalHeatMap, fetchArPoem, fetchSolarIrradiance, fetchLotCompanions } from '../../lib/api';
import ARBoxModule, { ARVarietyData } from '../../lib/NativeARBoxModule';
import { logStrawberries, requestHealthKitPermissions, getTodayHealthContext } from '../../lib/HealthKitService';

type State = 'scanning' | 'success' | 'error';
type FirstTapResult = { streak_weeks?: number; streak_milestone?: boolean; bank_days?: number; tier?: string | null } | null;

export default function VerifyNFCPanel() {
  const { goHome, showPanel } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>('scanning');
  const [errorMsg, setErrorMsg] = useState('');
  const [firstTapResult, setFirstTapResult] = useState<FirstTapResult>(null);

  const scan = async () => {
    setState('scanning');
    setErrorMsg('');
    try {
      const token = await readNfcToken();

      // Feature F: market stall NFC tag
      if (token.startsWith('fraise-stall-')) {
        const stallId = token.replace('fraise-stall-', '');
        const stallData = await fetchMarketStallAR(stallId);
        setState('success');
        await ARBoxModule.presentMarketStallAR(stallData);
        showPanel('market-vendor');
        return;
      }

      if (token === 'fraise.market') {
        const marketResult = await collectMarketOrderByNfc(token);
        setState('success');
        if (marketResult.vendor_info) {
          const marketPayload: ARVarietyData = {
            variety_id: 0,
            variety_name: marketResult.vendor_info.listing_name,
            farm: marketResult.vendor_info.vendor_name,
            harvest_date: null,
            quantity: 0,
            chocolate: '',
            finish: '',
            card_type: 'market',
            vendor_description: marketResult.vendor_info.vendor_description ?? null,
            vendor_instagram: marketResult.vendor_info.instagram_handle ?? null,
            vendor_tags: marketResult.vendor_info.tags ?? [],
          };
          await ARBoxModule.presentAR(marketPayload);
        }
        showPanel('market-orders');
        return;
      }

      // Feature E: staff AR — check if user is staff before normal flow
      const isStaff = await AsyncStorage.getItem('is_staff') === 'true';
      if (isStaff) {
        // Batch scan token: staff taps "batch scan" button which writes fraise-batch to NFC trigger
        if (token === 'fraise-batch') {
          setState('success');
          const pin = await AsyncStorage.getItem('staff_pin') ?? '';
          const batchResult = await ARBoxModule.presentBatchScanAR();
          if (batchResult?.order_ids?.length) {
            await bulkPrepareOrders(batchResult.order_ids, pin).catch(() => {});
          }
          return;
        }
        const [staffOrderData, pickupSlots] = await Promise.all([
          fetchStaffOrderByNfc(token),
          fetchPickupGrid().catch(() => [] as any[]),
        ]);
        setState('success');
        const [staffExpiryOrders, staffSession, postalHeatMap] = await Promise.all([
          fetchStaffExpiryGrid().catch(() => [] as any[]),
          fetchStaffSessionToday().catch(() => ({ orders_processed: 0, avg_prep_seconds: null, accuracy_pct: null })),
          fetchPostalHeatMap().catch(() => [] as any[]),
        ]);
        const staffPayload = {
          ...staffOrderData,
          pickup_slots: pickupSlots,
          staff_expiry_orders: staffExpiryOrders,
          staff_orders_today: (staffSession as any).orders_processed ?? 0,
          staff_avg_prep_seconds: (staffSession as any).avg_prep_seconds ?? null,
          staff_accuracy_pct: (staffSession as any).accuracy_pct ?? null,
          postal_heat_map: postalHeatMap,
        };
        const actionResult = await ARBoxModule.presentStaffAR(staffPayload);
        if (actionResult) {
          const pin = await AsyncStorage.getItem('staff_pin') ?? '';
          if (actionResult.action === 'prepare') {
            await staffMarkPrepare(pin, actionResult.order_id).catch(() => {});
          } else if (actionResult.action === 'ready') {
            await staffMarkReady(pin, actionResult.order_id).catch(() => {});
          } else if (actionResult.action === 'flag') {
            await staffFlagOrder(pin, actionResult.order_id, '').catch(() => {});
          }
        }
        return;
      }

      const alreadyVerified = await AsyncStorage.getItem('verified') === 'true';

      if (alreadyVerified) {
        const reorderData = await verifyNfcReorder(token);

        // Get device location for nearby AR notes (best-effort, 3s timeout)
        let deviceLat = 0, deviceLng = 0;
        await new Promise<void>((res) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => { deviceLat = pos.coords.latitude; deviceLng = pos.coords.longitude; res(); },
            () => res(),
            { timeout: 3000, enableHighAccuracy: false }
          );
        });

        // Fetch all enrichment data in parallel
        const [healthCtx, varietyProfile, activeDrop, scannedVarieties, collectifRankData, nearbyNotes, openFarmVisits, wordCloud, batchMembers, streakLeaders, currentChallenge, bundleSuggestion, upcomingDrop, personalBestFlavor, lotCompanions] = await Promise.all([
          getTodayHealthContext().catch(() => null),
          reorderData.variety_id ? fetchVarietyProfile(reorderData.variety_id).catch(() => null) : Promise.resolve(null),
          reorderData.variety_id ? fetchActiveDropForVariety(reorderData.variety_id).catch(() => null) : Promise.resolve(null),
          fetchMyScannedVarieties().catch(() => [] as any[]),
          fetchCollectifRank().catch(() => null),
          fetchNearbyArNotes(deviceLat, deviceLng).catch(() => [] as any[]),
          fetchOpenFarmVisits(reorderData.farm ?? '').catch(() => [] as any[]),
          reorderData.variety_id ? fetchTastingWordCloud(reorderData.variety_id).catch(() => [] as any[]) : Promise.resolve([]),
          reorderData.variety_id ? fetchBatchMembers(reorderData.variety_id).catch(() => [] as any[]) : Promise.resolve([]),
          reorderData.variety_id ? fetchVarietyStreakLeaders(reorderData.variety_id).catch(() => ({ leaders: [], my_rank: null })) : Promise.resolve({ leaders: [], my_rank: null }),
          fetchCurrentChallenge().catch(() => null),
          fetchBundleSuggestion().catch(() => null),
          reorderData.variety_id ? fetchUpcomingDrop(reorderData.variety_id).catch(() => null) : Promise.resolve(null),
          fetchPersonalBestFlavor().catch(() => null),
          reorderData.variety_id ? fetchLotCompanions(reorderData.variety_id).catch(() => [] as any[]) : Promise.resolve([]),
        ]);

        // AR Expanded 7: fetch poem and solar data (after varietyProfile to use farm coords)
        const vp = varietyProfile as any;
        const farmLat = vp?.farm_lat ?? null;
        const farmLng = vp?.farm_lng ?? null;
        const [arPoem, solarData] = await Promise.all([
          fetchArPoem({
            variety_name: reorderData.variety_name ?? undefined,
            farm: reorderData.farm ?? undefined,
            harvest_date: reorderData.harvest_date ?? undefined,
            brix_score: vp?.brix_score ?? undefined,
            terrain_type: vp?.terrain_type ?? undefined,
            moon_phase_at_harvest: vp?.moon_phase_at_harvest ?? undefined,
            growing_method: vp?.growing_method ?? undefined,
            farmer_name: vp?.farmer_name ?? undefined,
            flavor_profile: vp ? { sweetness: vp.sweetness, acidity: vp.acidity, aroma: vp.aroma, tasting_notes: vp.tasting_notes } : undefined,
          }).catch(() => null),
          (farmLat != null && farmLng != null) ? fetchSolarIrradiance(farmLat, farmLng).catch(() => null) : Promise.resolve(null),
        ]);

        // Feature C: format standing order label server data into display string
        let nextStandingOrderLabel: string | null = null;
        if (reorderData.next_standing_order) {
          const so = reorderData.next_standing_order;
          nextStandingOrderLabel = `NEXT ORDER  ·  ${so.variety_name}  ·  in ${so.days_until} day${so.days_until === 1 ? '' : 's'}`;
        }

        // AR Expanded 5-6: referral bubble threshold (lifetime scan count)
        const totalScansRaw = await AsyncStorage.getItem('total_scan_count').catch(() => null);
        const totalScans = parseInt(totalScansRaw ?? '0', 10);
        await AsyncStorage.setItem('total_scan_count', String(totalScans + 1)).catch(() => {});
        const showReferralBubble = totalScans >= 3;

        // Compute unlocked achievements (client-side)
        const seenFarmsRaw = await AsyncStorage.getItem('seen_farms').catch(() => null);
        const seenFarms: string[] = seenFarmsRaw ? JSON.parse(seenFarmsRaw) : [];
        const farmName = reorderData.farm ?? '';
        if (farmName && !seenFarms.includes(farmName)) {
          seenFarms.push(farmName);
          AsyncStorage.setItem('seen_farms', JSON.stringify(seenFarms)).catch(() => {});
        }
        const unlockedAchievements = computeUnlockedAchievements({
          orderCount: reorderData.order_count ?? 0,
          varietyId: reorderData.variety_id,
          farmName,
          isWinterVariety: false,
          streakWeeks: reorderData.streak_weeks ?? 0,
          seenFarms,
        });

        // Is this the first time the user has scanned this variety?
        const seenKey = `seen_variety_${reorderData.variety_id}`;
        const alreadySeen = await AsyncStorage.getItem(seenKey);
        const isFirstVariety = !alreadySeen;
        if (isFirstVariety) { AsyncStorage.setItem(seenKey, '1').catch(() => {}); }

        const arPayload: ARVarietyData = {
          variety_id: reorderData.variety_id,
          variety_name: reorderData.variety_name ?? null,
          farm: reorderData.farm ?? null,
          harvest_date: reorderData.harvest_date ?? null,
          quantity: reorderData.quantity,
          chocolate: reorderData.chocolate,
          finish: reorderData.finish,
          // Feature 1: HealthKit nutrition
          vitamin_c_today_mg: (healthCtx as any)?.dietaryVitaminC ?? null,
          calories_today_kcal: (healthCtx as any)?.dietaryEnergyConsumed ?? null,
          // Feature 3: Collectif social layer
          collectif_pickups_today: reorderData.collectif_pickups_today ?? 0,
          // Feature 4: Gift reveal
          is_gift: reorderData.is_gift ?? false,
          gift_note: reorderData.gift_note ?? null,
          // Feature 5: Variety streak
          order_count: reorderData.order_count ?? 0,
          // Feature B: last variety
          last_variety: reorderData.last_variety ?? null,
          // Feature C: standing order label
          next_standing_order_label: nextStandingOrderLabel,
          // Feature D: collectif member names
          collectif_member_names: reorderData.collectif_member_names ?? [],
          // AR Expanded 2: enrichment
          flavor_profile: varietyProfile ?? null,
          farm_distance_km: varietyProfile?.farm_distance_km ?? null,
          season_start: reorderData.season_start ?? null,
          season_end: reorderData.season_end ?? null,
          active_drop: activeDrop ? { id: activeDrop.id, title: activeDrop.title, price_cents: activeDrop.price_cents } : null,
          is_first_variety: isFirstVariety,
          // AR Expanded 3: new enrichment
          brix_score: varietyProfile?.brix_score ?? null,
          growing_method: varietyProfile?.growing_method ?? null,
          moon_phase_at_harvest: varietyProfile?.moon_phase_at_harvest ?? null,
          parent_a: varietyProfile?.parent_a ?? null,
          parent_b: varietyProfile?.parent_b ?? null,
          altitude_m: varietyProfile?.altitude_m ?? null,
          soil_type: varietyProfile?.soil_type ?? null,
          eat_by_days: varietyProfile?.eat_by_days ?? null,
          recipe_name: varietyProfile?.recipe_name ?? null,
          recipe_description: varietyProfile?.recipe_description ?? null,
          harvest_weather_json: varietyProfile?.harvest_weather_json ?? null,
          farm_photo_url: varietyProfile?.farm_photo_url ?? null,
          producer_video_url: varietyProfile?.producer_video_url ?? null,
          streak_weeks: reorderData.streak_weeks ?? null,
          collectif_rank: collectifRankData?.rank ?? null,
          collectif_total_members: collectifRankData?.total_members ?? null,
          scanned_varieties: scannedVarieties ?? [],
          // AR Expanded 4: new enrichment
          fiber_today_g: (healthCtx as any)?.dietaryFiber ?? null,
          allergy_flags: [],
          unlocked_achievements: unlockedAchievements,
          collectif_milestone_pct: reorderData.collectif_milestone_pct ?? null,
          co2_grams: (varietyProfile as any)?.co2_grams ?? null,
          carbon_offset_program: (varietyProfile as any)?.carbon_offset_program ?? null,
          sunlight_hours: (varietyProfile as any)?.sunlight_hours ?? null,
          price_history_json: (varietyProfile as any)?.price_history_json ?? null,
          open_farm_visit: (openFarmVisits as any[])[0] ?? null,
          nearby_ar_notes: nearbyNotes ?? [],
          // AR Expanded 5-6: science & sensory
          personal_best_flavor: (personalBestFlavor as any) ?? null,
          orac_value: (varietyProfile as any)?.orac_value ?? null,
          fermentation_profile: (() => { try { const j = (varietyProfile as any)?.fermentation_profile_json; return j ? JSON.parse(j) : null; } catch { return null; } })(),
          hue_value: (varietyProfile as any)?.hue_value ?? null,
          folate_mcg: (varietyProfile as any)?.folate_mcg ?? null,
          manganese_mg: (varietyProfile as any)?.manganese_mg ?? null,
          potassium_mg: (varietyProfile as any)?.potassium_mg ?? null,
          vitamin_k_mcg: (varietyProfile as any)?.vitamin_k_mcg ?? null,
          // AR Expanded 5-6: farm storytelling
          farmer_name: (varietyProfile as any)?.farmer_name ?? null,
          farmer_quote: (varietyProfile as any)?.farmer_quote ?? null,
          certifications: (() => { try { return JSON.parse((varietyProfile as any)?.certifications_json ?? '[]'); } catch { return []; } })(),
          farm_founded_year: (varietyProfile as any)?.farm_founded_year ?? null,
          farm_milestones: (() => { try { return JSON.parse((varietyProfile as any)?.farm_milestones_json ?? '[]'); } catch { return []; } })(),
          irrigation_method: (varietyProfile as any)?.irrigation_method ?? null,
          cover_crop: (varietyProfile as any)?.cover_crop ?? null,
          terrain_type: (varietyProfile as any)?.terrain_type ?? null,
          prevailing_wind: (varietyProfile as any)?.prevailing_wind ?? null,
          ambient_audio_url: (varietyProfile as any)?.ambient_audio_url ?? null,
          mascot_id: (varietyProfile as any)?.mascot_id ?? null,
          // AR Expanded 5-6: commerce
          bundle_suggestion: (bundleSuggestion as any) ?? null,
          upcoming_drop_at: (upcomingDrop as any)?.upcoming_drop_at ?? null,
          price_drop_pct: (() => {
            const hist = (varietyProfile as any)?.price_history_json;
            if (!hist) return null;
            try {
              const pts = JSON.parse(hist) as Array<{ season: string; priceCents: number }>;
              if (pts.length < 2) return null;
              const latest = pts[pts.length - 1].priceCents;
              const prev = pts[pts.length - 2].priceCents;
              if (prev <= 0) return null;
              const drop = Math.round((prev - latest) / prev * 100);
              return drop > 0 ? drop : null;
            } catch { return null; }
          })(),
          show_referral_bubble: showReferralBubble,
          // AR Expanded 5-6: social
          tasting_word_cloud: (wordCloud as any[]) ?? [],
          batch_members: (batchMembers as any[]) ?? [],
          last_scan_date: reorderData.last_scan_date ?? null,
          last_scan_rating: reorderData.last_scan_rating ?? null,
          last_scan_note: reorderData.last_scan_note ?? null,
          collectif_challenge: (currentChallenge as any) ?? null,
          variety_streak_leaders: (streakLeaders as any)?.leaders ?? (Array.isArray(streakLeaders) ? streakLeaders : []),
          current_user_streak_rank: (streakLeaders as any)?.my_rank ?? null,
          // AR Expanded 7
          farm_webcam_url: vp?.farm_webcam_url ?? null,
          ar_poem: arPoem ?? null,
          solar_data: solarData ?? null,
          // Social expanded
          lot_companions: (lotCompanions as any[]) ?? [],
        };
        setState('success');
        const arResult = await ARBoxModule.presentAR(arPayload);
        // Save tasting journal rating if user provided one
        if (arResult && arResult.rating && reorderData.variety_id) {
          saveTastingRating(reorderData.variety_id, arResult.rating, arResult.notes ?? null).catch(() => {});
        }
        // AR Expanded 4: handle farm visit tap, leave note
        if (arResult?.gift_registry_added && reorderData.variety_id) {
          addToGiftRegistry(reorderData.variety_id, reorderData.variety_name ?? undefined).catch(() => {});
        }
        if (arResult?.farm_visit_tapped) {
          showPanel('farm-visits');
          return;
        }
        if (arResult?.referral_tapped) {
          showPanel('referral');
          return;
        }
        if (arResult?.bundle_tapped) {
          showPanel('drops');
          return;
        }
        if (arResult?.note_body && arResult?.note_color) {
          postArNote(deviceLat, deviceLng, arResult.note_body, arResult.note_color).catch(() => {});
        }
        if (activeDrop) {
          showPanel('drop-detail', { drop: activeDrop });
        } else {
          showPanel('ar-box', arPayload);
        }
      } else {
        const result = await verifyNfc(token);
        await AsyncStorage.setItem('verified', 'true');
        if (result.fraise_chat_email) {
          await AsyncStorage.setItem('fraise_chat_email', result.fraise_chat_email);
        }
        // Store is_staff flag for future scans
        if (result.is_dj) {
          await AsyncStorage.setItem('is_staff', 'true');
        }
        if (result.quantity) {
          logStrawberries(result.quantity).catch(() => {});
        }
        requestHealthKitPermissions().catch(() => {});
        setFirstTapResult({ streak_weeks: result.streak_weeks, streak_milestone: result.streak_milestone, bank_days: result.bank_days, tier: result.tier });
        setState('success');
        setTimeout(() => showPanel('verified'), result.streak_milestone ? 2000 : 600);
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Scan failed. Try again.');
      setState('error');
    }
  };

  useEffect(() => {
    scan();
    return () => { cancelNfc(); };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={styles.body}>
        {state === 'scanning' && (
          <>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={[styles.title, { color: c.text }]}>Hold your phone to the chip.</Text>
            <Text style={[styles.subtitle, { color: c.muted }]}>Inside the lid of the box.</Text>
          </>
        )}

        {state === 'success' && (
          <>
            <View style={[styles.badge, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.badgeIcon, { color: c.accent }]}>
                {firstTapResult?.streak_milestone ? '🍓' : '✓'}
              </Text>
            </View>
            <Text style={[styles.title, { color: c.text }]}>
              {firstTapResult?.streak_milestone ? `${firstTapResult.streak_weeks}-week streak.` : 'Verified.'}
            </Text>
            {firstTapResult?.streak_milestone && (
              <Text style={[styles.subtitle, { color: c.muted }]}>
                You've tapped every week for {firstTapResult.streak_weeks} weeks straight.
              </Text>
            )}
            {firstTapResult?.bank_days != null && firstTapResult.bank_days > 0 && (
              <Text style={[styles.subtitle, { color: c.muted }]}>
                {firstTapResult.bank_days} days of {firstTapResult.tier ?? 'standard'} access added.
              </Text>
            )}
          </>
        )}

        {state === 'error' && (
          <>
            <Text style={[styles.title, { color: c.text }]}>Didn't catch it.</Text>
            <Text style={[styles.subtitle, { color: c.muted }]}>{errorMsg}</Text>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={scan}
              activeOpacity={0.8}
            >
              <Text style={[styles.retryBtnText, { color: c.accent }]}>Try again</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: c.border }]}
          onPress={() => { cancelNfc(); goHome(); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.cancelBtnText, { color: c.muted }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, padding: SPACING.md, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  badge: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeIcon: { fontSize: 32 },
  title: { fontSize: 28, fontFamily: fonts.playfair, textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: fonts.dmSans, textAlign: 'center', lineHeight: 22 },
  retryBtn: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28, borderWidth: StyleSheet.hairlineWidth },
  retryBtnText: { fontSize: 14, fontFamily: fonts.playfair },
  footer: { padding: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  cancelBtnText: { fontSize: 15, fontFamily: fonts.dmSans },
});
