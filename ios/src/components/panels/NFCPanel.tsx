import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import { usePanel } from '../../context/PanelContext';
import { useApp } from '../../../App';
import * as Haptics from 'expo-haptics';
import { verifyNfc } from '../../lib/api';
import { setVerified } from '../../lib/userId';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function NFCPanel() {
  const { goBack, showPanel, order } = usePanel();
  const { reviewMode } = useApp();
  const c = useColors();
  const [verifying, setVerifying] = useState(false);
  const [scanning, setScanning] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    if (reviewMode) return;
    NfcManager.isSupported().then(supported => {
      if (supported) startScan();
    });
    return () => { NfcManager.cancelTechnologyRequest().catch(() => {}); };
  }, []);

  const startScan = async () => {
    setScanning(true);
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      const record = tag?.ndefMessage?.[0];
      if (!record?.payload) throw new Error('No data on chip.');
      const token = Ndef.text.decodePayload(new Uint8Array(record.payload as number[]));
      await doVerify(token);
    } catch (err: any) {
      if (err?.message !== 'UserCancel') {
        Alert.alert('Could not read chip', 'Hold your phone steady against the chip and try again.');
      }
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
      setScanning(false);
    }
  };

  const doVerify = async (token: string) => {
    if (verifying) return;
    const stored = await AsyncStorage.getItem('user_db_id');
    if (!stored) {
      Alert.alert('Account required', 'Place an order first to link your account.');
      return;
    }
    setVerifying(true);
    try {
      await verifyNfc(token, parseInt(stored, 10));
      await setVerified();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showPanel('verified');
    } catch (err: unknown) {
      Alert.alert('Verification failed', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Tap the box.</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <View style={styles.pulseContainer}>
          <Animated.View style={[styles.pulseOuter, { transform: [{ scale: pulse }], backgroundColor: `${c.accent}18` }]} />
          <View style={[styles.pulseInner, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.boxIcon, { color: c.accent }]}>⬡</Text>
          </View>
        </View>

        <Text style={[styles.subtitle, { color: scanning ? c.text : c.muted }]}>
          {verifying
            ? 'Verifying your token…'
            : scanning
              ? 'Hold the top of your phone against the NFC chip inside the lid.'
              : 'Open your box and hold your phone to the chip inside the lid.'}
        </Text>

        {reviewMode ? (
          order.nfc_token ? (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: c.border }]}
              onPress={() => doVerify(order.nfc_token!)}
              disabled={verifying}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionBtnText, { color: c.accent }]}>
                {verifying ? 'Verifying…' : 'Simulate tap →'}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.fallbackText, { color: c.muted }]}>No NFC token on this order.</Text>
          )
        ) : (
          <>
            {!scanning && !verifying && (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: c.border }]}
                onPress={startScan}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionBtnText, { color: c.accent }]}>Try again</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.fallbackText, { color: c.muted }]}>
              Having trouble? Email us at hello@maisonfraise.com
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerSpacer: { width: 40 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: SPACING.lg },
  pulseContainer: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  pulseOuter: { position: 'absolute', width: 140, height: 140, borderRadius: 70 },
  pulseInner: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  boxIcon: { fontSize: 38 },
  subtitle: { fontSize: 15, fontFamily: fonts.dmSans, textAlign: 'center', lineHeight: 24 },
  actionBtn: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingVertical: 10 },
  actionBtnText: { fontSize: 14, fontFamily: fonts.dmSans },
  fallbackText: { fontSize: 13, fontFamily: fonts.dmSans, textAlign: 'center', lineHeight: 20 },
});
