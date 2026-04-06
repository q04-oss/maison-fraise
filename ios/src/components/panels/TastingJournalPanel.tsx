import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchTastingJournal } from '../../lib/api';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

type JournalEntry = {
  id: number;
  variety_id: number;
  variety_name: string;
  rating: number;
  notes: string | null;
  created_at: string;
};

export default function TastingJournalPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await fetchTastingJournal();
      const sorted = [...data].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setEntries(sorted);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalEntries = entries.length;
  const avgRating =
    totalEntries > 0
      ? entries.reduce((sum, e) => sum + e.rating, 0) / totalEntries
      : 0;

  const renderRating = (rating: number) => {
    const dots: React.ReactElement[] = [];
    for (let i = 1; i <= 5; i++) {
      dots.push(
        <Text
          key={i}
          style={[styles.dot, { color: i <= rating ? c.accent : c.muted }]}
        >
          {i <= rating ? '●' : '○'}
        </Text>,
      );
    }
    return <View style={styles.ratingRow}>{dots}</View>;
  };

  const renderItem = ({ item }: { item: JournalEntry }) => (
    <View style={[styles.row, { borderBottomColor: c.border }]}>
      <View style={styles.rowTop}>
        <Text style={[styles.varietyName, { color: c.text }]}>{item.variety_name}</Text>
        <Text style={[styles.dateText, { color: c.muted }]}>{formatDate(item.created_at)}</Text>
      </View>
      {renderRating(item.rating)}
      {!!item.notes && (
        <Text
          style={[styles.notes, { color: c.muted }]}
          numberOfLines={2}
        >
          {item.notes}
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>TASTING JOURNAL</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: (insets.bottom || SPACING.md) + SPACING.lg },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={c.accent}
            />
          }
          ListHeaderComponent={
            entries.length > 0 ? (
              <View style={[styles.statsRow, { borderBottomColor: c.border }]}>
                <View style={styles.stat}>
                  <Text style={[styles.statNum, { color: c.text }]}>{totalEntries}</Text>
                  <Text style={[styles.statLabel, { color: c.muted }]}>ENTRIES</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: c.border }]} />
                <View style={styles.stat}>
                  <Text style={[styles.statNum, { color: c.text }]}>★ {avgRating.toFixed(1)}</Text>
                  <Text style={[styles.statLabel, { color: c.muted }]}>AVG RATING</Text>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyPrimary, { color: c.text }]}>
                Your tasting journal is empty.
              </Text>
              <Text style={[styles.emptySub, { color: c.muted }]}>
                Rate a variety after your next order.
              </Text>
            </View>
          }
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

  listContent: {},

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontFamily: fonts.playfair, fontSize: 24 },
  statLabel: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 1.5 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 32 },

  row: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  varietyName: { fontFamily: fonts.playfair, fontSize: 16, flex: 1 },
  dateText: { fontFamily: fonts.dmMono, fontSize: 10, marginLeft: SPACING.sm },
  ratingRow: { flexDirection: 'row', gap: 3 },
  dot: { fontFamily: fonts.dmMono, fontSize: 12 },
  notes: { fontFamily: fonts.dmSans, fontSize: 12, lineHeight: 18 },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: SPACING.lg,
    gap: 8,
  },
  emptyPrimary: {
    fontFamily: fonts.dmSans,
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
