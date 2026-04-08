import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { useApp } from '../../../App';
import { createOrder, confirmOrder } from '../../lib/api';
import { useStripe } from '@stripe/stripe-react-native';
import * as Haptics from 'expo-haptics';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';


export default function ReviewPanel() {
  const { goBack, showPanel, jumpToPanel, currentPanel, order, setOrder, varieties, businesses } = usePanel();
  const { reviewMode, pushToken } = useApp();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState(order.customer_email);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentPanel === 'review' && !email) {
      AsyncStorage.getItem('user_email').then(stored => {
        if (stored) setEmail(stored);
      });
    }
  }, [currentPanel]);

  const totalCents = (order.price_cents ?? 0) * order.quantity;

  const activeBiz = businesses.find(b => b.id === order.location_id);
  const isPopupLive = (() => {
    if (activeBiz?.type !== 'popup' || !activeBiz.launched_at) return false;
    const start = new Date(activeBiz.launched_at);
    const end = activeBiz.ends_at
      ? new Date(activeBiz.ends_at)
      : new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const now = new Date();
    return now >= start && now < end;
  })();

  const liveVariety = varieties.find(v => v.id === order.variety_id);
  const isSoldOut = liveVariety != null && liveVariety.stock_remaining === 0;
  const isQuantityOverStock = liveVariety != null && !isSoldOut && order.quantity > liveVariety.stock_remaining;

  const handlePay = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Email required', 'Enter a valid email for your receipt.');
      return;
    }
    if (!liveVariety) {
      Alert.alert('No longer available', 'This variety isn\'t available today. Go back and choose another.', [
        { text: 'Go back', onPress: goBack },
      ]);
      return;
    }
    if (isSoldOut) {
      Alert.alert('Sold out', `${order.variety_name} sold out while you were ordering. Go back and choose another.`, [
        { text: 'Go back', onPress: goBack },
      ]);
      return;
    }
    if (isQuantityOverStock) {
      Alert.alert('Not enough stock', `Only ${liveVariety.stock_remaining} left — go back and reduce your quantity.`, [
        { text: 'Go back', onPress: goBack },
      ]);
      return;
    }
    if (totalCents === 0) {
      Alert.alert('Price unavailable', 'Return to the order flow and reselect your variety.');
      return;
    }
    if (!order.variety_id || !order.location_id || !order.chocolate || !order.finish) {
      Alert.alert('Incomplete', 'Something is missing from your order.');
      return;
    }
    if (email) AsyncStorage.setItem('user_email', email);
    setLoading(true);
    try {
      setOrder({ customer_email: email });
      const { order: created, client_secret } = await createOrder({
        variety_id: order.variety_id!,
        location_id: order.location_id!,
        chocolate: order.chocolate!,
        finish: order.finish!,
        quantity: order.quantity,
        is_gift: order.is_gift,
        customer_email: email,
        push_token: pushToken,
        gift_note: order.gift_note ?? null,
        ordered_at_popup: isPopupLive,
        excess_amount_cents: undefined,
      });

      let confirmed;
      if (reviewMode) {
        confirmed = await confirmOrder(created.id);
      } else {
        const { error: initErr } = await initPaymentSheet({
          merchantDisplayName: 'Maison Fraise',
          paymentIntentClientSecret: client_secret,
          applePay: {
            merchantCountryCode: 'CA',
            merchantIdentifier: 'merchant.com.maisonfraise.app',
          },
          googlePay: {
            merchantCountryCode: 'CA',
            testEnv: __DEV__,
          },
          defaultBillingDetails: { email },
          appearance: {
            colors: {
              primary: c.accent,
              background: '#FFFFFF',
              componentBackground: '#F7F5F2',
              componentText: '#1C1C1E',
              componentBorder: '#E5E1DA',
              placeholderText: '#8E8E93',
            },
          },
        });
        if (initErr) throw new Error(initErr.message);
        TrueSheet.present('main-sheet', 0);
        const { error: presentErr } = await presentPaymentSheet();
        if (presentErr) {
          setTimeout(() => TrueSheet.present('main-sheet', 1), 150);
          if (presentErr.code === 'Canceled') { setLoading(false); return; }
          throw new Error(presentErr.message);
        }
        confirmed = await confirmOrder(created.id);
      }

      setOrder({
        order_id: confirmed.id,
        order_status: confirmed.status,
        delivery_date: (confirmed as any).delivery_date ?? null,
        nfc_token: confirmed.nfc_token ?? null,
        total_cents: confirmed.total_cents ?? totalCents,
      });
      if (confirmed.user_db_id) {
        await AsyncStorage.setItem('user_db_id', String(confirmed.user_db_id));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showPanel('confirmation');
    } catch (err: unknown) {
      Alert.alert('Something went wrong.', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  const spec = [order.chocolate_name, order.finish_name, order.quantity > 1 ? `×${order.quantity}` : null]
    .filter(Boolean).join(' · ');

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} disabled={loading} activeOpacity={loading ? 1 : 0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Review</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.heroBlock}>
          <Text style={[styles.variety, { color: c.text }]}>{order.variety_name ?? '—'}</Text>
          <Text style={[styles.spec, { color: c.muted }]}>{spec}</Text>
          {isSoldOut && <Text style={styles.stockAlert}>Sold out</Text>}
          {isQuantityOverStock && <Text style={styles.stockAlert}>Only {liveVariety?.stock_remaining} left — reduce quantity</Text>}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: c.muted }]}>DETAILS</Text>
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: c.muted }]}>COLLECTION</Text>
              <Text style={[styles.detailValue, { color: c.text }]}>{order.location_name ?? '—'}</Text>
            </View>
            <View style={[styles.cardDivider, { backgroundColor: c.border }]} />
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: c.muted }]}>PICKUP</Text>
              <Text style={[styles.detailValue, { color: c.muted }]}>
                within 3 days of batch fill
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: c.muted }]}>CONTACT</Text>
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: c.muted }]}>EMAIL</Text>
              <TextInput
                style={[styles.emailInput, { color: c.text }]}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={c.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                onFocus={() => TrueSheet.present('main-sheet', 2)}
                onBlur={() => { if (email) AsyncStorage.setItem('user_email', email); setOrder({ customer_email: email }); }}
              />
            </View>
          </View>
          {!email && (
            <TouchableOpacity onPress={() => showPanel('terminal')} activeOpacity={0.7} style={styles.signInNudge}>
              <Text style={[styles.signInNudgeText, { color: c.muted }]}>Sign in with Apple to save your order history →</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: c.muted }]}>TOTAL</Text>
          <Text style={[styles.totalAmount, { color: c.text }]}>CA${(totalCents / 100).toFixed(2)}</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: c.accent }, loading && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.payBtnText}>{loading ? 'Processing…' : 'Place Order'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  scrollArea: { flex: 1 },
  body: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.md, gap: SPACING.md },
  heroBlock: { gap: 4 },
  variety: { fontSize: 36, fontFamily: fonts.playfair },
  spec: { fontSize: 14, fontFamily: fonts.dmSans },
  stockAlert: { fontSize: 12, fontFamily: fonts.dmSans, color: '#FF3B30' },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1, marginLeft: 4 },
  card: { borderRadius: 12, overflow: 'hidden' },
  cardDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 14, gap: 12 },
  detailLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  detailValue: { fontSize: 15, fontFamily: fonts.playfair, textAlign: 'right', flex: 1 },
  emailInput: { fontSize: 15, fontFamily: fonts.dmSans, textAlign: 'right', flex: 1 },
  signInNudge: { marginTop: 4, marginLeft: 4 },
  signInNudgeText: { fontSize: 12, fontFamily: fonts.dmSans, fontStyle: 'italic', textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm },
  totalLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.8 },
  totalAmount: { fontSize: 28, fontFamily: fonts.playfair },
  footer: { paddingHorizontal: SPACING.md, paddingTop: 12 },
  payBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#FFFFFF' },
});
