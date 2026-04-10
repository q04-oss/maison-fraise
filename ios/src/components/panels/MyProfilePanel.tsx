import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchMyStats, updateDisplayName } from '../../lib/api';

export default function MyProfilePanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    fetchMyStats().catch(() => null).then(s => {
      setStats(s);
    }).finally(() => setLoading(false));
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
          </View>

          {/* Streak */}
          {stats?.current_streak_weeks != null && stats.current_streak_weeks > 0 && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>STREAK</Text>
              <Text style={[styles.balance, { color: c.text }]}>{stats.current_streak_weeks}w</Text>
              <Text style={[styles.renewalLine, { color: c.muted }]}>
                {stats.longest_streak_weeks > stats.current_streak_weeks
                  ? `Personal best: ${stats.longest_streak_weeks} weeks`
                  : 'Current personal best'}
              </Text>
            </View>
          )}

          {/* Nav */}
          <View style={styles.navList}>
            <TouchableOpacity
              style={[styles.navRow, { borderBottomColor: c.border }]}
              onPress={() => showPanel('order-history')}
              activeOpacity={0.7}
            >
              <Text style={[styles.navLabel, { color: c.text }]}>Order History</Text>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navRow, { borderBottomColor: c.border }]}
              onPress={() => showPanel('batch-preference')}
              activeOpacity={0.7}
            >
              <Text style={[styles.navLabel, { color: c.text }]}>Batch Preferences</Text>
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
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  nameInput: { flex: 1, fontSize: 24, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  saveBtn: { fontSize: 11, letterSpacing: 1 },
  name: { fontFamily: fonts.playfair, fontSize: 28 },
  code: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 1 },
  sectionLabel: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 1.5 },
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
});
