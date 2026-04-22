import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { fetchOrderHistory, rateOrder, selfCollectOrder } from '../../lib/api';
import { readNfcToken, cancelNfc } from '../../lib/nfc';
import { useColors, fonts, SPACING } from '../../theme';

const CHOC: Record<string, string> = {
  guanaja_70: 'guanaja 70%',
  caraibe_66: 'caraïbe 66%',
  jivara_40: 'jivara 40%',
  ivoire_blanc: 'ivoire blanc',
};
const FIN: Record<string, string> = {
  plain: 'plain',
  fleur_de_sel: 'fleur de sel',
  or_fin: 'or fin',
};

function parseHour24(t: string): string {
  if (!t) return '';
  const colon = t.match(/^(\d{1,2}):\d{2}/);
  if (colon) return String(parseInt(colon[1]));
  const mer = t.match(/^(\d{1,2})(?::\d{2})?\s*(am|pm)$/i);
  if (mer) {
    let h = parseInt(mer[1]);
    if (mer[2].toLowerCase() === 'pm' && h !== 12) h += 12;
    if (mer[2].toLowerCase() === 'am' && h === 12) h = 0;
    return String(h);
  }
  return t;
}

function formatSlot(date: string, time: string): string {
  if (!date) return parseHour24(time ?? '');
  const d = new Date(date);
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
  const label = `${d.getDate()} ${months[d.getMonth()]}`;
  return time ? `${label}  ·  ${parseHour24(time)}` : label;
}

