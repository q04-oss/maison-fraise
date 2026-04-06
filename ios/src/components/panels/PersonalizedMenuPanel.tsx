import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { generatePersonalizedMenu, fetchLatestPersonalizedMenu } from '../../lib/api';

export default function PersonalizedMenuPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();

  const businessId: number | undefined = panelData?.businessId;
  const businessName: string = panelData?.businessName ?? 'this restaurant';

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [menuData, setMenuData] = useState<any>(null); // { courses, generated_at, valid_until }

  const load = async () => {
    setLoading(true);
    try {
      const latest = await fetchLatestPersonalizedMenu(businessId);
      // Treat as fresh if generated within last 4 hours
      if (latest && latest.generated_at) {
        const age = Date.now() - new Date(latest.generated_at).getTime();
        if (age < 4 * 60 * 60 * 1000) { setMenuData(latest); setLoading(false); return; }
      }
      setMenuData(null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (businessId === undefined) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: c.muted, fontFamily: fonts.dmSans, fontSize: 14 }}>No restaurant selected.</Text>
        <TouchableOpacity onPress={goBack} style={{ marginTop: 16 }}>
          <Text style={{ color: c.accent, fontFamily: fonts.dmMono, fontSize: 13 }}>← back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generatePersonalizedMenu(businessId);
      // result.menus is an array; take the first (requesting user's)
      const mine = result.menus?.[0];
      if (mine) setMenuData({ courses: mine.courses, generated_at: new Date().toISOString(), valid_until: mine.valid_until });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not generate menu.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Your Menu</Text>
        <View style={styles.spacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : menuData ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.topRow]}>
            <Text style={[styles.bizName, { color: c.muted }]}>{businessName.toUpperCase()}</Text>
            <Text style={[styles.timestamp, { color: c.muted }]}>
              {new Date(menuData.generated_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>

          {(menuData.courses as any[]).map((course: any, i: number) => (
            <View key={i} style={[styles.courseCard, { borderBottomColor: c.border }]}>
              <Text style={[styles.courseLabel, { color: c.accent }]}>{course.course.toUpperCase()}</Text>
              <Text style={[styles.courseDish, { color: c.text }]}>{course.dish}</Text>
              <Text style={[styles.courseRationale, { color: c.muted }]}>{course.rationale}</Text>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.regenerateBtn, { borderColor: c.border }]}
            onPress={handleGenerate}
            disabled={generating}
            activeOpacity={0.7}
          >
            <Text style={[styles.regenerateBtnText, { color: c.muted }]}>
              {generating ? 'regenerating…' : 'regenerate from latest readings →'}
            </Text>
          </TouchableOpacity>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No menu yet</Text>
          <Text style={[styles.emptyHint, { color: c.muted }]}>
            Dorotka will build a tasting menu calibrated to your biometrics and flavour profile.
            {'\n\n'}Each course is chosen for what your body needs right now.
          </Text>
          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: c.accent }, generating && { opacity: 0.5 }]}
            onPress={handleGenerate}
            disabled={generating}
            activeOpacity={0.8}
          >
            {generating
              ? <ActivityIndicator color={c.ctaText ?? '#fff'} />
              : <Text style={[styles.generateBtnText, { color: c.ctaText ?? '#fff' }]}>Build My Menu</Text>
            }
          </TouchableOpacity>
        </View>
      )}
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
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.playfair, textAlign: 'center' },
  spacer: { width: 40 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  bizName: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2 },
  timestamp: { fontSize: 9, fontFamily: fonts.dmMono },
  courseCard: {
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  courseLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2 },
  courseDish: { fontSize: 16, fontFamily: fonts.playfair, lineHeight: 24 },
  courseRationale: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 18 },
  regenerateBtn: { marginTop: SPACING.lg, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  regenerateBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, paddingBottom: 60 },
  emptyTitle: { fontSize: 22, fontFamily: fonts.playfair, marginBottom: 12, textAlign: 'center' },
  emptyHint: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, textAlign: 'center', marginBottom: SPACING.xl },
  generateBtn: { borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', minWidth: 200 },
  generateBtnText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 1 },
});
