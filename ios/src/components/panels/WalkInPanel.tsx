import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStripe } from '@stripe/stripe-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchWalkInToken, createWalkInOrder } from '../../lib/api';
import { CHOCOLATES, FINISHES } from '../../data/seed';

type Step = 'loading' | 'select' | 'paying' | 'confirmed' | 'claimed' | 'error';

export default function WalkInPanel() {
  const { goHome, panelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const token: string = panelData?.walk_in_token ?? '';

  const [step, setStep] = useState<Step>('loading');
  const [tokenData, setTokenData] = useState<any>(null);
  const [chocolate, setChocolate] = useState('');
  const [finish, setFinish] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('Invalid tag.'); return; }
    fetchWalkInToken(token)
      .then(data => { setTokenData(data); setStep('select'); })
      .catch(err => {
        if (err.message === 'already_claimed') { setStep('claimed'); return; }
        if (err.message === 'sold_out') { setStep('error'); setErrorMsg('This variety is sold out.'); return; }
        setStep('error'); setErrorMsg('Could not load this box. Try again.');
      });
  }, [token]);

  const handlePay = async () => {
    const email = await AsyncStorage.getItem('user_email');
    if (!email) { Alert.alert('Sign in to purchase.'); return; }
    if (!chocolate || !finish) { Alert.alert('Choose your options first.'); return; }

    setStep('paying');
    try {
      const { order, client_secret } = await createWalkInOrder(token, {
        chocolate,
        finish,
        customer_email: email,
        push_token: (await AsyncStorage.getItem('push_token')) ?? undefined,
      });

      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Maison Fraise',
        defaultBillingDetails: { email },
      });
      if (initErr) throw new Error(initErr.message);

      const { error: payErr } = await presentPaymentSheet();
      if (payErr) {
        if (payErr.code === 'Canceled') { setStep('select'); return; }
        throw new Error(payErr.message);
      }

      setStep('confirmed');
    } catch (err: any) {
      if (err.message === 'already_claimed') { setStep('claimed'); return; }
      setStep('error');
      setErrorMsg(err?.message ?? 'Payment failed. Try again.');
    }
  };

  const canPay = !!chocolate && !!finish;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={goHome} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>
          {tokenData?.variety_name ?? 'MAISON FRAISE'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {step === 'loading' && <ActivityIndicator color={c.accent} style={{ marginTop: 60 }} />}

        {step === 'select' && tokenData && (
          <>
            <View style={styles.varietyBlock}>
              <Text style={[styles.varietyName, { color: c.text, fontFamily: fonts.playfair }]}>
                {tokenData.variety_name}
              </Text>
              <Text style={[styles.locationName, { color: c.muted, fontFamily: fonts.dmMono }]}>
                {tokenData.location_name}
              </Text>
              <Text style={[styles.price, { color: c.text, fontFamily: fonts.dmMono }]}>
                CA${(tokenData.price_cents / 100).toFixed(0)}
              </Text>
            </View>

            {/* Chocolate */}
            <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>CHOCOLATE</Text>
            <View style={styles.optionRow}>
              {CHOCOLATES.map(ch => (
                <TouchableOpacity
                  key={ch.value}
                  style={[
                    styles.optionChip,
                    { borderColor: c.border },
                    chocolate === ch.value && { backgroundColor: c.accent, borderColor: c.accent },
                  ]}
                  onPress={() => setChocolate(ch.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.optionChipText,
                    { color: chocolate === ch.value ? '#fff' : c.muted, fontFamily: fonts.dmMono },
                  ]}>{ch.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Finish */}
            <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>FINISH</Text>
            <View style={styles.optionRow}>
              {FINISHES.map(f => (
                <TouchableOpacity
                  key={f.value}
                  style={[
                    styles.optionChip,
                    { borderColor: c.border },
                    finish === f.value && { backgroundColor: c.accent, borderColor: c.accent },
                  ]}
                  onPress={() => setFinish(f.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.optionChipText,
                    { color: finish === f.value ? '#fff' : c.muted, fontFamily: fonts.dmMono },
                  ]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.payBtn, { backgroundColor: canPay ? c.accent : c.border }]}
              onPress={handlePay}
              disabled={!canPay}
              activeOpacity={0.8}
            >
              <Text style={[styles.payBtnText, { fontFamily: fonts.dmSans }]}>
                Pay CA${(tokenData.price_cents / 100).toFixed(0)} →
              </Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'paying' && (
          <View style={styles.centred}>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={[styles.statusText, { color: c.text, fontFamily: fonts.playfair }]}>Processing…</Text>
          </View>
        )}

        {step === 'confirmed' && (
          <View style={styles.centred}>
            <View style={[styles.badge, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.badgeIcon, { color: c.accent }]}>✓</Text>
            </View>
            <Text style={[styles.statusText, { color: c.text, fontFamily: fonts.playfair }]}>Paid.</Text>
            <Text style={[styles.statusSub, { color: c.muted, fontFamily: fonts.dmSans }]}>
              Grab your box. Tap the sticker anytime to learn about your strawberries.
            </Text>
            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: c.accent }]} onPress={goHome} activeOpacity={0.8}>
              <Text style={[styles.doneBtnText, { fontFamily: fonts.dmSans }]}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'claimed' && (
          <View style={styles.centred}>
            <Text style={[styles.statusText, { color: c.text, fontFamily: fonts.playfair }]}>Already sold.</Text>
            <Text style={[styles.statusSub, { color: c.muted, fontFamily: fonts.dmSans }]}>
              This box has already been purchased.
            </Text>
            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: c.accent }]} onPress={goHome} activeOpacity={0.8}>
              <Text style={[styles.doneBtnText, { fontFamily: fonts.dmSans }]}>Go back</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'error' && (
          <View style={styles.centred}>
            <Text style={[styles.statusText, { color: c.text, fontFamily: fonts.playfair }]}>Something went wrong.</Text>
            <Text style={[styles.statusSub, { color: c.muted, fontFamily: fonts.dmSans }]}>{errorMsg}</Text>
            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: c.accent }]} onPress={goHome} activeOpacity={0.8}>
              <Text style={[styles.doneBtnText, { fontFamily: fonts.dmSans }]}>Go back</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 13, letterSpacing: 2 },
  headerSpacer: { width: 28 },
  body: { padding: SPACING.md, paddingBottom: 60, gap: SPACING.md },
  varietyBlock: { gap: 4, paddingVertical: SPACING.sm },
  varietyName: { fontSize: 28 },
  locationName: { fontSize: 11, letterSpacing: 0.5 },
  price: { fontSize: 16, marginTop: 4 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, marginTop: SPACING.sm },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  optionChipText: { fontSize: 12, letterSpacing: 0.5 },
  payBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: SPACING.lg },
  payBtnText: { color: '#fff', fontSize: 16 },
  centred: { alignItems: 'center', paddingTop: 80, gap: SPACING.md },
  badge: { width: 72, height: 72, borderRadius: 36, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  badgeIcon: { fontSize: 32 },
  statusText: { fontSize: 26, textAlign: 'center' },
  statusSub: { fontSize: 14, textAlign: 'center', lineHeight: 22, opacity: 0.7 },
  doneBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: SPACING.sm },
  doneBtnText: { color: '#fff', fontSize: 15 },
});
