import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchGreenhouses } from '../../lib/api';

export default function GreenhousePanel() {
  const { goBack, showPanel, setPanelData } = usePanel();
  const c = useColors();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGreenhouses().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handlePress = (item: any) => {
    setPanelData({ id: item.id });
    showPanel('greenhouse-detail');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>GREENHOUSES</Text>
        <TouchableOpacity onPress={() => showPanel('ar-video-feed')} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={{ color: c.accent, fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 0.5, textAlign: 'right' }}>AR ▶</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No greenhouses yet</Text>
          <Text style={[styles.emptyBody, { color: c.muted }]}>
            Greenhouses available for founding patronage will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.map((item: any) => {
            const progress = Math.min(1, item.funding_progress ?? 0);
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, { borderColor: c.border }]}
                onPress={() => handlePress(item)}
                activeOpacity={0.75}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: c.text }]}>{item.name}</Text>
                    {item.location && (
                      <Text style={[styles.location, { color: c.muted }]}>{item.location}</Text>
                    )}
                  </View>
                  <View style={[styles.statusPill, { borderColor: c.border }]}>
                    <Text style={[styles.statusText, { color: c.accent }]}>{item.status}</Text>
                  </View>
                  <Text style={[styles.chevron, { color: c.accent }]}>→</Text>
                </View>

                {/* Funding progress bar */}
                <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: c.accent }]} />
                </View>
                <Text style={[styles.progressLabel, { color: c.muted }]}>
                  CA${((item.funded_cents ?? 0) / 100).toFixed(0)} of CA${((item.funding_goal_cents ?? 0) / 100).toFixed(0)} funded
                </Text>

                {item.founding_patron_display_name && (
                  <Text style={[styles.patronName, { color: c.muted }]}>
                    Founded by {item.founding_patron_display_name}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
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
  scroll: { padding: SPACING.md },
  empty: { marginTop: 60, alignItems: 'center', paddingHorizontal: SPACING.lg },
  emptyTitle: { fontFamily: fonts.playfair, fontSize: 20, marginBottom: SPACING.sm, textAlign: 'center' },
  emptyBody: { fontFamily: fonts.dmSans, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  card: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    padding: SPACING.md, marginBottom: SPACING.sm, gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { fontFamily: fonts.playfair, fontSize: 20 },
  location: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1, marginTop: 4 },
  statusPill: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  statusText: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 1 },
  chevron: { fontSize: 18, paddingTop: 2 },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
  progressLabel: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 0.5 },
  patronName: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 0.5 },
});
