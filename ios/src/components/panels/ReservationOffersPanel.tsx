import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import {
  fetchMyReservationOffers, createReservationOffer, updateReservationOffer,
} from '../../lib/api';

type Screen = 'list' | 'create';

export default function ReservationOffersPanel() {
  const { goBack } = usePanel();
  const c = useColors();

  const [screen, setScreen] = useState<Screen>('list');
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'platform_match' | 'user_invite'>('platform_match');
  const [valueCents, setValueCents] = useState('');
  const [drink, setDrink] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState('1');

  const load = async () => {
    setLoading(true);
    try { setOffers(await fetchMyReservationOffers()); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!title.trim() || !valueCents.trim()) {
      Alert.alert('Required', 'Title and meal value are required.'); return;
    }
    const value = Math.round(parseFloat(valueCents) * 100);
    if (isNaN(value) || value < 1) { Alert.alert('Invalid', 'Enter a valid meal value.'); return; }

    setSaving(true);
    try {
      const created = await createReservationOffer({
        title: title.trim(),
        description: description.trim() || undefined,
        mode,
        value_cents: value,
        drink_description: drink.trim() || undefined,
        reservation_date: date.trim() || undefined,
        reservation_time: time.trim() || undefined,
        slots_total: parseInt(slots, 10) || 1,
      });
      setOffers(prev => [created, ...prev]);
      setTitle(''); setDescription(''); setValueCents(''); setDrink('');
      setDate(''); setTime(''); setSlots('1'); setMode('platform_match');
      setScreen('list');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not create offer.');
    } finally { setSaving(false); }
  };

  const handleToggle = async (offer: any) => {
    const newStatus = offer.status === 'active' ? 'paused' : 'active';
    try {
      const updated = await updateReservationOffer(offer.id, { status: newStatus });
      setOffers(prev => prev.map(o => o.id === offer.id ? updated : o));
    } catch { /* ignore */ }
  };

  const commission = valueCents.trim() && !isNaN(parseFloat(valueCents))
    ? (parseFloat(valueCents) * 0.20).toFixed(2)
    : null;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={screen === 'create' ? () => setScreen('list') : goBack}
          style={styles.backBtn} activeOpacity={0.7}
        >
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Sponsored Dinners</Text>
        {screen === 'list' ? (
          <TouchableOpacity onPress={() => setScreen('create')} style={styles.addBtn} activeOpacity={0.7}>
            <Text style={[styles.addBtnText, { color: c.accent }]}>+ new</Text>
          </TouchableOpacity>
        ) : <View style={styles.addBtn} />}
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : screen === 'create' ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.hint, { color: c.muted }]}>
            You cover the full dinner for two — drinks, mains, and chocolate-covered strawberries for dessert.
            Maison Fraise takes 20% as a platform fee.
          </Text>

          <Text style={[styles.fieldLabel, { color: c.muted }]}>TITLE</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={title} onChangeText={setTitle} placeholder="An evening at the chef's table…" placeholderTextColor={c.muted} />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>DESCRIPTION</Text>
          <TextInput style={[styles.input, styles.inputMulti, { color: c.text, borderColor: c.border }]} value={description} onChangeText={setDescription} placeholder="What will guests experience?" placeholderTextColor={c.muted} multiline />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>FULL MEAL VALUE (CA$)</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={valueCents} onChangeText={setValueCents} placeholder="240.00" placeholderTextColor={c.muted} keyboardType="decimal-pad" />
          {commission && (
            <Text style={[styles.commissionNote, { color: c.muted }]}>
              Platform fee CA${commission} · You pay CA${(parseFloat(valueCents) - parseFloat(commission)).toFixed(2)} net
            </Text>
          )}

          <Text style={[styles.fieldLabel, { color: c.muted }]}>DRINKS INCLUDED</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={drink} onChangeText={setDrink} placeholder="Wine pairing, cocktails on arrival…" placeholderTextColor={c.muted} />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>DATE (YYYY-MM-DD)</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={date} onChangeText={setDate} placeholder="2026-05-12" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>TIME (HH:MM)</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={time} onChangeText={setTime} placeholder="19:30" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>MATCHING MODE</Text>
          <View style={styles.modeRow}>
            {(['platform_match', 'user_invite'] as const).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.modePill, { borderColor: c.border, backgroundColor: mode === m ? c.accent : 'transparent' }]}
                onPress={() => setMode(m)} activeOpacity={0.7}
              >
                <Text style={[styles.modePillText, { color: mode === m ? (c.ctaText ?? '#fff') : c.muted }]}>
                  {m === 'platform_match' ? 'Platform match' : 'User invites guest'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.modeHint, { color: c.muted }]}>
            {mode === 'platform_match'
              ? 'We find two compatible users and propose this dinner to both.'
              : 'The first user who accepts invites someone from their contact list.'}
          </Text>

          <Text style={[styles.fieldLabel, { color: c.muted }]}>SLOTS</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={slots} onChangeText={setSlots} placeholder="1" placeholderTextColor={c.muted} keyboardType="number-pad" />

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: c.accent }, saving && { opacity: 0.5 }]}
            onPress={handleCreate} disabled={saving} activeOpacity={0.8}
          >
            <Text style={[styles.saveBtnText, { color: c.ctaText ?? '#fff' }]}>
              {saving ? 'Creating…' : 'Create Offer'}
            </Text>
          </TouchableOpacity>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {offers.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: c.text }]}>No offers yet</Text>
              <Text style={[styles.emptyHint, { color: c.muted }]}>
                Create a sponsored dinner offer. You cover the full meal — the platform connects you with two guests.
                Dessert is always chocolate-covered strawberries.
              </Text>
            </View>
          ) : (
            offers.map(offer => (
              <View key={offer.id} style={[styles.offerCard, { borderColor: c.border }]}>
                <View style={styles.offerTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.offerTitle, { color: c.text }]}>{offer.title}</Text>
                    {offer.reservation_date && (
                      <Text style={[styles.offerDate, { color: c.muted }]}>
                        {offer.reservation_date}{offer.reservation_time ? ` · ${offer.reservation_time}` : ''}
                      </Text>
                    )}
                    <Text style={[styles.offerMeta, { color: c.muted }]}>
                      {offer.mode === 'platform_match' ? 'Platform match' : 'User invite'} · {offer.slots_remaining}/{offer.slots_total} slots
                    </Text>
                  </View>
                  <View style={styles.offerValue}>
                    <Text style={[styles.offerValueText, { color: c.accent }]}>
                      CA${(offer.value_cents / 100).toFixed(0)}
                    </Text>
                    <Text style={[styles.offerValueLabel, { color: c.muted }]}>total</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.toggleBtn, { borderColor: c.border, backgroundColor: offer.status === 'active' ? 'transparent' : c.accent }]}
                  onPress={() => handleToggle(offer)} activeOpacity={0.7}
                >
                  <Text style={[styles.toggleBtnText, { color: offer.status === 'active' ? c.muted : (c.ctaText ?? '#fff') }]}>
                    {offer.status === 'active' ? 'pause' : offer.status === 'paused' ? 'resume' : offer.status}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      )}
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
  title: { flex: 1, fontSize: 18, fontFamily: fonts.playfair, textAlign: 'center' },
  addBtn: { width: 50, alignItems: 'flex-end' },
  addBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md },
  hint: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 18, marginTop: SPACING.md },
  fieldLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: SPACING.md, marginBottom: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, fontSize: 15, fontFamily: fonts.dmSans },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  commissionNote: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5, marginTop: 6 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modePill: {
    flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20,
    paddingVertical: 10, alignItems: 'center',
  },
  modePillText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  modeHint: { fontSize: 11, fontFamily: fonts.dmSans, marginTop: 8, lineHeight: 16 },
  saveBtn: { marginTop: SPACING.lg, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 1 },
  empty: { paddingTop: 60, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: fonts.playfair },
  emptyHint: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, textAlign: 'center' },
  offerCard: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    padding: SPACING.md, marginBottom: SPACING.sm, gap: 12,
  },
  offerTop: { flexDirection: 'row', gap: 12 },
  offerTitle: { fontSize: 15, fontFamily: fonts.playfair, marginBottom: 4 },
  offerDate: { fontSize: 11, fontFamily: fonts.dmMono },
  offerMeta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5, marginTop: 4 },
  offerValue: { alignItems: 'flex-end', justifyContent: 'flex-start' },
  offerValueText: { fontSize: 20, fontFamily: fonts.playfair },
  offerValueLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1 },
  toggleBtn: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  toggleBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
