import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
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

  const [selected, setSelected] = useState(500);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);

  const handleDonate = async () => {
    setPaying(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/donate/payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: selected }),
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
        <Text style={[styles.sub, { color: c.muted }]}>
          Independent, local, and built from scratch. If you like what we're building, this helps.
        </Text>

        <View style={styles.amountRow}>
          {AMOUNTS.map(a => (
            <TouchableOpacity
              key={a.cents}
              style={[
                styles.amountBtn,
                { borderColor: selected === a.cents ? c.accent : c.border },
                selected === a.cents && { backgroundColor: c.accent },
              ]}
              onPress={() => { setSelected(a.cents); Haptics.selectionAsync(); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.amountLabel, { color: selected === a.cents ? '#fff' : c.text }]}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: c.accent, paddingBottom: Math.max(insets.bottom, SPACING.md) + 16, opacity: paying ? 0.7 : 1 }]}
          onPress={handleDonate}
          disabled={paying}
          activeOpacity={0.8}
        >
          {paying
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.payBtnText}>Donate {AMOUNTS.find(a => a.cents === selected)?.label} →</Text>
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

  body: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, gap: SPACING.lg },
  sub: { fontFamily: fonts.dmSans, fontSize: 14, lineHeight: 22 },

  amountRow: { flexDirection: 'row', gap: 10 },
  amountBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, alignItems: 'center',
  },
  amountLabel: { fontFamily: fonts.playfair, fontSize: 18 },

  payBtn: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 18, alignItems: 'center',
  },
  payBtnText: { fontFamily: fonts.dmSans, fontWeight: '600', fontSize: 15, color: '#fff' },

  thankEmoji: { fontSize: 48, textAlign: 'center' },
  thankHeading: { fontFamily: fonts.playfair, fontSize: 28, textAlign: 'center' },
  thankSub: { fontFamily: fonts.dmSans, fontSize: 14, textAlign: 'center' },
  doneBtn: { paddingVertical: 16, paddingHorizontal: 40, borderRadius: 14, alignItems: 'center', alignSelf: 'center', marginTop: 8 },
  doneBtnText: { fontFamily: fonts.dmSans, fontWeight: '600', fontSize: 14, color: '#fff' },
});
