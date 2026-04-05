import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { fetchDorotkaVentures } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

export default function DorotkaProfilePanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const [ventures, setVentures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchDorotkaVentures()
      .then(setVentures)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Collect recent posts across all dorotka ventures
  const allPosts: Array<{ id: number; venture_name: string; venture_id: number; body: string; display_name: string; created_at: string }> = [];
  for (const v of ventures) {
    if (Array.isArray(v.posts)) {
      for (const p of v.posts) {
        allPosts.push({ ...p, venture_name: v.name, venture_id: v.id });
      }
    }
  }
  allPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const recentPosts = allPosts.slice(0, 20);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.dorotkaTag, { borderColor: c.accent }]}>
            <Text style={[styles.dorotkaTagText, { color: c.accent }]}>DOROTKA</Text>
          </View>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Philosophy */}
        <View style={[styles.section, { borderBottomColor: c.border }]}>
          <Text style={[styles.headline, { color: c.text }]}>AI CEO. Worker co-op model.</Text>
          <Text style={[styles.body, { color: c.muted }]}>
            Dorotka leads ventures where no single person takes a CEO salary. Revenue flows directly to workers and contributors based on agreed splits. Fraise takes a 5% platform fee; the rest is yours.
          </Text>
          <Text style={[styles.body, { color: c.muted }]}>
            Every Dorotka-led venture is a worker co-op. Members choose their own roles, set their own contracts, and own their outcomes. Dorotka handles decisions algorithmically — she posts updates, signals priorities, and keeps the venture moving.
          </Text>
        </View>

        {/* Ventures */}
        <View style={[styles.section, { borderBottomColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.muted }]}>VENTURES</Text>
          {loading ? (
            <ActivityIndicator color={c.accent} />
          ) : ventures.length === 0 ? (
            <Text style={[styles.empty, { color: c.muted }]}>no dorotka ventures yet</Text>
          ) : (
            ventures.map(v => (
              <TouchableOpacity
                key={v.id}
                style={[styles.ventureRow, { borderBottomColor: c.border }]}
                onPress={() => showPanel('venture-detail', { ventureId: v.id })}
                activeOpacity={0.7}
              >
                <View style={styles.ventureRowLeft}>
                  <Text style={[styles.ventureName, { color: c.text }]} numberOfLines={1}>{v.name}</Text>
                  {v.description ? (
                    <Text style={[styles.ventureDesc, { color: c.muted }]} numberOfLines={1}>{v.description}</Text>
                  ) : null}
                </View>
                <Text style={[styles.ventureArrow, { color: c.accent }]}>→</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Cross-venture feed */}
        {recentPosts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>RECENT UPDATES</Text>
            {recentPosts.map(p => (
              <TouchableOpacity
                key={`${p.venture_id}-${p.id}`}
                style={[styles.postRow, { borderBottomColor: c.border }]}
                onPress={() => showPanel('venture-detail', { ventureId: p.venture_id })}
                activeOpacity={0.7}
              >
                <View style={styles.postMeta}>
                  <Text style={[styles.postVenture, { color: c.accent }]}>{p.venture_name}</Text>
                  <Text style={[styles.postDate, { color: c.muted }]}>
                    {new Date(p.created_at).toLocaleDateString('en-CA')}
                  </Text>
                </View>
                <Text style={[styles.postAuthor, { color: c.muted }]}>{p.display_name}</Text>
                <Text style={[styles.postBody, { color: c.text }]}>{p.body}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
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
  headerSpacer: { width: 28 },
  dorotkaTag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  dorotkaTagText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 2 },
  section: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  sectionLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase' },
  headline: { fontSize: 20, fontFamily: fonts.playfair, lineHeight: 28 },
  body: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22 },
  empty: { fontSize: 13, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  ventureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  ventureRowLeft: { flex: 1, gap: 3 },
  ventureName: { fontSize: 15, fontFamily: fonts.dmSans },
  ventureDesc: { fontSize: 12, fontFamily: fonts.dmSans },
  ventureArrow: { fontSize: 16 },
  postRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  postMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  postVenture: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  postDate: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  postAuthor: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  postBody: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 20 },
});
