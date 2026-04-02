import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { fetchOrderHistory } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const CHOC: Record<string, string> = {
  guanaja_70: 'Guanaja 70%', caraibe_66: 'Caraïbe 66%',
  jivara_40: 'Jivara 40%', ivoire_blanc: 'Ivoire Blanc',
};
const FIN: Record<string, string> = { plain: 'Plain', fleur_de_sel: 'Fleur de sel', or_fin: 'Or fin' };

function statusColor(status: string, accent: string): string {
  if (status === 'ready') return '#34C759';
  if (status === 'paid' || status === 'completed') return accent;
  if (status === 'cancelled') return '#FF3B30';
  return '#8E8E93'; // pending/muted
}

export default function OrderHistoryPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(id => {
      if (!id) { setLoading(false); return; }
      fetchOrderHistory(parseInt(id))
        .then(setOrders)
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, []);

  const readyOrders = orders.filter(o => o.status === 'ready');

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Order History</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : orders.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>No orders yet.</Text>
        ) : (
          <>
            {readyOrders.length > 0 && (
              <View style={styles.readyBanner}>
                <View style={styles.readyDot} />
                <View style={styles.readyText}>
                  <Text style={styles.readyTitle}>Ready for pickup!</Text>
                  <Text style={styles.readyVarieties}>
                    {readyOrders.map(o => o.variety_name).join(', ')}
                  </Text>
                </View>
              </View>
            )}
            {orders.map(o => {
              const sColor = statusColor(o.status, c.accent);
              return (
                <View key={o.id} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.variety, { color: c.text }]}>{o.variety_name}</Text>
                    <Text style={[styles.total, { color: c.text }]}>CA${(o.total_cents / 100).toFixed(2)}</Text>
                  </View>
                  <Text style={[styles.meta, { color: c.muted }]}>
                    {CHOC[o.chocolate] ?? o.chocolate} · {FIN[o.finish] ?? o.finish} · ×{o.quantity}
                  </Text>
                  <View style={styles.cardBottom}>
                    <Text style={[styles.slot, { color: c.muted }]}>{o.slot_date} · {o.slot_time}</Text>
                    <View style={styles.statusRow}>
                      <View style={[styles.statusDot, { backgroundColor: sColor }]} />
                      <Text style={[styles.status, { color: sColor }]}>{o.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  body: { padding: SPACING.md, gap: 10 },
  empty: { textAlign: 'center', marginTop: 60, fontFamily: fonts.dmSans, fontStyle: 'italic' },

  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E8F8ED',
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#34C759',
    marginBottom: 2,
  },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759' },
  readyText: { flex: 1, gap: 2 },
  readyTitle: { fontSize: 14, fontFamily: fonts.dmSans, fontWeight: '700', color: '#1D6232' },
  readyVarieties: { fontSize: 13, fontFamily: fonts.playfair, color: '#2A7A41' },

  card: { borderRadius: 14, padding: SPACING.md, borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  variety: { fontSize: 17, fontFamily: fonts.playfair },
  total: { fontSize: 15, fontFamily: fonts.dmMono },
  meta: { fontSize: 12, fontFamily: fonts.dmSans },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  slot: { fontSize: 11, fontFamily: fonts.dmMono },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase' },
});
