import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchUserMaps, fetchMap, saveUser, unsaveUser, checkUserSaved } from '../../lib/api';

const SHEET_NAME = 'main-sheet';

interface UserMap {
  id: number;
  name: string;
  description: string | null;
  entry_count: number;
}

export default function UserProfilePanel() {
  const { panelData, goBack, setCuratedMap, goHome } = usePanel();
  const c = useColors();

  const userId: number = panelData?.userId;
  const displayName: string = panelData?.displayName ?? 'user';

  const [maps, setMaps] = useState<UserMap[]>([]);
  const [saveCount, setSaveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savingInProgress, setSavingInProgress] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      fetchUserMaps(userId),
      checkUserSaved(userId),
    ]).then(([profileData, saveData]) => {
      const allMaps = profileData.maps ?? profileData;
      setMaps(allMaps.slice(0, 1)); // one map per user
      setSaveCount(profileData.save_count ?? 0);
      setSaved(saveData.saved);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  const handleSaveToggle = useCallback(async () => {
    setSavingInProgress(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (saved) {
        await unsaveUser(userId);
        setSaved(false);
      } else {
        await saveUser(userId);
        setSaved(true);
      }
    } catch {
      Alert.alert('Something went wrong', 'Try again.');
    } finally {
      setSavingInProgress(false);
    }
  }, [saved, userId]);

  const handleOpenMap = useCallback(async (map: UserMap) => {
    if (map.entry_count === 0) {
      Alert.alert('Empty map', 'This map has no locations yet.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { entries } = await fetchMap(map.id);
      const businessIds = entries.map((e: any) => e.id);
      setCuratedMap({
        mapId: map.id,
        name: map.name,
        authorName: displayName,
        businessIds,
      });
      goHome();
      setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 350);
    } catch {
      Alert.alert('Could not load map', 'Try again.');
    }
  }, [displayName, setCuratedMap, goHome]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.6}>
          <Text style={[styles.backText, { color: c.muted }]}>←</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.identity}>
        <View>
          <Text style={[styles.name, { color: c.text }]}>{displayName}</Text>
          {saveCount > 0 && (
            <Text style={[styles.saveCount, { color: c.muted }]}>{saveCount} {saveCount === 1 ? 'save' : 'saves'}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, { borderColor: saved ? c.accent : c.border }]}
          onPress={handleSaveToggle}
          disabled={savingInProgress}
          activeOpacity={0.7}
        >
          <Text style={[styles.saveBtnText, { color: saved ? c.accent : c.muted }]}>
            {saved ? 'saved' : 'save'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.divider, { backgroundColor: c.border }]} />

      <Text style={[styles.sectionLabel, { color: c.muted }]}>map</Text>

      {loading ? (
        <ActivityIndicator color={c.muted} style={{ marginTop: SPACING.lg }} />
      ) : maps.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>no map yet</Text>
      ) : (
        maps.map(map => (
          <TouchableOpacity
            key={map.id}
            style={[styles.mapRow, { borderBottomColor: c.border }]}
            onPress={() => handleOpenMap(map)}
            activeOpacity={0.75}
          >
            <View style={styles.mapBody}>
              <Text style={[styles.mapName, { color: c.text }]}>{map.name}</Text>
              {!!map.description && (
                <Text style={[styles.mapDesc, { color: c.muted }]} numberOfLines={1}>{map.description}</Text>
              )}
              <Text style={[styles.mapCount, { color: c.muted }]}>
                {map.entry_count} {map.entry_count === 1 ? 'place' : 'places'}
              </Text>
            </View>
            <Text style={[styles.arrow, { color: c.muted }]}>→</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  header: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontSize: 20 },
  identity: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  name: { fontSize: 28, fontFamily: fonts.playfair },
  saveCount: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1, marginTop: 4 },
  saveBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  saveBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md, marginBottom: SPACING.md },
  sectionLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  empty: { fontSize: 13, fontFamily: fonts.dmMono, paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  mapRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  mapBody: { flex: 1, gap: 3 },
  mapName: { fontSize: 17, fontFamily: fonts.playfair },
  mapDesc: { fontSize: 12, fontFamily: fonts.dmSans },
  mapCount: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  arrow: { fontSize: 16, paddingLeft: SPACING.sm },
});
