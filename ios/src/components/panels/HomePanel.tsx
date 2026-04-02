import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, StyleSheet, ActivityIndicator, LayoutAnimation, Platform, UIManager, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { usePanel, Variety } from '../../context/PanelContext';
import { fetchVarieties } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { STRAWBERRIES } from '../../data/seed';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatHarvestDate(iso: string): string {
  const d = new Date(iso);
  const months = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function freshnessLabel(level?: number): string {
  if (!level) return 'Last chance';
  if (level >= 0.8) return '旬';
  if (level >= 0.5) return 'Good';
  return 'Last chance';
}

export default function HomePanel() {
  const { showPanel, setVarieties, setOrder, setActiveLocation, varieties, activeLocation, sheetHeight, businesses } = usePanel();
  const c = useColors();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isCollapsed = sheetHeight < 110;
  const hasFetched = useRef(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const now = new Date();
  const locations = businesses.filter((b: any) => {
    if (b.type === 'collection') return true;
    if (b.type === 'popup') {
      if (!b.launched_at) return false;
      // Keep popup if its day hasn't fully passed (allow until end of that day)
      const d = new Date(b.launched_at);
      d.setHours(23, 59, 59, 999);
      return d >= now;
    }
    return false;
  });
  const singleLocation = locations.length === 1;

  const todayLabel = now.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  const month = now.getMonth() + 1;
  const seasonKanji = month >= 3 && month <= 5 ? '春'
    : month >= 6 && month <= 8 ? '夏'
    : month >= 9 && month <= 11 ? '秋'
    : '冬';

  useEffect(() => {
    if (expandedId !== null) return;
    if (activeLocation) {
      setExpandedId(activeLocation.id);
    } else {
      const first = locations.find((b: any) => b.type === 'collection');
      if (first) setExpandedId(first.id);
    }
  }, [activeLocation?.id, businesses.length]);

  const loadVarieties = () => {
    if (hasFetched.current || varieties.length > 0) { setLoading(false); return; }
    hasFetched.current = true;
    setFetchError(false);
    setLoading(true);
    fetchVarieties()
      .then((vars: any[]) => {
        const merged = vars.map((v: any) => {
          const seed = STRAWBERRIES.find(s => s.name === v.name);
          return { ...(seed ?? {}), ...v, harvestDate: v.harvest_date ?? seed?.harvestDate };
        });
        setVarieties(merged);
      })
      .catch(() => { hasFetched.current = false; setFetchError(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadVarieties(); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    hasFetched.current = false;
    loadVarieties();
    setRefreshing(false);
  };

  const handleLocationToggle = (biz: any) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prev => prev === biz.id ? null : biz.id);
  };

  const handleVarietyPress = (v: Variety, biz: any) => {
    Haptics.selectionAsync();
    setActiveLocation(biz);
    setOrder({
      variety_id: v.id,
      variety_name: v.name,
      price_cents: v.price_cents,
      location_id: biz.id,
      location_name: biz.name,
    });
    showPanel('chocolate');
  };

  const renderVarieties = (biz: any) => {
    if (loading) return <ActivityIndicator color={c.accent} style={{ marginVertical: 24 }} />;
    if (fetchError) return (
      <TouchableOpacity onPress={loadVarieties} style={{ paddingVertical: 20, alignItems: 'center' }} activeOpacity={0.7}>
        <Text style={[styles.emptyText, { color: c.muted }]}>Could not load. Tap to retry.</Text>
      </TouchableOpacity>
    );
    // Filter by location if the API returns location-scoped varieties; fall back to all
    const hasLocationData = varieties.some(v => v.location_id != null);
    const bizVarieties = hasLocationData ? varieties.filter(v => v.location_id === biz.id) : varieties;
    if (bizVarieties.length === 0) return (
      <Text style={[styles.emptyText, { color: c.muted, paddingVertical: 20 }]}>Nothing ready today.</Text>
    );
    return bizVarieties.map(v => {
      const freshColor = v.freshnessColor ?? c.accent;
      const label = freshnessLabel(v.freshnessLevel);
      const stockLow = v.stock_remaining <= 3;
      return (
        <TouchableOpacity
          key={v.id}
          style={[styles.varietyRow, { borderTopColor: c.border }]}
          onPress={() => handleVarietyPress(v, biz)}
          activeOpacity={0.75}
        >
          <View style={styles.rowMain}>
            <Text style={[styles.varietyName, { color: c.text }]}>{v.name}</Text>
            {!!v.description && (
              <Text style={[styles.varietyDesc, { color: c.muted }]} numberOfLines={2}>{v.description}</Text>
            )}
            <View style={styles.meta}>
              {v.farm && <Text style={[styles.farm, { color: c.muted }]}>{v.farm}</Text>}
              <View style={[styles.freshDot, { backgroundColor: freshColor }]} />
              <Text style={[styles.freshLabel, { color: freshColor }]}>{label}</Text>
            </View>
            {!!v.harvestDate && (
              <Text style={[styles.harvestDate, { color: c.muted }]}>
                Récolte {formatHarvestDate(v.harvestDate)}
              </Text>
            )}
          </View>
          {!!v.image_url && (
            <Image source={{ uri: v.image_url }} style={[styles.varietyThumb, { backgroundColor: c.border }]} />
          )}
          <View style={styles.rowRight}>
            <Text style={[styles.price, { color: c.text }]}>CA${(v.price_cents / 100).toFixed(2)}</Text>
            <Text style={[styles.stock, { color: stockLow ? '#FF3B30' : c.muted }]}>
              {stockLow ? 'Almost gone' : `${v.stock_remaining} left`}
            </Text>
          </View>
        </TouchableOpacity>
      );
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.brandRow, { borderBottomColor: c.border }, !isCollapsed && styles.brandRowBorder]}>
        <View style={styles.brandInner}>
          <Text style={[styles.brandName, { color: c.text }]}>Maison Fraise</Text>
          {!isCollapsed && <Text style={[styles.brandDate, { color: c.muted }]}>{todayLabel}</Text>}
        </View>
        {!isCollapsed && <Text style={[styles.seasonKanji, { color: c.border }]}>{seasonKanji}</Text>}
      </View>

      {!isCollapsed && (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
          {locations.length === 0 && (
            <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
          )}
          {locations.length > 0 && expandedId === null && !singleLocation && (
            <Text style={[styles.emptyText, { color: c.muted, marginTop: 40 }]}>Select a location above.</Text>
          )}
          {locations.map((biz: any) => {
            const isExpanded = singleLocation || expandedId === biz.id;
            const isPopup = biz.type === 'popup';
            const popupDate = isPopup && biz.launched_at
              ? (biz.hours ?? new Date(biz.launched_at).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }))
              : null;

            return (
              <View key={biz.id}>
                {singleLocation ? (
                  // Single location: non-interactive label row
                  <View style={[styles.locationRow, styles.locationRowExpanded, { borderBottomColor: c.border }]}>
                    <View style={styles.locationMain}>
                      {isPopup && <Text style={[styles.popupBadge, { color: '#C0392B' }]}>POPUP</Text>}
                      <Text style={[styles.locationName, { color: c.text }]}>{biz.name}</Text>
                      {popupDate && <Text style={[styles.locationDate, { color: c.muted }]}>{popupDate}</Text>}
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.locationRow, { borderBottomColor: c.border }, isExpanded && styles.locationRowExpanded]}
                    onPress={() => handleLocationToggle(biz)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.locationMain}>
                      {isPopup && <Text style={[styles.popupBadge, { color: '#C0392B' }]}>POPUP</Text>}
                      <Text style={[styles.locationName, { color: c.text }]}>{biz.name}</Text>
                      {popupDate && <Text style={[styles.locationDate, { color: c.muted }]}>{popupDate}</Text>}
                    </View>
                    <Text style={[styles.locationChevron, { color: c.muted }, isExpanded && styles.locationChevronOpen]}>›</Text>
                  </TouchableOpacity>
                )}

                {isExpanded && (
                  <View style={[styles.varietyBlock, { borderBottomColor: c.border }]}>
                    {renderVarieties(biz)}
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  brandRow: {
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  brandRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brandInner: { alignItems: 'center', justifyContent: 'center' },
  brandName: {
    fontSize: 20,
    fontFamily: fonts.playfair,
  },
  brandDate: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5, marginTop: 3 },
  seasonKanji: { fontSize: 28, position: 'absolute', right: SPACING.md },
  list: { flex: 1 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  locationRowExpanded: {
    borderBottomWidth: 0,
  },
  locationMain: { flex: 1, gap: 3 },
  popupBadge: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  locationName: { fontSize: 18, fontFamily: fonts.playfair },
  locationDate: { fontSize: 12, fontFamily: fonts.dmSans },
  locationChevron: { fontSize: 22 },
  locationChevronOpen: { transform: [{ rotate: '90deg' }] },
  varietyBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  varietyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 18,
    paddingLeft: SPACING.md + 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowMain: { flex: 1, gap: 6 },
  varietyName: { fontSize: 17, fontFamily: fonts.playfair },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  farm: { fontSize: 11, fontFamily: fonts.dmMono },
  freshDot: { width: 6, height: 6, borderRadius: 3 },
  freshLabel: { fontSize: 11, fontFamily: fonts.dmMono },
  varietyThumb: { width: 48, height: 48, borderRadius: 6 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  price: { fontSize: 15, fontFamily: fonts.dmMono },
  stock: { fontSize: 11, fontFamily: fonts.dmSans },
  emptyText: { fontSize: 15, fontFamily: fonts.dmSans, textAlign: 'center', fontStyle: 'italic' },
  varietyDesc: { fontSize: 11, fontFamily: fonts.dmSans, lineHeight: 16, fontStyle: 'italic' },
  harvestDate: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5, fontStyle: 'italic' },
});
