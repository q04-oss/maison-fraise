import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { acceptDjOffer, passDjOffer } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(iso?: string, hours?: string): string {
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
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [passing, setPassing] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const biz = activeLocation;

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(stored => {
      if (stored) setUserDbId(parseInt(stored, 10));
    });
  }, []);

  const handleAccept = async () => {
    if (!biz || !userDbId) return;
    setAccepting(true);
    try {
      await acceptDjOffer(biz.id, userDbId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAccepted(true);
    } catch (err: any) {
      Alert.alert('Could not accept', err.message ?? 'Try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handlePass = async () => {
    if (!biz || !userDbId) return;
    setPassing(true);
    try {
      await passDjOffer(biz.id, userDbId);
    } catch {
      // fail silently — passing is low stakes
    } finally {
      setPassing(false);
      goHome();
    }
  };

  if (!biz) return null;

  const dateStr = formatDate(biz.launched_at);
  const timeStr = formatTime(biz.launched_at, biz.hours ?? undefined);

  if (accepted) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={styles.successBody}>
          <Text style={[styles.successKanji, { color: c.border }]}>音</Text>
          <Text style={[styles.successTitle, { color: c.text }]}>You're on.</Text>
          <Text style={[styles.successSub, { color: c.muted }]}>
            A complimentary box has been added to your profile. We'll be in touch with details closer to the date.
          </Text>
          <TouchableOpacity
            style={[styles.successBtn, { borderColor: c.border }]}
            onPress={goHome}
            activeOpacity={0.75}
          >
            <Text style={[styles.successBtnText, { color: c.accent }]}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerSpacer} />
        <Text style={[styles.title, { color: c.text }]}>You've been invited.</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Venue + date block */}
        <View style={[styles.block, { borderBottomColor: c.border }]}>
          <Text style={[styles.venueName, { color: c.text }]}>{biz.name}</Text>
          <Text style={[styles.venueAddress, { color: c.muted }]}>{biz.address}</Text>
          <View style={[styles.datetimeRow, { borderTopColor: c.border }]}>
            <Text style={[styles.datetimeText, { color: c.text }]}>{dateStr}</Text>
            {timeStr !== '' && (
              <Text style={[styles.datetimeTime, { color: c.muted }]}>{timeStr}</Text>
            )}
          </View>
        </View>

        {/* Organizer notes */}
        {!!biz.organizer_note && (
          <View style={[styles.block, { borderBottomColor: c.border }]}>
            <Text style={[styles.blockLabel, { color: c.muted }]}>FROM THE ORGANIZER</Text>
            <Text style={[styles.noteText, { color: c.muted }]}>"{biz.organizer_note}"</Text>
          </View>
        )}

        {/* Crowd size */}
        {(biz.rsvp_count ?? 0) > 0 && (
          <View style={[styles.block, { borderBottomColor: c.border }]}>
            <Text style={[styles.blockLabel, { color: c.muted }]}>EXPECTED CROWD</Text>
            <Text style={[styles.crowdCount, { color: c.text }]}>{biz.rsvp_count} going</Text>
            {biz.capacity && (
              <Text style={[styles.crowdCap, { color: c.muted }]}>Capacity {biz.capacity}</Text>
            )}
          </View>
        )}

        {/* Allocation info */}
        <View style={[styles.block, { borderBottomColor: c.border }]}>
          <Text style={[styles.blockLabel, { color: c.muted }]}>YOUR ALLOCATION</Text>
          <Text style={[styles.allocationText, { color: c.text }]}>One complimentary box</Text>
          <Text style={[styles.allocationSub, { color: c.muted }]}>
            Credited to your profile upon acceptance. Yours to keep regardless of how the night goes.
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.acceptBtn, { backgroundColor: c.accent }]}
          onPress={handleAccept}
          disabled={accepting || passing}
          activeOpacity={0.8}
        >
          {accepting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.acceptBtnText}>Accept the gig</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.passBtn}
          onPress={handlePass}
          disabled={accepting || passing}
          activeOpacity={0.7}
        >
          {passing
            ? <ActivityIndicator color={c.muted} size="small" />
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
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  body: { flex: 1 },

  block: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  blockLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginBottom: 6 },

  venueName: { fontSize: 24, fontFamily: fonts.playfair },
  venueAddress: { fontSize: 13, fontFamily: fonts.dmSans },
  datetimeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  datetimeText: { fontSize: 17, fontFamily: fonts.playfair },
  datetimeTime: { fontSize: 13, fontFamily: fonts.dmMono },

  noteText: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22, fontStyle: 'italic' },

  crowdCount: { fontSize: 22, fontFamily: fonts.playfair },
  crowdCap: { fontSize: 12, fontFamily: fonts.dmMono },

  allocationText: { fontSize: 17, fontFamily: fonts.playfair },
  allocationSub: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20 },

  footer: {
    padding: SPACING.md,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  acceptBtn: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  acceptBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#fff' },
  passBtn: { alignItems: 'center', paddingVertical: 10 },
  passBtnText: { fontSize: 14, fontFamily: fonts.dmSans },

  successBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  successKanji: { fontSize: 64 },
  successTitle: { fontSize: 24, fontFamily: fonts.playfair, textAlign: 'center' },
  successSub: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22, textAlign: 'center' },
  successBtn: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  successBtnText: { fontSize: 14, fontFamily: fonts.dmSans },
});
