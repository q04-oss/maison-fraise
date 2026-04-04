import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useApp } from '../../../App';
import { usePanel } from '../../context/PanelContext';
import {
  verifyAppleSignIn, setAuthToken,
  fetchOrdersByEmail,
  demoLogin, updateDisplayName,
} from '../../lib/api';
import { CHOCOLATES, FINISHES } from '../../data/seed';
import { useColors, fonts, SPACING } from '../../theme';
import { TrueSheet } from '@lodev09/react-native-true-sheet';

export default function ProfilePanel() {
  const { goHome, jumpToPanel, showPanel, setOrder, setActiveLocation, varieties, businesses } = usePanel();
  const { pushToken } = useApp();
  const c = useColors();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [fraiseChatEmail, setFraiseChatEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [editingName, setEditingName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('user_email'),
      AsyncStorage.getItem('verified'),
      AsyncStorage.getItem('user_db_id'),
      AsyncStorage.getItem('fraise_chat_email'),
      AsyncStorage.getItem('display_name'),
    ]).then(([email, verified, dbId, chatEmail, name]) => {
      setIsVerified(verified === 'true');
      if (dbId) setUserDbId(parseInt(dbId, 10));
      if (chatEmail) setFraiseChatEmail(chatEmail);
      if (name) setDisplayName(name);
      if (email) {
        setUserEmail(email);
        fetchOrdersByEmail()
          .then((orders: any[]) => {
            const paid = orders
              .filter((o: any) => o.status === 'paid' || o.status === 'confirmed')
              .sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
            setRecentOrders(paid.slice(0, 5));
          })
          .catch(() => {});
      }
    }).finally(() => setLoading(false));
  }, []);

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
      setUserDbId(result.user_id);
      if (result.verified) {
        await AsyncStorage.setItem('verified', 'true');
        setIsVerified(true);
      }
      if (result.fraise_chat_email) {
        await AsyncStorage.setItem('fraise_chat_email', result.fraise_chat_email);
        setFraiseChatEmail(result.fraise_chat_email);
      }
      if (result.display_name) {
        await AsyncStorage.setItem('display_name', result.display_name);
        setDisplayName(result.display_name);
      }
      const email = credential.email ?? result.email ?? null;
      if (email) {
        await AsyncStorage.setItem('user_email', email);
        setUserEmail(email);
        fetchOrdersByEmail()
          .then((orders: any[]) => {
            const paid = orders
              .filter((o: any) => o.status === 'paid' || o.status === 'confirmed')
              .sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
            setRecentOrders(paid.slice(0, 5));
          })
          .catch(() => {});
      }
      if (pushToken) {
        const { updatePushToken } = await import('../../lib/api');
        updatePushToken(pushToken).catch(() => {});
      }
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED' && !userDbId) {
        Alert.alert('Sign in failed', 'Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleDemoLogin = async () => {
    setSigningIn(true);
    try {
      const result = await demoLogin();
      await AsyncStorage.setItem('user_db_id', String(result.user_id));
      await AsyncStorage.setItem('user_email', 'demo@maison-fraise.com');
      await setAuthToken(result.token);
      setUserDbId(result.user_id);
      setUserEmail('demo@maison-fraise.com');
      if (pushToken) {
        const { updatePushToken } = await import('../../lib/api');
        updatePushToken(pushToken).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Demo unavailable', String(e?.message ?? e));
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You\'ll need to sign in again to place orders.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await AsyncStorage.multiRemove(['user_email', 'user_db_id', 'verified', 'is_dj', 'auth_token', 'fraise_chat_email', 'display_name']);
          setUserEmail(null);
          setUserDbId(null);
          setIsVerified(false);
          setFraiseChatEmail(null);
          setDisplayName('');
          setRecentOrders([]);
          setOrder({ customer_email: '' });
        },
      },
    ]);
  };

  const handleSaveName = async (name: string) => {
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed) return;
    setDisplayName(trimmed);
    await AsyncStorage.setItem('display_name', trimmed);
    updateDisplayName(trimmed).catch(() => {});
  };

  const lastOrder = recentOrders[0] ?? null;

  const handleOrderAgain = () => {
    if (!lastOrder) return;
    const variety = varieties.find(v => v.id === lastOrder.variety_id);
    if (!variety) {
      Alert.alert('Not available', 'That variety isn\'t available today.');
      return;
    }
    const business = businesses.find(b => b.id === lastOrder.location_id);
    const chocName = CHOCOLATES.find(choc => choc.id === lastOrder.chocolate)?.name ?? lastOrder.chocolate ?? null;
    const finName = FINISHES.find(f => f.id === lastOrder.finish)?.name ?? lastOrder.finish ?? null;
    if (business) setActiveLocation(business);
    setOrder({
      variety_id: lastOrder.variety_id,
      variety_name: variety?.name ?? lastOrder.variety_name ?? null,
      price_cents: variety?.price_cents ?? null,
      chocolate: lastOrder.chocolate ?? null,
      chocolate_name: chocName,
      finish: lastOrder.finish ?? null,
      finish_name: finName,
      quantity: lastOrder.quantity ?? 4,
      location_id: lastOrder.location_id ?? null,
      location_name: business?.name ?? lastOrder.location_name ?? null,
    });
    jumpToPanel(!lastOrder.chocolate ? 'chocolate' : !lastOrder.finish ? 'finish' : 'when');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : userEmail ? (
          <>
            {/* Identity block */}
            <View style={styles.identityBlock}>
              {editingName ? (
                <TextInput
                  ref={nameInputRef}
                  style={[styles.nameInput, { color: c.text }]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  onSubmitEditing={e => handleSaveName(e.nativeEvent.text)}
                  onBlur={e => handleSaveName(e.nativeEvent.text)}
                  returnKeyType="done"
                  autoFocus
                  placeholder="Your name"
                  placeholderTextColor={c.muted}
                />
              ) : (
                <TouchableOpacity onPress={() => setEditingName(true)} activeOpacity={0.7}>
                  <Text style={[styles.name, { color: c.text }]}>{displayName || 'Add a name'}</Text>
                </TouchableOpacity>
              )}
              {fraiseChatEmail ? (
                <TouchableOpacity onPress={() => showPanel('conversations')} activeOpacity={0.7}>
                  <Text style={[styles.chatEmail, { color: c.muted }]}>{fraiseChatEmail}</Text>
                </TouchableOpacity>
              ) : isVerified ? null : (
                <Text style={[styles.chatEmail, { color: c.muted }]}>collect in person to verify</Text>
              )}
            </View>

            {/* Last order */}
            {lastOrder && (
              <View style={styles.block}>
                <View style={styles.blockRow}>
                  <Text style={[styles.label, { color: c.muted }]}>LAST ORDER</Text>
                  <Text style={[styles.label, { color: c.muted }]}>
                    {new Date(lastOrder.created_at ?? Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.orderVariety, { color: c.text }]}>{lastOrder.variety_name ?? '—'}</Text>
                <View style={styles.blockRow}>
                  <Text style={[styles.orderDetail, { color: c.muted }]}>
                    {CHOCOLATES.find(choc => choc.id === lastOrder.chocolate)?.name ?? lastOrder.chocolate ?? '—'}
                    {'  ·  '}{FINISHES.find(f => f.id === lastOrder.finish)?.name ?? lastOrder.finish ?? '—'}
                    {'  ·  '}{lastOrder.quantity}
                  </Text>
                  <TouchableOpacity onPress={handleOrderAgain} activeOpacity={0.6}>
                    <Text style={[styles.action, { color: c.accent }]}>ORDER AGAIN</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* History */}
            {recentOrders.length > 1 && (
              <>
                <View style={styles.block}>
                  <Text style={[styles.label, { color: c.muted }]}>HISTORY</Text>
                  {recentOrders.slice(1).map((o: any) => (
                    <View key={o.id} style={styles.historyRow}>
                      <Text style={[styles.historyVariety, { color: c.text }]}>{o.variety_name ?? '—'}</Text>
                      <Text style={[styles.historyDetail, { color: c.muted }]}>
                        {CHOCOLATES.find(choc => choc.id === o.chocolate)?.name ?? o.chocolate ?? '—'}{'  ·  '}{o.quantity}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Sign out */}
            <TouchableOpacity onPress={handleSignOut} activeOpacity={0.6} style={styles.block}>
              <Text style={[styles.label, { color: c.muted }]}>SIGN OUT</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Signed out state */
          <View style={styles.signInBlock}>
            <TouchableOpacity onPress={() => TrueSheet.present('main-sheet', 1)} activeOpacity={0.6}>
              <Text style={[styles.signInPrompt, { color: c.muted }]}>sign in to continue</Text>
            </TouchableOpacity>
            <View style={styles.signInButtons}>
              {signingIn ? <ActivityIndicator color={c.accent} /> : (
                <>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={14}
                    style={styles.appleBtn}
                    onPress={handleAppleSignIn}
                  />
                  <TouchableOpacity onPress={handleDemoLogin} activeOpacity={0.6}>
                    <Text style={[styles.demoText, { color: c.muted }]}>use demo account</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingTop: 8, paddingHorizontal: SPACING.md },
  backBtn: { paddingVertical: 4, marginBottom: SPACING.md },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  identityBlock: { paddingTop: 4, paddingBottom: SPACING.md, gap: 6, alignItems: 'center' },
  name: { fontSize: 32, fontFamily: fonts.playfair, textAlign: 'center' },
  nameInput: { fontSize: 32, fontFamily: fonts.playfair, padding: 0, textAlign: 'center' },
  chatEmail: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  divider: { height: StyleSheet.hairlineWidth },
  block: { paddingVertical: SPACING.md, gap: 8 },
  blockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  action: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  orderVariety: { fontSize: 22, fontFamily: fonts.playfair },
  orderDetail: { fontSize: 12, fontFamily: fonts.dmMono, flex: 1 },
  historyRow: { gap: 2 },
  historyVariety: { fontSize: 15, fontFamily: fonts.playfair },
  historyDetail: { fontSize: 11, fontFamily: fonts.dmMono },
  signInBlock: { paddingTop: 0, alignItems: 'center', gap: 0 },
  signInPrompt: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1, paddingTop: 28, paddingBottom: SPACING.sm },
  signInButtons: { paddingTop: 48, gap: 16, alignItems: 'center', width: '100%' },
  appleBtn: { height: 44, width: '100%' },
  demoText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
