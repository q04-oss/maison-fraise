import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchMyPersonalToilet, upsertPersonalToilet, togglePersonalToilet } from '../../lib/api';

type Screen = 'view' | 'edit';

export default function PersonalToiletPanel() {
  const { goBack } = usePanel();
  const c = useColors();

  const [screen, setScreen] = useState<Screen>('view');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<any | null>(null);

  // Edit form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [address, setAddress] = useState('');
  const [instagram, setInstagram] = useState('');
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await fetchMyPersonalToilet();
      setData(result);
      if (result?.listing) {
        const l = result.listing;
        setTitle(l.title ?? '');
        setDescription(l.description ?? '');
        setPriceDollars(l.price_cents ? (l.price_cents / 100).toFixed(2) : '');
        setAddress(l.address ?? '');
        setInstagram(l.instagram_handle ?? '');
        if (l.lat && l.lng) setCoords({ lat: l.lat, lng: l.lng });
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleUseLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Location required', 'Enable location to pin your toilet.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      // Reverse geocode for address
      const [geo] = await Location.reverseGeocodeAsync(loc.coords);
      if (geo) {
        const parts = [geo.streetNumber, geo.street, geo.city].filter(Boolean);
        setAddress(parts.join(' '));
      }
    } catch {
      Alert.alert('Could not get location', 'Enter your address manually.');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    const price_cents = Math.round(parseFloat(priceDollars) * 100);
    if (!title.trim() || !address.trim() || isNaN(price_cents) || price_cents < 1) {
      Alert.alert('Missing fields', 'Fill in title, address, and a price.');
      return;
    }
    setSaving(true);
    try {
      await upsertPersonalToilet({
        title: title.trim(),
        description: description.trim() || undefined,
        price_cents,
        address: address.trim(),
        lat: coords?.lat,
        lng: coords?.lng,
        instagram_handle: instagram.trim() || undefined,
      });
      await load();
      setScreen('view');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    try {
      const updated = await togglePersonalToilet();
      setData((prev: any) => prev ? { ...prev, listing: updated } : prev);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not toggle.');
    }
  };

  const hasListing = !!data?.listing;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={screen === 'edit' ? () => setScreen('view') : goBack}
          style={styles.backBtn} activeOpacity={0.7}
        >
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>My Toilet</Text>
        <TouchableOpacity
          onPress={() => setScreen('edit')}
          style={styles.editBtn}
          activeOpacity={0.7}
        >
          <Text style={[styles.editBtnText, { color: c.accent }]}>
            {screen === 'view' ? (hasListing ? 'edit' : '+ new') : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : screen === 'edit' ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.fieldLabel, { color: c.muted }]}>TITLE</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. The Penthouse Bathroom"
            placeholderTextColor={c.muted}
            maxLength={60}
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.inputMulti, { color: c.text, borderColor: c.border }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Tell people what makes it worth visiting"
            placeholderTextColor={c.muted}
            multiline
            maxLength={300}
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>PRICE (CA$)</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={priceDollars}
            onChangeText={setPriceDollars}
            placeholder="e.g. 2.00"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>ADDRESS</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={address}
            onChangeText={setAddress}
            placeholder="Street address"
            placeholderTextColor={c.muted}
          />
          <TouchableOpacity
            onPress={handleUseLocation}
            disabled={locating}
            activeOpacity={0.7}
            style={styles.locationBtn}
          >
            <Text style={[styles.locationBtnText, { color: c.accent }]}>
              {locating ? 'locating…' : coords ? '✓ location set' : 'use current location →'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.fieldLabel, { color: c.muted }]}>INSTAGRAM (optional)</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={instagram}
            onChangeText={setInstagram}
            placeholder="@handle"
            placeholderTextColor={c.muted}
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: c.accent }, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={[styles.saveBtnText, { color: c.ctaText ?? '#fff' }]}>
              {saving ? 'Saving…' : 'Save Listing'}
            </Text>
          </TouchableOpacity>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      ) : hasListing ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Status */}
          <View style={[styles.statusRow, { borderBottomColor: c.border }]}>
            <View>
              <Text style={[styles.listingTitle, { color: c.text }]}>{data.listing.title}</Text>
              <Text style={[styles.listingAddress, { color: c.muted }]}>{data.listing.address}</Text>
              <Text style={[styles.listingPrice, { color: c.accent }]}>
                CA${(data.listing.price_cents / 100).toFixed(2)} per visit
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.activeToggle, { borderColor: data.listing.active ? c.accent : c.border }]}
              onPress={handleToggle}
              activeOpacity={0.7}
            >
              <Text style={[styles.activeToggleText, { color: data.listing.active ? c.accent : c.muted }]}>
                {data.listing.active ? 'active' : 'off'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={[styles.statsRow, { borderBottomColor: c.border }]}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: c.text }]}>{data.visit_count}</Text>
              <Text style={[styles.statLabel, { color: c.muted }]}>visits</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: c.text }]}>
                {data.avg_rating ? data.avg_rating.toFixed(1) : '—'}
              </Text>
              <Text style={[styles.statLabel, { color: c.muted }]}>avg rating</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: c.accent }]}>
                CA${(data.ad_balance_cents / 100).toFixed(2)}
              </Text>
              <Text style={[styles.statLabel, { color: c.muted }]}>earnings</Text>
            </View>
          </View>

          {/* Recent reviews */}
          {data.recent_reviews?.length > 0 && (
            <View style={styles.reviewsSection}>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>RECENT REVIEWS</Text>
              {data.recent_reviews.map((r: any) => (
                <View key={r.id} style={[styles.reviewRow, { borderBottomColor: c.border }]}>
                  <Text style={[styles.reviewStars, { color: c.accent }]}>{'★'.repeat(r.rating)}</Text>
                  {!!r.review_note && (
                    <Text style={[styles.reviewNote, { color: c.muted }]}>{r.review_note}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No listing yet</Text>
          <Text style={[styles.emptyHint, { color: c.muted }]}>
            List your home toilet and let people visit you.
          </Text>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: c.accent, marginTop: SPACING.lg }]}
            onPress={() => setScreen('edit')}
            activeOpacity={0.8}
          >
            <Text style={[styles.saveBtnText, { color: c.ctaText ?? '#fff' }]}>Create Listing</Text>
          </TouchableOpacity>
        </View>
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
  title: { flex: 1, fontSize: 20, fontFamily: fonts.playfair, textAlign: 'center' },
  editBtn: { width: 50, alignItems: 'flex-end' },
  editBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md },
  fieldLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: SPACING.md, marginBottom: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, fontSize: 15, fontFamily: fonts.dmSans },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  locationBtn: { marginTop: 6 },
  locationBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  saveBtn: { marginTop: SPACING.lg, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 1 },
  statusRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  listingTitle: { fontSize: 18, fontFamily: fonts.playfair, marginBottom: 4 },
  listingAddress: { fontSize: 11, fontFamily: fonts.dmSans, marginBottom: 4 },
  listingPrice: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  activeToggle: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  activeToggleText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  statsRow: {
    flexDirection: 'row', paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontFamily: fonts.playfair },
  statLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1 },
  reviewsSection: { paddingBottom: SPACING.md },
  reviewRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 3 },
  reviewStars: { fontSize: 13, letterSpacing: 1 },
  reviewNote: { fontSize: 12, fontFamily: fonts.dmSans },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, paddingBottom: 60 },
  emptyTitle: { fontSize: 20, fontFamily: fonts.playfair, marginBottom: 8 },
  emptyHint: { fontSize: 13, fontFamily: fonts.dmSans, textAlign: 'center', lineHeight: 20 },
});
