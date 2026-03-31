import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { verifyNfc } from '../../lib/api';
import { setVerified } from '../../lib/userId';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function NFCPanel() {
  const { goBack, showPanel, order } = usePanel();
  const c = useColors();
  const [verifying, setVerifying] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleVerify = async () => {
    if (verifying) return;
    if (!order.nfc_token) {
      Alert.alert('No token', 'This order does not have an NFC token.');
      return;
    }
    const stored = await AsyncStorage.getItem('user_db_id');
    if (!stored) {
      Alert.alert('Account required', 'Place an order first to link your account.');
      return;
    }
    setVerifying(true);
    try {
      await verifyNfc(order.nfc_token, parseInt(stored, 10));
      await setVerified();
      showPanel('verified');
    } catch (err: unknown) {
      Alert.alert('Verification failed', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.stepLabel, { color: c.muted }]}>VERIFICATION</Text>
        <Text style={[styles.title, { color: c.text }]}>Tap the box.</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.pulseContainer}>
          <Animated.View style={[styles.pulseOuter, { transform: [{ scale: pulse }], backgroundColor: `${c.accent}18` }]} />
          <View style={[styles.pulseInner, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.boxIcon, { color: c.accent }]}>⬡</Text>
          </View>
        </View>

        <Text style={[styles.subtitle, { color: c.muted }]}>Hold your phone to the NFC chip inside the lid.</Text>

        <TouchableOpacity style={styles.simulateBtn} onPress={handleVerify} disabled={verifying} activeOpacity={0.7}>
          <Text style={[styles.simulateText, { color: c.accent }]}>{verifying ? 'Verifying…' : 'Simulate tap →'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.6} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: c.accent }]}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: SPACING.md, paddingTop: 8, paddingBottom: 12, gap: 4 },
  stepLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  title: { fontSize: 28, fontFamily: fonts.playfair },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: SPACING.lg },
  pulseContainer: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  pulseOuter: { position: 'absolute', width: 140, height: 140, borderRadius: 70 },
  pulseInner: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  boxIcon: { fontSize: 38 },
  subtitle: { fontSize: 15, fontFamily: fonts.dmSans, textAlign: 'center', lineHeight: 24 },
  simulateBtn: { paddingVertical: 12 },
  simulateText: { fontSize: 13, fontFamily: fonts.dmSans },
  footer: { padding: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
  backLink: { alignItems: 'center', paddingVertical: 4 },
  backLinkText: { fontSize: 15, fontFamily: fonts.dmSans },
});
