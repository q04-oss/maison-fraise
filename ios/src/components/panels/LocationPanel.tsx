import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { usePanel, Variety } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function LocationPanel() {
  const { goBack, showPanel, setOrder, activeLocation, varieties } = usePanel();
  const c = useColors();

  const handleVarietyPress = (v: Variety) => {
    setOrder({
      variety_id: v.id,
      variety_name: v.name,
      price_cents: v.price_cents,
    });
    showPanel('variety');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>{activeLocation?.name ?? '—'}</Text>
        {activeLocation?.address && (
          <Text style={[styles.address, { color: c.muted }]}>{activeLocation.address}</Text>
        )}
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: c.muted }]}>AVAILABLE TODAY</Text>
        {varieties.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.muted }]}>Nothing ready today.</Text>
        ) : (
          varieties.map(v => (
            <TouchableOpacity
              key={v.id}
              style={[styles.varietyRow, { borderBottomColor: c.border }]}
              onPress={() => handleVarietyPress(v)}
              activeOpacity={0.75}
            >
              <View style={[styles.varietyDot, { backgroundColor: c.accent }]} />
              <View style={styles.varietyInfo}>
                <Text style={[styles.varietyName, { color: c.text }]}>{v.name}</Text>
                {(v as any).farm && (
                  <Text style={[styles.varietyFarm, { color: c.muted }]}>{(v as any).farm}</Text>
                )}
              </View>
              <View style={styles.varietyRight}>
                <Text style={[styles.varietyPrice, { color: c.text }]}>CA${(v.price_cents / 100).toFixed(2)}</Text>
                <Text style={[styles.varietyStock, {
                  color: v.stock_remaining <= 3 ? '#FF3B30' : v.stock_remaining <= 8 ? c.accent : c.muted
                }]}>
                  {v.stock_remaining <= 3 ? 'Almost gone' : v.stock_remaining <= 8 ? 'Selling fast' : `${v.stock_remaining} left`}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4, marginBottom: 4 },
  backBtnText: { fontSize: 22, lineHeight: 28 },
  title: { fontSize: 32, fontFamily: fonts.playfair },
  address: { fontSize: 13, fontFamily: fonts.dmSans, marginTop: 2 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
    paddingHorizontal: SPACING.md,
    paddingTop: 16,
    paddingBottom: 8,
  },
  list: { flex: 1 },
  emptyText: { fontSize: 15, fontFamily: fonts.dmSans, textAlign: 'center', marginTop: 32, fontStyle: 'italic' },
  varietyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  varietyDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  varietyInfo: { flex: 1, gap: 4 },
  varietyName: { fontSize: 18, fontFamily: fonts.playfair },
  varietyFarm: { fontSize: 12, fontFamily: fonts.dmSans },
  varietyRight: { alignItems: 'flex-end', gap: 4 },
  varietyPrice: { fontSize: 15, fontFamily: fonts.dmMono },
  varietyStock: { fontSize: 11, fontFamily: fonts.dmSans },
});
