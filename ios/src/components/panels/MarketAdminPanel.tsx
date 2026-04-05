import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { createMarketDate, fetchUpcomingMarkets } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

export default function MarketAdminPanel() {
  const { goBack } = usePanel();
  const c = useColors();

  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [adminPin, setAdminPin] = useState('');

  // Form fields
  const [name, setName] = useState('Marché Atwater');
  const [location, setLocation] = useState('Marché Atwater');
  const [address, setAddress] = useState('138 Av. Atwater, Montréal');
  const [date, setDate] = useState('');         // YYYY-MM-DD
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('14:00');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('admin_pin').then(v => { if (v) setAdminPin(v); });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetchUpcomingMarkets()
      .then(setUpcoming)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!name.trim() || !location.trim() || !address.trim() || !date || !startTime || !endTime) {
      Alert.alert('Missing fields', 'Fill in all required fields.');
      return;
    }
    if (!adminPin.trim()) {
      Alert.alert('PIN required', 'Enter your admin PIN.');
      return;
    }

    // Build ISO timestamps with timezone offset
    const starts_at = `${date}T${startTime}:00`;
    const ends_at = `${date}T${endTime}:00`;

    setSubmitting(true);
    try {
      await createMarketDate(adminPin.trim(), {
        name: name.trim(),
        location: location.trim(),
        address: address.trim(),
        starts_at,
        ends_at,
        notes: notes.trim() || undefined,
      });
      await AsyncStorage.setItem('admin_pin', adminPin.trim());
      setDate('');
      setNotes('');
      load();
      Alert.alert('Created', 'Market date added.');
    } catch (e: any) {
      Alert.alert('Error', e.message === 'Invalid or missing X-Admin-PIN header' ? 'Wrong PIN.' : 'Could not create market date.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>market admin</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: SPACING.md, gap: 14, paddingBottom: 60 }}>

        <Text style={[styles.sectionLabel, { color: c.muted }]}>NEW MARKET DATE</Text>

        <Text style={[styles.fieldLabel, { color: c.muted }]}>NAME</Text>
        <TextInput
          style={[styles.input, { borderColor: c.border, color: c.text }]}
          value={name}
          onChangeText={setName}
          placeholder="Marché Atwater"
          placeholderTextColor={c.muted}
        />

        <Text style={[styles.fieldLabel, { color: c.muted }]}>LOCATION</Text>
        <TextInput
          style={[styles.input, { borderColor: c.border, color: c.text }]}
          value={location}
          onChangeText={setLocation}
          placeholder="Marché Atwater"
          placeholderTextColor={c.muted}
        />

        <Text style={[styles.fieldLabel, { color: c.muted }]}>ADDRESS</Text>
        <TextInput
          style={[styles.input, { borderColor: c.border, color: c.text }]}
          value={address}
          onChangeText={setAddress}
          placeholder="138 Av. Atwater, Montréal"
          placeholderTextColor={c.muted}
        />

        <Text style={[styles.fieldLabel, { color: c.muted }]}>DATE (YYYY-MM-DD)</Text>
        <TextInput
          style={[styles.input, { borderColor: c.border, color: c.text }]}
          value={date}
          onChangeText={setDate}
          placeholder="2026-04-12"
          placeholderTextColor={c.muted}
          keyboardType="numbers-and-punctuation"
        />

        <View style={styles.timeRow}>
          <View style={styles.timeField}>
            <Text style={[styles.fieldLabel, { color: c.muted }]}>START (HH:MM)</Text>
            <TextInput
              style={[styles.input, { borderColor: c.border, color: c.text }]}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="09:00"
              placeholderTextColor={c.muted}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.timeField}>
            <Text style={[styles.fieldLabel, { color: c.muted }]}>END (HH:MM)</Text>
            <TextInput
              style={[styles.input, { borderColor: c.border, color: c.text }]}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="14:00"
              placeholderTextColor={c.muted}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>

        <Text style={[styles.fieldLabel, { color: c.muted }]}>NOTES (optional)</Text>
        <TextInput
          style={[styles.input, { borderColor: c.border, color: c.text }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Rain or shine, bring cash..."
          placeholderTextColor={c.muted}
        />

        <Text style={[styles.fieldLabel, { color: c.muted }]}>ADMIN PIN</Text>
        <TextInput
          style={[styles.input, { borderColor: c.border, color: c.text }]}
          value={adminPin}
          onChangeText={setAdminPin}
          placeholder="••••"
          placeholderTextColor={c.muted}
          secureTextEntry
          keyboardType="number-pad"
        />

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: c.text }, submitting && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          <Text style={[styles.submitBtnText, { color: c.ctaText }]}>
            {submitting ? '...' : 'create market date'}
          </Text>
        </TouchableOpacity>

        {/* Upcoming dates */}
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Text style={[styles.sectionLabel, { color: c.muted }]}>UPCOMING</Text>

        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 12 }} />
        ) : upcoming.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>no upcoming market dates</Text>
        ) : (
          upcoming.map(m => (
            <View key={m.id} style={[styles.dateRow, { borderBottomColor: c.border }]}>
              <Text style={[styles.dateName, { color: c.text }]}>{m.name}</Text>
              <Text style={[styles.dateMeta, { color: c.muted }]}>
                {fmtDate(m.starts_at)}  ·  {fmtTime(m.starts_at)}–{fmtTime(m.ends_at)}
              </Text>
              <Text style={[styles.dateMeta, { color: c.muted }]}>{m.location}</Text>
            </View>
          ))
        )}
      </ScrollView>
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
  backArrow: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: fonts.playfair },
  sectionLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: 4 },
  fieldLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: fonts.dmSans,
  },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1, gap: 6 },
  submitBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  submitBtnText: { fontFamily: fonts.dmSans, fontSize: 15, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  empty: { fontSize: 13, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  dateRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 3 },
  dateName: { fontSize: 16, fontFamily: fonts.playfair },
  dateMeta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
