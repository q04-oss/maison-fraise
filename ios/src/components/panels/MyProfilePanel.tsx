import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchMyStats } from '../../lib/api';
import { getAverageVitaminCMgPerDay } from '../../lib/HealthKitService';

export default function MyProfilePanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [vitaminCNudge, setVitaminCNudge] = useState(false);

  useEffect(() => {
    fetchMyStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
    getAverageVitaminCMgPerDay(7).then(avg => {
      if (avg < 50) setVitaminCNudge(true);
    }).catch(() => {});
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>PROFILE</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : !stats ? null : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Name / handle */}
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.name, { color: c.text }]}>{stats.display_name ?? stats.user_code}</Text>
            {stats.user_code && stats.display_name && (
              <Text style={[styles.code, { color: c.muted }]}>{stats.user_code}</Text>
            )}
            {stats.membership_tier && (
              <Text style={[styles.tier, { color: c.accent }]}>
                {stats.membership_tier.charAt(0).toUpperCase() + stats.membership_tier.slice(1)} member
              </Text>
            )}
          </View>

          {/* Stats row */}
          <View style={[styles.statsRow, { borderBottomColor: c.border }]}>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: c.text }]}>{stats.evening_count}</Text>
              <Text style={[styles.statLabel, { color: c.muted }]}>EVENINGS</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: c.text }]}>{stats.portrait_count}</Text>
              <Text style={[styles.statLabel, { color: c.muted }]}>PORTRAITS</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: c.text }]}>{stats.nfc_connection_count}</Text>
              <Text style={[styles.statLabel, { color: c.muted }]}>CONNECTIONS</Text>
            </View>
          </View>

          {/* Vitamin C nudge */}
          {vitaminCNudge && (
            <View style={[styles.nudgeCard, { borderColor: c.accent, backgroundColor: c.card }]}>
              <Text style={[styles.nudgeTitle, { color: c.text }]}>YOUR VITAMIN C HAS BEEN LOW THIS WEEK</Text>
              <Text style={[styles.nudgeSub, { color: c.muted }]}>Plain strawberries are one of the richest sources.</Text>
              <TouchableOpacity onPress={() => showPanel('standing-order')} activeOpacity={0.7}>
                <Text style={[styles.nudgeCta, { color: c.accent }]}>order plain strawberries →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Ad balance / earnings */}
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>AD EARNINGS BALANCE</Text>
            <Text style={[styles.balance, { color: c.text }]}>
              CA${((stats.ad_balance_cents ?? 0) / 100).toFixed(2)}
            </Text>
          </View>

          {/* Quick nav */}
          <View style={styles.navList}>
            {stats.evening_count > 0 && (
              <TouchableOpacity
                style={[styles.navRow, { borderBottomColor: c.border }]}
                onPress={() => showPanel('evening-tokens')}
                activeOpacity={0.7}
              >
                <Text style={[styles.navLabel, { color: c.text }]}>Evenings</Text>
                <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
              </TouchableOpacity>
            )}
            {stats.portrait_count > 0 && (
              <TouchableOpacity
                style={[styles.navRow, { borderBottomColor: c.border }]}
                onPress={() => showPanel('portrait-tokens')}
                activeOpacity={0.7}
              >
                <Text style={[styles.navLabel, { color: c.text }]}>Portrait Tokens</Text>
                <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.navRow, { borderBottomColor: c.border }]}
              onPress={() => showPanel('portrait-feed')}
              activeOpacity={0.7}
            >
              <Text style={[styles.navLabel, { color: c.text }]}>Portrait Feed</Text>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navRow, { borderBottomColor: c.border }]}
              onPress={() => showPanel('discovery')}
              activeOpacity={0.7}
            >
              <Text style={[styles.navLabel, { color: c.text }]}>Discover</Text>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
          </View>
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
  scroll: { paddingBottom: 60 },
  section: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 4,
  },
  name: { fontFamily: fonts.playfair, fontSize: 28 },
  code: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 1 },
  tier: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1.5, marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontFamily: fonts.playfair, fontSize: 28 },
  statLabel: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 1.5, marginTop: 2 },
  sectionLabel: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 1.5 },
  balance: { fontFamily: fonts.playfair, fontSize: 32, marginTop: 4 },
  navList: {},
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navLabel: { fontFamily: fonts.dmSans, fontSize: 15 },
  navChevron: { fontSize: 18 },
  nudgeCard: {
    marginHorizontal: SPACING.md, marginVertical: SPACING.sm,
    borderRadius: 12, borderWidth: 1,
    padding: SPACING.md, gap: 6,
  },
  nudgeTitle: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1.5 },
  nudgeSub: { fontFamily: fonts.dmSans, fontSize: 13, lineHeight: 20 },
  nudgeCta: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 1, marginTop: 4 },
});
