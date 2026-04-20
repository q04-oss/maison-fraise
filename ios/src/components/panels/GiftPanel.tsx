import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { API_BASE_URL } from '../../config/api';

const SHEET_NAME = 'main-sheet';

type GiftType = 'digital' | 'physical' | 'bundle';

const GIFT_OPTIONS: { type: GiftType; label: string; desc: string; price: string }[] = [
  { type: 'digital', label: 'Digital Sticker', desc: 'Delivered instantly in-app', price: '$3' },
  { type: 'physical', label: 'Physical Sticker Pack', desc: 'Mailed to the recipient', price: '$14' },
  { type: 'bundle', label: 'Digital + Physical', desc: 'Both, together', price: '$16' },
];

export default function GiftPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const businessId: number | null = panelData?.businessId ?? null;
  const businessName: string | null = panelData?.businessName ?? null;
  const prefilledEmail: string | null = panelData?.recipientEmail ?? null;
  const isOutreach: boolean = panelData?.isOutreach ?? false;

  const [giftType, setGiftType] = useState<GiftType>('digital');
  const [recipientEmail, setRecipientEmail] = useState(prefilledEmail ?? '');
  const [paying, setPaying] = useState(false);
  const [sent, setSent] = useState(false);
  const [userToken, setUserToken] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('auth_token').then(t => setUserToken(t));
  }, []);

  const handleSend = async () => {
    const trimmed = recipientEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!userToken) {
      Alert.alert('Not signed in', 'Please sign in to send a gift.');
      return;
    }

    setPaying(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gifts/payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ gift_type: giftType, recipient_email: trimmed, ...(businessId ? { business_id: businessId } : {}), ...(isOutreach ? { is_outreach: true } : {}) }),
      });
      if (!res.ok) throw new Error('Failed to create gift');
      const { client_secret } = await res.json();

      const { error: initErr } = await initPaymentSheet({
        merchantDisplayName: 'Box Fraise',
        paymentIntentClientSecret: client_secret,
        applePay: { merchantCountryCode: 'CA', merchantIdentifier: 'merchant.com.boxfraise.app' },
        defaultBillingDetails: { email: trimmed },
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
      setSent(true);
      setTimeout(() => TrueSheet.present(SHEET_NAME, 2), 150);
    } catch (err: any) {
      Alert.alert('Something went wrong', err.message ?? 'Please try again.');
    } finally {
      setPaying(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>Gift sent</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.sentBody}>
          <Text style={[styles.sentEmoji]}>🍓</Text>
          <Text style={[styles.sentHeading, { color: c.text }]}>On its way.</Text>
          <Text style={[styles.sentSub, { color: c.muted }]}>
            {recipientEmail.trim().toLowerCase()} will receive an email with a claim code and a link to download the app.
          </Text>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: c.accent }]}
            onPress={goBack}
            activeOpacity={0.8}
          >
            <Text style={[styles.doneBtnText, { color: '#fff' }]}>Done</Text>
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
        <Text style={[styles.title, { color: c.text }]}>{isOutreach ? 'Introduce them' : businessName ?? 'Send a sticker'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Type picker */}
        <Text style={[styles.sectionLabel, { color: c.muted }]}>CHOOSE A GIFT</Text>
        {GIFT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.type}
            style={[styles.optionRow, { borderColor: giftType === opt.type ? c.accent : c.border }]}
            onPress={() => setGiftType(opt.type)}
            activeOpacity={0.8}
          >
            <View style={styles.optionLeft}>
              <Text style={[styles.optionLabel, { color: c.text }]}>{opt.label}</Text>
              <Text style={[styles.optionDesc, { color: c.muted }]}>{opt.desc}</Text>
            </View>
            <Text style={[styles.optionPrice, { color: giftType === opt.type ? c.accent : c.muted }]}>{opt.price}</Text>
          </TouchableOpacity>
        ))}

        {/* Recipient */}
        <Text style={[styles.sectionLabel, { color: c.muted, marginTop: SPACING.lg }]}>
          {isOutreach ? 'SENDING TO' : 'RECIPIENT'}
        </Text>
        <View style={[styles.inputWrapper, { borderColor: c.border, backgroundColor: c.card }]}>
          <TextInput
            style={[styles.input, { color: isOutreach ? c.muted : c.text }]}
            placeholder="Email address"
            placeholderTextColor={c.muted}
            value={recipientEmail}
            onChangeText={isOutreach ? undefined : setRecipientEmail}
            editable={!isOutreach}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <Text style={[styles.hint, { color: c.muted }]}>
          {isOutreach
            ? `${businessName ?? 'They'} will receive a sticker and a note about Box Fraise.`
            : "They'll receive a claim code and a link to download the app. No account needed to receive it."}
        </Text>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.actionBar, { borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: c.accent, opacity: paying ? 0.7 : 1 }]}
          onPress={handleSend}
          disabled={paying}
          activeOpacity={0.8}
        >
          {paying
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.sendBtnText}>Send gift →</Text>
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
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.lg },

  sectionLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginBottom: 10 },

  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    marginBottom: 10,
  },
  optionLeft: { flex: 1, gap: 3 },
  optionLabel: { fontSize: 15, fontFamily: fonts.playfair },
  optionDesc: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  optionPrice: { fontSize: 14, fontFamily: fonts.dmMono, marginLeft: 12 },

  inputWrapper: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    paddingHorizontal: SPACING.md, paddingVertical: 14,
  },
  input: { fontSize: 15, fontFamily: fonts.dmSans },
  hint: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.3, marginTop: 8, lineHeight: 16 },

  actionBar: {
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sendBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  sendBtnText: { fontSize: 14, fontFamily: fonts.dmSans, fontWeight: '600', color: '#fff' },

  sentBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, gap: 16 },
  sentEmoji: { fontSize: 48 },
  sentHeading: { fontSize: 26, fontFamily: fonts.playfair, fontStyle: 'italic' },
  sentSub: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.3, textAlign: 'center', lineHeight: 20 },
  doneBtn: { marginTop: 8, paddingVertical: 16, paddingHorizontal: 40, borderRadius: 14, alignItems: 'center' },
  doneBtnText: { fontSize: 14, fontFamily: fonts.dmSans, fontWeight: '600' },
});
