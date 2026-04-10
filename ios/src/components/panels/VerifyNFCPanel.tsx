import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { readNfcToken, cancelNfc } from '../../lib/nfc';
import { verifyNfc, verifyNfcReorder, fetchStaffOrderByNfc, staffMarkPrepare, staffMarkReady, staffFlagOrder, bulkPrepareOrders, fetchPickupGrid, fetchStaffExpiryGrid, fetchStaffSessionToday, fetchPostalHeatMap, fetchWalkInToken } from '../../lib/api';
import ARBoxModule, { ARVarietyData } from '../../lib/NativeARBoxModule';
import { logStrawberries, requestHealthKitPermissions } from '../../lib/HealthKitService';

type State = 'scanning' | 'success' | 'error';
type FirstTapResult = { streak_weeks?: number; streak_milestone?: boolean; bank_days?: number; tier?: string | null } | null;

export default function VerifyNFCPanel() {
  const { goHome, showPanel } = usePanel();
  const showPanelRef = useRef(showPanel);
  showPanelRef.current = showPanel;
  const goHomeRef = useRef(goHome);
  goHomeRef.current = goHome;
  const c = useColors();
  const [state, setState] = useState<State>('scanning');
  const [errorMsg, setErrorMsg] = useState('');
  const [firstTapResult, setFirstTapResult] = useState<FirstTapResult>(null);

  const scan = async () => {
    setState('scanning');
    setErrorMsg('');
    try {
      const token = await readNfcToken();

      // Demo mode: skip server call, show mock reveal
      const isDemo = await AsyncStorage.getItem('is_demo') === 'true';
      if (isDemo) {
        setState('success');
        showPanelRef.current('nfc-reveal', { variety_name: 'Gariguette', tasting_notes: null, location_id: null });
        return;
      }

      // Walk-in purchase tag
      if (token.startsWith('fraise-walkin-')) {
        const data = await fetchWalkInToken(token).catch(() => null);
        if (!data) { setErrorMsg('Tag not recognised.'); setState('error'); return; }

        // Location is a pre-order pickup node — redirect to ordering flow
        if (data.allows_walkin === false) {
          showPanelRef.current('location', { preselect_location_id: data.location_id, preselect_location_name: data.location_name });
          return;
        }

        if (data.claimed) {
          const myEmail = await AsyncStorage.getItem('user_email');
          if (myEmail && myEmail === data.owner_email) {
            // Owner scanning their own box — run the full reorder AR flow
            const reorderData = await verifyNfcReorder(token);
            setState('success');
            const arPayload: ARVarietyData = {
              variety_id: reorderData.variety_id,
              variety_name: reorderData.variety_name ?? null,
              farm: reorderData.farm ?? null,
              harvest_date: reorderData.harvest_date ?? null,
              quantity: reorderData.quantity,
              chocolate: reorderData.chocolate,
              finish: reorderData.finish,
              card_type: 'variety',
              order_count: reorderData.order_count ?? 0,
              tasting_word_cloud: [], batch_members: [], lot_companions: [],
            } as any;
            await ARBoxModule.presentAR(arPayload);
            goHomeRef.current();
          } else {
            // Someone else's box at a walkin location — show remaining inventory
            setState('success');
            showPanelRef.current('walk-in-inventory', { location_id: data.location_id, location_name: data.location_name });
          }
        } else {
          setState('success');
          showPanelRef.current('walk-in', { walk_in_token: token });
        }
        return;
      }

      // Generic thank-you tag: any user scans → AR overlay
      if (token === 'fraise-thankyou') {
        setState('success');
        await ARBoxModule.presentAR({
          variety_id: 0, variety_name: null, farm: null, harvest_date: null,
          quantity: 0, chocolate: '', finish: '', card_type: 'thankyou',
        } as any);
        goHomeRef.current();
        return;
      }

      // Staff flow
      const isStaff = await AsyncStorage.getItem('is_staff') === 'true';
      if (isStaff) {
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
        setState('success');
        showPanelRef.current('nfc-reveal', {
          variety_name: reorderData.variety_name ?? 'Strawberry',
          tasting_notes: null,
          location_id: reorderData.location_id ?? null,
        });
      } else {
        const result = await verifyNfc(token);
        await AsyncStorage.setItem('verified', 'true');
        if (result.fraise_chat_email) {
          await AsyncStorage.setItem('fraise_chat_email', result.fraise_chat_email);
        }
        if (result.is_dj) {
          await AsyncStorage.setItem('is_staff', 'true');
        }
        if (result.quantity) {
          logStrawberries(result.quantity).catch(() => {});
        }
        requestHealthKitPermissions().catch(() => {});
        setFirstTapResult({ streak_weeks: result.streak_weeks, streak_milestone: result.streak_milestone, bank_days: result.bank_days, tier: result.tier });
        setState('success');
        setTimeout(() => showPanelRef.current('verified'), result.streak_milestone ? 2000 : 600);
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Scan failed. Try again.');
      setState('error');
    }
  };

  useEffect(() => {
    const t = setTimeout(() => scan(), 350);
    return () => { clearTimeout(t); cancelNfc(); };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { cancelNfc(); goHomeRef.current(); }} activeOpacity={0.7} style={styles.headerLeft}>
          <Text style={[styles.headerBackText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={state === 'error' ? scan : undefined}
          disabled={state !== 'error'}
          activeOpacity={0.6}
          style={styles.headerTitleBtn}
        >
          <Text style={[styles.headerTitle, { color: c.text }]}>
            {state === 'error' ? "Didn't catch it." : 'box fraise'}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerRight} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 24, paddingBottom: 14 },
  headerLeft: { width: 72 },
  headerRight: { width: 72, alignItems: 'flex-end' },
  headerBackText: { fontSize: 28, lineHeight: 34 },
  headerTitleBtn: { flex: 1 },
  headerTitle: { textAlign: 'center', fontSize: 18, fontFamily: fonts.playfair },
});
