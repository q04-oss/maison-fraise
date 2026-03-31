import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStripe } from '@stripe/stripe-react-native';
import { useOrder } from '../../context/OrderContext';
import { useApp } from '../../../App';
import { createOrder, confirmOrder } from '../../lib/api';
import { COLORS, SPACING } from '../../theme';
import { OrderStackParamList } from '../../types';
import ProgressBar from '../../components/ProgressBar';
import StrawberrySVG from '../../components/StrawberrySVG';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'Step7Review'>;

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

export default function Step7ReviewScreen() {
  const navigation = useNavigation<Nav>();
  const { order, resetOrder, setCustomerEmail } = useOrder();
  const { pushToken, reviewMode } = useApp();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const totalCents = (order.priceCents ?? 0) * (order.quantity ?? 0);
  const total = totalCents > 0 ? (totalCents / 100).toFixed(2) : '—';

  const handlePlaceOrder = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Email required', 'Please enter a valid email address.');
      return;
    }

    if (order.variety_id === null || !order.location_id || !order.time_slot_id || !order.chocolateId || !order.finishId) {
      Alert.alert('Incomplete order', `variety:${order.variety_id} location:${order.location_id} slot:${order.time_slot_id} choc:${order.chocolateId} finish:${order.finishId}`);
      return;
    }

    setLoading(true);
    try {
      setCustomerEmail(email);

      // Step 1: create order
      const { order: createdOrder, client_secret } = await createOrder({
        variety_id: order.variety_id,
        location_id: order.location_id,
        time_slot_id: order.time_slot_id,
        chocolate: order.chocolateId,
        finish: order.finishId,
        quantity: order.quantity,
        is_gift: order.isGift,
        customer_email: email,
        push_token: pushToken,
      });

      if (reviewMode) {
        // Review mode — skip Stripe, confirm directly
        await confirmOrder(createdOrder.id);
      } else {
        // Step 2: init payment sheet
        const { error: initError } = await initPaymentSheet({
          merchantDisplayName: 'Maison Fraise',
          paymentIntentClientSecret: client_secret,
          defaultBillingDetails: { email },
          appearance: {
            colors: {
              primary: COLORS.forestGreen,
              background: COLORS.cream,
            },
          },
        });

        if (initError) {
          throw new Error(initError.message);
        }

        // Step 3: present payment sheet
        const { error: presentError } = await presentPaymentSheet();

        if (presentError) {
          if (presentError.code === 'Canceled') {
            setLoading(false);
            return;
          }
          throw new Error(presentError.message);
        }

        // Step 4: confirm with server
        await confirmOrder(createdOrder.id);
      }

      Alert.alert(
        'Order placed.',
        `Your ${order.strawberryName ?? 'order'} will be ready for collection.`,
        [{ text: 'Done', onPress: () => { resetOrder(); navigation.navigate('Step1Strawberry'); } }]
      );
    } catch (err: any) {
      Alert.alert('Something went wrong.', err?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <ProgressBar current={7} total={7} />
        <Text style={styles.stepLabel}>STEP 7 OF 7</Text>
        <Text style={styles.stepTitle}>Review</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.illustrationRow}>
          <StrawberrySVG size={54} />
        </View>

        <View style={styles.reviewCard}>
          <ReviewRow label="STRAWBERRY" value={order.strawberryName ?? '—'} />
          <View style={styles.divider} />
          <ReviewRow label="CHOCOLATE" value={order.chocolateName ?? '—'} />
          <View style={styles.divider} />
          <ReviewRow label="FINISH" value={order.finishName ?? '—'} />
          <View style={styles.divider} />
          <ReviewRow label="QUANTITY" value={order.quantity ? `${order.quantity}` : '—'} />
          <View style={styles.divider} />
          <ReviewRow label="COLLECTION" value={order.locationName ?? '—'} />
          <View style={styles.divider} />
          <ReviewRow label="WHEN" value={order.date && order.timeSlotTime ? `${order.date} at ${order.timeSlotTime}` : '—'} />
          {order.isGift && (
            <>
              <View style={styles.divider} />
              <ReviewRow label="GIFT" value="Handwritten note included" />
            </>
          )}
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalAmount}>CA${total}</Text>
        </View>

        <View style={styles.emailCard}>
          <Text style={styles.emailLabel}>EMAIL FOR RECEIPT</Text>
          <TextInput
            style={styles.emailInput}
            placeholder="your@email.com"
            placeholderTextColor={COLORS.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <TouchableOpacity
          style={[styles.placeOrderBtn, loading && styles.placeOrderBtnDisabled]}
          onPress={handlePlaceOrder}
          activeOpacity={0.85}
          disabled={loading}
        >
          <Text style={styles.placeOrderText}>{loading ? 'Processing...' : 'Pay  →'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: COLORS.forestGreen, paddingBottom: 22 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 6 },
  backText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  stepLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', paddingHorizontal: 20, marginTop: 2 },
  stepTitle: { color: COLORS.white, fontSize: 30, fontFamily: 'PlayfairDisplay_700Bold', paddingHorizontal: 20, marginTop: 4 },
  illustrationRow: { alignItems: 'center', paddingVertical: 24 },
  reviewCard: { backgroundColor: COLORS.cardBg, marginHorizontal: SPACING.md, borderRadius: 14, overflow: 'hidden' },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 14, gap: 16 },
  reviewLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: 1.4, fontWeight: '600', textTransform: 'uppercase' },
  reviewValue: { fontSize: 15, color: COLORS.textDark, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'right', flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },
  totalCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: SPACING.md, marginTop: SPACING.md, paddingHorizontal: SPACING.md, paddingVertical: 18, backgroundColor: COLORS.forestGreen, borderRadius: 14 },
  totalLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600' },
  totalAmount: { color: COLORS.white, fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' },
  emailCard: { marginHorizontal: SPACING.md, marginTop: SPACING.md, backgroundColor: COLORS.cardBg, borderRadius: 14, padding: SPACING.md, gap: 8 },
  emailLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: 1.4, fontWeight: '600', textTransform: 'uppercase' },
  emailInput: { fontSize: 15, color: COLORS.textDark, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  footer: { backgroundColor: COLORS.cream, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  placeOrderBtn: { backgroundColor: COLORS.forestGreen, borderRadius: 30, paddingVertical: 16, alignItems: 'center' },
  placeOrderBtnDisabled: { opacity: 0.5 },
  placeOrderText: { color: COLORS.white, fontSize: 14, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700' },
});
