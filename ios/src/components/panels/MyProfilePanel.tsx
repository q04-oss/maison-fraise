import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, Alert, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import {
  fetchMyStats, updateDisplayName,
  deleteAuthToken, verifyAppleSignIn, setAuthToken,
  fetchReceivedGifts, fetchCreditBalance,
  fetchMyMaps, createMap, deleteMap,
} from '../../lib/api';

export default function MyProfilePanel() {
  const { goBack, showPanel, setOrder, setPanelData } = usePanel();
  const c = useColors();

  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [receivedGifts, setReceivedGifts] = useState<{ id: number; gift_type: string; claimed_at: string; sticker_emoji: string | null; sticker_image_url: string | null; business_name: string | null }[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [creditBalance, setCreditBalance] = useState(0);

  const [maps, setMaps] = useState<{ id: number; name: string; description: string | null; entry_count: number }[]>([]);
  const [creatingMap, setCreatingMap] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [savingMap, setSavingMap] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(id => {
      const isIn = !!id;
      setLoggedIn(isIn);
      if (isIn) loadStats();
    }).finally(() => setLoading(false));
  }, []);

  const loadStats = () => {
    setStatsLoading(true);
    fetchMyStats().catch(() => null).then(s => {
      setStats(s);
    }).finally(() => setStatsLoading(false));
    fetchReceivedGifts().then(g => setReceivedGifts(g)).catch(() => {});
    fetchCreditBalance().then(r => setCreditBalance(r.balance_cents)).catch(() => {});
    fetchMyMaps().then(m => setMaps(m)).catch(() => {});
  };

  const handleCreateMap = async () => {
    if (!newMapName.trim()) return;
    setSavingMap(true);
    try {
      const created = await createMap(newMapName.trim());
      setMaps(prev => [created, ...prev]);
      setNewMapName('');
      setCreatingMap(false);
    } catch {
      Alert.alert('Error', 'Could not create map.');
    } finally {
      setSavingMap(false);
    }
  };

  const handleDeleteMap = (mapId: number, mapName: string) => {
    Alert.alert(`Delete "${mapName}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteMap(mapId);
            setMaps(prev => prev.filter(m => m.id !== mapId));
          } catch {
            Alert.alert('Error', 'Could not delete map.');
          }
        },
      },
    ]);
  };

  const handleAppleSignIn = async () => {
    setSigningIn(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token');
      const result = await verifyAppleSignIn({
        identityToken: credential.identityToken,
        firstName: credential.fullName?.givenName ?? undefined,
        lastName: credential.fullName?.familyName ?? undefined,
        email: credential.email ?? undefined,
      });
      await AsyncStorage.setItem('user_db_id', String(result.user_id));
      await setAuthToken(result.token);
      if (result.display_name) await AsyncStorage.setItem('display_name', result.display_name);
      if (result.verified) await AsyncStorage.setItem('verified', 'true');
      setLoggedIn(true);
      loadStats();
      setPanelData({ signedIn: true });
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed', e.message ?? 'Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You\'ll need to sign in again to place orders.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await AsyncStorage.multiRemove(['user_email', 'user_db_id', 'verified', 'is_dj', 'fraise_chat_email', 'display_name', 'is_shop']);
          await deleteAuthToken();
          setOrder({ customer_email: '' });
          setLoggedIn(false);
          setStats(null);
        },
      },
    ]);
  };

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

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <ActivityIndicator color={c.accent} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>PROFILE</Text>
        <View style={styles.backBtn} />
      </View>

      {!loggedIn ? (
        <View style={styles.signInBody}>
          <Text style={[styles.signInHeading, { color: c.text }]}>Sign in to Box Fraise</Text>
          <Text style={[styles.signInSub, { color: c.muted }]}>Place orders, track pickups, and earn rewards.</Text>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleBtn}
            onPress={handleAppleSignIn}
          />
          {signingIn && <ActivityIndicator color={c.accent} style={{ marginTop: 16 }} />}
        </View>
      ) : statsLoading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Name */}
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            {editingName ? (
              <View style={styles.editRow}>
                <TextInput
                  style={[styles.nameInput, { color: c.text, borderBottomColor: c.border }]}
                  value={nameInput}
                  onChangeText={setNameInput}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                <TouchableOpacity onPress={handleSaveName} disabled={savingName} activeOpacity={0.7}>
                  <Text style={[styles.actionBtn, { color: c.accent }]}>{savingName ? '…' : 'SAVE'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingName(false)} activeOpacity={0.7}>
                  <Text style={[styles.actionBtn, { color: c.muted }]}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { setNameInput(stats?.display_name ?? ''); setEditingName(true); }} activeOpacity={0.8}>
                <Text style={[styles.name, { color: c.text }]}>{stats?.display_name ?? stats?.user_code ?? '—'}</Text>
              </TouchableOpacity>
            )}
            {stats?.user_code && stats?.display_name && (
              <Text style={[styles.code, { color: c.muted }]}>{stats.user_code}</Text>
            )}
          </View>

          {/* Streak */}
          {stats?.current_streak_weeks > 0 && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>STREAK</Text>
              <Text style={[styles.balance, { color: c.text }]}>{stats.current_streak_weeks}w</Text>
              <Text style={[styles.subLine, { color: c.muted }]}>
                {stats.longest_streak_weeks > stats.current_streak_weeks
                  ? `Personal best: ${stats.longest_streak_weeks} weeks`
                  : 'Current personal best'}
              </Text>
            </View>
          )}

          {/* Sticker collection */}
          {receivedGifts.length > 0 && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>STICKERS</Text>
              <View style={styles.stickerRow}>
                {receivedGifts.map(g => (
                  <View key={g.id} style={styles.stickerItem}>
                    {g.sticker_image_url ? (
                      <Image source={{ uri: g.sticker_image_url }} style={styles.stickerImg} />
                    ) : (
                      <Text style={styles.stickerEmoji}>{g.sticker_emoji ?? '🍓'}</Text>
                    )}
                    {g.business_name ? (
                      <Text style={[styles.stickerLabel, { color: c.muted }]} numberOfLines={1}>{g.business_name}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Credit balance */}
          {creditBalance > 0 && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>CREDIT</Text>
              <Text style={[styles.balance, { color: c.text }]}>CA${(creditBalance / 100).toFixed(2)}</Text>
              <Text style={[styles.subLine, { color: c.muted }]}>Applies automatically at checkout</Text>
            </View>
          )}

          {/* Maps */}
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <View style={styles.mapsHeader}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>MAPS</Text>
              <TouchableOpacity onPress={() => setCreatingMap(v => !v)} activeOpacity={0.7}>
                <Text style={[styles.actionBtn, { color: c.accent }]}>{creatingMap ? 'CANCEL' : '+ NEW'}</Text>
              </TouchableOpacity>
            </View>
            {creatingMap && (
              <View style={styles.editRow}>
                <TextInput
                  style={[styles.nameInput, { color: c.text, borderBottomColor: c.border, fontSize: 16 }]}
                  value={newMapName}
                  onChangeText={setNewMapName}
                  placeholder="map name"
                  placeholderTextColor={c.muted}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreateMap}
                />
                <TouchableOpacity onPress={handleCreateMap} disabled={savingMap || !newMapName.trim()} activeOpacity={0.7}>
                  <Text style={[styles.actionBtn, { color: c.accent }]}>{savingMap ? '…' : 'SAVE'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {maps.length === 0 && !creatingMap && (
              <Text style={[styles.subLine, { color: c.muted }]}>no maps yet</Text>
            )}
            {maps.map(m => (
              <View key={m.id} style={[styles.mapRow, { borderTopColor: c.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mapName, { color: c.text }]}>{m.name}</Text>
                  <Text style={[styles.subLine, { color: c.muted }]}>{m.entry_count} {m.entry_count === 1 ? 'place' : 'places'}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteMap(m.id, m.name)} activeOpacity={0.6}>
                  <Text style={[styles.actionBtn, { color: c.muted }]}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Nav */}
          <View>
            <TouchableOpacity style={[styles.navRow, { borderBottomColor: c.border }]} onPress={() => showPanel('send-credit')} activeOpacity={0.7}>
              <Text style={[styles.navLabel, { color: c.text }]}>Send Credit</Text>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navRow, { borderBottomColor: c.border }]} onPress={() => showPanel('merch')} activeOpacity={0.7}>
              <Text style={[styles.navLabel, { color: c.text }]}>Shop</Text>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navRow, { borderBottomColor: c.border }]} onPress={() => showPanel('order-history')} activeOpacity={0.7}>
              <Text style={[styles.navLabel, { color: c.text }]}>Order History</Text>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navRow, { borderBottomColor: c.border }]} onPress={() => showPanel('batch-preference')} activeOpacity={0.7}>
              <Text style={[styles.navLabel, { color: c.text }]}>Batch Preferences</Text>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navRow, { borderBottomColor: c.border }]} onPress={handleSignOut} activeOpacity={0.7}>
              <Text style={[styles.navLabel, { color: c.muted }]}>Sign Out</Text>
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
    paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40 },
  backText: { fontSize: 22 },
  notifIcon: { fontSize: 18, textAlign: 'right' },
  title: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  scroll: { paddingBottom: 60 },

  signInBody: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.lg, gap: 12,
  },
  signInHeading: { fontSize: 22, fontFamily: fonts.playfair, textAlign: 'center' },
  signInSub: { fontSize: 13, fontFamily: fonts.dmSans, textAlign: 'center', lineHeight: 20 },
  appleBtn: { width: '100%', height: 50, marginTop: 8 },

  section: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 4,
  },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  nameInput: { flex: 1, fontSize: 24, fontFamily: fonts.playfair, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  actionBtn: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1 },
  name: { fontFamily: fonts.playfair, fontSize: 28 },
  code: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 1 },
  sectionLabel: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 1.5 },
  balance: { fontFamily: fonts.playfair, fontSize: 32, marginTop: 4 },
  subLine: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 0.5, marginTop: 2 },

  stickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  stickerItem: { alignItems: 'center', gap: 4, width: 56 },
  stickerEmoji: { fontSize: 28 },
  stickerImg: { width: 52, height: 52, borderRadius: 6 },
  stickerLabel: { fontFamily: fonts.dmMono, fontSize: 8, letterSpacing: 0.3, textAlign: 'center' },
  mapsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  mapRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  mapName: { fontFamily: fonts.dmSans, fontSize: 15 },
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navLabel: { fontFamily: fonts.dmSans, fontSize: 15 },
  navChevron: { fontSize: 18 },
});
