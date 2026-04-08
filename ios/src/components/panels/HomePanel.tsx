import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  RefreshControl, StyleSheet, ActivityIndicator, FlatList,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel, Variety } from '../../context/PanelContext';
import { fetchVarieties, fetchTodayStats, fetchBatchStatus } from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';
import { STRAWBERRIES } from '../../data/seed';

const SHEET_NAME = 'main-sheet';

function formatHarvestDate(iso: string): string {
  const d = new Date(iso);
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default function HomePanel() {
  const { setVarieties, setActiveLocation, varieties, activeLocation, businesses, sheetHeight, setPanelData, jumpToPanel, showPanel, order, setOrder } = usePanel();
  const now = new Date();
  const otherLocations = businesses.filter((b: any) => {
    if (b.id === activeLocation?.id) return false;
    if (b.type === 'collection') return true;
    if (b.type === 'popup') {
      if (!b.launched_at) return false;
      const d = new Date(b.launched_at); d.setHours(23, 59, 59, 999);
      return d >= now;
    }
    return false;
  });

  const c = useColors();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayStats, setTodayStats] = useState<{ pickups_today: number; active_locations: number; varieties_today: number } | null>(null);
  const isCollapsed = sheetHeight < 110;
  const hasFetched = useRef(false);

  const todayLabel = now.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  const month = now.getMonth() + 1;
  const season = month >= 3 && month <= 5 ? 'spring'
    : month >= 6 && month <= 8 ? 'summer'
    : month >= 9 && month <= 11 ? 'autumn'
    : 'winter';

  const loadVarieties = async () => {
    if (hasFetched.current || varieties.length > 0) { setLoading(false); return; }
    hasFetched.current = true;
    setFetchError(false);
    setLoading(true);
    try {
      const vars: any[] = await fetchVarieties();
      const merged = vars.map((v: any) => {
        const seed = STRAWBERRIES.find(s => s.name === v.name);
        return { ...(seed ?? {}), ...v, harvestDate: v.harvest_date ?? seed?.harvestDate };
      });
      setVarieties(merged);
    } catch {
      hasFetched.current = false;
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVarieties();
    fetchTodayStats().then(setTodayStats).catch(() => {});
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    hasFetched.current = true;
    setFetchError(false);
    try {
      const vars: any[] = await fetchVarieties();
      const merged = vars.map((v: any) => {
        const seed = STRAWBERRIES.find(s => s.name === v.name);
        return { ...(seed ?? {}), ...v, harvestDate: v.harvest_date ?? seed?.harvestDate };
      });
      setVarieties(merged);
    } catch {
      hasFetched.current = false;
      setFetchError(true);
    } finally {
      setRefreshing(false);
    }
  };

  const handleVarietyPress = (v: Variety) => {
    setPanelData({ openOrder: true, preselectedVariety: { id: v.id, name: v.name, price_cents: v.price_cents } });
    jumpToPanel('terminal');
    setTimeout(() => TrueSheet.present(SHEET_NAME, 1), 350);
  };

  const [batchStatus, setBatchStatus] = useState<Record<number, { queued_boxes: number; min_quantity: number }>>({});

  useEffect(() => {
    if (!activeLocation?.id) { setBatchStatus({}); return; }
    let cancelled = false;
    fetchBatchStatus(activeLocation.id).then(rows => {
      if (cancelled) return;
      const map: Record<number, { queued_boxes: number; min_quantity: number }> = {};
      rows.forEach(r => { map[r.variety_id] = { queued_boxes: r.queued_boxes, min_quantity: r.min_quantity }; });
      setBatchStatus(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeLocation?.id]);

    const bizVarieties = activeLocation
    ? varieties.filter((v: any) => (v.variety_type ?? 'strawberry') === 'strawberry')
    : [];

  const stripLabel = activeLocation ? activeLocation.name.toLowerCase() : 'box fraise';

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>

      {/* Collapsed strip */}
      <TouchableOpacity
        style={styles.strip}
        activeOpacity={activeLocation ? 0.6 : 1}
        onPress={() => {
          if (!activeLocation) return;
          setPanelData({ openOrder: true });
          jumpToPanel('terminal');
          setTimeout(() => TrueSheet.present(SHEET_NAME, 1), 350);
        }}
      >
        <Text style={[styles.stripBrand, { color: c.text }]}>
          {activeLocation ? `box fraise × ${activeLocation.name.toLowerCase()}` : 'box fraise'}
        </Text>
      </TouchableOpacity>

      {!isCollapsed && (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        >
          {!activeLocation ? (

            /* ── No location selected ── */
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: c.text }]}>Box Fraise</Text>
              <Text style={[styles.emptyDate, { color: c.muted }]}>{todayLabel}</Text>
              <Text style={[styles.emptySeason, { color: c.muted }]}>{season}</Text>
              {todayStats && todayStats.pickups_today > 0 && (
                <Text style={[styles.emptyHint, { color: c.accent }]}>
                  {todayStats.pickups_today} pickups today · {todayStats.active_locations} locations · {todayStats.varieties_today} {todayStats.varieties_today === 1 ? 'variety' : 'varieties'}
                </Text>
              )}
              <Text style={[styles.emptyHint, { color: c.muted }]}>tap a location on the map</Text>
            </View>

          ) : (
            <>
              {/* ── Location meta ── */}
              <View style={styles.locationMeta}>
                <View style={styles.locationMetaRow}>
                  <Text style={[styles.locationMetaText, { color: c.muted, flex: 1 }]} numberOfLines={1}>
                    {[
                      activeLocation.type === 'popup' ? 'popup' : null,
                      activeLocation.address ?? activeLocation.neighbourhood ?? null,
                      activeLocation.type === 'popup' && activeLocation.launched_at
                        ? (activeLocation.hours ?? new Date(activeLocation.launched_at).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }))
                        : todayLabel,
                    ].filter(Boolean).join('  ·  ')}
                  </Text>
                </View>
                {order.order_id && order.location_id === activeLocation.id && (
                  <Text style={[styles.orderPlaced, { color: c.accent }]}>order placed</Text>
                )}
              </View>


              {/* ── Shop identity ── */}
              {!!activeLocation.description && (
                <View style={styles.identityBlock}>
                  <Text style={[styles.description, { color: c.muted }]}>{activeLocation.description}</Text>
                </View>
              )}

              {/* ── Location switcher ── */}
              {otherLocations.length > 0 && (
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={otherLocations}
                  keyExtractor={b => String(b.id)}
                  contentContainerStyle={styles.switcherRow}
                  renderItem={({ item: b }) => (
                    <TouchableOpacity
                      onPress={() => { setActiveLocation(b); setOrder({ location_id: b.id, location_name: b.name }); }}
                      activeOpacity={0.7}
                      style={[styles.switcherChip, { borderColor: c.border }]}
                    >
                      <Text style={[styles.switcherChipText, { color: c.muted }]}>{b.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}

              <View style={[styles.divider, { backgroundColor: c.border }]} />

              {/* ── Today's varieties ── */}
              <View style={styles.varietiesBlock}>
                {loading ? (
                  <ActivityIndicator color={c.accent} style={{ marginVertical: 32 }} />
                ) : fetchError ? (
                  <TouchableOpacity onPress={loadVarieties} activeOpacity={0.7} style={styles.retryRow}>
                    <Text style={[styles.retryText, { color: c.muted }]}>could not load — tap to retry</Text>
                  </TouchableOpacity>
                ) : bizVarieties.length === 0 ? (
                  <Text style={[styles.nothingText, { color: c.muted }]}>nothing ready today</Text>
                ) : (
                  bizVarieties.map((v, idx) => {
                    const freshColor = v.freshnessColor ?? c.accent;
                    return (
                      <React.Fragment key={v.id}>
                        {idx > 0 && <View style={[styles.varietyDivider, { backgroundColor: c.border }]} />}
                        <TouchableOpacity
                          style={styles.varietyBlock}
                          onPress={() => handleVarietyPress(v)}
                          activeOpacity={0.8}
                        >
                          {/* Top row: name + price */}
                          <View style={styles.varietyTopRow}>
                            <Text style={[styles.varietyName, { color: c.text }]}>{v.name}</Text>
                            <Text style={[styles.varietyPrice, { color: c.text }]}>
                              CA${(v.price_cents / 100).toFixed(0)}
                            </Text>
                          </View>

                          {/* Provenance row */}
                          <View style={styles.provenanceRow}>
                            {v.farm && (
                              <Text style={[styles.farm, { color: c.muted }]}>{v.farm}</Text>
                            )}
                            {v.farm && v.harvestDate && (
                              <Text style={[styles.provenanceDot, { color: c.border }]}>·</Text>
                            )}
                            {v.harvestDate && (
                              <Text style={[styles.harvest, { color: c.muted }]}>récolte {formatHarvestDate(v.harvestDate)}</Text>
                            )}
                            {(v.farm || v.harvestDate) && (
                              <Text style={[styles.provenanceDot, { color: c.border }]}>·</Text>
                            )}
                            <View style={[styles.freshDot, { backgroundColor: freshColor }]} />
                            {v.avg_rating != null && (v.rating_count ?? 0) > 0 && (
                              <>
                                <Text style={[styles.provenanceDot, { color: c.border }]}>·</Text>
                                <Text style={[styles.rating, { color: '#FFD700' }]}>★ {v.avg_rating.toFixed(1)}</Text>
                              </>
                            )}
                          </View>

                          {/* Description */}
                          {v.description && (
                            <Text style={[styles.varietyDesc, { color: c.muted }]}>{v.description}</Text>
                          )}

                          {/* Image + stock */}
                          <View style={styles.varietyBottomRow}>
                            <View style={styles.batchBarWrap}>
                              <View style={[styles.batchBarTrack, { backgroundColor: c.border }]}>
                                <View style={[styles.batchBarFill, { backgroundColor: c.accent, width: `${Math.min(100, ((batchStatus[v.id]?.queued_boxes ?? 0) / (batchStatus[v.id]?.min_quantity ?? 4)) * 100)}%` }]} />
                              </View>
                              <Text style={[styles.batchBarLabel, { color: c.muted }]}>
                                {batchStatus[v.id]?.queued_boxes ?? 0} of {batchStatus[v.id]?.min_quantity ?? 4} queued
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      </React.Fragment>
                    );
                  })
                )}
              </View>
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  strip: { alignItems: 'center', paddingTop: 28, paddingBottom: 20 },
  stripBrand: { fontSize: 13, fontFamily: fonts.playfair, letterSpacing: 0.3 },
  scroll: { flex: 1 },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: SPACING.xl ?? 40, gap: 6 },
  emptyTitle: { fontSize: 24, fontFamily: fonts.playfair },
  emptyDate: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  emptySeason: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5, fontStyle: 'italic' },
  emptyHint: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5, marginTop: 20 },

  // Location meta
  locationMeta: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: 4, gap: 4 },
  locationMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationMetaText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  orderPlaced: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },

  // Shop identity
  identityBlock: { paddingHorizontal: SPACING.md, paddingTop: 6, paddingBottom: SPACING.md, gap: 6 },
  description: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, fontStyle: 'italic' },
  // Location switcher
  switcherRow: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: 8, flexDirection: 'row' },
  switcherChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  switcherChipText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1 },

  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },

  // Varieties
  varietiesBlock: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, gap: 0 },
  varietyDivider: { height: StyleSheet.hairlineWidth, marginVertical: SPACING.md },
  varietyBlock: { gap: 8 },
  varietyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  varietyName: { fontSize: 24, fontFamily: fonts.playfair, flex: 1 },
  varietyPrice: { fontSize: 14, fontFamily: fonts.dmMono },
  provenanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  farm: { fontSize: 11, fontFamily: fonts.dmMono },
  harvest: { fontSize: 11, fontFamily: fonts.dmMono },
  provenanceDot: { fontSize: 10, fontFamily: fonts.dmMono },
  freshDot: { width: 6, height: 6, borderRadius: 3 },
  rating: { fontSize: 10, fontFamily: fonts.dmMono },
  varietyDesc: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, fontStyle: 'italic' },
  varietyBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 },
  retryRow: { paddingVertical: 16 },
  retryText: { fontSize: 12, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  nothingText: { fontSize: 13, fontFamily: fonts.dmSans, fontStyle: 'italic', paddingVertical: 8 },
  viewEventRow: { paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  viewEventText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  batchBarWrap: { flex: 1, gap: 3, marginHorizontal: 12 },
  batchBarTrack: { height: 2, borderRadius: 1, overflow: 'hidden' },
  batchBarFill: { height: 2, borderRadius: 1 },
  batchBarLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
