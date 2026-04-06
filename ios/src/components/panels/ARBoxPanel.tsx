import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';

export default function ARBoxPanel() {
  const { goHome, panelData, setOrder, showPanel } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const data = panelData ?? {};
  const varietyName: string = data.variety_name ?? 'Strawberry';
  const farm: string | null = data.farm ?? null;
  const harvestDate: string | null = data.harvest_date ?? null;
  const quantity: number = data.quantity ?? 0;
  const chocolate: string = data.chocolate ?? '';
  const finish: string = data.finish ?? '';
  const varietyId: number | null = data.variety_id ?? null;
  const locationId: number | null = data.location_id ?? null;

  const handleReorder = () => {
    if (!varietyId) return;
    setOrder({
      variety_id: varietyId,
      variety_name: varietyName,
      chocolate,
      finish,
      price_cents: null,
    });
    showPanel('location');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingBottom: insets.bottom }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.side} />
        <Text style={[styles.headerTitle, { color: c.text, fontFamily: fonts.dmMono }]}>YOUR BOX</Text>
        <TouchableOpacity onPress={goHome} style={styles.side} activeOpacity={0.7}>
          <Text style={[styles.closeBtn, { color: c.muted }]}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.varietyName, { color: c.text, fontFamily: fonts.playfair }]}>
          {varietyName}
        </Text>

        {(farm || harvestDate) && (
          <Text style={[styles.meta, { color: c.muted, fontFamily: fonts.dmMono }]}>
            {[farm, harvestDate ? `Harvested ${harvestDate}` : null].filter(Boolean).join('  ·  ')}
          </Text>
        )}

        {quantity > 0 && (
          <View style={[styles.orderCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.orderLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>LAST ORDER</Text>
            <Text style={[styles.orderDetail, { color: c.text, fontFamily: fonts.dmSans }]}>
              {quantity} {quantity === 1 ? 'box' : 'boxes'}
              {chocolate ? `  ·  ${chocolate}` : ''}
              {finish ? `  ·  ${finish}` : ''}
            </Text>
          </View>
        )}

        {varietyId && (
          <TouchableOpacity
            style={[styles.reorderBtn, { backgroundColor: c.accent }]}
            onPress={handleReorder}
            activeOpacity={0.85}
          >
            <Text style={[styles.reorderBtnText, { color: c.ctaText ?? '#fff', fontFamily: fonts.dmMono }]}>
              REORDER →
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.doneBtn, { borderColor: c.border }]}
          onPress={goHome}
          activeOpacity={0.7}
        >
          <Text style={[styles.doneBtnText, { color: c.muted, fontFamily: fonts.dmSans }]}>Done</Text>
        </TouchableOpacity>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { width: 40 },
  headerTitle: { fontSize: 14, letterSpacing: 2 },
  closeBtn: { fontSize: 16, textAlign: 'right' },
  scroll: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.lg },
  varietyName: { fontSize: 34, marginBottom: SPACING.sm },
  meta: { fontSize: 12, letterSpacing: 0.5, marginBottom: SPACING.lg },
  orderCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm, marginBottom: SPACING.lg, gap: 4,
  },
  orderLabel: { fontSize: 10, letterSpacing: 1.5 },
  orderDetail: { fontSize: 15 },
  reorderBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: SPACING.sm },
  reorderBtnText: { fontSize: 13, letterSpacing: 1.5 },
  doneBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  doneBtnText: { fontSize: 14 },
});
