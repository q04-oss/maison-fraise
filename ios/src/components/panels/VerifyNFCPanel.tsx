import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { readNfcToken, cancelNfc } from '../../lib/nfc';
import { verifyNfc, collectMarketOrderByNfc, verifyNfcReorder, fetchStaffOrderByNfc, fetchMarketStallAR, staffMarkPrepare, staffMarkReady, staffFlagOrder, fetchVarietyProfile, fetchActiveDropForVariety, bulkPrepareOrders, fetchMyScannedVarieties, fetchCollectifRank, fetchPickupGrid, saveTastingRating } from '../../lib/api';
import ARBoxModule, { ARVarietyData } from '../../lib/NativeARBoxModule';
import { logStrawberries, requestHealthKitPermissions, getTodayHealthContext } from '../../lib/HealthKitService';

type State = 'scanning' | 'success' | 'error';

export default function VerifyNFCPanel() {
  const { goHome, showPanel } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>('scanning');
  const [errorMsg, setErrorMsg] = useState('');

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
        const staffPayload = { ...staffOrderData, pickup_slots: pickupSlots };
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

        // Fetch all enrichment data in parallel
        const [healthCtx, varietyProfile, activeDrop, scannedVarieties, collectifRankData] = await Promise.all([
          getTodayHealthContext().catch(() => null),
          reorderData.variety_id ? fetchVarietyProfile(reorderData.variety_id).catch(() => null) : Promise.resolve(null),
          reorderData.variety_id ? fetchActiveDropForVariety(reorderData.variety_id).catch(() => null) : Promise.resolve(null),
          fetchMyScannedVarieties().catch(() => [] as any[]),
          fetchCollectifRank().catch(() => null),
        ]);

        // Feature C: format standing order label server data into display string
        let nextStandingOrderLabel: string | null = null;
        if (reorderData.next_standing_order) {
          const so = reorderData.next_standing_order;
          nextStandingOrderLabel = `NEXT ORDER  ·  ${so.variety_name}  ·  in ${so.days_until} day${so.days_until === 1 ? '' : 's'}`;
        }

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
        };
        setState('success');
        const arResult = await ARBoxModule.presentAR(arPayload);
        // Save tasting journal rating if user provided one
        if (arResult && arResult.rating && reorderData.variety_id) {
          saveTastingRating(reorderData.variety_id, arResult.rating, arResult.notes ?? null).catch(() => {});
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
        setState('success');
        setTimeout(() => showPanel('verified'), 600);
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
              <Text style={[styles.badgeIcon, { color: c.accent }]}>✓</Text>
            </View>
            <Text style={[styles.title, { color: c.text }]}>Verified.</Text>
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
