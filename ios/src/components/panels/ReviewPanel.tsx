import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { useApp } from '../../../App';
import { createOrder, confirmOrder } from '../../lib/api';
import { useStripe } from '@stripe/stripe-react-native';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

function Row({ label, value, sub, c }: { label: string; value: string; sub?: string; c: any }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: c.muted }]}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, { color: c.text }]}>{value}</Text>
        {sub && <Text style={[styles.rowSub, { color: c.muted }]}>{sub}</Text>}
      </View>
    </View>
  );
}

export default function ReviewPanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const { reviewMode, pushToken } = useApp();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const c = useColors();
  const [email, setEmail] = useState(order.customer_email);
  const [loading, setLoading] = useState(false);

  const totalCents = (order.price_cents ?? 0) * order.quantity;

  const handlePay = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Email required', 'Enter a valid email for your receipt.');
      return;
    }
    if (!order.variety_id || !order.location_id || !order.time_slot_id) {
      Alert.alert('Incomplete', 'Something is missing from your order.');
      return;
    }
    setLoading(true);
    try {
      setOrder({ customer_email: email });
      const { order: created, client_secret } = await createOrder({
        variety_id: order.variety_id!,
        location_id: order.location_id!,
        time_slot_id: order.time_slot_id!,
        chocolate: order.chocolate!,
        finish: order.finish!,
        quantity: order.quantity,
        is_gift: order.is_gift,
        customer_email: email,
        push_token: pushToken,
      });

      let confirmed;
      if (reviewMode) {
        confirmed = await confirmOrder(created.id);
      } else {
        const { error: initErr } = await initPaymentSheet({
          merchantDisplayName: 'Maison Fraise',
          paymentIntentClientSecret: client_secret,
          defaultBillingDetails: { email },
          appearance: { colors: { primary: c.accent, background: '#FFFFFF' } },
        });
        if (initErr) throw new Error(initErr.message);
        const { error: presentErr } = await presentPaymentSheet();
        if (presentErr) {
          if (presentErr.code === 'Canceled') { setLoading(false); return; }
          throw new Error(presentErr.message);
        }
        confirmed = await confirmOrder(created.id);
      }

      setOrder({
        order_id: confirmed.id,
        nfc_token: confirmed.nfc_token ?? null,
        total_cents: confirmed.total_cents ?? totalCents,
      });
      if (confirmed.user_db_id) {
        await AsyncStorage.setItem('user_db_id', String(confirmed.user_db_id));
      }
      showPanel('confirmation');
    } catch (err: unknown) {
      Alert.alert('Something went wrong.', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.progress}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={[styles.seg, { backgroundColor: i < 6 ? c.text : c.border }]} />
          ))}
        </View>
        <Text style={[styles.stepLabel, { color: c.muted }]}>STEP 6 OF 7</Text>
        <Text style={[styles.stepTitle, { color: c.text }]}>Review</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Row label="STRAWBERRY" value={order.variety_name ?? '—'} c={c} />
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <Row label="CHOCOLATE" value={order.chocolate_name ?? '—'} c={c} />
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <Row label="FINISH" value={order.finish_name ?? '—'} c={c} />
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <Row label="QUANTITY" value={String(order.quantity)} c={c} />
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <Row label="COLLECTION" value={order.location_name ?? '—'} c={c} />
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <Row label="WHEN" value={order.time_slot_time ?? '—'} sub={order.date ?? ''} c={c} />
        </View>

        <View style={[styles.totalRow, { borderTopColor: c.border, borderBottomColor: c.border }]}>
          <Text style={[styles.totalLabel, { color: c.muted }]}>TOTAL</Text>
          <Text style={[styles.totalAmount, { color: c.text }]}>CA${(totalCents / 100).toFixed(2)}</Text>
        </View>

        <View style={[styles.emailCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.emailLabel, { color: c.muted }]}>EMAIL FOR RECEIPT</Text>
          <TextInput
            style={[styles.emailInput, { color: c.text, borderBottomColor: c.border }]}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor={c.muted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: c.accent }, loading && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.payBtnText}>{loading ? 'Processing…' : 'Place Order'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goBack} activeOpacity={0.6} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: c.accent }]}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: SPACING.md, paddingTop: 8, paddingBottom: 12 },
  progress: { flexDirection: 'row', gap: 3, marginBottom: 10 },
  seg: { flex: 1, height: 2, borderRadius: 1 },
  stepLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginBottom: 2 },
  stepTitle: { fontSize: 28, fontFamily: fonts.playfair },
  body: { paddingHorizontal: SPACING.md, gap: SPACING.md },
  card: { borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: SPACING.md, paddingVertical: 11, gap: 12 },
  rowLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.8, marginTop: 2 },
  rowRight: { flex: 1, alignItems: 'flex-end', gap: 2 },
  rowValue: { fontSize: 14, fontFamily: fonts.playfair, textAlign: 'right' },
  rowSub: { fontSize: 11, fontFamily: fonts.dmSans },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  totalLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.8 },
  totalAmount: { fontSize: 22, fontFamily: fonts.playfair },
  emailCard: { borderRadius: 12, padding: SPACING.md, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  emailLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  emailInput: { fontSize: 15, fontFamily: fonts.dmSans, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  payBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#FFFFFF' },
  backLink: { alignItems: 'center', paddingVertical: 4 },
  backLinkText: { fontSize: 15, fontFamily: fonts.dmSans },
});
