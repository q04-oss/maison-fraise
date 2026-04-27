import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useStripe } from '@stripe/stripe-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { creditsCheckout, creditsConfirm, getMemberToken } from '../../lib/api';
import { PanelHeader, Card, PrimaryButton } from '../ui';

const CREDIT_PRICE_CENTS = 12000; // CA$120

export default function CreditsPanel() {
  const { member, setMember, goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [qty, setQty]         = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [done, setDone]       = useState(false);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const totalCents = qty * CREDIT_PRICE_CENTS;
  const totalDisplay = `CA$${(totalCents / 100).toFixed(0)}`;

  const handleBuy = async () => {
    const token = await getMemberToken();
    if (!token || !member) {
      setError('sign in first.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    try {
      const { client_secret, amount_cents } = await creditsCheckout(qty);

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'box fraise',
        applePay: { merchantCountryCode: 'CA' },
        style: 'alwaysLight',
        primaryButtonLabel: `Pay ${totalDisplay}`,
      });
      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') { setLoading(false); return; }
        throw new Error(presentError.message);
      }

      const paymentIntentId = client_secret.split('_secret_')[0];
      const result = await creditsConfirm(paymentIntentId);
      setMember({ ...member, credit_balance: result.credit_balance });
      setNewBalance(result.credit_balance);
      setDone(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(err.message || 'payment failed.');
    }
    setLoading(false);
  };

  if (!member) {
    return (
      <View style={[styles.center, { backgroundColor: c.panelBg }]}>
        <Text style={[styles.muted, { color: c.muted }]}>sign in to buy akènes.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.panelBg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <PanelHeader title="buy akènes" back onBack={goBack} />

      {done ? (
        <Card style={styles.doneCard}>
          <Text style={[styles.doneTitle, { color: c.text }]}>akènes added.</Text>
          {newBalance !== null ? (
            <Text style={[styles.doneSub, { color: c.muted }]}>
              balance: {newBalance} akène{newBalance !== 1 ? 's' : ''}
            </Text>
          ) : null}
        </Card>
      ) : (
        <View style={styles.body}>
          <Text style={[styles.priceNote, { color: c.muted }]}>CA$120 per akène · no expiry</Text>

          <View style={styles.qtyRow}>
            <TouchableOpacity
              style={[styles.qtyBtn, { borderColor: c.border }]}
              onPress={() => setQty(q => Math.max(1, q - 1))}
              activeOpacity={0.7}
            >
              <Text style={[styles.qtyBtnText, { color: c.text }]}>−</Text>
            </TouchableOpacity>
            <View style={styles.qtyCenter}>
              <Text style={[styles.qtyVal, { color: c.text }]}>{qty}</Text>
              <Text style={[styles.qtyLabel, { color: c.muted }]}>
                akène{qty !== 1 ? 's' : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.qtyBtn, { borderColor: c.border }]}
              onPress={() => setQty(q => Math.min(10, q + 1))}
              activeOpacity={0.7}
            >
              <Text style={[styles.qtyBtnText, { color: c.text }]}>+</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <Text style={[styles.errText, { color: '#C0392B' }]}>{error}</Text>
          ) : null}

          <PrimaryButton
            label={totalDisplay}
            onPress={handleBuy}
            loading={loading}
          />

          <Text style={[styles.note, { color: c.muted }]}>
            akènes never expire. if an event doesn't go ahead, your akène is returned automatically.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: SPACING.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: SPACING.lg, gap: SPACING.md },
  doneCard: { marginHorizontal: SPACING.lg, gap: 6, padding: SPACING.lg },
  doneTitle: { fontSize: 16, fontFamily: fonts.dmMono, fontWeight: '500' },
  doneSub: { fontSize: 12, fontFamily: fonts.dmMono },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 22, fontFamily: fonts.dmMono, lineHeight: 28 },
  qtyCenter: { alignItems: 'center', gap: 2 },
  qtyVal: { fontSize: 32, fontFamily: fonts.dmMono, fontWeight: '500' },
  qtyLabel: { fontSize: 11, fontFamily: fonts.dmMono },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalLabel: { fontSize: 13, fontFamily: fonts.dmMono },
  totalValue: { fontSize: 13, fontFamily: fonts.dmMono, fontWeight: '500' },
  errText: { fontSize: 12, fontFamily: fonts.dmMono },
  note: { fontSize: 11, fontFamily: fonts.dmMono, lineHeight: 17 },
  priceNote: { fontSize: 12, fontFamily: fonts.dmMono },
  muted: { fontSize: 13, fontFamily: fonts.dmMono },
});
