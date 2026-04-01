import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function VarietyPanel() {
  const { goBack, showPanel, order, varieties } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const variety = varieties.find(v => v.id === order.variety_id);

  useEffect(() => { TrueSheet.present('main-sheet', 2); }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>{variety?.name ?? '—'}</Text>
        <View style={styles.headerSpacer} />
      </View>
      {variety?.source_farm && (
        <Text style={[styles.subtitle, { color: c.muted }]}>
          {variety.source_farm}{variety.source_location ? ` · ${variety.source_location}` : ''}
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {variety?.description && (
          <Text style={[styles.description, { color: c.text }]}>{variety.description}</Text>
        )}

        <View style={[styles.statsRow, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: c.text }]}>CA${((variety?.price_cents ?? 0) / 100).toFixed(2)}</Text>
            <Text style={[styles.statLabel, { color: c.muted }]}>per strawberry</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: c.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: (variety?.stock_remaining ?? 0) <= 3 ? '#FF3B30' : c.text }]}>
              {variety?.stock_remaining ?? 0}
            </Text>
            <Text style={[styles.statLabel, {
              color: (variety?.stock_remaining ?? 0) <= 3 ? '#FF3B30' : (variety?.stock_remaining ?? 0) <= 8 ? c.accent : c.muted
            }]}>
              {(variety?.stock_remaining ?? 0) <= 3 ? 'almost gone' : (variety?.stock_remaining ?? 0) <= 8 ? 'selling fast' : 'remaining'}
            </Text>
          </View>
        </View>

        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.accent }]}
          onPress={() => showPanel('chocolate')}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>Order This Strawberry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 22, lineHeight: 28 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  subtitle: { textAlign: 'center', fontSize: 13, fontFamily: fonts.dmSans, paddingTop: 10, paddingBottom: 4, paddingHorizontal: SPACING.md },
  body: { paddingHorizontal: SPACING.md, gap: SPACING.lg },
  description: { fontSize: 16, fontFamily: fonts.dmSans, lineHeight: 26 },
  statsRow: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 20, gap: 4 },
  statValue: { fontSize: 26, fontFamily: fonts.playfair },
  statLabel: { fontSize: 12, fontFamily: fonts.dmSans },
  statDivider: { width: StyleSheet.hairlineWidth },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#FFFFFF' },
});
