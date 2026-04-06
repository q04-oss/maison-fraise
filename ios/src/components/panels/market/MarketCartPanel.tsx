import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../../theme';
import { placeMarketOrder } from '../../../lib/api';

export default function MarketCartPanel() {
  const { goBack, panelData, showPanel } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);

  const cartItems: Array<{ listing_id: number; quantity: number; listing: any }> =
    panelData?.cart ?? [];

  const total = cartItems.reduce((sum, item) => {
    return sum + (item.listing?.price_cents ?? 0) * item.quantity;
  }, 0);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const items = cartItems.map(i => ({ listing_id: i.listing_id, quantity: i.quantity }));
      const result = await placeMarketOrder(items);
      setOrderId(result.order_id);
      setSubmitted(true);
    } catch (e: any) {
      // Show error inline — no alert, stay on panel
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={() => showPanel('market-orders')} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.text, fontFamily: fonts.dmMono }]}>YOUR ORDER</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.successBody}>
          <Text style={[styles.successTitle, { color: c.text, fontFamily: fonts.playfair }]}>Order confirmed.</Text>
          <Text style={[styles.successSub, { color: c.muted, fontFamily: fonts.dmSans }]}>
            Pick up at fraise.market.{'\n'}Tap the box when you arrive.
          </Text>
          <TouchableOpacity
            style={[styles.ordersBtn, { backgroundColor: c.accent }]}
            onPress={() => showPanel('market-orders')}
            activeOpacity={0.8}
          >
            <Text style={[styles.ordersBtnText, { color: c.ctaText ?? '#fff', fontFamily: fonts.dmMono }]}>VIEW ORDERS</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text, fontFamily: fonts.dmMono }]}>YOUR ORDER</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {cartItems.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.muted, fontFamily: fonts.dmSans }]}>Your cart is empty.</Text>
        ) : (
          <>
            {cartItems.map(item => (
              <View key={item.listing_id} style={[styles.itemRow, { borderBottomColor: c.border }]}>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: c.text, fontFamily: fonts.dmSans }]}>
                    {item.listing?.name ?? `Listing #${item.listing_id}`}
                  </Text>
                  <Text style={[styles.itemDetail, { color: c.muted, fontFamily: fonts.dmMono }]}>
                    {item.quantity} × {item.listing?.unit_label ?? 'unit'}
                  </Text>
                </View>
                <Text style={[styles.itemTotal, { color: c.text, fontFamily: fonts.dmMono }]}>
                  CA${((item.listing?.price_cents ?? 0) * item.quantity / 100).toFixed(2)}
                </Text>
              </View>
            ))}

            <View style={[styles.totalRow, { borderTopColor: c.border }]}>
              <Text style={[styles.totalLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>TOTAL</Text>
              <Text style={[styles.totalAmount, { color: c.text, fontFamily: fonts.dmMono }]}>
                CA${(total / 100).toFixed(2)}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: c.accent }, submitting && { opacity: 0.5 }]}
              onPress={handleConfirm}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={c.ctaText ?? '#fff'} />
              ) : (
                <Text style={[styles.confirmBtnText, { color: c.ctaText ?? '#fff', fontFamily: fonts.dmMono }]}>
                  CONFIRM ORDER →
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: c.border }]}
              onPress={goBack}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: c.muted, fontFamily: fonts.dmSans }]}>Back</Text>
            </TouchableOpacity>
          </>
        )}
        <View style={{ height: SPACING.xl }} />
      </ScrollView>
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
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15 },
  itemDetail: { fontSize: 12, marginTop: 2 },
  itemTotal: { fontSize: 14 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.sm,
  },
  totalLabel: { fontSize: 12, letterSpacing: 1.5 },
  totalAmount: { fontSize: 18 },
  confirmBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    marginTop: SPACING.md,
  },
  confirmBtnText: { fontSize: 13, letterSpacing: 1.5 },
  cancelBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, marginTop: SPACING.sm,
  },
  cancelBtnText: { fontSize: 14 },
  emptyText: { textAlign: 'center', marginTop: 60, fontSize: 15 },
  successBody: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.lg, gap: SPACING.md,
  },
  successTitle: { fontSize: 28, textAlign: 'center' },
  successSub: { fontSize: 15, textAlign: 'center', lineHeight: 24 },
  ordersBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: SPACING.sm },
  ordersBtnText: { fontSize: 13, letterSpacing: 1.5 },
});
