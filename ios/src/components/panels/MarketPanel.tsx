import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { fetchMarket, fetchUpcomingMarkets } from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

function fmtCAD(cents: number) {
  return `CA$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
}

function fmtMarketDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

type Tab = 'community' | 'confirmed';

export default function MarketPanel() {
  const { goBack, showPanel, panelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [market, setMarket] = useState<any>(null);
  const [upcomingList, setUpcomingList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('community');
  const [isVerified, setIsVerified] = useState(false);

  const marketId: number | null = panelData?.marketId ?? null;

  useEffect(() => {
    AsyncStorage.getItem('verified').then(v => setIsVerified(v === 'true'));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    if (marketId) {
      fetchMarket(marketId)
        .then(setMarket)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      fetchUpcomingMarkets()
        .then(setUpcomingList)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [marketId]);

  useEffect(() => { load(); }, [load]);

  const confirmedStalls = (market?.stalls ?? []).filter((s: any) => s.confirmed);
  const collectifs = market?.collectifs ?? [];

  // ── List of upcoming markets (no specific date selected) ──────────────────
  if (!marketId) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>market</Text>
          <View style={{ width: 40 }} />
        </View>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : upcomingList.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>no upcoming markets</Text>
        ) : (
          <FlatList
            data={upcomingList}
            keyExtractor={i => String(i.id)}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={<View style={{ height: 40 }} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.dateRow, { borderBottomColor: c.border }]}
                onPress={() => showPanel('market', { marketId: item.id })}
                activeOpacity={0.75}
              >
                <View style={styles.dateRowTop}>
                  <Text style={[styles.dateName, { color: c.text }]}>{item.name}</Text>
                  <Text style={[styles.dateMeta, { color: c.muted }]}>
                    {item.open_collectif_count > 0 ? `${item.open_collectif_count} proposals` : ''}
                  </Text>
                </View>
                <Text style={[styles.dateMeta, { color: c.muted }]}>
                  {fmtMarketDate(item.starts_at)}  ·  {fmtTime(item.starts_at)}–{fmtTime(item.ends_at)}
                </Text>
                <Text style={[styles.dateLocation, { color: c.muted }]}>{item.location}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  }

  // ── Single market date ────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
            {market?.name?.toLowerCase() ?? 'market'}
          </Text>
          {market && (
            <Text style={[styles.subtitle, { color: c.muted }]}>
              {fmtMarketDate(market.starts_at)}
            </Text>
          )}
        </View>
        {isVerified && (
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => showPanel('collectif-create', {
              collectifType: 'vendor_invite',
              proposedVenue: market?.location,
              proposedDate: market?.starts_at?.slice(0, 10),
            })}
            activeOpacity={0.7}
          >
            <Text style={[styles.headerActionText, { color: c.accent }]}>propose</Text>
          </TouchableOpacity>
        )}
        {!isVerified && <View style={{ width: 60 }} />}
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {/* Market meta */}
          {market && (
            <View style={[styles.metaCard, { borderBottomColor: c.border }]}>
              <Text style={[styles.metaLocation, { color: c.muted }]}>{market.location}</Text>
              <Text style={[styles.metaAddress, { color: c.muted }]}>{market.address}</Text>
              <Text style={[styles.metaTime, { color: c.muted }]}>
                {fmtTime(market.starts_at)} – {fmtTime(market.ends_at)}
              </Text>
              {market.notes && (
                <Text style={[styles.metaNotes, { color: c.muted }]}>{market.notes}</Text>
              )}
            </View>
          )}

          {/* Tabs */}
          <View style={[styles.tabs, { borderBottomColor: c.border }]}>
            <TouchableOpacity
              style={[styles.tab, tab === 'community' && { borderBottomColor: c.text, borderBottomWidth: 1.5 }]}
              onPress={() => setTab('community')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, { color: tab === 'community' ? c.text : c.muted }]}>
                community{collectifs.length > 0 ? ` · ${collectifs.length}` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'confirmed' && { borderBottomColor: c.text, borderBottomWidth: 1.5 }]}
              onPress={() => setTab('confirmed')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, { color: tab === 'confirmed' ? c.text : c.muted }]}>
                confirmed{confirmedStalls.length > 0 ? ` · ${confirmedStalls.length}` : ''}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Community tab: vendor_invite + product_prebuy collectifs */}
          {tab === 'community' && (
            <View>
              {collectifs.length === 0 ? (
                <Text style={[styles.empty, { color: c.muted }]}>
                  {isVerified
                    ? 'no proposals yet — be the first to invite a vendor'
                    : 'no proposals yet'}
                </Text>
              ) : (
                collectifs.map((col: any) => {
                  const isInvite = col.collectif_type === 'vendor_invite';
                  const progress = col.target_quantity > 0
                    ? Math.min(1, col.current_quantity / col.target_quantity)
                    : 0;
                  return (
                    <TouchableOpacity
                      key={col.id}
                      style={[styles.collectifRow, { borderBottomColor: c.border }]}
                      onPress={() => showPanel('collectif-detail', { collectifId: col.id })}
                      activeOpacity={0.75}
                    >
                      <View style={styles.collectifRowTop}>
                        <Text style={[styles.collectifTitle, { color: c.text }]} numberOfLines={1}>
                          {col.title}
                        </Text>
                        <Text style={[styles.collectifMeta, { color: c.muted }]}>
                          {isInvite ? fmtCAD(col.price_cents) + ' deposit' : fmtCAD(col.price_cents)}
                        </Text>
                      </View>
                      <Text style={[styles.collectifMeta, { color: c.muted }]}>
                        {col.business_name}  ·  {isInvite ? 'vendor invite' : 'pre-buy'}
                      </Text>
                      <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
                        <View style={[styles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: c.accent }]} />
                      </View>
                      <Text style={[styles.collectifMeta, { color: c.muted }]}>
                        {col.current_quantity} / {col.target_quantity} committed
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* Confirmed tab: operator-confirmed stalls + products */}
          {tab === 'confirmed' && (
            <View>
              {confirmedStalls.length === 0 ? (
                <Text style={[styles.empty, { color: c.muted }]}>
                  no confirmed vendors yet
                </Text>
              ) : (
                confirmedStalls.map((stall: any) => (
                  <TouchableOpacity
                    key={stall.id}
                    style={[styles.stallRow, { borderBottomColor: c.border }]}
                    onPress={() => showPanel('market-stall', { stallId: stall.id, marketId, marketDateStr: market?.starts_at?.slice(0, 10) })}
                    activeOpacity={0.75}
                  >
                    <View style={styles.stallRowTop}>
                      <Text style={[styles.stallName, { color: c.text }]}>{stall.vendor_name}</Text>
                      <Text style={[styles.collectifMeta, { color: c.muted }]}>
                        {stall.products?.length ?? 0} products →
                      </Text>
                    </View>
                    {stall.description && (
                      <Text style={[styles.stallDesc, { color: c.muted }]} numberOfLines={2}>
                        {stall.description}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: 20, fontFamily: fonts.playfair, textAlign: 'center' },
  subtitle: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: 2 },
  headerAction: { width: 60, alignItems: 'flex-end' },
  headerActionText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },

  metaCard: {
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 3,
  },
  metaLocation: { fontFamily: fonts.playfair, fontSize: 15 },
  metaAddress: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 0.5 },
  metaTime: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 0.5 },
  metaNotes: { fontFamily: fonts.dmSans, fontSize: 12, fontStyle: 'italic', marginTop: 4 },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 0,
  },
  tabText: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },

  empty: {
    textAlign: 'center', marginTop: 60, fontSize: 13,
    fontFamily: fonts.dmSans, fontStyle: 'italic',
  },

  collectifRow: {
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 5,
  },
  collectifRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  collectifTitle: { fontSize: 18, fontFamily: fonts.playfair, flex: 1 },
  collectifMeta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  progressTrack: { height: 2, borderRadius: 1, overflow: 'hidden', marginVertical: 4 },
  progressFill: { height: '100%', borderRadius: 1 },

  stallRow: {
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 5,
  },
  stallRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stallName: { fontSize: 18, fontFamily: fonts.playfair, flex: 1 },
  stallDesc: { fontFamily: fonts.dmSans, fontSize: 12, lineHeight: 18 },

  dateRow: {
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 4,
  },
  dateRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  dateName: { fontSize: 20, fontFamily: fonts.playfair },
  dateMeta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  dateLocation: { fontFamily: fonts.dmSans, fontSize: 12, fontStyle: 'italic' },
});
