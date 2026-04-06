import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchMyDjGigs, acceptDjOffer, passDjOffer } from '../../lib/api';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

type DjGig = {
  popup_id: number;
  popup_name: string;
  status: string;
  allocation_boxes: number;
  organizer_note: string | null;
  starts_at: string | null;
  venue_name: string | null;
  address: string | null;
};

type GigStatus = 'pending' | 'accepted' | 'passed';

export default function ProposalsPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [gigs, setGigs] = useState<DjGig[]>([]);
  const [actionLoading, setActionLoading] = useState<Record<number, 'accept' | 'pass' | null>>({});

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(async stored => {
      if (!stored) { setLoading(false); return; }
      const uid = parseInt(stored, 10);
      try {
        const data = await fetchMyDjGigs(uid);
        setGigs(data);
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const handleAccept = async (popupId: number) => {
    setActionLoading(prev => ({ ...prev, [popupId]: 'accept' }));
    try {
      await acceptDjOffer(popupId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGigs(prev =>
        prev.map(g => g.popup_id === popupId ? { ...g, status: 'accepted' } : g),
      );
    } catch {
      // non-fatal
    } finally {
      setActionLoading(prev => ({ ...prev, [popupId]: null }));
    }
  };

  const handlePass = async (popupId: number) => {
    setActionLoading(prev => ({ ...prev, [popupId]: 'pass' }));
    try {
      await passDjOffer(popupId);
      setGigs(prev =>
        prev.map(g => g.popup_id === popupId ? { ...g, status: 'passed' } : g),
      );
    } catch {
      // non-fatal
    } finally {
      setActionLoading(prev => ({ ...prev, [popupId]: null }));
    }
  };

  const pending = gigs.filter(g => g.status === 'pending');
  const history = gigs.filter(g => g.status === 'accepted' || g.status === 'passed');
  const isEmpty = pending.length === 0 && history.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>PROPOSALS</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : isEmpty ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.kanji, { color: c.accent }]}>待</Text>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No proposals.</Text>
          <Text style={[styles.emptySub, { color: c.muted }]}>
            When the platform has an offer for you, it will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: (insets.bottom || SPACING.md) + SPACING.lg },
          ]}
        >
          {pending.length > 0 && (
            <View>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>PENDING</Text>
              {pending.map(gig => {
                const isActing = actionLoading[gig.popup_id];
                return (
                  <View key={gig.popup_id} style={[styles.gigCard, { borderColor: c.border, backgroundColor: c.card }]}>
                    <Text style={[styles.venueName, { color: c.text }]}>
                      {gig.venue_name ?? gig.popup_name}
                    </Text>
                    {gig.starts_at && (
                      <Text style={[styles.dateRow, { color: c.muted }]}>
                        {formatDate(gig.starts_at)}
                      </Text>
                    )}
                    <Text style={[styles.allocationText, { color: c.text }]}>
                      {gig.allocation_boxes} {gig.allocation_boxes === 1 ? 'box' : 'boxes'} allocated
                    </Text>
                    {!!gig.organizer_note && (
                      <Text style={[styles.noteText, { color: c.muted }]}>
                        "{gig.organizer_note}"
                      </Text>
                    )}
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.acceptBtn, { backgroundColor: c.accent }]}
                        onPress={() => handleAccept(gig.popup_id)}
                        disabled={!!isActing}
                        activeOpacity={0.8}
                      >
                        {isActing === 'accept' ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.acceptBtnText}>Accept</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.passBtn, { borderColor: c.border }]}
                        onPress={() => handlePass(gig.popup_id)}
                        disabled={!!isActing}
                        activeOpacity={0.7}
                      >
                        {isActing === 'pass' ? (
                          <ActivityIndicator color={c.muted} size="small" />
                        ) : (
                          <Text style={[styles.passBtnText, { color: c.text }]}>Pass</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {history.length > 0 && (
            <View style={{ marginTop: pending.length > 0 ? SPACING.lg : 0 }}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>HISTORY</Text>
              {history.map(gig => {
                const isAccepted = gig.status === 'accepted';
                return (
                  <View key={gig.popup_id} style={[styles.historyRow, { borderBottomColor: c.border }]}>
                    <View style={styles.historyMain}>
                      <Text style={[styles.historyName, { color: c.text }]}>{gig.popup_name}</Text>
                      {gig.starts_at && (
                        <Text style={[styles.historyDate, { color: c.muted }]}>
                          {formatDate(gig.starts_at)}
                        </Text>
                      )}
                    </View>
                    <View style={[
                      styles.statusBadge,
                      { borderColor: isAccepted ? c.accent : c.border },
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        { color: isAccepted ? c.accent : c.muted },
                      ]}>
                        {gig.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backText: { fontSize: 28, lineHeight: 34 },
  title: { fontFamily: fonts.dmMono, fontSize: 14, letterSpacing: 2 },
  headerSpacer: { width: 40 },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: 10,
  },
  kanji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontFamily: fonts.playfair, fontSize: 22 },
  emptySub: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },

  scrollContent: { paddingTop: SPACING.md },

  sectionLabel: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
    letterSpacing: 1.5,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },

  gigCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: SPACING.md,
    gap: 8,
  },
  venueName: { fontFamily: fonts.playfair, fontSize: 16 },
  dateRow: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 0.5 },
  allocationText: { fontFamily: fonts.dmSans, fontSize: 13 },
  noteText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  acceptBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  passBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passBtnText: { fontFamily: fonts.dmSans, fontSize: 14 },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  historyMain: { flex: 1, gap: 3 },
  historyName: { fontFamily: fonts.playfair, fontSize: 15 },
  historyDate: { fontFamily: fonts.dmMono, fontSize: 10 },
  statusBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1.5 },
});
