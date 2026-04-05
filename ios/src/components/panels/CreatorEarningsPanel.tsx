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
import { fetchCreatorEarnings } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

export default function CreatorEarningsPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const [data, setData] = useState<{ earnings: any[]; total_cents: number; pending_cents: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCreatorEarnings()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const renderItem = ({ item: e }: { item: any }) => {
    const amount = `CA$${(e.amount_cents / 100).toFixed(2)}`;
    const label = e.source === 'win_bonus' ? 'win bonus' : 'card play';
    const date = new Date(e.created_at).toLocaleDateString('en-CA');
    return (
      <View style={[styles.row, { borderBottomColor: c.border }]}>
        <View style={styles.rowMain}>
          <Text style={[styles.tournamentName, { color: c.text }]} numberOfLines={1}>
            {e.tournament_name ?? `tournament #${e.tournament_id}`}
          </Text>
          <Text style={[styles.amount, { color: e.paid_out ? c.muted : c.accent }]}>{amount}</Text>
        </View>
        <View style={styles.rowMeta}>
          <Text style={[styles.meta, { color: c.muted }]}>{label}</Text>
          <Text style={[styles.meta, { color: c.muted }]}>{date}</Text>
          {!e.paid_out && (
            <Text style={[styles.metaPending, { color: c.muted }]}>pending</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>creator earnings</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : !data || data.earnings.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>no earnings yet</Text>
      ) : (
        <>
          <View style={[styles.summary, { borderBottomColor: c.border }]}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: c.text }]}>
                CA${(data.total_cents / 100).toFixed(2)}
              </Text>
              <Text style={[styles.summaryLabel, { color: c.muted }]}>total earned</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: c.accent }]}>
                CA${(data.pending_cents / 100).toFixed(2)}
              </Text>
              <Text style={[styles.summaryLabel, { color: c.muted }]}>pending payout</Text>
            </View>
          </View>
          <FlatList
            data={data.earnings}
            keyExtractor={e => String(e.id)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </>
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
  summary: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 22, fontFamily: fonts.playfair },
  summaryLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1, textTransform: 'uppercase' },
  row: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  rowMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  tournamentName: { fontSize: 14, fontFamily: fonts.dmSans, flex: 1 },
  amount: { fontSize: 14, fontFamily: fonts.playfair },
  rowMeta: { flexDirection: 'row', gap: 10 },
  meta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  metaPending: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3, fontStyle: 'italic' },
});
