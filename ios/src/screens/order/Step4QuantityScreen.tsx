import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { QUANTITIES } from '../../data/seed';
import { useOrder } from '../../context/OrderContext';
import { COLORS, SPACING } from '../../theme';
import { OrderStackParamList } from '../../types';
import StepLayout from '../../components/StepLayout';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'Step4Quantity'>;

export default function Step4QuantityScreen() {
  const navigation = useNavigation<Nav>();
  const { order, setQuantity, setIsGift } = useOrder();

  const unitPrice = order.strawberry?.price ?? 0;

  return (
    <StepLayout
      step={4}
      title="Quantity"
      onBack={() => navigation.goBack()}
      onContinue={() => navigation.navigate('Step5Where')}
      continueLabel="Continue to Collection"
      canContinue={true}
    >
      <View style={styles.container}>
        {/* Quantity grid */}
        <View style={styles.grid}>
          {QUANTITIES.map((q) => {
            const selected = order.quantity === q;
            const total = (q * unitPrice).toFixed(2);
            return (
              <TouchableOpacity
                key={q}
                style={[styles.qOption, selected && styles.qOptionSelected]}
                onPress={() => setQuantity(q)}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.qNumber, selected && styles.textWhite]}
                >
                  {q}
                </Text>
                {unitPrice > 0 && (
                  <Text
                    style={[styles.qPrice, selected && styles.textWhiteMuted]}
                  >
                    CA${total}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Price breakdown */}
        {unitPrice > 0 && (
          <View style={styles.priceRow}>
            <Text style={styles.priceCalc}>
              {order.quantity} × CA${unitPrice.toFixed(2)} = CA$
              {(order.quantity * unitPrice).toFixed(2)}
            </Text>
          </View>
        )}

        {/* Gift toggle */}
        <View style={styles.giftCard}>
          <View style={styles.giftInfo}>
            <Text style={styles.giftTitle}>Gift</Text>
            <Text style={styles.giftDesc}>
              We will add a handwritten note and seal the box.
            </Text>
          </View>
          <Switch
            value={order.isGift}
            onValueChange={setIsGift}
            trackColor={{
              false: COLORS.border,
              true: COLORS.forestGreen,
            }}
            thumbColor={COLORS.white}
          />
        </View>
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
    gap: SPACING.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  qOption: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: '47.5%',
    gap: 4,
  },
  qOptionSelected: {
    backgroundColor: COLORS.forestGreen,
  },
  qNumber: {
    fontSize: 28,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textDark,
  },
  qPrice: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  priceRow: {
    alignItems: 'center',
  },
  priceCalc: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  giftCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  giftInfo: { flex: 1, gap: 4 },
  giftTitle: {
    fontSize: 16,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textDark,
  },
  giftDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  textWhite: { color: COLORS.white },
  textWhiteMuted: { color: 'rgba(255,255,255,0.6)' },
});
