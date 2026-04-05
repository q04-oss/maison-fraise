import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import * as Haptics from 'expo-haptics';
import { useStripe } from '@stripe/stripe-react-native';
import { usePanel } from '../../context/PanelContext';
import {
  enterTournament, fetchTournament, fetchMyDeck, fetchMyTournamentEntry,
  registerDeck, recordCardPlay, fetchMyContentTokens,
} from '../../lib/api';
import { ARCHETYPE_COLORS } from '../../lib/tokenAlgorithm';
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

  // Deck management
  const [deck, setDeck] = useState<number[]>([]);
  const [myTokens, setMyTokens] = useState<any[]>([]);
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<number>>(new Set());
  const [savingDeck, setSavingDeck] = useState(false);

  // Card play
  const [playingCard, setPlayingCard] = useState(false);

  useEffect(() => {
    if (!tournamentId) { setLoading(false); return; }
    Promise.all([
      fetchTournament(tournamentId),
      fetchMyTournamentEntry(tournamentId).catch(() => ({ entered: false })),
      fetchMyDeck(tournamentId).catch(() => null),
      fetchMyContentTokens().catch(() => []),
    ]).then(([t, entryStatus, deckData, tokens]) => {
      setTournament(t);
      if (entryStatus.entered) setEntered(true);
      if (deckData?.content_token_ids) setDeck(deckData.content_token_ids);
      setMyTokens(tokens);
    }).catch(() => {}).finally(() => setLoading(false));
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

  const openDeckModal = async () => {
    const tokens = await fetchMyContentTokens().catch(() => []);
    setMyTokens(tokens);
    setSelectedTokenIds(new Set(deck));
    setShowDeckModal(true);
  };

  const saveDeck = async () => {
    if (!tournamentId) return;
    setSavingDeck(true);
    try {
      const ids = [...selectedTokenIds];
      await registerDeck(tournamentId, ids);
      setDeck(ids);
      setShowDeckModal(false);
    } catch (e: any) {
      Alert.alert('error', e?.message ?? 'save_failed');
    }
    setSavingDeck(false);
  };

  const handleScanCard = async () => {
    if (!tournamentId || playingCard) return;
    setPlayingCard(true);
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      const record = tag?.ndefMessage?.[0];
      if (!record?.payload) throw new Error('no_data');

      const raw = Ndef.text.decodePayload(new Uint8Array(record.payload as number[]));
      const contentTokenId = parseInt(raw, 10);
      if (isNaN(contentTokenId)) throw new Error('invalid_card');

      await recordCardPlay(tournamentId, contentTokenId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Optimistically show which card was played
      const token = myTokens.find(t => t.id === contentTokenId);
      const label = token ? `${token.mechanic_archetype} · power ${token.mechanic_power}` : `card #${contentTokenId}`;
      Alert.alert('played', label);
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg !== 'UserCancel' && msg !== 'user_cancel') {
        const friendly: Record<string, string> = {
          token_not_in_deck: 'that card isn\'t in your registered deck.',
          tournament_not_in_progress: 'the tournament isn\'t active yet.',
          no_data: 'couldn\'t read the chip — try again.',
          invalid_card: 'this doesn\'t look like a maison fraise card.',
        };
        Alert.alert('scan failed', friendly[msg] ?? 'hold the card flat against the top of your phone and try again.');
      }
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
      setPlayingCard(false);
    }
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

        {/* Deck management — visible once entered */}
        {entered && (
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <View style={styles.deckHeader}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>your deck</Text>
              <TouchableOpacity onPress={openDeckModal} activeOpacity={0.7}>
                <Text style={[styles.deckEdit, { color: c.accent }]}>
                  {deck.length === 0 ? 'register →' : 'edit →'}
                </Text>
              </TouchableOpacity>
            </View>
            {deck.length === 0 ? (
              <Text style={[styles.deckEmpty, { color: c.muted }]}>no cards registered</Text>
            ) : (
              <Text style={[styles.deckCount, { color: c.muted }]}>{deck.length} card{deck.length !== 1 ? 's' : ''} registered</Text>
            )}

            {/* NFC card play — active during in_progress */}
            {tournament.status === 'in_progress' && deck.length > 0 && (
              <TouchableOpacity
                style={[styles.scanBtn, { borderColor: c.accent }, playingCard && styles.scanBtnActive]}
                onPress={handleScanCard}
                disabled={playingCard}
                activeOpacity={0.75}
              >
                {playingCard ? (
                  <>
                    <ActivityIndicator size="small" color={c.accent} />
                    <Text style={[styles.scanBtnText, { color: c.accent }]}>hold card to phone</Text>
                  </>
                ) : (
                  <Text style={[styles.scanBtnText, { color: c.accent }]}>tap to play a card</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Deck registration modal */}
      <Modal visible={showDeckModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: c.panelBg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <TouchableOpacity onPress={() => setShowDeckModal(false)} activeOpacity={0.7}>
              <Text style={[styles.modalClose, { color: c.accent }]}>cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: c.text }]}>select deck</Text>
            <TouchableOpacity onPress={saveDeck} disabled={savingDeck} activeOpacity={0.7}>
              {savingDeck
                ? <ActivityIndicator size="small" color={c.accent} />
                : <Text style={[styles.modalClose, { color: c.accent }]}>save</Text>
              }
            </TouchableOpacity>
          </View>
          <FlatList
            data={myTokens}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => {
              const selected = selectedTokenIds.has(item.id);
              const archetype = item.mechanic_archetype ?? 'allure';
              return (
                <TouchableOpacity
                  style={[
                    styles.deckTokenRow,
                    { borderBottomColor: c.border },
                    selected && { backgroundColor: c.accent + '22' },
                  ]}
                  onPress={() => {
                    setSelectedTokenIds(prev => {
                      const next = new Set(prev);
                      if (next.has(item.id)) { next.delete(item.id); } else { next.add(item.id); }
                      return next;
                    });
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.deckTokenBadge, { backgroundColor: ARCHETYPE_COLORS[archetype as keyof typeof ARCHETYPE_COLORS] ?? '#333' }]}>
                    <Text style={styles.deckTokenBadgeText}>{archetype[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.deckTokenName, { color: c.text }]} numberOfLines={1}>
                      {item.variety_name ?? `card #${item.id}`}
                    </Text>
                    <Text style={[styles.deckTokenMeta, { color: c.muted }]}>
                      {archetype} · power {item.mechanic_power} · {item.mechanic_rarity}
                    </Text>
                  </View>
                  {selected && <Text style={[styles.deckCheck, { color: c.accent }]}>✓</Text>}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.deckEmpty, { color: c.muted, textAlign: 'center', marginTop: 40 }]}>
                no content cards in your collection
              </Text>
            }
          />
        </View>
      </Modal>
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
  deckHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deckEdit: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  deckEmpty: { fontSize: 11, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  deckCount: { fontSize: 11, fontFamily: fonts.dmMono },
  scanBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    borderStyle: 'dashed',
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  scanBtnActive: { opacity: 0.7 },
  scanBtnText: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 15, fontFamily: fonts.playfair },
  modalClose: { fontSize: 13, fontFamily: fonts.dmMono },
  deckTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  deckTokenBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  deckTokenBadgeText: { fontSize: 14, fontFamily: fonts.playfair, color: '#fff' },
  deckTokenName: { fontSize: 13, fontFamily: fonts.dmSans },
  deckTokenMeta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3, marginTop: 2 },
  deckCheck: { fontSize: 16, fontFamily: fonts.dmSans },
});
