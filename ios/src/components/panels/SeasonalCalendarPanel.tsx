import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchSeasons } from '../../lib/api';

export default function SeasonalCalendarPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [seasons, setSeasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSeasons()
      .then(setSeasons)
      .catch(() => setSeasons([]))
      .finally(() => setLoading(false));
  }, []);

  const isActive = (season: any) => {
    const now = new Date();
    const start = season.start_date ? new Date(season.start_date) : null;
    const end = season.end_date ? new Date(season.end_date) : null;
    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>SEASONAL CALENDAR</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && seasons.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>No seasonal data available.</Text>
        </View>
      )}

      {!loading && (
        <FlatList
          data={seasons}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const active = isActive(item);
            return (
              <View style={[styles.card, { backgroundColor: active ? c.card : c.panelBg, borderColor: active ? c.accent : c.border }]}>
                <View style={styles.row}>
                  <Text style={[styles.varietyName, { color: c.text, fontFamily: fonts.playfair }]}>{item.variety_name ?? item.name}</Text>
                  {active && (
                    <View style={[styles.activePill, { backgroundColor: c.accent }]}>
                      <Text style={[styles.activePillText, { fontFamily: fonts.dmMono }]}>NOW</Text>
                    </View>
                  )}
                </View>
                {item.notes ? (
                  <Text style={[styles.notes, { color: c.muted, fontFamily: fonts.dmSans }]}>{item.notes}</Text>
                ) : null}
                <Text style={[styles.dates, { color: c.muted, fontFamily: fonts.dmMono }]}>
                  {item.start_date
                    ? new Date(item.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
                    : '—'}
                  {' → '}
                  {item.end_date
                    ? new Date(item.end_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
                    : '—'}
                </Text>
              </View>
            );
          }}
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
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  varietyName: { fontSize: 20, flex: 1 },
  activePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  activePillText: { color: '#fff', fontSize: 10, letterSpacing: 1 },
  notes: { fontSize: 13, lineHeight: 18 },
  dates: { fontSize: 11, letterSpacing: 0.5 },
});
