import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchCollectifLeaderboard } from '../../lib/api';

export default function LeaderboardPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCollectifLeaderboard()
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  const medalColor = (rank: number) => {
    if (rank === 1) return '#C9973A';
    if (rank === 2) return '#9CA3AF';
    if (rank === 3) return '#A16207';
    return c.muted;
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>LEADERBOARD</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && entries.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>No collectif data yet.</Text>
        </View>
      )}

      {!loading && (
        <FlatList
          data={entries}
          keyExtractor={item => String(item.collectif_id)}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.rank, { color: medalColor(index + 1), fontFamily: fonts.playfair }]}>
                {index + 1}
              </Text>
              <View style={styles.info}>
                <Text style={[styles.name, { color: c.text, fontFamily: fonts.playfair }]}>{item.name ?? `Collectif #${item.collectif_id}`}</Text>
                <Text style={[styles.meta, { color: c.muted, fontFamily: fonts.dmMono }]}>
                  {item.member_count} members · {item.total_pickups} pickups
                </Text>
              </View>
              <Text style={[styles.score, { color: c.accent, fontFamily: fonts.dmMono }]}>{item.score}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { fontSize: 28 },
  title: { fontSize: 14, letterSpacing: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14 },
  list: { padding: SPACING.md, gap: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACING.md, paddingVertical: 14, gap: SPACING.md },
  rank: { fontSize: 28, width: 36, textAlign: 'center' },
  info: { flex: 1 },
  name: { fontSize: 18 },
  meta: { fontSize: 11, letterSpacing: 0.5 },
  score: { fontSize: 20, letterSpacing: 1 },
});
