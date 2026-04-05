import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import {
  fetchMyTournaments, createTournament, advanceTournamentStatus,
  declareWinner, fetchTournament,
} from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

type View = 'list' | 'create' | 'manage';

const STATUS_LABEL: Record<string, string> = {
  open: 'open',
  in_progress: 'live',
  closed: 'closed',
  paid_out: 'paid out',
};

const NEXT_STATUS: Record<string, 'in_progress' | 'closed'> = {
  open: 'in_progress',
  in_progress: 'closed',
};

const fmtCAD = (cents: number) => `CA$${(cents / 100).toFixed(2)}`;

export default function TournamentOperatorPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<View>('list');
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [managedDetail, setManagedDetail] = useState<any>(null);
  const [advancing, setAdvancing] = useState(false);
  const [declaringWinner, setDeclaringWinner] = useState(false);
  const [pickedWinnerId, setPickedWinnerId] = useState<number | null>(null);

  // Create form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entryFeeDollars, setEntryFeeDollars] = useState('');
  const [maxEntries, setMaxEntries] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchMyTournaments()
      .then(setTournaments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openManage = async (t: any) => {
    setSelected(t);
    setPickedWinnerId(null);
    setView('manage');
    try {
      const detail = await fetchTournament(t.id);
      setManagedDetail(detail);
    } catch {
      setManagedDetail(t);
    }
  };

  const handleAdvance = async () => {
    if (!selected) return;
    const next = NEXT_STATUS[selected.status];
    if (!next) return;
    Alert.alert(
      'Advance status',
      `Move "${selected.name}" to ${STATUS_LABEL[next]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm', onPress: async () => {
            setAdvancing(true);
            try {
              await advanceTournamentStatus(selected.id, next);
              const updated = { ...selected, status: next };
              setSelected(updated);
              setManagedDetail((prev: any) => prev ? { ...prev, status: next } : prev);
              setTournaments(prev => prev.map(t => t.id === selected.id ? updated : t));
            } catch (err: any) {
              const msg = err?.message === 'not_your_tournament' ? 'You can only manage your own tournaments.'
                : err?.message === 'invalid_transition' ? 'Tournament is no longer in the expected state.'
                : 'Could not advance status.';
              Alert.alert('Error', msg);
            } finally {
              setAdvancing(false);
            }
          },
        },
      ],
    );
  };

  const handleDeclareWinner = async () => {
    if (!selected || !pickedWinnerId) return;
    const entry = managedDetail?.entries?.find((e: any) => e.user_id === pickedWinnerId);
    const name = entry?.display_name ?? `user #${pickedWinnerId}`;
    Alert.alert(
      'Declare winner',
      `Declare ${name} the winner of "${selected.name}"? This distributes the prize pool and creator earnings immediately and cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Declare', style: 'destructive', onPress: async () => {
            setDeclaringWinner(true);
            try {
              const result = await declareWinner(selected.id, pickedWinnerId);
              const updated = { ...selected, status: 'paid_out', winner_user_id: pickedWinnerId };
              setSelected(updated);
              setManagedDetail((prev: any) => prev ? { ...prev, status: 'paid_out', winner_user_id: pickedWinnerId } : prev);
              setTournaments(prev => prev.map(t => t.id === selected.id ? updated : t));
              Alert.alert(
                'Done',
                `Winner paid ${fmtCAD(result.payout_cents)}.\nCreators earned ${fmtCAD((result.play_pool_cents ?? 0) + (result.win_bonus_pool_cents ?? 0))}.`,
              );
            } catch (e: any) {
              const msg = e?.message === 'already_paid_out' ? 'Already paid out.'
                : e?.message === 'not_your_tournament' ? 'You can only manage your own tournaments.'
                : 'Could not declare winner.';
              Alert.alert('Error', msg);
            } finally {
              setDeclaringWinner(false);
            }
          },
        },
      ],
    );
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const feeCents = Math.round(parseFloat(entryFeeDollars) * 100);
    if (!trimmedName) { Alert.alert('Name required'); return; }
    if (isNaN(feeCents) || feeCents < 100) { Alert.alert('Entry fee must be at least $1.00'); return; }
    setCreating(true);
    try {
      const t = await createTournament({
        name: trimmedName,
        description: description.trim() || undefined,
        entry_fee_cents: feeCents,
        max_entries: maxEntries ? parseInt(maxEntries, 10) : undefined,
      });
      setTournaments(prev => [t, ...prev]);
      setName(''); setDescription(''); setEntryFeeDollars(''); setMaxEntries('');
      setView('list');
    } catch (e: any) {
      Alert.alert('Error', e.message === 'operators_only' ? 'Operator access required.' : 'Could not create tournament.');
    } finally {
      setCreating(false);
    }
  };

  // ── List view ─────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>tournaments</Text>
          <TouchableOpacity onPress={() => setView('create')} activeOpacity={0.7}>
            <Text style={[styles.newBtn, { color: c.accent }]}>new +</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : tournaments.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>no tournaments yet</Text>
        ) : (
          <FlatList
            data={tournaments}
            keyExtractor={t => String(t.id)}
            renderItem={({ item: t }) => (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: c.border }]}
                onPress={() => openManage(t)}
                activeOpacity={0.7}
              >
                <View style={styles.rowMain}>
                  <Text style={[styles.rowName, { color: c.text }]} numberOfLines={1}>{t.name}</Text>
                  <Text style={[styles.rowStatus, { color: t.status === 'in_progress' ? c.accent : c.muted }]}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </Text>
                </View>
                <View style={styles.rowMeta}>
                  <Text style={[styles.meta, { color: c.muted }]}>{fmtCAD(t.entry_fee_cents)} entry</Text>
                  <Text style={[styles.meta, { color: c.muted }]}>{t.entry_count} entered</Text>
                  {t.prize_pool_cents > 0 && (
                    <Text style={[styles.meta, { color: c.muted }]}>{fmtCAD(t.prize_pool_cents)} pool</Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          />
        )}
      </View>
    );
  }

  // ── Create view ───────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={() => setView('list')} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>new tournament</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={[styles.fieldLabel, { color: c.muted }]}>NAME</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={name}
            onChangeText={setName}
            placeholder="Tournament name"
            placeholderTextColor={c.muted}
            returnKeyType="next"
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.inputMulti, { color: c.text, borderColor: c.border }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description"
            placeholderTextColor={c.muted}
            multiline
            numberOfLines={3}
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>ENTRY FEE (CA$)</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={entryFeeDollars}
            onChangeText={setEntryFeeDollars}
            placeholder="e.g. 10.00"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
            returnKeyType="next"
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>MAX ENTRIES</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={maxEntries}
            onChangeText={setMaxEntries}
            placeholder="Leave blank for unlimited"
            placeholderTextColor={c.muted}
            keyboardType="number-pad"
            returnKeyType="done"
          />

          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: c.text }, creating && { opacity: 0.5 }]}
            onPress={handleCreate}
            disabled={creating}
            activeOpacity={0.8}
          >
            <Text style={[styles.createBtnText, { color: c.ctaText }]}>
              {creating ? 'creating…' : 'create tournament'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Manage view ───────────────────────────────────────────────────────────
  const detail = managedDetail ?? selected;
  const entries: any[] = detail?.entries ?? [];
  const canAdvance = !!NEXT_STATUS[detail?.status];
  const canDeclareWinner = detail?.status === 'closed' && entries.length > 0;
  const isPaidOut = detail?.status === 'paid_out';

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => { setView('list'); setSelected(null); setManagedDetail(null); }} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{detail?.name ?? '—'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.manageContent, { paddingBottom: insets.bottom + 40 }]}>
        {/* Status row */}
        <View style={[styles.statusRow, { borderBottomColor: c.border }]}>
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: detail?.status === 'in_progress' ? c.accent : c.text }]}>
              {STATUS_LABEL[detail?.status] ?? detail?.status}
            </Text>
            <Text style={[styles.statusLabel, { color: c.muted }]}>status</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: c.text }]}>{entries.length}</Text>
            <Text style={[styles.statusLabel, { color: c.muted }]}>entered</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: c.text }]}>
              {detail?.prize_pool_cents ? fmtCAD(detail.prize_pool_cents) : '—'}
            </Text>
            <Text style={[styles.statusLabel, { color: c.muted }]}>pool</Text>
          </View>
        </View>

        {/* Advance status */}
        {canAdvance && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: c.text }, advancing && { opacity: 0.5 }]}
            onPress={handleAdvance}
            disabled={advancing}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionBtnText, { color: c.ctaText }]}>
              {advancing ? 'updating…' : `advance to ${STATUS_LABEL[NEXT_STATUS[detail?.status]] ?? '—'}`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Entries list */}
        {entries.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>ENTRANTS</Text>
            {entries.map((e: any) => {
              const isWinner = isPaidOut && detail?.winner_user_id === e.user_id;
              const isPicked = pickedWinnerId === e.user_id;
              return (
                <TouchableOpacity
                  key={e.id}
                  style={[
                    styles.entrantRow,
                    { borderBottomColor: c.border },
                    isPicked && { backgroundColor: c.card },
                  ]}
                  onPress={() => canDeclareWinner && setPickedWinnerId(isPicked ? null : e.user_id)}
                  activeOpacity={canDeclareWinner ? 0.7 : 1}
                >
                  <Text style={[styles.entrantName, { color: c.text }]} numberOfLines={1}>
                    {e.display_name}
                  </Text>
                  {isWinner && (
                    <Text style={[styles.winnerBadge, { color: c.accent }]}>winner</Text>
                  )}
                  {canDeclareWinner && (
                    <View style={[
                      styles.radio,
                      { borderColor: isPicked ? c.text : c.border },
                      isPicked && { backgroundColor: c.text },
                    ]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Declare winner */}
        {canDeclareWinner && (
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: c.text, marginTop: SPACING.md },
              (!pickedWinnerId || declaringWinner) && { opacity: 0.4 },
            ]}
            onPress={handleDeclareWinner}
            disabled={!pickedWinnerId || declaringWinner}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionBtnText, { color: c.ctaText }]}>
              {declaringWinner ? 'declaring…' : 'declare winner'}
            </Text>
          </TouchableOpacity>
        )}

        {isPaidOut && detail?.winner_payout_cents && (
          <Text style={[styles.payoutNote, { color: c.muted }]}>
            {fmtCAD(detail.winner_payout_cents)} paid to winner
          </Text>
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
  backBtn: { paddingVertical: 4, width: 44 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: fonts.playfair },
  newBtn: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  empty: {
    textAlign: 'center', marginTop: 60, fontSize: 13,
    fontFamily: fonts.dmSans, fontStyle: 'italic', paddingHorizontal: SPACING.md,
  },
  row: {
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 5,
  },
  rowMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowName: { fontSize: 15, fontFamily: fonts.dmSans, flex: 1 },
  rowStatus: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5, textTransform: 'uppercase' },
  rowMeta: { flexDirection: 'row', gap: 12 },
  meta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  form: { padding: SPACING.md, gap: 8 },
  fieldLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: fonts.dmSans,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  createBtn: {
    borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24,
  },
  createBtnText: { fontFamily: fonts.dmSans, fontSize: 15, fontWeight: '700' },
  manageContent: { padding: SPACING.md, gap: 0 },
  statusRow: {
    flexDirection: 'row', paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: SPACING.md,
  },
  statusItem: { flex: 1, alignItems: 'center', gap: 4 },
  statusValue: { fontSize: 18, fontFamily: fonts.playfair },
  statusLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1, textTransform: 'uppercase' },
  actionBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    marginBottom: SPACING.md,
  },
  actionBtnText: { fontFamily: fonts.dmSans, fontSize: 14, fontWeight: '700' },
  sectionLabel: {
    fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5,
    textTransform: 'uppercase', marginTop: SPACING.md, marginBottom: 8,
  },
  entrantRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  entrantName: { flex: 1, fontSize: 14, fontFamily: fonts.dmSans },
  winnerBadge: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, marginLeft: 10,
  },
  payoutNote: {
    textAlign: 'center', fontSize: 12, fontFamily: fonts.dmMono,
    letterSpacing: 0.3, marginTop: 16,
  },
});
