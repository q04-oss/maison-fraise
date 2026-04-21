import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Keyboard, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import * as Haptics from 'expo-haptics';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { searchUsers, createCreditTransferIntent } from '../../lib/api';

const PRESETS = [300, 500, 1000, 2500];

export default function SendCreditPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: number; display_name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [recipient, setRecipient] = useState<{ id: number; display_name: string } | null>(null);

  const [selected, setSelected] = useState<number | null>(500);
  const [customInput, setCustomInput] = useState('');
  const [note, setNote] = useState('');
  const customRef = useRef<TextInput>(null);

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const activeCents = (() => {
    if (selected !== null) return selected;
    const n = Math.round(parseFloat(customInput) * 100);
    return isNaN(n) ? 0 : n;
  })();

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await searchUsers(text);
      setResults(r.slice(0, 5));
    } catch { setResults([]); }
    finally { setSearching(false); }
  };

  const handlePay = async () => {
    if (!recipient || activeCents < 100) return;
    Keyboard.dismiss();
    setLoading(true);
    try {
      const { client_secret } = await createCreditTransferIntent(recipient.id, activeCents, note || undefined);
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Box Fraise',
      });
      if (initError) { setLoading(false); return; }
      const { error: presentError } = await presentPaymentSheet();
      if (!presentError) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setDone(true);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  if (done) {
    return (
      <View style={[styles.wrap, { backgroundColor: c.background }]}>
        <View style={styles.confirmWrap}>
          <Text style={styles.confirmEmoji}>🍓</Text>
          <Text style={[styles.confirmTitle, { color: c.text }]}>Sent.</Text>
          <Text style={[styles.confirmSub, { color: c.muted }]}>
            CA${(activeCents / 100).toFixed(2)} added to {recipient?.display_name ?? 'their'} credit.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.wrap, { backgroundColor: c.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
            <Text style={[styles.back, { color: c.muted }]}>← back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>send credit</Text>
        </View>

        {/* Recipient search */}
        {!recipient ? (
          <View style={styles.section}>
            <Text style={[styles.label, { color: c.muted }]}>WHO</Text>
            <TextInput
              style={[styles.searchInput, { color: c.text, borderColor: c.border }]}
              placeholder="Search by name…"
              placeholderTextColor={c.muted}
              value={query}
              onChangeText={handleSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searching && <ActivityIndicator size="small" color={c.muted} style={{ marginTop: 8 }} />}
            {results.map(u => (
              <TouchableOpacity
                key={u.id}
                style={[styles.resultRow, { borderBottomColor: c.border }]}
                onPress={() => { setRecipient(u); setResults([]); setQuery(''); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.resultName, { color: c.text }]}>{u.display_name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.label, { color: c.muted }]}>TO</Text>
            <View style={styles.recipientRow}>
              <Text style={[styles.recipientName, { color: c.text }]}>{recipient.display_name}</Text>
              <TouchableOpacity onPress={() => setRecipient(null)} activeOpacity={0.7}>
                <Text style={[styles.changeBtn, { color: c.muted }]}>change</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Amount */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: c.muted }]}>AMOUNT</Text>
          <View style={styles.presets}>
            {PRESETS.map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.pill, { borderColor: selected === p ? c.text : c.border, backgroundColor: selected === p ? c.text : 'transparent' }]}
                onPress={() => { setSelected(p); setCustomInput(''); customRef.current?.blur(); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, { color: selected === p ? c.background : c.muted }]}>
                  ${(p / 100).toFixed(0)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.customRow, { borderColor: c.border }]}>
            <Text style={[styles.currencyPrefix, { color: c.muted }]}>CA$</Text>
            <TextInput
              ref={customRef}
              style={[styles.customInput, { color: c.text }]}
              placeholder="Other"
              placeholderTextColor={c.muted}
              keyboardType="decimal-pad"
              value={customInput}
              onChangeText={v => { setCustomInput(v); setSelected(null); }}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
        </View>

        {/* Note */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: c.muted }]}>NOTE (optional)</Text>
          <TextInput
            style={[styles.noteInput, { color: c.text, borderColor: c.border }]}
            placeholder="Add a note…"
            placeholderTextColor={c.muted}
            value={note}
            onChangeText={setNote}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.payBtn,
            { backgroundColor: c.text, opacity: (!recipient || activeCents < 100 || loading) ? 0.3 : 1 },
          ]}
          onPress={handlePay}
          disabled={!recipient || activeCents < 100 || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={c.background} />
          ) : (
            <Text style={[styles.payBtnText, { color: c.background }]}>
              Send CA${(activeCents / 100).toFixed(2)}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: SPACING.md },
  header: { paddingTop: SPACING.lg, paddingBottom: SPACING.md, gap: 4 },
  back: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 0.5 },
  title: { fontFamily: fonts.playfair, fontSize: 28 },
  section: { marginBottom: SPACING.lg },
  label: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1.5, marginBottom: 10 },
  searchInput: { fontFamily: fonts.body, fontSize: 15, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  resultRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  resultName: { fontFamily: fonts.body, fontSize: 15 },
  recipientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recipientName: { fontFamily: fonts.body, fontSize: 17 },
  changeBtn: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 0.5 },
  presets: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  pillText: { fontFamily: fonts.dmMono, fontSize: 12 },
  customRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 },
  currencyPrefix: { fontFamily: fonts.dmMono, fontSize: 13, marginRight: 4 },
  customInput: { flex: 1, fontFamily: fonts.body, fontSize: 15, paddingVertical: 10 },
  noteInput: { fontFamily: fonts.body, fontSize: 15, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  payBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  payBtnText: { fontFamily: fonts.dmMono, fontSize: 13, letterSpacing: 1 },
  confirmWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  confirmEmoji: { fontSize: 48 },
  confirmTitle: { fontFamily: fonts.playfair, fontSize: 36 },
  confirmSub: { fontFamily: fonts.body, fontSize: 15, textAlign: 'center', maxWidth: 260 },
});
