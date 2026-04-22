import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { usePanel, Variety } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { fetchCommunityFund, CommunityFundState } from '../../lib/api';

export default function LocationPanel() {
  const { goBack, showPanel, setOrder, setActiveLocation, activeLocation, varieties, businesses, order } = usePanel();
  const c = useColors();
  const [communityFund, setCommunityFund] = useState<CommunityFundState | null>(null);

  useEffect(() => {
    fetchCommunityFund().then(f => setCommunityFund(f)).catch(() => {});
  }, []);

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
  const loc = activeLocation as any;

  const foodStatus: string = loc?.food_popup_status ?? 'announced';
  const isConfirmed = isPopup && foodStatus === 'confirmed';
  const isLive = isPopup && (() => {
    if (!loc?.launched_at) return false;
    const start = new Date(loc.launched_at);
    const end = loc.ends_at ? new Date(loc.ends_at) : new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const now = new Date();
    return now >= start && now < end;
  })();

  const paidCount: number = loc?.food_paid_count ?? 0;
  const threshold: number | null = loc?.min_orders_to_confirm ?? null;
  const progressPct = threshold ? Math.min(1, paidCount / threshold) : null;

  const confirmedDateStr = isConfirmed && loc?.starts_at
    ? new Date(loc.starts_at).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {isPopup && (
            <Text style={[styles.headerBadge, { color: '#C0392B' }]}>
              {isLive ? 'LIVE NOW' : isConfirmed ? 'CONFIRMED' : 'POPUP'}
            </Text>
          )}
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{activeLocation?.name ?? '—'}</Text>
          {isPopup && (
            <Text style={[styles.headerDate, { color: isLive ? '#C0392B' : c.muted }]}>
              {isLive ? 'happening now' : isConfirmed && confirmedDateStr ? confirmedDateStr : 'date TBD'}
            </Text>
          )}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {!isPopup && activeLocation?.address && (
        <Text style={[styles.address, { color: c.muted }]}>{activeLocation.address}</Text>
      )}

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>

        {/* ── Popup status block ── */}
        {isPopup && (
          <View style={[styles.popupStatus, { borderBottomColor: c.border }]}>
            {loc?.description ? (
              <Text style={[styles.popupDesc, { color: c.muted }]}>{loc.description}</Text>
            ) : null}

            {!isConfirmed && (
              <>
                <Text style={[styles.popupStatusText, { color: c.muted }]}>
                  {threshold
                    ? `${paidCount} of ${threshold} orders to confirm`
                    : `${paidCount} prepaid`}
                </Text>
                {progressPct !== null && (
                  <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
                    <View style={[styles.progressFill, { backgroundColor: '#C0392B', width: `${Math.round(progressPct * 100)}%` as any }]} />
                  </View>
                )}
              </>
            )}

            {communityFund && communityFund.threshold_cents > 0 && (
              <View style={styles.fundBlock}>
                <View style={[styles.fundTrack, { backgroundColor: c.border }]}>
                  <View style={[styles.fundFill, { backgroundColor: '#C0392B', width: `${Math.min(100, Math.round((communityFund.balance_cents / communityFund.threshold_cents) * 100))}%` as any }]} />
                </View>
                <Text style={[styles.fundCaption, { color: c.muted }]}>
                  {`CA$${(communityFund.balance_cents / 100).toFixed(0)} of CA$${(communityFund.threshold_cents / 100).toFixed(0)} · next community meal`}
                  {communityFund.popup_count > 0 ? `  ·  ${communityFund.popup_count} done` : ''}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.foodMenuBtn, { backgroundColor: '#C0392B' }]}
              onPress={() => showPanel('popup-food', { popupId: activeLocation.id, popupName: activeLocation.name })}
              activeOpacity={0.8}
            >
              <Text style={[styles.foodMenuBtnText, { color: '#fff' }]}>
                {isLive ? 'order food' : 'prepay for food'}
              </Text>
              <Text style={[styles.foodMenuArrow, { color: '#fff' }]}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.foodMenuBtn, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}
              onPress={() => showPanel('popup-merch', { popupId: activeLocation.id, popupName: activeLocation.name })}
              activeOpacity={0.8}
            >
              <Text style={[styles.foodMenuBtnText, { color: c.text }]}>merch</Text>
              <Text style={[styles.foodMenuArrow, { color: c.muted }]}>→</Text>
            </TouchableOpacity>
          </View>
        )}

        {varieties.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>{isPopup ? 'ALSO AVAILABLE' : 'AVAILABLE TODAY'}</Text>
            {varieties.map(v => (
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
            ))}
          </>
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
  list: { flex: 1 },
  popupStatus: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  popupDesc: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 19 },
  popupStatusText: { fontSize: 12, fontFamily: fonts.dmMono },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
  fundBlock: { gap: 5 },
  fundTrack: { height: 2, borderRadius: 1, overflow: 'hidden' },
  fundFill: { height: 2, borderRadius: 1 },
  fundCaption: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  foodMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderRadius: 8,
  },
  foodMenuBtnText: { fontSize: 14, fontFamily: fonts.dmSans, fontWeight: '600' },
  foodMenuArrow: { fontSize: 16 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
    paddingHorizontal: SPACING.md,
    paddingTop: 16,
    paddingBottom: 8,
  },
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
