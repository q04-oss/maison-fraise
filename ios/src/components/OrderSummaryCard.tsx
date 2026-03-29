import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOrder } from '../context/OrderContext';
import { COLORS } from '../theme';
import StrawberrySVG from './StrawberrySVG';

const OrderSummaryCard: React.FC = () => {
  const { order } = useOrder();

  const parts = [
    order.strawberry?.name,
    order.chocolate?.name,
    order.finish?.name,
  ].filter(Boolean);

  const selectionText = parts.join(' · ');

  const priceText = order.strawberry
    ? `${order.quantity} × CA$${order.strawberry.price.toFixed(2)} = CA$${(
        order.quantity * order.strawberry.price
      ).toFixed(2)}`
    : '';

  return (
    <View style={styles.card}>
      <StrawberrySVG size={42} />
      <View style={styles.info}>
        {selectionText ? (
          <Text style={styles.selection} numberOfLines={2}>
            {selectionText}
          </Text>
        ) : (
          <Text style={styles.placeholder}>Select your strawberry</Text>
        )}
        {priceText ? (
          <Text style={styles.price}>{priceText}</Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  info: {
    flex: 1,
  },
  selection: {
    fontSize: 14,
    color: COLORS.textDark,
    fontWeight: '500',
    lineHeight: 20,
  },
  placeholder: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  price: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 3,
  },
});

export default OrderSummaryCard;
