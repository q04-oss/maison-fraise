import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useApp } from '../../../App';
import { usePanel } from '../../context/PanelContext';
import {
  verifyAppleSignIn, setAuthToken,
  fetchOrdersByEmail,
  demoLogin,
} from '../../lib/api';
import { CHOCOLATES, FINISHES } from '../../data/seed';
import { useColors, fonts, SPACING } from '../../theme';

export default function ProfilePanel() {
  const { goHome, jumpToPanel, showPanel, setOrder, setActiveLocation, varieties, businesses } = usePanel();
  const { pushToken } = useApp();
  const c = useColors();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [fraiseChatEmail, setFraiseChatEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('user_email'),
      AsyncStorage.getItem('verified'),
      AsyncStorage.getItem('user_db_id'),
      AsyncStorage.getItem('fraise_chat_email'),
    ]).then(([email, verified, dbId, chatEmail]) => {
      setIsVerified(verified === 'true');
      if (dbId) setUserDbId(parseInt(dbId, 10));
      if (chatEmail) setFraiseChatEmail(chatEmail);
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
      if (err.code !== 'ERR_REQUEST_CANCELED') {
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
          await AsyncStorage.multiRemove(['user_email', 'user_db_id', 'verified', 'is_dj', 'auth_token', 'fraise_chat_email']);
          setUserEmail(null);
          setUserDbId(null);
          setIsVerified(false);
          setFraiseChatEmail(null);
          setRecentOrders([]);
          setOrder({ customer_email: '' });
        },
      },
    ]);
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
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goHome} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {userEmail ? (
            <>
              <Text style={[styles.headerEmail, { color: c.text }]}>{userEmail}</Text>
              {isVerified && <Text style={[styles.headerVerified, { color: c.accent }]}>Verified member</Text>}
              {fraiseChatEmail && (
                <TouchableOpacity onPress={() => showPanel('conversations')} activeOpacity={0.7}>
                  <Text style={[styles.headerChatEmail, { color: c.muted }]}>{fraiseChatEmail}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : !loading ? (
            signingIn ? <ActivityIndicator color={c.accent} /> : (
              <View style={styles.signInStack}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={14}
                  style={styles.appleBtn}
                  onPress={handleAppleSignIn}
                />
                <TouchableOpacity onPress={handleDemoLogin} activeOpacity={0.6} style={styles.demoBtn}>
                  <Text style={[styles.demoBtnText, { color: c.muted }]}>Use demo account</Text>
                </TouchableOpacity>
              </View>
            )
          ) : null}
        </View>
        {userEmail ? (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn} activeOpacity={0.7}>
            <Text style={[styles.signOutText, { color: c.muted }]}>Sign out</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {lastOrder && (
              <View style={styles.lastOrderBlock}>
                <Text style={[styles.lastOrderDate, { color: c.muted }]}>
                  {new Date(lastOrder.created_at ?? Date.now()).toLocaleDateString([], { month: 'long', day: 'numeric' })}
                </Text>
                <Text style={[styles.lastOrderName, { color: c.text }]}>{lastOrder.variety_name ?? '—'}</Text>
                <Text style={[styles.lastOrderSub, { color: c.muted }]}>
                  {CHOCOLATES.find(choc => choc.id === lastOrder.chocolate)?.name ?? lastOrder.chocolate ?? '—'}
                  {'  ·  '}{FINISHES.find(f => f.id === lastOrder.finish)?.name ?? lastOrder.finish ?? '—'}
                  {'  ·  '}{lastOrder.quantity}
                </Text>
                <TouchableOpacity onPress={handleOrderAgain} activeOpacity={0.6} style={styles.reorderLink}>
                  <Text style={[styles.reorderLinkText, { color: c.accent }]}>Order again</Text>
                </TouchableOpacity>
              </View>
            )}

            {recentOrders.length > 1 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>RECENT ORDERS</Text>
                <View style={[styles.card, { backgroundColor: c.card }]}>
                  {recentOrders.slice(1).map((o: any, i: number) => (
                    <React.Fragment key={o.id}>
                      {i > 0 && <View style={[styles.divider, { backgroundColor: c.border }]} />}
                      <View style={styles.orderRow}>
                        <Text style={[styles.orderName, { color: c.text }]}>{o.variety_name ?? '—'}</Text>
                        <Text style={[styles.orderMeta, { color: c.muted }]}>
                          {CHOCOLATES.find(choc => choc.id === o.chocolate)?.name ?? o.chocolate ?? '—'}
                          {' · '}{o.quantity}
                        </Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </View>
            )}


            {(!isVerified || !userDbId) && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>VERIFICATION</Text>
                <View style={[styles.card, { backgroundColor: c.card }]}>
                  <View style={styles.verifyRow}>
                    <Text style={[styles.verifyText, { color: c.muted }]}>
                      {userDbId
                        ? 'Collect your first order in person to become a verified member.'
                        : 'Sign in, place an order, and collect it in person. Verified members unlock standing orders and member features.'}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}
        <View style={{ height: 32 }} />
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
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4, flexShrink: 0 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, paddingHorizontal: SPACING.sm, gap: 2 },
  headerEmail: { fontSize: 15, fontFamily: fonts.playfair },
  headerVerified: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1 },
  headerChatEmail: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  headerSpacer: { width: 40 },
  signOutBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  signOutText: { fontSize: 13, fontFamily: fonts.dmSans },
  appleBtn: { height: 44, width: '100%' },
  signInStack: { gap: 8, alignItems: 'center' },
  demoBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  demoBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  body: { padding: SPACING.md, gap: SPACING.md },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1, marginLeft: 4 },
  card: { borderRadius: 12, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  orderAgainRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 14, gap: 12 },
  orderAgainInfo: { flex: 1, gap: 4 },
  orderAgainName: { fontSize: 17, fontFamily: fonts.playfair },
  orderAgainSub: { fontSize: 12, fontFamily: fonts.dmSans },
  chevron: { fontSize: 20 },
  orderRow: { paddingHorizontal: SPACING.md, paddingVertical: 12, gap: 3 },
  orderName: { fontSize: 15, fontFamily: fonts.playfair },
  orderMeta: { fontSize: 12, fontFamily: fonts.dmSans },
  verifyRow: { paddingHorizontal: SPACING.md, paddingVertical: 14 },
  verifyText: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, fontStyle: 'italic' },
  lastOrderBlock: { gap: 4, marginLeft: 4 },
  lastOrderDate: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5, textTransform: 'uppercase' },
  lastOrderName: { fontSize: 22, fontFamily: fonts.playfair },
  lastOrderSub: { fontSize: 12, fontFamily: fonts.dmSans },
  reorderLink: { paddingTop: 6 },
  reorderLinkText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1, textTransform: 'uppercase' },
});
