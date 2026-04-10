import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';

export default function NfcRevealPanel() {
  const { goHome, showPanel, panelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const varietyName: string = panelData?.variety_name ?? 'Strawberry';
  const tastingNotes: string | null = panelData?.tasting_notes ?? null;
  const locationId: number | null = panelData?.location_id ?? null;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goHome} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={[styles.collected, { color: c.muted, fontFamily: fonts.dmMono }]}>COLLECTED</Text>
        <Text style={[styles.varietyName, { color: c.text, fontFamily: fonts.playfair }]}>{varietyName}</Text>
        {!!tastingNotes && (
          <Text style={[styles.notes, { color: c.muted, fontFamily: fonts.dmSans }]}>{tastingNotes}</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.reorderBtn, { backgroundColor: c.accent }]}
        onPress={() => showPanel('location', locationId ? { preselect_location_id: locationId } : undefined)}
        activeOpacity={0.8}
      >
        <Text style={[styles.reorderText, { fontFamily: fonts.dmSans }]}>REORDER →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 8,
  },
  backBtn: { paddingVertical: 4, alignSelf: 'flex-start' },
  backArrow: { fontSize: 28, lineHeight: 34 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    gap: 16,
  },
  collected: {
    fontSize: 11,
    letterSpacing: 3,
  },
  varietyName: {
    fontSize: 38,
    textAlign: 'center',
    lineHeight: 46,
  },
  notes: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 8,
    maxWidth: 300,
  },
  reorderBtn: {
    marginHorizontal: SPACING.lg,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  reorderText: {
    color: '#fff',
    fontSize: 14,
    letterSpacing: 1.5,
  },
});