export default function OrderHistoryPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [pendingRating, setPendingRating] = useState<Record<number, number>>({});
  const [collectingId, setCollectingId] = useState<number | null>(null);
  const userDbIdRef = useRef<number | null>(null);

  const loadPage = (userId: number, pageOffset: number, append: boolean) => {
    const setL = append ? setLoadingMore : setLoading;
    setL(true);
    fetchOrderHistory(userId, pageOffset, 20)
      .then(results => {
        if (results.length < 20) setHasMore(false);
        setOrders(prev => append ? [...prev, ...results] : results);
      })
      .catch(() => {})
      .finally(() => setL(false));
  };

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(id => {
      if (!id) { setLoading(false); return; }
      const uid = parseInt(id, 10);
      userDbIdRef.current = uid;
      loadPage(uid, 0, false);
    });
  }, []);

  const handleLoadMore = () => {
    if (!userDbIdRef.current || loadingMore || !hasMore) return;
    const next = offset + 20;
    setOffset(next);
    loadPage(userDbIdRef.current, next, true);
  };

  const handleRate = async (orderId: number, stars: number) => {
    setPendingRating(prev => ({ ...prev, [orderId]: stars }));
    try {
      await rateOrder(orderId, stars);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, rating: stars } : o));
    } catch {}
  };

  const handleCollect = async (orderId: number) => {
    setCollectingId(orderId);
    try {
      const scanned = await readNfcToken();
      await selfCollectOrder(scanned);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'collected' } : o));
    } catch (err: any) {
      const msg = err?.message;
      if (msg === 'already_claimed') {
        Alert.alert('Already collected', 'This order has already been picked up.');
      } else if (msg === 'forbidden') {
        Alert.alert('Wrong order', 'This tag does not belong to your order.');
      } else if (msg !== 'cancelled') {
        Alert.alert('Could not collect', 'Make sure you are tapping the sticker on your bag.');
      }
    } finally {
      cancelNfc().catch(() => {});
      setCollectingId(null);
    }
  };

  const sorted = [...orders].sort((a, b) => {
    if (a.status === 'ready' && b.status !== 'ready') return -1;
    if (b.status === 'ready' && a.status !== 'ready') return 1;
    return 0;
  });

  const renderItem = ({ item: o }: { item: any }) => {
    const isReady = o.status === 'ready';
    const isCancelled = o.status === 'cancelled';
    const isCollected = o.status === 'collected';
    const statusColor = isReady ? c.accent : isCancelled ? c.muted : c.muted;
    const rating = pendingRating[o.id] ?? o.rating ?? 0;

    return (
      <View style={[styles.row, { borderBottomColor: c.border }]}>
        <View style={styles.rowTop}>
          <Text style={[styles.varietyName, { color: isCancelled ? c.muted : c.text }]}>{o.variety_name}</Text>
          <Text style={[styles.total, { color: isCancelled ? c.muted : c.text }]}>
            CA${(o.total_cents / 100).toFixed(0)}
          </Text>
        </View>

        <Text style={[styles.meta, { color: c.muted }]}>
          {[CHOC[o.chocolate] ?? o.chocolate, FIN[o.finish] ?? o.finish, `×${o.quantity}`].filter(Boolean).join('  ·  ')}
        </Text>

        <View style={styles.rowBottom}>
          <Text style={[styles.slot, { color: c.muted }]}>{formatSlot(o.slot_date, o.slot_time)}</Text>
          <Text style={[styles.status, { color: statusColor }]}>{o.status}</Text>
        </View>

        {o.status === 'queued' && o.queued_boxes != null && (
          <View style={styles.batchWrap}>
            <View style={[styles.batchTrack, { backgroundColor: c.border }]}>
              <View style={[styles.batchFill, { backgroundColor: c.accent, width: `${Math.min(100, (o.queued_boxes / o.min_quantity) * 100)}%` }]} />
            </View>
            <Text style={[styles.batchLabel, { color: c.muted }]}>
              {o.queued_boxes} of {o.min_quantity} boxes{o.queued_boxes < o.min_quantity ? ` · ${o.min_quantity - o.queued_boxes} more to fill` : ' · filling now'}
            </Text>
          </View>
        )}

        {isReady && o.nfc_token && (
          collectingId === o.id ? (
            <View style={[styles.collectCard, { backgroundColor: c.card, borderColor: c.accent }]}>
              <ActivityIndicator color={c.accent} size="small" />
              <Text style={[styles.collectScan, { color: c.muted }]}>hold phone to bag sticker…</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.collectCard, { backgroundColor: c.card, borderColor: c.accent }]}
              onPress={() => handleCollect(o.id)}
              activeOpacity={0.75}
            >
              <Text style={[styles.collectIcon, { color: c.accent }]}>⬡</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.collectTitle, { color: c.text }]}>tap bag to collect</Text>
                <Text style={[styles.collectSub, { color: c.muted }]}>hold your phone to the sticker on your box</Text>
              </View>
            </TouchableOpacity>
          )
        )}

        {isCollected && (
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(star => {
              const filled = rating >= star;
              return rating > 0 ? (
                <Text key={star} style={[styles.star, { color: filled ? '#FFD700' : c.border }]}>★</Text>
              ) : (
                <TouchableOpacity
                  key={star}
                  onPress={() => handleRate(o.id, star)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
                >
                  <Text style={[styles.star, { color: c.muted }]}>☆</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>order history</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : orders.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>nothing here yet</Text>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={o => String(o.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          onEndReached={hasMore ? handleLoadMore : undefined}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={c.accent} style={{ paddingVertical: 20 }} /> : <View style={{ height: 40 }} />
          }
        />
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
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  title: { textAlign: 'center', fontSize: 17, fontFamily: fonts.playfair },
  headerSpacer: { width: 28 },

  empty: { textAlign: 'center', marginTop: 60, fontSize: 13, fontFamily: fonts.dmSans, fontStyle: 'italic' },

  row: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  varietyName: { fontSize: 22, fontFamily: fonts.playfair, flex: 1 },
  total: { fontSize: 13, fontFamily: fonts.dmMono },
  meta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 },
  slot: { fontSize: 10, fontFamily: fonts.dmMono },
  status: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  starsRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  star: { fontSize: 14, fontFamily: fonts.dmMono },
  batchWrap: { gap: 5, marginTop: 4 },
  batchTrack: { height: 2, borderRadius: 1, overflow: 'hidden' },
  batchFill: { height: 2, borderRadius: 1 },
  batchLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  collectCard: { marginTop: 10, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  collectIcon: { fontSize: 22 },
  collectTitle: { fontSize: 13, fontFamily: fonts.dmSans, fontWeight: '500' },
  collectSub: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3, marginTop: 2 },
  collectScan: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
