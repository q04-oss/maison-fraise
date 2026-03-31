import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function VarietyPanel() {
  const { goBack, showPanel, order, varieties } = usePanel();
  const c = useColors();
  const variety = varieties.find(v => v.id === order.variety_id);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>{variety?.name ?? '—'}</Text>
        {(variety as any)?.farm && <Text style={[styles.source, { color: c.muted }]}>{(variety as any).farm}</Text>}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {(variety as any)?.description && (
          <Text style={[styles.description, { color: c.text }]}>{(variety as any).description}</Text>
        )}

        {(variety as any)?.freshnessLevel !== undefined && (
          <View style={[styles.freshnessTrack, { backgroundColor: c.border }]}>
            <View style={[styles.freshnessBar, {
              width: `${((variety as any).freshnessLevel ?? 0.8) * 100}%` as any,
              backgroundColor: c.accent,
            }]} />
          </View>
        )}

        <View style={styles.metaRow}>
          {(variety as any)?.harvestDate && <Text style={[styles.metaText, { color: c.muted }]}>{(variety as any).harvestDate}</Text>}
          <Text style={[styles.metaText, { color: c.muted }]}>{variety?.stock_remaining ?? 0} remaining</Text>
        </View>

        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: c.text }]}>CA${((variety?.price_cents ?? 0) / 100).toFixed(2)}</Text>
          <Text style={[styles.perItem, { color: c.muted }]}>per strawberry</Text>
        </View>
        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[styles.orderBtn, { backgroundColor: c.text }]}
          onPress={() => showPanel('chocolate')}
          activeOpacity={0.8}
        >
          <Text style={[styles.orderBtnText, { color: c.ctaText }]}>Order This Strawberry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goBack} activeOpacity={0.6} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: c.accent }]}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: SPACING.md, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 32, fontFamily: fonts.playfair },
  source: { fontSize: 13, fontFamily: fonts.dmSans, fontStyle: 'italic', marginTop: 2 },
  body: { paddingHorizontal: SPACING.md, gap: SPACING.md },
  description: { fontSize: 14, fontFamily: fonts.dmSans, fontStyle: 'italic', lineHeight: 22 },
  freshnessTrack: { height: 2, borderRadius: 1, overflow: 'hidden' },
  freshnessBar: { height: 2, borderRadius: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 12, fontFamily: fonts.dmSans },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  price: { fontSize: 28, fontFamily: fonts.playfair },
  perItem: { fontSize: 13, fontFamily: fonts.dmSans },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  orderBtn: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  orderBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
  backLink: { alignItems: 'center', paddingVertical: 8 },
  backLinkText: { fontSize: 15, fontFamily: fonts.dmSans },
});
