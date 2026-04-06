import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import {
  fetchItineraryDetail, addDestination, removeDestination,
  respondToProposal,
} from '../../lib/api';

type Screen = 'view' | 'add-dest';

export default function ItineraryDetailPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();

  const itineraryId: number | undefined = panelData?.itineraryId;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [screen, setScreen] = useState<Screen>('view');

  // Add destination form
  const [placeName, setPlaceName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!itineraryId) return;
    setLoading(true);
    try { setData(await fetchItineraryDetail(itineraryId)); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (itineraryId === undefined) {
    return (
      <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: c.panelBg }]}>
        <Text style={{ color: c.muted, fontFamily: fonts.dmSans, fontSize: 14 }}>No itinerary selected.</Text>
        <TouchableOpacity onPress={goBack} style={{ marginTop: 16 }}>
          <Text style={{ color: c.accent, fontFamily: fonts.dmMono, fontSize: 13 }}>← back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleAddDest = async () => {
    if (!placeName.trim() || !city.trim() || !country.trim()) {
      Alert.alert('Missing fields', 'Place, city, and country are required.'); return;
    }
    setSaving(true);
    try {
      await addDestination(itineraryId, {
        place_name: placeName.trim(), city: city.trim(), country: country.trim(),
        arrival_date: arrivalDate.trim() || undefined,
        departure_date: departureDate.trim() || undefined,
      });
      setPlaceName(''); setCity(''); setCountry(''); setArrivalDate(''); setDepartureDate('');
      setScreen('view');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not add destination.');
    } finally { setSaving(false); }
  };

  const handleRemoveDest = (destId: number, name: string) => {
    Alert.alert(`Remove ${name}?`, '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await removeDestination(itineraryId, destId).catch(() => {});
          await load();
        },
      },
    ]);
  };

  const handleRespond = async (proposalId: number, accept: boolean) => {
    try {
      const result = await respondToProposal(proposalId, accept);
      if (accept && result.credited_cents) {
        Alert.alert('Accepted', `CA$${(result.credited_cents / 100).toLocaleString('en-CA')} credited to your ad balance.`);
      }
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not respond.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={screen === 'add-dest' ? () => setScreen('view') : goBack}
          style={styles.backBtn} activeOpacity={0.7}
        >
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
          {data?.title ?? ''}
        </Text>
        <TouchableOpacity onPress={() => setScreen('add-dest')} style={styles.addBtn} activeOpacity={0.7}>
          {screen === 'view' && <Text style={[styles.addBtnText, { color: c.accent }]}>+ stop</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : screen === 'add-dest' ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.fieldLabel, { color: c.muted }]}>PLACE</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={placeName} onChangeText={setPlaceName} placeholder="Hotel, restaurant, spa…" placeholderTextColor={c.muted} />
          <Text style={[styles.fieldLabel, { color: c.muted }]}>CITY</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={city} onChangeText={setCity} placeholder="Tokyo" placeholderTextColor={c.muted} />
          <Text style={[styles.fieldLabel, { color: c.muted }]}>COUNTRY</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={country} onChangeText={setCountry} placeholder="Japan" placeholderTextColor={c.muted} />
          <Text style={[styles.fieldLabel, { color: c.muted }]}>ARRIVAL (YYYY-MM-DD)</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={arrivalDate} onChangeText={setArrivalDate} placeholder="2027-03-14" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" />
          <Text style={[styles.fieldLabel, { color: c.muted }]}>DEPARTURE (YYYY-MM-DD)</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={departureDate} onChangeText={setDepartureDate} placeholder="2027-03-18" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" />
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: c.accent }, saving && { opacity: 0.5 }]}
            onPress={handleAddDest} disabled={saving} activeOpacity={0.8}
          >
            <Text style={[styles.saveBtnText, { color: c.ctaText ?? '#fff' }]}>
              {saving ? 'Adding…' : 'Add Stop'}
            </Text>
          </TouchableOpacity>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Destinations timeline */}
          {data?.destinations?.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>ITINERARY</Text>
              {(data.destinations as any[]).map((dest: any, i: number) => (
                <TouchableOpacity
                  key={dest.id}
                  style={[styles.destRow, { borderLeftColor: c.accent }]}
                  onLongPress={() => handleRemoveDest(dest.id, dest.place_name)}
                  delayLongPress={600}
                  activeOpacity={0.8}
                >
                  <View style={[styles.destDot, { backgroundColor: c.accent }]} />
                  <View style={styles.destContent}>
                    <Text style={[styles.destPlace, { color: c.text }]}>{dest.place_name}</Text>
                    <Text style={[styles.destLocation, { color: c.muted }]}>{dest.city}, {dest.country}</Text>
                    {(dest.arrival_date || dest.departure_date) && (
                      <Text style={[styles.destDates, { color: c.muted }]}>
                        {dest.arrival_date ?? '?'}{dest.departure_date ? ` → ${dest.departure_date}` : ''}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <View style={styles.emptyDests}>
              <Text style={[styles.emptyHint, { color: c.muted }]}>
                Add stops to this itinerary. Properties in each city will be able to see you're coming and send bespoke invitations.
              </Text>
            </View>
          )}

          {/* Proposals */}
          {data?.proposals?.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>INVITATIONS</Text>
              {(data.proposals as any[]).map((p: any) => (
                <View key={p.id} style={[styles.proposalCard, { borderColor: c.border, backgroundColor: c.card }]}>
                  <View style={styles.proposalTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.proposalBiz, { color: c.accent }]}>{p.business_name?.toUpperCase()}</Text>
                      <Text style={[styles.proposalTitle, { color: c.text }]}>{p.title}</Text>
                      <Text style={[styles.proposalBody, { color: c.muted }]} numberOfLines={4}>{p.body}</Text>
                    </View>
                    <View style={styles.proposalValueBlock}>
                      <Text style={[styles.proposalValue, { color: c.accent }]}>
                        CA${(p.value_cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 0 })}
                      </Text>
                      <Text style={[styles.proposalValueLabel, { color: c.muted }]}>to attend</Text>
                    </View>
                  </View>

                  {p.status === 'pending' ? (
                    <View style={styles.proposalBtns}>
                      <TouchableOpacity
                        style={[styles.proposalBtn, { backgroundColor: c.accent }]}
                        onPress={() => handleRespond(p.id, true)} activeOpacity={0.8}
                      >
                        <Text style={[styles.proposalBtnText, { color: c.ctaText ?? '#fff' }]}>accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.proposalBtn, styles.proposalBtnOutline, { borderColor: c.border }]}
                        onPress={() => handleRespond(p.id, false)} activeOpacity={0.8}
                      >
                        <Text style={[styles.proposalBtnText, { color: c.muted }]}>decline</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={[styles.proposalStatus, { color: p.status === 'accepted' ? c.accent : c.muted }]}>
                      {p.status}
                    </Text>
                  )}
                </View>
              ))}
            </>
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
  sectionLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2, marginTop: SPACING.md, marginBottom: SPACING.sm },
  destRow: {
    flexDirection: 'row', gap: 14, paddingVertical: SPACING.sm,
    borderLeftWidth: 2, paddingLeft: SPACING.md, marginLeft: 6,
  },
  destDot: {
    width: 8, height: 8, borderRadius: 4,
    marginLeft: -18, marginTop: 5, flexShrink: 0,
  },
  destContent: { flex: 1, gap: 2 },
  destPlace: { fontSize: 15, fontFamily: fonts.playfair },
  destLocation: { fontSize: 11, fontFamily: fonts.dmSans },
  destDates: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  emptyDests: { paddingTop: 40, paddingHorizontal: SPACING.sm },
  emptyHint: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, textAlign: 'center' },
  proposalCard: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    padding: SPACING.md, marginBottom: SPACING.sm, gap: 12,
  },
  proposalTop: { flexDirection: 'row', gap: 12 },
  proposalBiz: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2, marginBottom: 4 },
  proposalTitle: { fontSize: 15, fontFamily: fonts.playfair, marginBottom: 4 },
  proposalBody: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 18 },
  proposalValueBlock: { alignItems: 'flex-end', justifyContent: 'flex-start', minWidth: 80 },
  proposalValue: { fontSize: 20, fontFamily: fonts.playfair, textAlign: 'right' },
  proposalValueLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1 },
  proposalBtns: { flexDirection: 'row', gap: 8 },
  proposalBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  proposalBtnOutline: { borderWidth: StyleSheet.hairlineWidth },
  proposalBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  proposalStatus: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1, textAlign: 'center' },
  fieldLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: SPACING.md, marginBottom: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, fontSize: 15, fontFamily: fonts.dmSans },
  saveBtn: { marginTop: SPACING.lg, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 1 },
});
