import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useStripe } from '@stripe/stripe-react-native';
import { usePanel } from '../../context/PanelContext';
import { useApp } from '../../../App';
import { searchVerifiedUsers, generateGiftNote, createStandingOrder, placeStandingOrderFromFund } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

function fmtCents(cents: number): string {
  return `CA$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', cycles: 52, desc: 'Every week' },
  { key: 'biweekly', label: 'Biweekly', cycles: 26, desc: 'Every two weeks' },
  { key: 'monthly', label: 'Monthly', cycles: 12, desc: 'Once a month' },
];
const TIME_PREFS = ['9:00 – 11:00', '11:00 – 13:00', '13:00 – 15:00', '15:00 – 17:00'];
const TONES = ['warm', 'funny', 'poetic', 'minimal'] as const;

export default function StandingOrderPanel() {
  const { goBack, goHome, order, varieties } = usePanel();
  const { reviewMode } = useApp();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [type, setType] = useState<'personal' | 'gift'>('personal');

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('user_db_id'),
      AsyncStorage.getItem('verified'),
    ]).then(([dbId, verified]) => {
      if (dbId) setUserDbId(parseInt(dbId, 10));
      setIsVerified(verified === 'true');
    });
  }, []);
  const [freq, setFreq] = useState('monthly');
  const [timePref, setTimePref] = useState(TIME_PREFS[0]);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipients, setRecipients] = useState<any[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [tone, setTone] = useState<'warm' | 'funny' | 'poetic' | 'minimal'>('warm');
  const [notePreview, setNotePreview] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fundBalanceCents, setFundBalanceCents] = useState<number>(0);
  const [fundNewBalance, setFundNewBalance] = useState<number | null>(null);
  const [fundError, setFundError] = useState<string | null>(null);

  const selectedFreq = FREQUENCIES.find(f => f.key === freq)!;
  const priceCents = varieties.find(v => v.id === order.variety_id)?.price_cents ?? order.price_cents ?? null;
  const totalCents = priceCents !== null ? priceCents * order.quantity * selectedFreq.cycles : null;

  const handleSearch = useCallback(async (q: string) => {
    setRecipientQuery(q);
    setSelectedRecipient(null);
    if (q.length < 3) { setRecipients([]); return; }
    setSearchLoading(true);
    try { setRecipients(await searchVerifiedUsers(q) ?? []); }
    catch { setRecipients([]); }
    finally { setSearchLoading(false); }
  }, []);

  const handlePreview = async () => {
    setNoteLoading(true);
    try { setNotePreview((await generateGiftNote(tone, order.variety_name ?? '', selectedRecipient?.user_id ?? '')).note); }
    catch { Alert.alert('Could not generate note'); }
    finally { setNoteLoading(false); }
  };

  const handleConfirm = async () => {
    const senderId = userDbId;
    if (!senderId || !isVerified) return;
    if (!order.variety_id || !order.location_id || !order.chocolate || !order.finish) {
      Alert.alert('Incomplete order', 'Return to the order flow and complete your selection first.');
      return;
    }
    if (type === 'gift' && !selectedRecipient) {
      Alert.alert('Recipient required', 'Search for and select a verified member.');
      return;
    }
    if (totalCents === null) {
      Alert.alert('Pricing unavailable', 'Return to the order flow and reselect your variety.');
      return;
    }
    setSubmitting(true);
    try {
      const today = new Date();
      const next = new Date(today);
      if (freq === 'weekly') next.setDate(today.getDate() + 7);
      else if (freq === 'biweekly') next.setDate(today.getDate() + 14);
      else { next.setDate(1); next.setMonth(today.getMonth() + 1); }

      const { client_secret } = await createStandingOrder({
        recipient_id: type === 'gift' ? selectedRecipient?.id : undefined,
        variety_id: order.variety_id!,
        chocolate: order.chocolate!,
        finish: order.finish!,
        quantity: order.quantity,
        location_id: order.location_id!,
        time_slot_preference: timePref,
        frequency: freq,
        next_order_date: next.toISOString().split('T')[0],
        gift_tone: type === 'gift' ? tone : undefined,
      });

      if (!reviewMode) {
        const email = await AsyncStorage.getItem('user_email');
        const { error: initErr } = await initPaymentSheet({
          merchantDisplayName: 'Maison Fraise',
          paymentIntentClientSecret: client_secret,
          applePay: {
            merchantCountryCode: 'CA',
            merchantIdentifier: 'merchant.com.maisonfraise.app',
          },
          defaultBillingDetails: { email: email ?? undefined },
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
        TrueSheet.present('main-sheet', 0);
        const { error: presentErr } = await presentPaymentSheet();
        if (presentErr) {
          setTimeout(() => TrueSheet.present('main-sheet', 1), 150);
          if (presentErr.code === 'Canceled') { setSubmitting(false); return; }
          throw new Error(presentErr.message);
        }
        setTimeout(() => TrueSheet.present('main-sheet', 2), 150);
      }

      setSuccess(true);
    } catch (err: unknown) {
      Alert.alert('Could not set up standing order', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmFromFund = async () => {
    const senderId = userDbId;
    if (!senderId || !isVerified) return;
    if (!order.variety_id || !order.location_id || !order.time_slot_id || !order.chocolate || !order.finish) {
      Alert.alert('Incomplete order', 'Return to the order flow and complete your selection first.');
      return;
    }
    if (totalCents === null) {
      Alert.alert('Pricing unavailable', 'Return to the order flow and reselect your variety.');
      return;
    }
    setFundError(null);
    if (fundBalanceCents < totalCents) {
      setFundError(
        `ERR: insufficient fund balance\n     ${fmtCents(fundBalanceCents)} available · ${fmtCents(totalCents)} required`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const result = await placeStandingOrderFromFund(order.variety_id!, order.quantity, order.location_id!, order.time_slot_id!, order.chocolate!, order.finish!);
      setFundNewBalance(result.new_balance_cents);
      setSuccess(true);
    } catch (err: unknown) {
      Alert.alert('Could not place order from fund', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.container, styles.successContainer, { backgroundColor: c.panelBg }]}>
        <Text style={[styles.successCheck, { color: c.accent }]}>✓</Text>
        {fundNewBalance !== null ? (
          <>
            <Text style={[styles.successTitle, { color: c.text }]}>{'OK: order placed from fund_'}</Text>
            <Text style={[styles.successSub, { color: c.muted }]}>
              {`new balance: ${fmtCents(fundNewBalance)}`}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.successTitle, { color: c.text }]}>Standing order set.</Text>
            <Text style={[styles.successSub, { color: c.muted }]}>
              Your {freq} order starts {selectedFreq.desc.toLowerCase()}.
            </Text>
          </>
        )}
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: c.text, marginTop: SPACING.lg, paddingHorizontal: SPACING.xl }]}
          onPress={goHome}
          activeOpacity={0.8}
        >
          <Text style={[styles.confirmBtnText, { color: c.ctaText }]}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Standing Order</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Toggle */}
        <View style={[styles.toggle, { backgroundColor: c.cardDark }]}>
          {(['personal', 'gift'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.toggleOpt, type === t && [styles.toggleOptActive, { backgroundColor: c.accent }]]}
              onPress={() => setType(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, { color: type === t ? '#fff' : c.muted }]}>
                {t === 'personal' ? 'Myself' : 'A gift'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {type === 'gift' && (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>RECIPIENT</Text>
            <TextInput
              style={[styles.searchInput, { color: c.text, borderBottomColor: c.border }]}
              placeholder="Search by member ID (MF-...)"
              placeholderTextColor={c.muted}
              value={recipientQuery}
              onChangeText={handleSearch}
              autoCapitalize="characters"
            />
            {searchLoading && <ActivityIndicator size="small" color={c.accent} style={{ marginTop: 8 }} />}
            {recipients.map(r => (
              <TouchableOpacity key={r.id} style={[styles.resultRow, { borderBottomColor: c.border }]} onPress={() => { setSelectedRecipient(r); setRecipientQuery(r.user_id); setRecipients([]); }}>
                <Text style={[styles.resultText, { color: c.text }]}>{r.user_id}</Text>
              </TouchableOpacity>
            ))}
            {selectedRecipient && (
              <View style={[styles.selectedRow, { backgroundColor: c.cardDark }]}>
                <Text style={[styles.selectedText, { color: c.accent }]}>{selectedRecipient.user_id}</Text>
                <TouchableOpacity onPress={() => { setSelectedRecipient(null); setRecipientQuery(''); }}>
                  <Text style={[styles.clearText, { color: c.muted }]}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Frequency */}
        <Text style={[styles.sectionLabel, { color: c.muted }]}>FREQUENCY</Text>
        {FREQUENCIES.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.freqCard, { backgroundColor: c.card, borderColor: freq === f.key ? c.accent : 'transparent' }]}
            onPress={() => setFreq(f.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.freqLabel, { color: freq === f.key ? c.accent : c.text }]}>{f.label}</Text>
            <Text style={[styles.freqDesc, { color: freq === f.key ? c.accent : c.muted }]}>{f.desc}</Text>
          </TouchableOpacity>
        ))}

        {/* Time */}
        <Text style={[styles.sectionLabel, { color: c.muted }]}>PREFERRED TIME</Text>
        <View style={styles.timeRow}>
          {TIME_PREFS.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.timeChip, { backgroundColor: c.card, borderColor: timePref === t ? c.accent : 'transparent' }]}
              onPress={() => setTimePref(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.timeText, { color: timePref === t ? c.accent : c.text, fontWeight: timePref === t ? '600' : '400' }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {type === 'gift' && (
          <>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>NOTE TONE</Text>
            <View style={styles.toneRow}>
              {TONES.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.toneChip, { backgroundColor: c.card, borderColor: tone === t ? c.accent : 'transparent' }]}
                  onPress={() => { setTone(t); setNotePreview(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.toneText, { color: tone === t ? c.accent : c.text, fontWeight: tone === t ? '600' : '400' }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.previewBtn, { backgroundColor: c.card, borderColor: c.border }, (!selectedRecipient || noteLoading) && { opacity: 0.4 }]}
              onPress={handlePreview}
              disabled={!selectedRecipient || noteLoading}
              activeOpacity={0.8}
            >
              {noteLoading
                ? <ActivityIndicator size="small" color={c.accent} />
                : <Text style={[styles.previewBtnText, { color: c.accent }]}>Preview note</Text>
              }
            </TouchableOpacity>
            {notePreview !== '' && (
              <View style={[styles.noteCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.noteLabel, { color: c.muted }]}>SAMPLE NOTE</Text>
                <Text style={[styles.noteText, { color: c.text }]}>{notePreview}</Text>
              </View>
            )}
          </>
        )}

        {/* Total */}
        <View style={[styles.totalCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View>
            <Text style={[styles.totalLabel, { color: c.muted }]}>TOTAL PREPAYMENT</Text>
            <Text style={[styles.totalSub, { color: c.muted }]}>
              {priceCents !== null
                ? `${selectedFreq.cycles} orders × CA${(priceCents * order.quantity / 100).toFixed(2)}`
                : 'Pricing unavailable — return to order flow'}
            </Text>
          </View>
          <Text style={[styles.totalAmount, { color: c.text }]}>
            {totalCents !== null ? `CA$${(totalCents / 100).toFixed(2)}` : '—'}
          </Text>
        </View>
        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {!userDbId && (
        <View style={[styles.notSignedInBanner, { backgroundColor: c.cardDark }]}>
          <Text style={[styles.notSignedInText, { color: c.muted }]}>Sign in with Apple in your profile to set up standing orders.</Text>
        </View>
      )}
      {userDbId && !isVerified && (
        <View style={[styles.notSignedInBanner, { backgroundColor: c.cardDark }]}>
          <Text style={[styles.notSignedInText, { color: c.muted }]}>Collect your first order and tap the NFC chip to unlock standing orders.</Text>
        </View>
      )}

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        {/* Payment section */}
        <View style={[styles.paymentSection, { borderColor: c.border }]}>
          <Text style={[styles.paymentHeader, { color: c.muted }]}>{'PAYMENT'}</Text>
          <View style={styles.paymentSeparator} />

          <TouchableOpacity
            style={[styles.paymentOption, (!userDbId || !isVerified || submitting) && { opacity: 0.4 }]}
            onPress={handleConfirm}
            disabled={!userDbId || !isVerified || submitting}
            activeOpacity={0.85}
          >
            <Text style={[styles.paymentOptionText, { color: c.text }]}>
              {submitting ? 'Setting up...' : '> PAY WITH CARD_'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentOption, (!userDbId || !isVerified || submitting) && { opacity: 0.4 }]}
            onPress={handleConfirmFromFund}
            disabled={!userDbId || !isVerified || submitting}
            activeOpacity={0.85}
          >
            <Text style={[styles.paymentOptionText, { color: c.text }]}>{'> PAY FROM FUND_'}</Text>
            <Text style={[styles.paymentOptionSub, { color: c.muted }]}>
              {`  Fund balance: ${fmtCents(fundBalanceCents)}`}
            </Text>
          </TouchableOpacity>

          {fundError && (
            <Text style={[styles.fundError, { color: '#E53935' }]}>{fundError}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerSpacer: { width: 40 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  body: { padding: SPACING.md, gap: SPACING.md },
  sectionLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.8 },
  toggle: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  toggleOpt: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  toggleOptActive: {},
  toggleText: { fontSize: 14, fontFamily: fonts.dmSans, fontWeight: '600' },
  card: { borderRadius: 14, padding: SPACING.md, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { fontSize: 14, fontFamily: fonts.dmSans, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  resultRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  resultText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 1 },
  selectedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  selectedText: { fontSize: 13, fontFamily: fonts.dmMono, fontWeight: '600' },
  clearText: { fontSize: 14 },
  freqCard: { borderRadius: 14, padding: SPACING.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  freqLabel: { fontSize: 16, fontFamily: fonts.playfair },
  freqDesc: { fontSize: 13, fontFamily: fonts.dmSans },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, borderWidth: StyleSheet.hairlineWidth },
  timeText: { fontSize: 13, fontFamily: fonts.dmSans },
  toneRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  toneChip: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth },
  toneText: { fontSize: 13, fontFamily: fonts.dmSans },
  previewBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  previewBtnText: { fontSize: 14, fontFamily: fonts.playfair },
  noteCard: { borderRadius: 14, padding: SPACING.md, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  noteLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 2 },
  noteText: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22, fontStyle: 'italic' },
  totalCard: { borderRadius: 14, paddingHorizontal: SPACING.md, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  totalLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.8, marginBottom: 3 },
  totalSub: { fontSize: 12, fontFamily: fonts.dmSans },
  totalAmount: { fontSize: 24, fontFamily: fonts.playfair },
  footer: { padding: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
  confirmBtn: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
  notSignedInBanner: { marginHorizontal: SPACING.md, marginBottom: 8, borderRadius: 12, padding: 12 },
  notSignedInText: { fontSize: 13, fontFamily: fonts.dmSans, textAlign: 'center', lineHeight: 20 },
  successContainer: { alignItems: 'center', justifyContent: 'center' },
  successCheck: { fontSize: 48, marginBottom: SPACING.md },
  successTitle: { fontSize: 32, fontFamily: fonts.playfair, marginBottom: SPACING.sm },
  successSub: { fontSize: 14, fontFamily: fonts.dmSans, textAlign: 'center' },
  paymentSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACING.sm, gap: 8 },
  paymentHeader: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.8 },
  paymentSeparator: { height: StyleSheet.hairlineWidth },
  paymentOption: { paddingVertical: 6 },
  paymentOptionText: { fontSize: 13, fontFamily: fonts.dmMono },
  paymentOptionSub: { fontSize: 12, fontFamily: fonts.dmMono, marginTop: 2 },
  fundError: { fontSize: 12, fontFamily: fonts.dmMono, lineHeight: 18, marginTop: 4 },
});
