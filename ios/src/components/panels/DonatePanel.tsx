import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Keyboard, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import * as Haptics from 'expo-haptics';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { API_BASE_URL } from '../../config/api';

const SHEET_NAME = 'main-sheet';

const PRESETS = [300, 500, 1000, 2500];

export default function DonatePanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const inputRef = useRef<TextInput>(null);

  const [selected, setSelected] = useState<number | null>(500);
  const [customInput, setCustomInput] = useState('');
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);

  const customCents = customInput ? Math.round(parseFloat(customInput) * 100) : 0;
  const activeCents = customInput ? customCents : (selected ?? 0);

  const displayAmount = customInput
    ? (isNaN(parseFloat(customInput)) ? '$0' : `$${parseFloat(customInput).toFixed(2)}`)
    : `$${((selected ?? 0) / 100).toFixed(2)}`;

  const canPay = activeCents >= 100 && !paying;

  const handleDonate = async () => {
    if (!canPay) return;
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
        <View style={styles.thankBody}>
          <Text style={styles.thankEmoji}>🍓</Text>
          <Text style={[styles.thankHeading, { color: c.text }]}>Thank you.</Text>
          <Text style={[styles.thankSub, { color: c.muted }]}>It means a lot.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.panelBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Support Box Fraise</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Amount display */}
      <TouchableOpacity
        style={styles.amountDisplay}
        onPress={() => { inputRef.current?.focus(); setSelected(null); }}
        activeOpacity={1}
      >
        <Text style={[styles.amountBig, { color: c.text }]}>{displayAmount}</Text>
        <Text style={[styles.amountSub, { color: c.muted }]}>CAD</Text>
      </TouchableOpacity>

      {/* Presets */}
      <View style={styles.presetRow}>
        {PRESETS.map(cents => {
          const active = !customInput && selected === cents;
          return (
            <TouchableOpacity
              key={cents}
              style={[
                styles.preset,
                { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent : 'transparent' },
              ]}
              onPress={() => {
                setSelected(cents);
                setCustomInput('');
                inputRef.current?.blur();
                Haptics.selectionAsync();
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.presetLabel, { color: active ? '#fff' : c.muted }]}>
                ${cents / 100 % 1 === 0 ? cents / 100 : (cents / 100).toFixed(2)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Custom input */}
      <View style={[styles.customRow, { borderTopColor: c.border, borderBottomColor: c.border }]}>
        <Text style={[styles.customLabel, { color: c.muted }]}>Other</Text>
        <View style={styles.customInputWrap}>
          <Text style={[styles.customCurrency, { color: customInput ? c.text : c.muted }]}>$</Text>
          <TextInput
            ref={inputRef}
            style={[styles.customInput, { color: c.text }]}
            placeholder="0.00"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            value={customInput}
            onChangeText={v => { setCustomInput(v); setSelected(null); }}
            onFocus={() => setSelected(null)}
          />
        </View>
      </View>

      {/* Pay button */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: c.accent, opacity: canPay ? 1 : 0.4 }]}
          onPress={handleDonate}
          disabled={!canPay}
          activeOpacity={0.8}
        >
          {paying
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.payBtnText}>Donate {displayAmount} →</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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

  amountDisplay: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 40, gap: 4,
  },
  amountBig: { fontFamily: fonts.playfair, fontSize: 56 },
  amountSub: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 1.5 },

  presetRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.lg,
  },
  preset: {
    flex: 1, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, alignItems: 'center',
  },
  presetLabel: { fontFamily: fonts.dmMono, fontSize: 13, letterSpacing: 0.5 },

  customRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 18,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  customLabel: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 1, width: 48 },
  customInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  customCurrency: { fontFamily: fonts.playfair, fontSize: 22, marginRight: 4 },
  customInput: { flex: 1, fontFamily: fonts.playfair, fontSize: 22 },

  footer: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  payBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  payBtnText: { fontFamily: fonts.dmSans, fontWeight: '600', fontSize: 15, color: '#fff' },

  thankBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  thankEmoji: { fontSize: 48 },
  thankHeading: { fontFamily: fonts.playfair, fontSize: 32 },
  thankSub: { fontFamily: fonts.dmSans, fontSize: 14 },
});
