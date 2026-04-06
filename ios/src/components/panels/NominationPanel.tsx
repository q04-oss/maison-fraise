import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { fetchPopupAttendees, fetchNominationStatus, submitNomination } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

type Attendee = { user_id: number; display_name: string };

export default function NominationPanel() {
  const { goHome, activeLocation } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const biz = activeLocation;

  useEffect(() => {
    if (!biz) { setLoading(false); return; }
    AsyncStorage.getItem('user_db_id').then(async stored => {
      const uid = stored ? parseInt(stored, 10) : null;
      setUserDbId(uid);
      try {
        const [people, status] = await Promise.all([
          fetchPopupAttendees(biz.id),
          fetchNominationStatus(biz.id),
        ]);
        if (status.has_nominated) {
          setConfirmed(true);
          setLoading(false);
          return;
        }
        const filtered = uid ? people.filter(p => p.user_id !== uid) : people;
        setAttendees(filtered);
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    });
  }, [biz?.id]);

  const handleSelect = (id: number) => {
    setSelectedId(prev => (prev === id ? null : id));
  };

  const handleSubmit = async () => {
    if (!biz || selectedId === null) return;
    setSubmitting(true);
    try {
      await submitNomination(biz.id, selectedId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmed(true);
    } catch {
      // non-fatal — still show confirmed to avoid double-tap confusion
      setConfirmed(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (!biz) return null;

  if (confirmed) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.confirmedBody, { paddingBottom: insets.bottom || SPACING.lg }]}>
          <Text style={[styles.kanji, { color: c.text }]}>人</Text>
          <Text style={[styles.confirmedTitle, { color: c.text }]}>Nomination received.</Text>
          <Text style={[styles.confirmedSub, { color: c.muted }]}>
            Your voice is part of the record.
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
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: c.text }]}>From last night.</Text>
          <Text style={[styles.headerSub, { color: c.muted }]}>{biz.name}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Prompt */}
      <View style={[styles.prompt, { borderBottomColor: c.border }]}>
        <Text style={[styles.promptText, { color: c.muted }]}>
          Who did you notice? Nominate one person whose presence stood out.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {attendees.map(person => {
            const isSelected = selectedId === person.user_id;
            return (
              <TouchableOpacity
                key={person.user_id}
                style={[
                  styles.attendeeRow,
                  { borderBottomColor: c.border },
                  isSelected && { backgroundColor: `${c.accent}08` },
                ]}
                onPress={() => handleSelect(person.user_id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.attendeeName, { color: c.text }]}>
                  {person.display_name}
                </Text>
                {isSelected && (
                  <Text style={[styles.checkmark, { color: c.accent }]}>✓</Text>
                )}
              </TouchableOpacity>
            );
          })}
          {attendees.length === 0 && (
            <Text style={[styles.emptyText, { color: c.muted }]}>No attendees found.</Text>
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[
            styles.cta,
            { backgroundColor: selectedId !== null ? c.accent : c.card },
            selectedId === null && { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
          ]}
          onPress={handleSubmit}
          disabled={selectedId === null || submitting}
          activeOpacity={0.8}
        >
          {submitting
            ? <ActivityIndicator color={selectedId !== null ? '#fff' : c.muted} />
            : (
              <Text style={[
                styles.ctaText,
                { color: selectedId !== null ? '#fff' : c.muted },
              ]}>
                Nominate
              </Text>
            )
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
  headerCenter: { flex: 1, alignItems: 'center', gap: 3 },
  headerTitle: { fontSize: 20, fontFamily: fonts.playfair, textAlign: 'center' },
  headerSub: { fontSize: 12, fontFamily: fonts.dmMono, textAlign: 'center' },

  prompt: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  promptText: {
    fontSize: 14,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    lineHeight: 22,
  },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },

  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  attendeeName: { flex: 1, fontSize: 17, fontFamily: fonts.playfair },
  checkmark: { fontSize: 16, fontFamily: fonts.dmSans },

  emptyText: {
    fontSize: 14,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.lg,
  },

  footer: {
    padding: SPACING.md,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },

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
