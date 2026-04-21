import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Keyboard,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import * as Haptics from 'expo-haptics';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { API_BASE_URL } from '../../config/api';

const SHEET_NAME = 'main-sheet';

const AMOUNTS = [
  { cents: 300, label: '$3' },
  { cents: 500, label: '$5' },
  { cents: 1000, label: '$10' },
  { cents: 2500, label: '$25' },
];

export default function DonatePanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [selected, setSelected] = useState<number | null>(500);
  const [customInput, setCustomInput] = useState('');
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);

  const customCents = customInput ? Math.round(parseFloat(customInput) * 100) : 0;
  const activeCents = customInput ? customCents : (selected ?? 0);
  const displayAmount = customInput
    ? (customCents >= 100 ? `$${parseFloat(customInput).toFixed(2)}` : '')
    : AMOUNTS.find(a => a.cents === selected)?.label ?? '';

  const handleDonate = async () => {
    if (activeCents < 100) {
      alert('Minimum donation is $1.00.');
      return;
    }
    Keyboard.dismiss();
    setPaying(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/donate/payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: activeCents }),
      });
      if (!res.ok) throw new Error('Failed to create payment');
      const { client_secret } = await res.json();

      const { error: initErr } = await initPaymentSheet({
        merchantDisplayName: 'Box Fraise',
        paymentIntentClientSecret: client_secret,
        applePay: { merchantCountryCode: 'CA', merchantIdentifier: 'merchant.com.boxfraise.app' },
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

      TrueSheet.present(SHEET_NAME, 0);
      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        setTimeout(() => TrueSheet.present(SHEET_NAME, 2), 150);
        if (presentErr.code === 'Canceled') { setPaying(false); return; }
        throw new Error(presentErr.message);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
      setTimeout(() => TrueSheet.present(SHEET_NAME, 2), 150);
    } catch (err: any) {
      alert(err.message ?? 'Something went wrong.');
    } finally {
      setPaying(false);
    }
  };

  if (done) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.body}>
          <Text style={styles.thankEmoji}>🍓</Text>
          <Text style={[styles.thankHeading, { color: c.text }]}>Thank you.</Text>
          <Text style={[styles.thankSub, { color: c.muted }]}>It means a lot.</Text>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: c.accent }]}
            onPress={goBack}
            activeOpacity={0.8}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Support Box Fraise</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.sub, { color: c.muted, paddingHorizontal: SPACING.md }]}>
          Independent, local, and built from scratch. If you like what we're building, this helps.
        </Text>

        <View style={[styles.amountRow, { paddingHorizontal: SPACING.md }]}>
          {AMOUNTS.map(a => {
            const active = !customInput && selected === a.cents;
            return (
              <TouchableOpacity
                key={a.cents}
                style={[
                  styles.amountBtn,
                  { borderColor: active ? c.accent : c.border },
                  active && { backgroundColor: c.accent },
                ]}
                onPress={() => { setSelected(a.cents); setCustomInput(''); Haptics.selectionAsync(); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.amountLabel, { color: active ? '#fff' : c.text }]}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.customWrapper, { borderColor: customInput ? c.accent : c.border, backgroundColor: c.card }]}>
          <Text style={[styles.customPrefix, { color: c.muted }]}>$</Text>
          <TextInput
            style={[styles.customInput, { color: c.text }]}
            placeholder="Custom amount"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            value={customInput}
            onChangeText={v => { setCustomInput(v); setSelected(null); }}
          />
        </View>

        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: c.accent, opacity: (paying || activeCents < 100) ? 0.5 : 1 }]}
          onPress={handleDonate}
          disabled={paying || activeCents < 100}
          activeOpacity={0.8}
        >
          {paying
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.payBtnText}>{displayAmount ? `Donate ${displayAmount} →` : 'Donate →'}</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },

  body: { flex: 1, paddingTop: SPACING.lg, gap: SPACING.lg, justifyContent: 'flex-end', paddingBottom: SPACING.lg },
  sub: { fontFamily: fonts.dmSans, fontSize: 14, lineHeight: 22 },

  amountRow: { flexDirection: 'row', gap: 10 },
  customWrapper: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.md, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: SPACING.md, paddingVertical: 14,
  },
  customPrefix: { fontFamily: fonts.playfair, fontSize: 18, marginRight: 4 },
  customInput: { flex: 1, fontFamily: fonts.playfair, fontSize: 18 },
  amountBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, alignItems: 'center',
  },
  amountLabel: { fontFamily: fonts.playfair, fontSize: 18 },

  payBtn: {
    marginHorizontal: SPACING.md, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  payBtnText: { fontFamily: fonts.dmSans, fontWeight: '600', fontSize: 15, color: '#fff' },

  thankEmoji: { fontSize: 48, textAlign: 'center' },
  thankHeading: { fontFamily: fonts.playfair, fontSize: 28, textAlign: 'center' },
  thankSub: { fontFamily: fonts.dmSans, fontSize: 14, textAlign: 'center' },
  doneBtn: { paddingVertical: 16, paddingHorizontal: 40, borderRadius: 14, alignItems: 'center', alignSelf: 'center', marginTop: 8 },
  doneBtnText: { fontFamily: fonts.dmSans, fontWeight: '600', fontSize: 14, color: '#fff' },
});
