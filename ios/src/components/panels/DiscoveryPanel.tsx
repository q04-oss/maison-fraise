import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchDiscovery } from '../../lib/api';

export default function DiscoveryPanel() {
  const { goBack, setActiveLocation, showPanel, businesses } = usePanel();
  const c = useColors();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchDiscovery()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter
    ? items.filter(i =>
        i.neighbourhood?.toLowerCase().includes(filter.toLowerCase()) ||
        i.name?.toLowerCase().includes(filter.toLowerCase())
      )
    : items;

  const handlePress = (item: any) => {
    // Find business in context businesses array (has lat/lng etc), fall back to item
    const full = businesses?.find((b: any) => b.id === item.id) ?? item;
    setActiveLocation(full);
    showPanel('partner-detail');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>DISCOVER</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={[styles.searchRow, { borderBottomColor: c.border }]}>
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="neighbourhood or name…"
          placeholderTextColor={c.muted}
          value={filter}
          onChangeText={setFilter}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Nothing here yet</Text>
          <Text style={[styles.emptyBody, { color: c.muted }]}>
            Businesses appear here once they host an evening, license a portrait, or add their menu.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {filtered.map((item: any) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, { borderColor: c.border }]}
              onPress={() => handlePress(item)}
              activeOpacity={0.75}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bizName, { color: c.text }]}>{item.name}</Text>
                  {item.neighbourhood && (
                    <Text style={[styles.neighbourhood, { color: c.muted }]}>{item.neighbourhood}</Text>
                  )}
                </View>
                <Text style={[styles.chevron, { color: c.accent }]}>→</Text>
              </View>

              <View style={styles.stats}>
                {item.evening_count > 0 && (
                  <View style={styles.stat}>
                    <Text style={[styles.statNum, { color: c.text }]}>{item.evening_count}</Text>
                    <Text style={[styles.statLabel, { color: c.muted }]}>
                      {item.evening_count === 1 ? 'EVENING' : 'EVENINGS'}
                    </Text>
                  </View>
                )}
                {item.portrait_count > 0 && (
                  <View style={styles.stat}>
                    <Text style={[styles.statNum, { color: c.text }]}>{item.portrait_count}</Text>
                    <Text style={[styles.statLabel, { color: c.muted }]}>
                      {item.portrait_count === 1 ? 'PORTRAIT' : 'PORTRAITS'}
                    </Text>
                  </View>
                )}
                {item.has_menu && (
                  <View style={styles.stat}>
                    <Text style={[styles.statNum, { color: c.accent }]}>✓</Text>
                    <Text style={[styles.statLabel, { color: c.muted }]}>MENU</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40 },
  backText: { fontSize: 22 },
  title: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 1.5 },
  searchRow: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { fontFamily: fonts.dmMono, fontSize: 13, paddingVertical: 6 },
  scroll: { padding: SPACING.md },
  empty: { marginTop: 60, alignItems: 'center', paddingHorizontal: SPACING.lg },
  emptyTitle: { fontFamily: fonts.playfair, fontSize: 20, marginBottom: SPACING.sm, textAlign: 'center' },
  emptyBody: { fontFamily: fonts.dmSans, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  card: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    padding: SPACING.md, marginBottom: SPACING.sm, gap: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bizName: { fontFamily: fonts.playfair, fontSize: 20 },
  neighbourhood: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1, marginTop: 4 },
  chevron: { fontSize: 18, paddingTop: 4 },
  stats: { flexDirection: 'row', gap: SPACING.md },
  stat: { alignItems: 'center', minWidth: 48 },
  statNum: { fontSize: 18, fontFamily: fonts.playfair },
  statLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: 2 },
});
