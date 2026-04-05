import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { fetchTournaments } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

export default function TournamentsPanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTournaments()
      .then(setTournaments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const renderItem = ({ item: t }: { item: any }) => {
    const entryFee = `CA$${(t.entry_fee_cents / 100).toFixed(0)}`;
    const prizePool = t.prize_pool_cents > 0
      ? `CA$${(t.prize_pool_cents / 100).toFixed(0)} pool`
      : 'no pool yet';
    const statusColor = t.status === 'in_progress' ? c.accent : c.muted;

    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: c.border }]}
        onPress={() => showPanel('tournament-detail', { tournamentId: t.id })}
        activeOpacity={0.75}
      >
        <View style={styles.rowMain}>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{t.name}</Text>
          <Text style={[styles.status, { color: statusColor }]}>{t.status}</Text>
        </View>
        <View style={styles.rowMeta}>
          <Text style={[styles.meta, { color: c.muted }]}>
            {entryFee} entry · {prizePool}
          </Text>
          {t.entry_count > 0 && (
            <Text style={[styles.meta, { color: c.muted }]}>
              {t.entry_count} entered
            </Text>
          )}
          {t.ends_at && (
            <Text style={[styles.meta, { color: c.muted }]}>
              ends {new Date(t.ends_at).toLocaleDateString('en-CA')}
            </Text>
          )}
        </View>
        {t.description ? (
          <Text style={[styles.description, { color: c.muted }]} numberOfLines={2}>
            {t.description}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>tournaments</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : tournaments.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>no open tournaments right now</Text>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={t => String(t.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
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
  empty: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 13,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    paddingHorizontal: SPACING.md,
  },
  row: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  rowMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontSize: 18, fontFamily: fonts.playfair, flex: 1 },
  status: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  rowMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  meta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  description: { fontSize: 12, fontFamily: fonts.dmSans, fontStyle: 'italic', marginTop: 2 },
});
