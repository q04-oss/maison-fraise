import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchReservationOffers, joinReservationOffer } from '../../lib/api';

export default function ReservationDiscoveryPanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();

  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try { setOffers(await fetchReservationOffers()); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleJoin = async (offer: any) => {
    setJoining(offer.id);
    try {
      const result = await joinReservationOffer(offer.id);
      if (result.status === 'confirmed') {
        Alert.alert('Dinner confirmed', `You\'re both going. ${offer.title} — details in your bookings.`, [
          { text: 'View bookings', onPress: () => showPanel('reservation-booking') },
          { text: 'OK', style: 'cancel' },
        ]);
      } else if (result.status === 'seeking_pair') {
        Alert.alert('You\'re in the pool', 'We\'ll match you with another guest and confirm shortly.', [
          { text: 'OK' },
        ]);
      } else if (result.status === 'pending_invite') {
        Alert.alert('Pick your guest', 'Choose someone from your contacts to join you.', [
          {
            text: 'Choose now',
            onPress: () => showPanel('reservation-booking', { bookingId: result.booking_id, mode: 'invite' }),
          },
          { text: 'Later', style: 'cancel' },
        ]);
      }
      // Remove this offer from the list if no more slots
      setOffers(prev => prev.map(o =>
        o.id === offer.id
          ? { ...o, slots_remaining: Math.max(0, o.slots_remaining - 1) }
          : o
      ).filter(o => o.slots_remaining > 0));
    } catch (e: any) {
      const msg = e.message ?? 'Could not join';
      if (msg === 'no slots remaining') {
        Alert.alert('No spots left', 'This dinner is full. Check back for new offers.');
        setOffers(prev => prev.filter(o => o.id !== offer.id));
      } else {
        Alert.alert('Error', msg);
      }
    } finally { setJoining(null); }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Sponsored Dinners</Text>
        <TouchableOpacity onPress={() => showPanel('reservation-booking')} style={styles.bookingsBtn} activeOpacity={0.7}>
          <Text style={[styles.bookingsBtnText, { color: c.muted }]}>my bookings</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : offers.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Nothing open right now</Text>
          <Text style={[styles.emptyHint, { color: c.muted }]}>
            Restaurants on the platform sponsor full dinners for two — drinks, mains, and chocolate-covered strawberries for dessert. Check back soon.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: c.muted }]}>
            The restaurant pays for everything. You and a guest dine for free.
          </Text>
          {offers.map(offer => (
            <View key={offer.id} style={[styles.card, { borderColor: c.border }]}>
              <Text style={[styles.bizName, { color: c.accent }]}>{offer.business_name?.toUpperCase()}</Text>
              {offer.business_neighbourhood ? (
                <Text style={[styles.neighbourhood, { color: c.muted }]}>{offer.business_neighbourhood}</Text>
              ) : null}
              <Text style={[styles.offerTitle, { color: c.text }]}>{offer.title}</Text>
              {offer.description ? (
                <Text style={[styles.offerDesc, { color: c.muted }]} numberOfLines={3}>{offer.description}</Text>
              ) : null}

              <View style={[styles.detailRow, { borderTopColor: c.border }]}>
                {offer.reservation_date ? (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: c.muted }]}>DATE</Text>
                    <Text style={[styles.detailValue, { color: c.text }]}>
                      {offer.reservation_date}{offer.reservation_time ? ` · ${offer.reservation_time}` : ''}
                    </Text>
                  </View>
                ) : null}
                {offer.offer_drink_description || offer.drink_description ? (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: c.muted }]}>DRINKS</Text>
                    <Text style={[styles.detailValue, { color: c.text }]}>{offer.drink_description}</Text>
                  </View>
                ) : null}
                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: c.muted }]}>DESSERT</Text>
                  <Text style={[styles.detailValue, { color: c.text }]}>Chocolate-covered strawberries</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: c.muted }]}>MATCHING</Text>
                  <Text style={[styles.detailValue, { color: c.text }]}>
                    {offer.mode === 'platform_match' ? 'We find your match' : 'You invite your guest'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.joinBtn, { backgroundColor: c.accent }, joining === offer.id && { opacity: 0.5 }]}
                onPress={() => handleJoin(offer)}
                disabled={joining !== null}
                activeOpacity={0.8}
              >
                <Text style={[styles.joinBtnText, { color: c.ctaText ?? '#fff' }]}>
                  {joining === offer.id ? 'Joining…' : 'I\'m in →'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
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
  bookingsBtn: { alignItems: 'flex-end' },
  bookingsBtnText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md },
  intro: { fontSize: 12, fontFamily: fonts.dmSans, marginTop: SPACING.md, marginBottom: SPACING.sm, lineHeight: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, paddingBottom: 60 },
  emptyTitle: { fontSize: 20, fontFamily: fonts.playfair, marginBottom: 12, textAlign: 'center' },
  emptyHint: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, textAlign: 'center' },
  card: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    padding: SPACING.md, marginBottom: SPACING.md, gap: 6,
  },
  bizName: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2 },
  neighbourhood: { fontSize: 10, fontFamily: fonts.dmSans, marginTop: -2 },
  offerTitle: { fontSize: 18, fontFamily: fonts.playfair, marginTop: 4 },
  offerDesc: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 18 },
  detailRow: {
    borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 12, gap: 10,
  },
  detailItem: { gap: 2 },
  detailLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2 },
  detailValue: { fontSize: 13, fontFamily: fonts.dmSans },
  joinBtn: { marginTop: 8, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  joinBtnText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 1 },
});
