import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import {
  fetchMyReservationBookings, fetchContacts,
  inviteToBooking, respondToBookingInvite,
} from '../../lib/api';

const STATUS_LABELS: Record<string, string> = {
  seeking_pair: 'Finding your match…',
  pending_invite: 'Pick your guest',
  pending_guest: 'Waiting for guest',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export default function ReservationBookingPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();

  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<any[]>([]);
  const [inviting, setInviting] = useState(false);
  const [responding, setResponding] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    panelData?.bookingId ?? null
  );

  const load = async () => {
    setLoading(true);
    try {
      const [bkgs, ctcts] = await Promise.all([
        fetchMyReservationBookings(),
        fetchContacts().catch(() => []),
      ]);
      setBookings(bkgs);
      setContacts(ctcts);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async (bookingId: number, contactUserId: number, contactName: string) => {
    Alert.alert(`Invite ${contactName}?`, 'They\'ll have 24 hours to accept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Invite', onPress: async () => {
          setInviting(true);
          try {
            await inviteToBooking(bookingId, contactUserId);
            await load();
            Alert.alert('Invited', `${contactName} has been notified.`);
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not invite.');
          } finally { setInviting(false); }
        },
      },
    ]);
  };

  const handleRespond = async (bookingId: number, accept: boolean) => {
    setResponding(true);
    try {
      const result = await respondToBookingInvite(bookingId, accept);
      if (accept && result.status === 'confirmed') {
        Alert.alert('You\'re going', 'Dinner confirmed. Dessert will be chocolate-covered strawberries.');
      } else if (!accept) {
        Alert.alert('Declined', 'Your host has been notified.');
      }
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not respond.');
    } finally { setResponding(false); }
  };

  const invitableContacts = contacts.filter((c: any) => c.user_id);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>My Bookings</Text>
        <View style={styles.spacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : bookings.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No bookings yet</Text>
          <Text style={[styles.emptyHint, { color: c.muted }]}>
            Sponsored dinners you join or are invited to will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {bookings.map(booking => {
            const isInvited = booking.guest_user_id && booking.status === 'pending_guest';
            const canInvite = booking.status === 'pending_invite' && booking.initiator_user_id;
            const isSelected = selectedBookingId === booking.id;
            const dateStr = [booking.offer_reservation_date, booking.offer_reservation_time]
              .filter(Boolean).join(' at ') || null;

            return (
              <TouchableOpacity
                key={booking.id}
                style={[styles.card, { borderColor: c.border }, isSelected && { borderColor: c.accent }]}
                onPress={() => setSelectedBookingId(isSelected ? null : booking.id)}
                activeOpacity={0.9}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bizName, { color: c.accent }]}>{booking.business_name?.toUpperCase()}</Text>
                    <Text style={[styles.offerTitle, { color: c.text }]}>{booking.offer_title}</Text>
                    {dateStr && (
                      <Text style={[styles.date, { color: c.muted }]}>{dateStr}</Text>
                    )}
                  </View>
                  <View style={[styles.statusBadge, {
                    backgroundColor: booking.status === 'confirmed' ? c.accent : 'transparent',
                    borderColor: c.border,
                  }]}>
                    <Text style={[styles.statusText, {
                      color: booking.status === 'confirmed' ? (c.ctaText ?? '#fff') : c.muted,
                    }]}>
                      {STATUS_LABELS[booking.status] ?? booking.status}
                    </Text>
                  </View>
                </View>

                {booking.status === 'confirmed' && (
                  <View style={[styles.confirmedDetails, { borderTopColor: c.border }]}>
                    {booking.offer_drink_description ? (
                      <Text style={[styles.detailLine, { color: c.muted }]}>
                        Drinks: {booking.offer_drink_description}
                      </Text>
                    ) : null}
                    <Text style={[styles.detailLine, { color: c.muted }]}>
                      Dessert: Chocolate-covered strawberries
                    </Text>
                  </View>
                )}

                {/* Invite flow — initiator picks from contacts */}
                {canInvite && isSelected && (
                  <View style={[styles.inviteSection, { borderTopColor: c.border }]}>
                    <Text style={[styles.inviteLabel, { color: c.muted }]}>INVITE FROM YOUR CONTACTS</Text>
                    {invitableContacts.length === 0 ? (
                      <Text style={[styles.noContacts, { color: c.muted }]}>
                        No contacts yet. Exchange codes via NFC to build your list.
                      </Text>
                    ) : (
                      invitableContacts.map((contact: any) => (
                        <TouchableOpacity
                          key={contact.id}
                          style={[styles.contactRow, { borderBottomColor: c.border }]}
                          onPress={() => handleInvite(booking.id, contact.user_id, contact.display_name ?? 'Contact')}
                          disabled={inviting}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.contactName, { color: c.text }]}>{contact.display_name}</Text>
                          <Text style={[styles.inviteArrow, { color: c.accent }]}>invite →</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}

                {/* Guest response — accept or decline */}
                {isInvited && (
                  <View style={[styles.respondSection, { borderTopColor: c.border }]}>
                    <Text style={[styles.inviteLabel, { color: c.muted }]}>YOU'VE BEEN INVITED</Text>
                    <Text style={[styles.respondHint, { color: c.muted }]}>
                      The restaurant is paying for everything. Accept to confirm your seat.
                    </Text>
                    <View style={styles.respondBtns}>
                      <TouchableOpacity
                        style={[styles.respondBtn, { backgroundColor: c.accent }, responding && { opacity: 0.5 }]}
                        onPress={() => handleRespond(booking.id, true)}
                        disabled={responding} activeOpacity={0.8}
                      >
                        <Text style={[styles.respondBtnText, { color: c.ctaText ?? '#fff' }]}>accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.respondBtn, styles.respondBtnOutline, { borderColor: c.border }, responding && { opacity: 0.5 }]}
                        onPress={() => handleRespond(booking.id, false)}
                        disabled={responding} activeOpacity={0.8}
                      >
                        <Text style={[styles.respondBtnText, { color: c.muted }]}>decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
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
  spacer: { width: 40 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, paddingBottom: 60 },
  emptyTitle: { fontSize: 20, fontFamily: fonts.playfair, marginBottom: 12, textAlign: 'center' },
  emptyHint: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, textAlign: 'center' },
  card: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    padding: SPACING.md, marginTop: SPACING.md, gap: 0,
  },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bizName: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2, marginBottom: 4 },
  offerTitle: { fontSize: 16, fontFamily: fonts.playfair },
  date: { fontSize: 11, fontFamily: fonts.dmMono, marginTop: 4 },
  statusBadge: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  statusText: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1 },
  confirmedDetails: {
    borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12, gap: 4,
  },
  detailLine: { fontSize: 12, fontFamily: fonts.dmSans },
  inviteSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12 },
  inviteLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2, marginBottom: SPACING.sm },
  noContacts: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 18 },
  contactRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactName: { fontSize: 15, fontFamily: fonts.playfair },
  inviteArrow: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  respondSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12, gap: 8 },
  respondHint: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 18 },
  respondBtns: { flexDirection: 'row', gap: 8 },
  respondBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  respondBtnOutline: { borderWidth: StyleSheet.hairlineWidth },
  respondBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
