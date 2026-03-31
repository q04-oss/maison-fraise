import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { fetchOrdersByEmail } from '../lib/api';
import { COLORS, SPACING } from '../theme';

const EMAIL_KEY = '@maison_fraise_email';

const CHOCOLATE_LABELS: Record<string, string> = {
  guanaja_70: 'Guanaja 70%',
  caraibe_66: 'Caraïbe 66%',
  jivara_40: 'Jivara 40%',
  ivoire_blanc: 'Ivoire Blanc',
};

const FINISH_LABELS: Record<string, string> = {
  plain: 'Plain',
  fleur_de_sel: 'Fleur de Sel',
  or_fin: 'Or Fin',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#888880',
  paid: '#C4973A',
  preparing: '#2D6B9E',
  ready: '#2D8A2D',
  collected: '#1C3A2A',
  cancelled: '#CC3333',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  preparing: 'Preparing',
  ready: 'Ready for pickup',
  collected: 'Collected',
  cancelled: 'Cancelled',
};

interface Order {
  id: number;
  variety_name: string | null;
  chocolate: string;
  finish: string;
  quantity: number;
  is_gift: boolean;
  total_cents: number;
  status: string;
  slot_date: string | null;
  slot_time: string | null;
  created_at: string;
}

function formatSlot(date: string | null, time: string | null): string {
  if (!date || !time) return '—';
  const d = new Date(date + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()} at ${time}`;
}

export default function OrderHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // On focus, load saved email and auto-fetch if available
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(EMAIL_KEY).then(saved => {
        if (saved && !submittedEmail) {
          setEmail(saved);
          fetchOrders(saved);
        }
      });
    }, [])
  );

  const fetchOrders = async (emailToFetch: string) => {
    if (!emailToFetch || !emailToFetch.includes('@')) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setSubmittedEmail(emailToFetch);
    try {
      await AsyncStorage.setItem(EMAIL_KEY, emailToFetch);
      const data = await fetchOrdersByEmail(emailToFetch);
      setOrders(data.reverse()); // newest first
    } catch {
      setError('Could not load orders. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Your Orders</Text>
        <Text style={styles.headerSubtitle}>Enter the email you used to order.</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => fetchOrders(email)}
          />
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => fetchOrders(email)}
            activeOpacity={0.8}
          >
            <Text style={styles.searchBtnText}>GO</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={COLORS.forestGreen} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={styles.emptyText}>{error}</Text>
        ) : hasSearched && orders.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No orders found.</Text>
            <Text style={styles.emptySubtext}>Orders appear here once you've placed one.</Text>
          </View>
        ) : (
          orders.map((o) => (
            <View key={o.id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <Text style={styles.cardName}>{o.variety_name ?? 'Strawberry'}</Text>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[o.status] + '22', borderColor: STATUS_COLORS[o.status] + '55' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[o.status] }]}>
                    {STATUS_LABELS[o.status] ?? o.status}
                  </Text>
                </View>
              </View>

              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>CHOCOLATE</Text>
                  <Text style={styles.detailValue}>{CHOCOLATE_LABELS[o.chocolate] ?? o.chocolate}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>FINISH</Text>
                  <Text style={styles.detailValue}>{FINISH_LABELS[o.finish] ?? o.finish}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>QTY</Text>
                  <Text style={styles.detailValue}>{o.quantity}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>TOTAL</Text>
                  <Text style={styles.detailValue}>CA${(o.total_cents / 100).toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.cardBottomRow}>
                <Text style={styles.slotText}>{formatSlot(o.slot_date, o.slot_time)}</Text>
                {o.is_gift && <Text style={styles.giftBadge}>GIFT</Text>}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: COLORS.forestGreen, paddingBottom: 20, paddingHorizontal: SPACING.md },
  headerTitle: { color: COLORS.white, fontSize: 34, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 6 },
  headerSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontStyle: 'italic', marginBottom: 16 },
  searchRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: COLORS.white, fontSize: 15 },
  searchBtn: { backgroundColor: COLORS.cream, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  searchBtnText: { color: COLORS.forestGreen, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  listContent: { padding: SPACING.md, gap: SPACING.md },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 14, padding: SPACING.md, gap: 12 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardName: { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold', color: COLORS.textDark, flex: 1 },
  statusBadge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detailItem: { minWidth: '40%', flex: 1 },
  detailLabel: { fontSize: 10, color: COLORS.textMuted, letterSpacing: 1.4, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  detailValue: { fontSize: 14, color: COLORS.textDark, fontFamily: 'PlayfairDisplay_700Bold' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.separator },
  cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotText: { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic' },
  giftBadge: { fontSize: 10, color: COLORS.accentGold, fontWeight: '700', letterSpacing: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: COLORS.textMuted, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: COLORS.textMuted, marginTop: 8, fontStyle: 'italic', textAlign: 'center' },
});
