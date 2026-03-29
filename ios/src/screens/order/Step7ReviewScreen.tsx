import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrder } from '../../context/OrderContext';
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
  const { order, resetOrder } = useOrder();
  const insets = useSafeAreaInsets();

  const total =
    order.strawberry && order.quantity
      ? (order.strawberry.price * order.quantity).toFixed(2)
      : '—';

  const handlePlaceOrder = () => {
    Alert.alert(
      'Order placed.',
      `Your ${order.strawberry?.name ?? 'order'} will be ready for collection.`,
      [
        {
          text: 'Done',
          onPress: () => {
            resetOrder();
            navigation.navigate('Step1Strawberry');
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <ProgressBar current={7} total={7} />
        <Text style={styles.stepLabel}>STEP 7 OF 7</Text>
        <Text style={styles.stepTitle}>Review</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary illustration */}
        <View style={styles.illustrationRow}>
          <StrawberrySVG size={54} />
        </View>

        {/* Review rows */}
        <View style={styles.reviewCard}>
          <ReviewRow
            label="STRAWBERRY"
            value={order.strawberry?.name ?? '—'}
          />
          <View style={styles.divider} />
          <ReviewRow
            label="CHOCOLATE"
            value={order.chocolate?.name ?? '—'}
          />
          <View style={styles.divider} />
          <ReviewRow
            label="FINISH"
            value={order.finish?.name ?? '—'}
          />
          <View style={styles.divider} />
          <ReviewRow
            label="QUANTITY"
            value={
              order.strawberry
                ? `${order.quantity} × CA$${order.strawberry.price.toFixed(2)}`
                : '—'
            }
          />
          <View style={styles.divider} />
          <ReviewRow
            label="COLLECTION"
            value={order.location?.name ?? '—'}
          />
          <View style={styles.divider} />
          <ReviewRow
            label="WHEN"
            value={
              order.date && order.timeSlot
                ? `${order.date} at ${order.timeSlot.time}`
                : '—'
            }
          />
          {order.isGift && (
            <>
              <View style={styles.divider} />
              <ReviewRow label="GIFT" value="Handwritten note included" />
            </>
          )}
        </View>

        {/* Total */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalAmount}>CA${total}</Text>
        </View>
      </ScrollView>

      {/* Place order button */}
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 12) + 8 },
        ]}
      >
        <TouchableOpacity
          style={styles.placeOrderBtn}
          onPress={handlePlaceOrder}
          activeOpacity={0.85}
        >
          <Text style={styles.placeOrderText}>Place Order  →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.forestGreen,
    paddingBottom: 22,
  },
  backBtn: { paddingHorizontal: 20, paddingVertical: 6 },
  backText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  stepLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginTop: 2,
  },
  stepTitle: {
    color: COLORS.white,
    fontSize: 30,
    fontFamily: 'PlayfairDisplay_700Bold',
    paddingHorizontal: 20,
    marginTop: 4,
  },
  illustrationRow: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  reviewCard: {
    backgroundColor: COLORS.cardBg,
    marginHorizontal: SPACING.md,
    borderRadius: 14,
    overflow: 'hidden',
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    gap: 16,
  },
  reviewLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 1.4,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  reviewValue: {
    fontSize: 15,
    color: COLORS.textDark,
    fontFamily: 'PlayfairDisplay_700Bold',
    textAlign: 'right',
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 18,
    backgroundColor: COLORS.forestGreen,
    borderRadius: 14,
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  totalAmount: {
    color: COLORS.white,
    fontSize: 22,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  footer: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  placeOrderBtn: {
    backgroundColor: COLORS.forestGreen,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  placeOrderText: {
    color: COLORS.white,
    fontSize: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
});
