import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchMyStats, updateDisplayName } from '../../lib/api';
import { useSocialAccess } from '../SocialGate';
import { getAverageVitaminCMgPerDay } from '../../lib/HealthKitService';


export default function MyProfilePanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const { active: socialActive, tier: socialTier, bankDays, lifetimeDays } = useSocialAccess();
  const [stats, setStats] = useState<any>(null);
  const [fundBalance, setFundBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [vitaminCNudge, setVitaminCNudge] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    fetchMyStats().catch(() => null).then(s => {
      setStats(s);
    }).finally(() => setLoading(false));

    getAverageVitaminCMgPerDay(7).then(avg => {
      if (avg < 50) setVitaminCNudge(true);
    }).catch(() => {});
  }, []);

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      await updateDisplayName(nameInput.trim());
      setStats((prev: any) => ({ ...prev, display_name: nameInput.trim() }));
      setEditingName(false);
    } catch {
      Alert.alert('Error', 'Could not save name.');
    } finally {
      setSavingName(false);
    }
  };

  const accessExpiringSoon = socialActive && bankDays <= 7;
  const TIER_LABELS: Record<string, string> = { standard: 'Standard', reserve: 'Reserve', estate: 'Estate' };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>PROFILE</Text>
        <TouchableOpacity onPress={() => showPanel('notifications')} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.notifIcon, { color: c.muted }]}>◉</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : !stats ? null : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Name / handle */}
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={[styles.nameInput, { color: c.text, borderBottomColor: c.border, fontFamily: fonts.playfair }]}
                  value={nameInput}
                  onChangeText={setNameInput}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                <TouchableOpacity onPress={handleSaveName} disabled={savingName} activeOpacity={0.7}>
                  <Text style={[styles.saveBtn, { color: c.accent, fontFamily: fonts.dmMono }]}>
                    {savingName ? '…' : 'SAVE'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingName(false)} activeOpacity={0.7}>
                  <Text style={[styles.saveBtn, { color: c.muted, fontFamily: fonts.dmMono }]}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => { setNameInput(stats.display_name ?? ''); setEditingName(true); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.name, { color: c.text }]}>{stats.display_name ?? stats.user_code}</Text>
              </TouchableOpacity>
            )}
            {stats.user_code && stats.display_name && (
              <Text style={[styles.code, { color: c.muted }]}>{stats.user_code}</Text>
            )}
            {socialActive && socialTier && (
              <Text style={[styles.tier, { color: c.accent }]}>
                {TIER_LABELS[socialTier] ?? socialTier}
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

          {/* Social access + fund */}
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>FUND BALANCE</Text>
            </View>
            <Text style={[styles.balance, { color: c.text }]}>
              CA${(fundBalance / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            {socialActive && (
              <Text style={[styles.renewalLine, { color: accessExpiringSoon ? c.accent : c.muted }]}>
                {accessExpiringSoon
                  ? `${bankDays}d remaining — tap a new box soon`
                  : `${bankDays} days remaining`}
              </Text>
            )}
            {socialActive && lifetimeDays > 0 && (
              <Text style={[styles.renewalLine, { color: c.muted }]}>
                {lifetimeDays} lifetime days accumulated
              </Text>
            )}
            {!socialActive && (
              <Text style={[styles.renewalLine, { color: c.muted }]}>No active access — tap a box to unlock</Text>
            )}
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
              onPress={() => showPanel('tasting-journal')}
              activeOpacity={0.7}
            >
              <Text style={[styles.navLabel, { color: c.text }]}>Tasting Journal</Text>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navRow, { borderBottomColor: c.border }]}
              onPress={() => showPanel('proposals')}
              activeOpacity={0.7}
            >
              <Text style={[styles.navLabel, { color: c.text }]}>Proposals</Text>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navRow, { borderBottomColor: c.border }]}
              onPress={() => showPanel('nomination-history')}
              activeOpacity={0.7}
            >
              <Text style={[styles.navLabel, { color: c.text }]}>Nomination History</Text>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
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
  notifIcon: { fontSize: 18, textAlign: 'right' },
  title: { fontSize: 11, letterSpacing: 1.5 },
  scroll: { paddingBottom: 60 },
  section: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 4,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  nameInput: { flex: 1, fontSize: 24, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  saveBtn: { fontSize: 11, letterSpacing: 1 },
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
  chevron: { fontSize: 14 },
  balance: { fontFamily: fonts.playfair, fontSize: 32, marginTop: 4 },
  renewalLine: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
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
    borderRadius: 12, borderWidth: 1, padding: SPACING.md, gap: 6,
  },
  nudgeTitle: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1.5 },
  nudgeSub: { fontFamily: fonts.dmSans, fontSize: 13, lineHeight: 20 },
  nudgeCta: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 1, marginTop: 4 },
});
