import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { acceptDjOffer, passDjOffer } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPopupDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatPopupTime(iso?: string, hours?: string): string {
  if (hours) return hours;
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''} ${ampm}`;
}

export default function DjOfferPanel() {
  const { goHome, activeLocation } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [accepting, setAccepting] = useState(false);
  const [passing, setPassing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const biz = activeLocation;
  if (!biz) return null;

  const dateStr = formatPopupDate(biz.launched_at);
  const timeStr = formatPopupTime(biz.launched_at, biz.hours ?? undefined);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await acceptDjOffer(biz.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmed(true);
    } catch (err: any) {
      Alert.alert('Could not accept', err.message ?? 'Try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handlePass = async () => {
    setPassing(true);
    try {
      await passDjOffer(biz.id);
    } catch {
      // non-fatal
    } finally {
      setPassing(false);
      goHome();
    }
  };

  if (confirmed) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.confirmedBody, { paddingBottom: insets.bottom || SPACING.lg }]}>
          <Text style={[styles.kanji, { color: c.text }]}>音</Text>
          <Text style={[styles.confirmedTitle, { color: c.text }]}>You're on.</Text>
          <Text style={[styles.confirmedSub, { color: c.muted }]}>
            A complimentary box has been added to your profile.
          </Text>
          <TouchableOpacity
            style={[styles.borderBtn, { borderColor: c.border }]}
            onPress={goHome}
            activeOpacity={0.7}
          >
            <Text style={[styles.borderBtnText, { color: c.text }]}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      {/* Header — no back button */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerSpacer} />
        <Text style={[styles.headerTitle, { color: c.text }]}>You've been invited.</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Venue block */}
        <View style={[styles.venueBlock, { borderBottomColor: c.border }]}>
          <Text style={[styles.venueName, { color: c.text }]}>{biz.name}</Text>
          <Text style={[styles.venueAddress, { color: c.muted }]}>{biz.address}</Text>
          <View style={[styles.dateRow, { borderTopColor: c.border }]}>
            {dateStr !== '' && (
              <Text style={[styles.dateText, { color: c.text }]}>{dateStr}</Text>
            )}
            {timeStr !== '' && (
              <Text style={[styles.timeText, { color: c.muted }]}>{timeStr}</Text>
            )}
          </View>
        </View>

        {/* Organizer note */}
        {!!biz.organizer_note && (
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>FROM THE ORGANIZER</Text>
            <Text style={[styles.noteText, { color: c.muted }]}>"{biz.organizer_note}"</Text>
          </View>
        )}

        {/* Expected crowd */}
        {(biz.rsvp_count ?? 0) > 0 && (
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>EXPECTED CROWD</Text>
            <Text style={[styles.crowdCount, { color: c.text }]}>
              {biz.rsvp_count}
            </Text>
            {(biz.capacity ?? 0) > 0 && (
              <Text style={[styles.crowdCapacity, { color: c.muted }]}>
                capacity {biz.capacity}
              </Text>
            )}
          </View>
        )}

        {/* Your allocation */}
        <View style={[styles.section, { borderBottomColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.muted }]}>YOUR ALLOCATION</Text>
          <Text style={[styles.allocationTitle, { color: c.text }]}>One complimentary box</Text>
          <Text style={[styles.allocationSub, { color: c.muted }]}>
            Credited to your profile upon acceptance. Yours to keep regardless of how the night goes.
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.accent }]}
          onPress={handleAccept}
          disabled={accepting || passing}
          activeOpacity={0.8}
        >
          {accepting
            ? <ActivityIndicator color="#fff" />
            : <Text style={[styles.ctaText, { color: '#fff' }]}>Accept the gig</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.passBtn}
          onPress={handlePass}
          disabled={accepting || passing}
          activeOpacity={0.6}
        >
          {passing
            ? <ActivityIndicator color={c.muted} />
            : <Text style={[styles.passBtnText, { color: c.muted }]}>Pass</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSpacer: { width: 40 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: fonts.playfair,
  },
  body: { flex: 1 },

  venueBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  venueName: { fontSize: 24, fontFamily: fonts.playfair },
  venueAddress: { fontSize: 13, fontFamily: fonts.dmSans, marginTop: 2 },
  dateRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  dateText: { fontSize: 15, fontFamily: fonts.dmMono },
  timeText: { fontSize: 13, fontFamily: fonts.dmMono },

  section: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
  },
  noteText: {
    fontSize: 14,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  crowdCount: { fontSize: 22, fontFamily: fonts.playfair },
  crowdCapacity: { fontSize: 12, fontFamily: fonts.dmMono },
  allocationTitle: { fontSize: 17, fontFamily: fonts.playfair },
  allocationSub: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20 },

  footer: {
    padding: SPACING.md,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  cta: {
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
  passBtn: { alignItems: 'center', paddingVertical: 6 },
  passBtnText: { fontSize: 15, fontFamily: fonts.dmSans },

  // Confirmed state
  confirmedBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    gap: 12,
  },
  kanji: { fontSize: 64, fontFamily: fonts.playfair, marginBottom: 8 },
  confirmedTitle: { fontSize: 24, fontFamily: fonts.playfair },
  confirmedSub: {
    fontSize: 14,
    fontFamily: fonts.dmSans,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  borderBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  borderBtnText: { fontSize: 15, fontFamily: fonts.dmSans },
});
