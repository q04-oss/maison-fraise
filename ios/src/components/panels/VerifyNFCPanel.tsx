import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { readNfcToken, cancelNfc } from '../../lib/nfc';
import { verifyNfc, collectMarketOrderByNfc, verifyNfcReorder } from '../../lib/api';
import ARBoxModule, { ARVarietyData } from '../../lib/NativeARBoxModule';
import { logStrawberries, requestHealthKitPermissions } from '../../lib/HealthKitService';

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

      if (token === 'fraise.market') {
        await collectMarketOrderByNfc(token);
        setState('success');
        setTimeout(() => showPanel('market-orders'), 600);
        return;
      }

      const alreadyVerified = await AsyncStorage.getItem('verified') === 'true';

      if (alreadyVerified) {
        const reorderData = await verifyNfcReorder(token);
        const arPayload: ARVarietyData = {
          variety_id: reorderData.variety_id,
          variety_name: reorderData.variety_name ?? null,
          farm: reorderData.farm ?? null,
          harvest_date: reorderData.harvest_date ?? null,
          quantity: reorderData.quantity,
          chocolate: reorderData.chocolate,
          finish: reorderData.finish,
        };
        setState('success');
        await ARBoxModule.presentAR(arPayload);
        showPanel('ar-box', arPayload);
      } else {
        const result = await verifyNfc(token);
        await AsyncStorage.setItem('verified', 'true');
        if (result.fraise_chat_email) {
          await AsyncStorage.setItem('fraise_chat_email', result.fraise_chat_email);
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
