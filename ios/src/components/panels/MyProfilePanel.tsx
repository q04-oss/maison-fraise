import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, Alert, Image, Switch, Share,
} from 'react-native';

const MAP_BASE_URL = 'https://api.fraise.chat/map';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { useApp } from '../../../App';
import {
  fetchMyStats, updateDisplayName,
  deleteAuthToken, verifyAppleSignIn, setAuthToken,
  fetchReceivedGifts, fetchCreditBalance,
  fetchMyMaps, deleteMap,
  fetchMySaves, fetchMyFollowers, fetchFeedVisibility, setFeedVisibility,
  fetchPresenceFeed, fetchMyBusinessProposals,
  fetchMyBeacons, registerBeacon, deactivateBeacon,
  fetchMerchHistory, PopupMerchOrder,
  fetchMyFundContributions,
  fetchMyPopupInterest, submitPopupInterest, CommunityPopupInterest,
} from '../../lib/api';

function timeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return String(date.getHours());
  const days = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (days < 7) return ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][date.getDay()];
  return `${days}j`;
}

export default function MyProfilePanel() {
  const { goBack, showPanel, setOrder, setPanelData } = usePanel();
  const { unreadCount } = useApp();
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
  const [isShop, setIsShop] = useState(false);
  type BeaconRow = { id: number; uuid: string; major: number; minor: number; name: string | null; active: boolean };
  const [myBeacons, setMyBeacons] = useState<BeaconRow[]>([]);
  const [addingBeacon, setAddingBeacon] = useState(false);
  const [beaconUuid, setBeaconUuid] = useState('');
  const [beaconName, setBeaconName] = useState('');
  const [savingBeacon, setSavingBeacon] = useState(false);

  type SocialUser = { id: number; display_name: string; portrait_url: string | null; verified: boolean };
  const [followers, setFollowers] = useState<SocialUser[]>([]);
  const [mySaves, setMySaves] = useState<SocialUser[]>([]);
  const [feedVisible, setFeedVisibleState] = useState(false);
  const [togglingFeed, setTogglingFeed] = useState(false);
  const [feedEntries, setFeedEntries] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [merchSent, setMerchSent] = useState<PopupMerchOrder[]>([]);
  const [merchReceived, setMerchReceived] = useState<PopupMerchOrder[]>([]);
  const [fundTotalCents, setFundTotalCents] = useState(0);
  const [popupInterest, setPopupInterest] = useState<CommunityPopupInterest | null | undefined>(undefined);
  const [interestConcept, setInterestConcept] = useState('');
  const [interestNote, setInterestNote] = useState('');
  const [submittingInterest, setSubmittingInterest] = useState(false);
  const [showInterestForm, setShowInterestForm] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(['user_db_id', 'is_shop']).then(([idEntry, shopEntry]) => {
      const isIn = !!idEntry[1];
      setLoggedIn(isIn);
      const shop = shopEntry[1] === 'true';
      setIsShop(shop);
      if (isIn) loadStats(shop);
    }).finally(() => setLoading(false));
  }, []);

  const loadStats = (shop = isShop) => {
    setStatsLoading(true);
    fetchMyStats().catch(() => null).then(s => {
      setStats(s);
    }).finally(() => setStatsLoading(false));
    fetchReceivedGifts().then(g => setReceivedGifts(g)).catch(() => {});
    fetchCreditBalance().then(r => setCreditBalance(r.balance_cents)).catch(() => {});
    fetchMyMaps().then(m => setMaps(m)).catch(() => {});
    fetchMyFollowers().then(f => setFollowers(f)).catch(() => {});
    fetchMySaves().then(s => setMySaves(s)).catch(() => {});
    fetchFeedVisibility().then(v => setFeedVisibleState(v)).catch(() => {});
    fetchPresenceFeed().then(e => setFeedEntries(e)).catch(() => {});
    fetchMyBusinessProposals().then(p => setProposals(p)).catch(() => {});
    fetchMerchHistory().then(h => { setMerchSent(h.sent); setMerchReceived(h.received); }).catch(() => {});
    fetchMyFundContributions().then(r => setFundTotalCents(r.total_cents)).catch(() => {});
    if (shop) {
      fetchMyBeacons().then(b => setMyBeacons(b)).catch(() => {});
      fetchMyPopupInterest().then(i => setPopupInterest(i)).catch(() => {});
    }
  };

  const handleAddBeacon = async () => {
    const uuid = beaconUuid.trim().toUpperCase();
    if (!uuid) { Alert.alert('UUID required', 'Enter the beacon UUID.'); return; }
    setSavingBeacon(true);
    try {
      const b = await registerBeacon({ uuid, name: beaconName.trim() || undefined });
      setMyBeacons(prev => [...prev, b]);
      setBeaconUuid('');
      setBeaconName('');
      setAddingBeacon(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not register beacon.');
    } finally {
      setSavingBeacon(false);
    }
  };

  const handleRemoveBeacon = (id: number) => {
    Alert.alert('Remove beacon?', 'It will stop detecting visits.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await deactivateBeacon(id).catch(() => {});
        setMyBeacons(prev => prev.filter(b => b.id !== id));
      }},
    ]);
  };

  const handleSubmitInterest = async () => {
    setSubmittingInterest(true);
    try {
      await submitPopupInterest({ concept: interestConcept.trim() || undefined, note: interestNote.trim() || undefined });
      const updated = await fetchMyPopupInterest();
      setPopupInterest(updated);
      setShowInterestForm(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not submit.');
    } finally {
      setSubmittingInterest(false);
    }
  };

  const handleFeedToggle = useCallback(async (val: boolean) => {
    setTogglingFeed(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await setFeedVisibility(val);
      setFeedVisibleState(val);
    } catch {
      Alert.alert('Error', 'Could not update setting.');
    } finally {
      setTogglingFeed(false);
    }
  }, []);

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
      if (result.is_shop) await AsyncStorage.setItem('is_shop', 'true');
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

          {/* Community fund */}
          {fundTotalCents > 0 && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>COMMUNITY FUND</Text>
              <Text style={[styles.balance, { color: c.text }]}>CA${(fundTotalCents / 100).toFixed(2)}</Text>
              <Text style={[styles.subLine, { color: c.muted }]}>contributed to feeding people in the community</Text>
            </View>
          )}

          {/* Map — one per user, earned through visits */}
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>MY MAP</Text>
            {maps.length === 0 ? (
              <Text style={[styles.subLine, { color: c.muted }]}>
                visit a business 4 times to add it here
              </Text>
            ) : (
              maps.slice(0, 1).map(m => (
                <View key={m.id} style={[styles.mapRow, { borderTopColor: c.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mapName, { color: c.text }]}>{m.name}</Text>
                    <Text style={[styles.subLine, { color: c.muted }]}>{m.entry_count} {m.entry_count === 1 ? 'place' : 'places'}</Text>
                  </View>
                  {m.entry_count > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        AsyncStorage.getItem('user_db_id').then(id => {
                          if (!id) return;
                          Share.share({ message: `My map on Box Fraise`, url: `${MAP_BASE_URL}/${id}` }).catch(() => {});
                        });
                      }}
                      activeOpacity={0.6}
                    >
                      <Text style={[styles.actionBtn, { color: c.muted }]}>share →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Beacons — operator only */}
          {isShop && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <View style={styles.mapsHeader}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>BEACONS</Text>
                <TouchableOpacity onPress={() => setAddingBeacon(v => !v)} activeOpacity={0.7}>
                  <Text style={[styles.actionBtn, { color: c.accent }]}>{addingBeacon ? 'CANCEL' : '+ ADD'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.subLine, { color: c.muted }]}>
                Customers need 4 beacon detections to add you to their map
              </Text>
              {addingBeacon && (
                <View style={{ marginTop: 12, gap: 8 }}>
                  <TextInput
                    style={[styles.nameInput, { color: c.text, borderBottomColor: c.border, fontSize: 13, fontFamily: fonts.dmMono }]}
                    value={beaconUuid}
                    onChangeText={setBeaconUuid}
                    placeholder="UUID  (e.g. E2C56DB5-DFFB-48D2-B060-D0F5A71096E0)"
                    placeholderTextColor={c.muted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                  <View style={styles.editRow}>
                    <TextInput
                      style={[styles.nameInput, { flex: 1, color: c.text, borderBottomColor: c.border, fontSize: 14 }]}
                      value={beaconName}
                      onChangeText={setBeaconName}
                      placeholder="Label (optional)"
                      placeholderTextColor={c.muted}
                      returnKeyType="done"
                      onSubmitEditing={handleAddBeacon}
                    />
                    <TouchableOpacity onPress={handleAddBeacon} disabled={savingBeacon || !beaconUuid.trim()} activeOpacity={0.7}>
                      <Text style={[styles.actionBtn, { color: c.accent }]}>{savingBeacon ? '…' : 'SAVE'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {myBeacons.length === 0 && !addingBeacon && (
                <Text style={[styles.subLine, { color: c.muted, marginTop: 4 }]}>no beacons registered</Text>
              )}
              {myBeacons.map(b => (
                <View key={b.id} style={[styles.mapRow, { borderTopColor: c.border }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.subLine, { color: c.text, fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 0.5 }]}>{b.uuid}</Text>
                    {b.name && <Text style={[styles.subLine, { color: c.muted }]}>{b.name}</Text>}
                    {!b.active && <Text style={[styles.subLine, { color: c.muted }]}>inactive</Text>}
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveBeacon(b.id)} activeOpacity={0.6}>
                    <Text style={[styles.actionBtn, { color: c.muted }]}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Community popup interest — shop only */}
          {isShop && popupInterest !== undefined && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <View style={styles.mapsHeader}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>COMMUNITY POPUP</Text>
                {!popupInterest && (
                  <TouchableOpacity onPress={() => setShowInterestForm(v => !v)} activeOpacity={0.7}>
                    <Text style={[styles.actionBtn, { color: c.accent }]}>{showInterestForm ? 'CANCEL' : 'I\'M INTERESTED'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.subLine, { color: c.muted }]}>
                Express interest in cooking a free meal for the community
              </Text>

              {popupInterest ? (
                <View style={{ marginTop: 8, gap: 4 }}>
                  {popupInterest.concept && (
                    <Text style={[styles.subLine, { color: c.text }]}>{popupInterest.concept}</Text>
                  )}
                  <View style={[styles.statusBadge, { borderColor: popupInterest.status === 'contacted' ? c.accent : c.border, alignSelf: 'flex-start', marginTop: 4 }]}>
                    <Text style={[styles.statusText, { color: popupInterest.status === 'contacted' ? c.accent : c.muted }]}>
                      {popupInterest.status === 'pending' ? 'in the queue' : popupInterest.status === 'contacted' ? 'we\'ll be in touch' : 'done'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => { setInterestConcept(popupInterest.concept ?? ''); setInterestNote(popupInterest.note ?? ''); setShowInterestForm(true); setPopupInterest(null); }} activeOpacity={0.6}>
                    <Text style={[styles.actionBtn, { color: c.muted, marginTop: 6 }]}>edit →</Text>
                  </TouchableOpacity>
                </View>
              ) : showInterestForm ? (
                <View style={{ marginTop: 12, gap: 10 }}>
                  <TextInput
                    style={[styles.nameInput, { color: c.text, borderBottomColor: c.border, fontSize: 14 }]}
                    value={interestConcept}
                    onChangeText={setInterestConcept}
                    placeholder="your concept (e.g. smash burgers, jerk chicken)"
                    placeholderTextColor={c.muted}
                    autoCapitalize="sentences"
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[styles.nameInput, { color: c.text, borderBottomColor: c.border, fontSize: 13 }]}
                    value={interestNote}
                    onChangeText={setInterestNote}
                    placeholder="anything else we should know (optional)"
                    placeholderTextColor={c.muted}
                    autoCapitalize="sentences"
                    returnKeyType="done"
                    onSubmitEditing={handleSubmitInterest}
                  />
                  <TouchableOpacity onPress={handleSubmitInterest} disabled={submittingInterest} activeOpacity={0.7}>
                    <Text style={[styles.actionBtn, { color: c.accent }]}>{submittingInterest ? '…' : 'SUBMIT'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}

          {/* Audience */}
          {(followers.length > 0 || mySaves.length > 0) && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              {followers.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: c.muted }]}>SAVED BY</Text>
                  <View style={styles.socialRow}>
                    {followers.slice(0, 12).map(u => (
                      <TouchableOpacity
                        key={u.id}
                        style={styles.socialChip}
                        onPress={() => { showPanel('user-profile', { userId: u.id, displayName: u.display_name }); }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.socialAvatar, { backgroundColor: c.border }]}>
                          {u.portrait_url
                            ? <Image source={{ uri: u.portrait_url }} style={styles.socialAvatarImg} />
                            : <Text style={[styles.socialAvatarInitial, { color: c.muted }]}>{(u.display_name?.[0] ?? '?').toUpperCase()}</Text>}
                        </View>
                        <Text style={[styles.socialName, { color: c.muted }]} numberOfLines={1}>{u.display_name}</Text>
                      </TouchableOpacity>
                    ))}
                    {followers.length > 12 && (
                      <Text style={[styles.subLine, { color: c.muted }]}>+{followers.length - 12} more</Text>
                    )}
                  </View>
                </>
              )}
              {mySaves.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: c.muted, marginTop: followers.length > 0 ? 12 : 0 }]}>FOLLOWING</Text>
                  <View style={styles.socialRow}>
                    {mySaves.slice(0, 12).map(u => (
                      <TouchableOpacity
                        key={u.id}
                        style={styles.socialChip}
                        onPress={() => { showPanel('user-profile', { userId: u.id, displayName: u.display_name }); }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.socialAvatar, { backgroundColor: c.border }]}>
                          {u.portrait_url
                            ? <Image source={{ uri: u.portrait_url }} style={styles.socialAvatarImg} />
                            : <Text style={[styles.socialAvatarInitial, { color: c.muted }]}>{(u.display_name?.[0] ?? '?').toUpperCase()}</Text>}
                        </View>
                        <Text style={[styles.socialName, { color: c.muted }]} numberOfLines={1}>{u.display_name}</Text>
                      </TouchableOpacity>
                    ))}
                    {mySaves.length > 12 && (
                      <Text style={[styles.subLine, { color: c.muted }]}>+{mySaves.length - 12} more</Text>
                    )}
                  </View>
                </>
              )}
            </View>
          )}

          {/* Presence feed */}
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <View style={styles.feedHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>SHARE MY VISITS</Text>
                <Text style={[styles.subLine, { color: c.muted, marginTop: 4 }]}>
                  Let people you save see where you've been
                </Text>
              </View>
              <Switch
                value={feedVisible}
                onValueChange={handleFeedToggle}
                disabled={togglingFeed}
                trackColor={{ true: c.accent }}
              />
            </View>
            {feedEntries.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: c.muted, marginTop: 12 }]}>THEIR VISITS</Text>
                {feedEntries.slice(0, 8).map((e: any) => {
                  const when = timeAgo(e.created_at);
                  return (
                    <View key={e.order_id} style={[styles.feedRow, { borderTopColor: c.border }]}>
                      <Text style={[styles.feedName, { color: c.text }]}>{e.display_name}</Text>
                      <Text style={[styles.feedPlace, { color: c.muted }]}>
                        {e.business_name}{e.neighbourhood ? `  ·  ${e.neighbourhood}` : ''}
                      </Text>
                      <Text style={[styles.feedWhen, { color: c.muted }]}>{when}</Text>
                    </View>
                  );
                })}
              </>
            )}
          </View>

          {/* Merch */}
          {(merchSent.filter(o => o.status === 'paid').length > 0 || merchReceived.length > 0) && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>MERCH</Text>
              {merchSent.filter(o => o.status === 'paid').map(o => (
                <View key={o.id} style={[styles.merchRow, { borderTopColor: c.border }]}>
                  <Text style={[styles.merchItem, { color: c.text }]}>{o.item_name}{o.size ? ` · ${o.size}` : ''}</Text>
                  <Text style={[styles.merchMeta, { color: c.muted }]}>
                    {o.donated ? 'donated' : o.recipient_user_id ? `gifted to ${o.recipient_name ?? 'someone'}` : 'kept'}
                  </Text>
                </View>
              ))}
              {merchReceived.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: c.muted, marginTop: 10 }]}>RECEIVED</Text>
                  {merchReceived.map(o => (
                    <View key={o.id} style={[styles.merchRow, { borderTopColor: c.border }]}>
                      <Text style={[styles.merchItem, { color: c.text }]}>{o.item_name}{o.size ? ` · ${o.size}` : ''}</Text>
                      <Text style={[styles.merchMeta, { color: c.muted }]}>from {o.buyer_name ?? 'someone'}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* Nominations */}
          {proposals.length > 0 && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>NOMINATIONS</Text>
              {proposals.map((p: any) => (
                <View key={p.id} style={[styles.proposalRow, { borderTopColor: c.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.proposalName, { color: c.text }]}>{p.business_name}</Text>
                    {!!p.business_address && (
                      <Text style={[styles.subLine, { color: c.muted }]}>{p.business_address}</Text>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { borderColor: p.status === 'interested' ? c.accent : c.border }]}>
                    <Text style={[styles.statusText, { color: p.status === 'interested' ? c.accent : c.muted }]}>
                      {p.status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Nav */}
          <View>
            <TouchableOpacity style={[styles.navRow, { borderBottomColor: c.border }]} onPress={() => showPanel('conversations')} activeOpacity={0.7}>
              <View style={styles.navLabelRow}>
                <Text style={[styles.navLabel, { color: c.text }]}>Strawberry Chat</Text>
                {unreadCount > 0 && (
                  <View style={[styles.unreadBadge, { backgroundColor: c.text }]}>
                    <Text style={[styles.unreadText, { color: c.sheetBg }]}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.navChevron, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
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
  navLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unreadBadge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  unreadText: { fontSize: 9, fontFamily: fonts.dmMono },
  navChevron: { fontSize: 18 },

  // Social / audience
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  socialChip: { alignItems: 'center', gap: 4, width: 52 },
  socialAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  socialAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  socialAvatarInitial: { fontSize: 15, fontFamily: fonts.dmMono },
  socialName: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 0.3, textAlign: 'center' },

  // Feed
  feedHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  feedRow: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, gap: 2 },
  feedName: { fontFamily: fonts.playfair, fontSize: 14 },
  feedPlace: { fontFamily: fonts.dmSans, fontSize: 12 },
  feedWhen: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 0.5, marginTop: 2 },

  // Merch
  merchRow: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, gap: 2 },
  merchItem: { fontFamily: fonts.dmSans, fontSize: 14 },
  merchMeta: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 0.5 },

  // Nominations
  proposalRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  proposalName: { fontFamily: fonts.dmSans, fontSize: 15 },
  statusBadge: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  statusText: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
});
