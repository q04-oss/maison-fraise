import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchDrops } from '../../lib/api';

export default function DropsPanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [drops, setDrops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDrops()
      .then(setDrops)
      .catch(() => setDrops([]))
      .finally(() => setLoading(false));
  }, []);

  const statusColor = (status: string) => {
    if (status === 'open') return c.accent;
    if (status === 'sold_out') return '#EF4444';
    return c.muted;
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>VARIETY DROPS</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      )}

      {!loading && drops.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>No drops available right now.</Text>
        </View>
      )}

      {!loading && (
        <FlatList
          data={drops}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => showPanel('drop-detail', { drop: item })}
              activeOpacity={0.8}
            >
              <View style={styles.row}>
                <Text style={[styles.variety, { color: c.text, fontFamily: fonts.playfair }]}>{item.variety_name ?? item.title}</Text>
                <Text style={[styles.status, { color: statusColor(item.status), fontFamily: fonts.dmMono }]}>
                  {item.status === 'open' ? 'OPEN' : item.status === 'sold_out' ? 'SOLD OUT' : item.status?.toUpperCase()}
                </Text>
              </View>
              {item.description ? (
                <Text style={[styles.desc, { color: c.muted, fontFamily: fonts.dmSans }]} numberOfLines={2}>{item.description}</Text>
              ) : null}
              <View style={styles.row}>
                <Text style={[styles.meta, { color: c.muted, fontFamily: fonts.dmMono }]}>
                  {item.quantity} available
                </Text>
                {item.price_cents != null && (
                  <Text style={[styles.price, { color: c.text, fontFamily: fonts.playfair }]}>
                    CA${(item.price_cents / 100).toFixed(2)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
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
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  variety: { fontSize: 20, flex: 1 },
  status: { fontSize: 11, letterSpacing: 1 },
  desc: { fontSize: 13, lineHeight: 18 },
  meta: { fontSize: 12, letterSpacing: 0.5 },
  price: { fontSize: 18 },
});
