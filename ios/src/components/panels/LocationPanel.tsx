import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { usePanel, Variety } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { formatHours24 } from '../../lib/geo';

export default function LocationPanel() {
  const { goBack, showPanel, setOrder, setActiveLocation, activeLocation, varieties, businesses, order } = usePanel();
  const c = useColors();

  const doLocationSwitch = (biz: any) => {
    setActiveLocation(biz);
    setOrder({ location_id: biz.location_id ?? biz.id, location_name: biz.name, variety_id: null, variety_name: null, price_cents: null, chocolate: null, chocolate_name: null, finish: null, finish_name: null, date: null, time_slot_id: null, time_slot_time: null });
  };

  const handleLocationSwitch = (biz: any) => {
    if (biz.id === activeLocation?.id) return;
    if (order.variety_id) {
      Alert.alert('Restart order?', 'Switching location will clear your current selection.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', style: 'destructive', onPress: () => doLocationSwitch(biz) },
      ]);
      return;
    }
    doLocationSwitch(biz);
  };

  const { goHome, setPanelData } = usePanel();

  const handleVarietyPress = (v: Variety) => {
    setPanelData({ preselectedVariety: { id: v.id, name: v.name, price_cents: v.price_cents } });
    goHome();
  };

  const isPopup = activeLocation?.type === 'popup';
  const popupDate = isPopup && activeLocation?.launched_at
    ? (activeLocation.hours ? formatHours24(activeLocation.hours) : new Date(activeLocation.launched_at).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }))
    : null;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {isPopup && <Text style={[styles.headerBadge, { color: '#C0392B' }]}>POPUP</Text>}
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{activeLocation?.name ?? '—'}</Text>
          {popupDate && <Text style={[styles.headerDate, { color: c.muted }]}>{popupDate}</Text>}
        </View>
        <View style={styles.headerSpacer} />
      </View>
      {!isPopup && activeLocation?.address && (
        <Text style={[styles.address, { color: c.muted }]}>{activeLocation.address}</Text>
      )}

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: c.muted }]}>{isPopup ? 'AVAILABLE AT THIS POPUP' : 'AVAILABLE TODAY'}</Text>
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
                {v.farm && (
                  <Text style={[styles.varietyFarm, { color: c.muted }]}>{v.farm}</Text>
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
        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerBadge: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  title: { fontSize: 20, fontFamily: fonts.playfair, textAlign: 'center' },
  headerDate: { fontSize: 13, fontFamily: fonts.dmSans },
  headerSpacer: { width: 40 },
  address: { fontSize: 13, fontFamily: fonts.dmSans, textAlign: 'center', paddingTop: 4, paddingBottom: 4, paddingHorizontal: SPACING.md },
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
  chatLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1 },
});
