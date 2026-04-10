import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { createWalkInTokens } from '../../lib/api';
import { writeNfcToken, cancelNfc } from '../../lib/nfc';

type Step = 'setup' | 'writing' | 'done' | 'error';

export default function WalkInWritePanel() {
  const { goBack, panelData, businesses, varieties } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [locationId, setLocationId] = useState<number | null>(panelData?.location_id ?? null);
  const [varietyId, setVarietyId] = useState<number | null>(panelData?.variety_id ?? null);
  const [count, setCount] = useState('1');
  const [step, setStep] = useState<Step>('setup');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const stockedVarieties = varieties.filter((v: any) => v.stock_remaining > 0 && v.active !== false);
  const activeLocations = businesses.filter((b: any) => b.active !== false);

  const handleWrite = async () => {
    if (!locationId || !varietyId) { Alert.alert('Select a location and variety.'); return; }
    const n = parseInt(count, 10);
    if (isNaN(n) || n < 1 || n > 50) { Alert.alert('Enter a count between 1 and 50.'); return; }

    const pin = await AsyncStorage.getItem('staff_pin') ?? '';
    if (!pin) { Alert.alert('No staff PIN saved. Sign in via the terminal first.'); return; }

    setStep('writing');
    setTotal(n);
    setProgress(0);

    try {
      const tokens = await createWalkInTokens(pin, locationId, varietyId, n);
      for (let i = 0; i < tokens.length; i++) {
        setProgress(i + 1);
        await writeNfcToken(tokens[i]);
      }
      setStep('done');
    } catch (err: any) {
      cancelNfc();
      setErrorMsg(err?.message ?? 'Failed. Try again.');
      setStep('error');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => { cancelNfc(); goBack(); }} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>WRITE WALK-IN TAGS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {step === 'setup' && (
          <>
            <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>LOCATION</Text>
            {activeLocations.map((b: any) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.chip, { borderColor: c.border }, locationId === b.id && { backgroundColor: c.accent, borderColor: c.accent }]}
                onPress={() => setLocationId(b.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: locationId === b.id ? '#fff' : c.muted, fontFamily: fonts.dmMono }]}>
                  {b.name}
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>VARIETY</Text>
            {stockedVarieties.map((v: any) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.chip, { borderColor: c.border }, varietyId === v.id && { backgroundColor: c.accent, borderColor: c.accent }]}
                onPress={() => setVarietyId(v.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: varietyId === v.id ? '#fff' : c.muted, fontFamily: fonts.dmMono }]}>
                  {v.name}  ·  {v.stock_remaining} left
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>HOW MANY TAGS</Text>
            <TextInput
              style={[styles.countInput, { color: c.text, borderColor: c.border, fontFamily: fonts.dmMono }]}
              value={count}
              onChangeText={setCount}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={2}
            />

            <TouchableOpacity
              style={[styles.writeBtn, { backgroundColor: c.accent }]}
              onPress={handleWrite}
              activeOpacity={0.8}
            >
              <Text style={[styles.writeBtnText, { fontFamily: fonts.dmSans }]}>Write tags →</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'writing' && (
          <View style={styles.centred}>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={[styles.statusText, { color: c.text, fontFamily: fonts.playfair }]}>
              {progress} / {total}
            </Text>
            <Text style={[styles.statusSub, { color: c.muted, fontFamily: fonts.dmSans }]}>
              Hold phone to the next tag.
            </Text>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.centred}>
            <View style={[styles.badge, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.badgeIcon, { color: c.accent }]}>✓</Text>
            </View>
            <Text style={[styles.statusText, { color: c.text, fontFamily: fonts.playfair }]}>
              {total} {total === 1 ? 'tag' : 'tags'} written.
            </Text>
            <TouchableOpacity style={[styles.writeBtn, { backgroundColor: c.accent }]} onPress={goBack} activeOpacity={0.8}>
              <Text style={[styles.writeBtnText, { fontFamily: fonts.dmSans }]}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'error' && (
          <View style={styles.centred}>
            <Text style={[styles.statusText, { color: c.text, fontFamily: fonts.playfair }]}>Failed.</Text>
            <Text style={[styles.statusSub, { color: c.muted, fontFamily: fonts.dmSans }]}>{errorMsg}</Text>
            <TouchableOpacity style={[styles.writeBtn, { backgroundColor: c.accent }]} onPress={() => setStep('setup')} activeOpacity={0.8}>
              <Text style={[styles.writeBtnText, { fontFamily: fonts.dmSans }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 11, letterSpacing: 2 },
  headerSpacer: { width: 28 },
  body: { padding: SPACING.md, paddingBottom: 60, gap: SPACING.sm },
  sectionLabel: { fontSize: 10, letterSpacing: 2, marginTop: SPACING.md },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  chipText: { fontSize: 12, letterSpacing: 0.5 },
  countInput: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 18, letterSpacing: 2, width: 80,
  },
  writeBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: SPACING.lg },
  writeBtnText: { color: '#fff', fontSize: 15 },
  centred: { alignItems: 'center', paddingTop: 80, gap: SPACING.md },
  badge: { width: 72, height: 72, borderRadius: 36, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  badgeIcon: { fontSize: 32 },
  statusText: { fontSize: 26, textAlign: 'center' },
  statusSub: { fontSize: 14, textAlign: 'center', lineHeight: 22, opacity: 0.7 },
});
