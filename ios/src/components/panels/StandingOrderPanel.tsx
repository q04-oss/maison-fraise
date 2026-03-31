import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { searchVerifiedUsers, generateGiftNote, createStandingOrder } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', cycles: 52, desc: 'Every week' },
  { key: 'biweekly', label: 'Biweekly', cycles: 26, desc: 'Every two weeks' },
  { key: 'monthly', label: 'Monthly', cycles: 12, desc: 'Once a month' },
];
const TIME_PREFS = ['9:00 – 11:00', '11:00 – 13:00', '13:00 – 15:00', '15:00 – 17:00'];
const TONES = ['warm', 'funny', 'poetic', 'minimal'] as const;

export default function StandingOrderPanel() {
  const { goBack, goHome, order } = usePanel();
  const c = useColors();
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [type, setType] = useState<'personal' | 'gift'>('personal');

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(val => {
      if (val) setUserDbId(parseInt(val, 10));
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

  const selectedFreq = FREQUENCIES.find(f => f.key === freq)!;
  const totalCents = (order.price_cents ?? 0) * order.quantity * selectedFreq.cycles;

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
    try { setNotePreview((await generateGiftNote(tone, order.variety_name ?? '', '')).note); }
    catch { Alert.alert('Could not generate note'); }
    finally { setNoteLoading(false); }
  };

  const handleConfirm = async () => {
    if (type === 'gift' && !selectedRecipient) {
      Alert.alert('Recipient required', 'Search for and select a verified member.');
      return;
    }
    setSubmitting(true);
    try {
      const today = new Date();
      const next = new Date(today);
      if (freq === 'weekly') next.setDate(today.getDate() + 7);
      else if (freq === 'biweekly') next.setDate(today.getDate() + 14);
      else next.setMonth(today.getMonth() + 1);

      await createStandingOrder({
        sender_id: userDbId!,
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
      Alert.alert('Standing order set.', `Your ${freq} order is confirmed.`, [
        { text: 'Done', onPress: () => { goHome(); TrueSheet.present('main-sheet', 1); } },
      ]);
    } catch (err: unknown) {
      Alert.alert('Could not set up standing order', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Standing Order</Text>
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
              style={[styles.previewBtn, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={handlePreview}
              disabled={noteLoading}
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
            <Text style={[styles.totalSub, { color: c.muted }]}>{selectedFreq.cycles} orders × CA${((order.price_cents ?? 0) * order.quantity / 100).toFixed(2)}</Text>
          </View>
          <Text style={[styles.totalAmount, { color: c.text }]}>CA${(totalCents / 100).toFixed(2)}</Text>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: c.text }, submitting && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={submitting}
          activeOpacity={0.85}
        >
          <Text style={[styles.confirmBtnText, { color: c.ctaText }]}>{submitting ? 'Setting up...' : 'Confirm & Pay'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goBack} activeOpacity={0.6} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: c.accent }]}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: SPACING.md, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 28, fontFamily: fonts.playfair },
  body: { padding: SPACING.md, gap: SPACING.md },
  sectionLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.8 },
  toggle: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  toggleOpt: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  toggleOptActive: {},
  toggleText: { fontSize: 14, fontFamily: fonts.dmSans, fontWeight: '600' },
  card: { borderRadius: 14, padding: SPACING.md, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { fontSize: 14, fontFamily: fonts.dmSans, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  resultRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  resultText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 1 },
  selectedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  selectedText: { fontSize: 13, fontFamily: fonts.dmMono, fontWeight: '600' },
  clearText: { fontSize: 14 },
  freqCard: { borderRadius: 14, padding: SPACING.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5 },
  freqLabel: { fontSize: 16, fontFamily: fonts.playfair },
  freqDesc: { fontSize: 13, fontFamily: fonts.dmSans },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1.5 },
  timeText: { fontSize: 13, fontFamily: fonts.dmSans },
  toneRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  toneChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5 },
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
  footer: { padding: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  confirmBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
  backLink: { alignItems: 'center', paddingVertical: 4 },
  backLinkText: { fontSize: 15, fontFamily: fonts.dmSans },
});
