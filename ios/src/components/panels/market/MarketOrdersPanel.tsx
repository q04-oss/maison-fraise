import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../../theme';
import { fetchMyMarketOrders } from '../../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  collected: '#10b981',
  cancelled: '#6b7280',
};

export default function MarketOrdersPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchMyMarketOrders();
        setOrders(data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-CA', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return dateStr; }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text, fontFamily: fonts.dmMono }]}>YOUR ORDERS</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : orders.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text, fontFamily: fonts.playfair }]}>No orders yet</Text>
          <Text style={[styles.emptyHint, { color: c.muted, fontFamily: fonts.dmSans }]}>
            Browse listings and place your first order.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {orders.map(order => (
            <View key={order.id} style={[styles.orderCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.orderTop}>
                <Text style={[styles.orderDate, { color: c.muted, fontFamily: fonts.dmMono }]}>
                  {formatDate(order.created_at)}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[order.status] ?? '#888' }]}>
                  <Text style={styles.statusText}>{order.status}</Text>
                </View>
              </View>

              {Array.isArray(order.items) && order.items.map((item: any) => (
                <Text key={item.id} style={[styles.itemLine, { color: c.text, fontFamily: fonts.dmSans }]}>
                  {item.quantity}× {item.listing_name}
                </Text>
              ))}

              <Text style={[styles.orderTotal, { color: c.accent, fontFamily: fonts.dmMono }]}>
                CA${(order.total_cents / 100).toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      )}
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
  backBtn: { width: 40, alignItems: 'flex-start' },
  backBtnText: { fontSize: 22 },
  headerTitle: { fontSize: 14, letterSpacing: 2 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  orderCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm, marginBottom: SPACING.sm, gap: 4,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  orderDate: { fontSize: 12, letterSpacing: 0.5 },
  statusPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: '#fff', fontSize: 11, fontFamily: 'System', fontWeight: '600' },
  itemLine: { fontSize: 14 },
  orderTotal: { fontSize: 14, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  emptyTitle: { fontSize: 22 },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
