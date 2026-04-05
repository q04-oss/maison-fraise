import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { usePanel } from '../../context/PanelContext';
import { enterTournament, fetchTournament } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

export default function TournamentDetailPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const tournamentId = panelData?.tournamentId as number | undefined;

  const [tournament, setTournament] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);
  const [entered, setEntered] = useState(false);
  const [enterError, setEnterError] = useState('');

  useEffect(() => {
    if (!tournamentId) { setLoading(false); return; }
    fetchTournament(tournamentId)
      .then(setTournament)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tournamentId]);

  const handleEnter = async () => {
    if (!tournament) return;
    setEntering(true);
    setEnterError('');
    try {
      const { client_secret, amount_cents } = await enterTournament(tournament.id);

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Maison Fraise',
        defaultBillingDetails: {},
      });
      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') throw new Error(presentError.message);
        return;
      }

      setEntered(true);
      setTournament((prev: any) => ({
        ...prev,
        prize_pool_cents: (prev.prize_pool_cents ?? 0) + amount_cents,
        entries: [...(prev.entries ?? []), { display_name: 'you', entered_at: new Date().toISOString() }],
      }));
    } catch (e: any) {
      const msg = e?.message ?? 'entry_failed';
      if (msg === 'already_entered') {
        setEntered(true);
      } else {
        setEnterError(msg);
      }
    }
    setEntering(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <Header onBack={goBack} c={c} />
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!tournament) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <Header onBack={goBack} c={c} />
        <Text style={[styles.empty, { color: c.muted }]}>tournament not found</Text>
      </View>
    );
  }

  const prizePool = `CA$${(tournament.prize_pool_cents / 100).toFixed(0)}`;
  const entryFee = `CA$${(tournament.entry_fee_cents / 100).toFixed(0)}`;
  const platformCut = tournament.platform_cut_bps / 100;
  const entryCount = tournament.entries?.length ?? 0;
  const isOpen = tournament.status === 'open';

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <Header onBack={goBack} c={c} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        <View style={[styles.section, { borderBottomColor: c.border }]}>
          <Text style={[styles.name, { color: c.text }]}>{tournament.name}</Text>
          <Text style={[styles.statusText, { color: tournament.status === 'in_progress' ? c.accent : c.muted }]}>
            {tournament.status}
          </Text>
          {tournament.description ? (
            <Text style={[styles.description, { color: c.muted }]}>{tournament.description}</Text>
          ) : null}
        </View>

        <View style={[styles.section, { borderBottomColor: c.border }]}>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: c.text }]}>{prizePool}</Text>
              <Text style={[styles.statLabel, { color: c.muted }]}>prize pool</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: c.text }]}>{entryFee}</Text>
              <Text style={[styles.statLabel, { color: c.muted }]}>entry fee</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: c.text }]}>{entryCount}</Text>
              <Text style={[styles.statLabel, { color: c.muted }]}>entered</Text>
            </View>
          </View>
          <Text style={[styles.cutNote, { color: c.muted }]}>
            {platformCut}% platform cut on payout
          </Text>
          {tournament.ends_at && (
            <Text style={[styles.cutNote, { color: c.muted }]}>
              ends {new Date(tournament.ends_at).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
          )}
          {tournament.winner_payout_cents && (
            <Text style={[styles.winnerNote, { color: c.accent }]}>
              winner: CA${(tournament.winner_payout_cents / 100).toFixed(0)}
            </Text>
          )}
        </View>

        {entryCount > 0 && (
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>participants</Text>
            {tournament.entries.map((e: any, i: number) => (
              <Text key={i} style={[styles.participant, { color: c.text }]}>
                @{e.display_name}
              </Text>
            ))}
          </View>
        )}

        {isOpen && !entered && (
          <View style={styles.enterSection}>
            {!!enterError && (
              <Text style={[styles.enterError, { color: '#B00020' }]}>{enterError}</Text>
            )}
            <TouchableOpacity
              style={[styles.enterBtn, { backgroundColor: c.accent }]}
              onPress={handleEnter}
              disabled={entering}
              activeOpacity={0.75}
            >
              {entering
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.enterBtnText}>enter — {entryFee}</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {entered && (
          <View style={styles.enterSection}>
            <Text style={[styles.enteredNote, { color: c.accent }]}>you're in</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function Header({ onBack, c }: { onBack: () => void; c: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.header, { borderBottomColor: c.border }]}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
        <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={[styles.title, { color: c.text }]}>tournament</Text>
      </View>
      <View style={styles.headerSpacer} />
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
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { textAlign: 'center', fontSize: 17, fontFamily: fonts.playfair },
  headerSpacer: { width: 28 },
  scroll: { paddingBottom: 20 },
  section: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  name: { fontSize: 24, fontFamily: fonts.playfair },
  statusText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  description: { fontSize: 13, fontFamily: fonts.dmSans, fontStyle: 'italic', marginTop: 4 },
  statRow: { flexDirection: 'row', gap: 0 },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 20, fontFamily: fonts.playfair },
  statLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1, textTransform: 'uppercase' },
  cutNote: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3, marginTop: 4 },
  winnerNote: { fontSize: 13, fontFamily: fonts.dmMono, marginTop: 4 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  participant: { fontSize: 13, fontFamily: fonts.dmMono, paddingVertical: 4 },
  enterSection: { paddingHorizontal: SPACING.md, paddingTop: 24, gap: 10 },
  enterBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  enterBtnText: { fontSize: 14, fontFamily: fonts.dmMono, color: '#fff', letterSpacing: 0.5 },
  enterError: { fontSize: 11, fontFamily: fonts.dmMono, textAlign: 'center' },
  enteredNote: { fontSize: 15, fontFamily: fonts.playfair, textAlign: 'center', paddingVertical: 8 },
  empty: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 13,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    paddingHorizontal: SPACING.md,
  },
});
