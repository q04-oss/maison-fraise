import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { colors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function NFCPanel() {
  const { goBack, showPanel } = usePanel();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.back}>
          <Text style={styles.backText}>← Order</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>VERIFICATION</Text>
        <Text style={styles.title}>Tap the box.</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.pulseContainer}>
          <Animated.View style={[styles.pulseOuter, { transform: [{ scale: pulse }] }]} />
          <View style={styles.pulseInner}>
            <Text style={styles.boxIcon}>⬡</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>Hold your phone to the NFC chip inside the lid.</Text>

        <TouchableOpacity style={styles.simulateBtn} onPress={() => showPanel('verified')} activeOpacity={0.7}>
          <Text style={styles.simulateText}>Simulate tap →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { backgroundColor: colors.green, paddingHorizontal: SPACING.md, paddingTop: 16, paddingBottom: 24 },
  back: { paddingVertical: 4, marginBottom: 8 },
  backText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: fonts.dmSans },
  stepLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginBottom: 4 },
  title: { color: colors.cream, fontSize: 28, fontFamily: fonts.playfair },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: SPACING.lg },
  pulseContainer: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  pulseOuter: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(28,58,42,0.12)' },
  pulseInner: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.gold },
  boxIcon: { fontSize: 38, color: colors.gold },
  subtitle: { fontSize: 15, color: colors.muted, fontFamily: fonts.dmSans, textAlign: 'center', lineHeight: 24 },
  simulateBtn: { paddingVertical: 12 },
  simulateText: { color: colors.muted, fontSize: 13, fontFamily: fonts.dmSans },
});
