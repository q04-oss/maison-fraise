import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Switch,
  StyleSheet, ActivityIndicator, Alert, Share,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useApp } from '../../../App';
import { usePanel } from '../../context/PanelContext';
import {
  verifyAppleSignIn, setAuthToken,
  fetchStandingOrders, updateStandingOrder, cancelStandingOrder,
  fetchOrdersByEmail, updateDisplayName,
  demoLogin, fetchSetupIntent,
  fetchMyReferralCode, applyReferralCode,
  fetchNotificationPrefs, updateNotificationPrefs,
} from '../../lib/api';
import { CHOCOLATES, FINISHES } from '../../data/seed';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function ProfilePanel() {
  const { goHome, jumpToPanel, showPanel, setOrder, setActiveLocation, varieties, businesses } = usePanel();
  const { pushToken } = useApp();
  const c = useColors();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [isVerified, setIsVerifiedState] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [standingOrders, setStandingOrders] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralUses, setReferralUses] = useState(0);
  const [notifPrefs, setNotifPrefs] = useState<{ order_updates: boolean; marketing: boolean } | null>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('user_email'),
      AsyncStorage.getItem('verified'),
      AsyncStorage.getItem('user_db_id'),
      AppleAuthentication.isAvailableAsync().catch(() => false),
      AsyncStorage.getItem('display_name'),
    ]).then(([email, verified, dbId, available, storedDisplayName]) => {
      if (storedDisplayName) setDisplayName(storedDisplayName);
      setIsVerifiedState(verified === 'true');
      setAppleAvailable(available as boolean);
      if (email) {
        setUserEmail(email);
        fetchOrdersByEmail(email)
          .then((orders: any[]) => {
            const paid = orders
              .filter((o: any) => o.status === 'paid' || o.status === 'confirmed')
              .sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
            setRecentOrders(paid.slice(0, 3));
          })
          .catch(() => {});
      }
      if (dbId) {
        const uid = parseInt(dbId, 10);
        setUserDbId(uid);
        fetchStandingOrders(uid).then(setStandingOrders).catch(() => {});
        fetchMyReferralCode().then(r => { setReferralCode(r.code); setReferralUses(r.uses); }).catch(() => {});
        fetchNotificationPrefs().then(prefs => {
          setNotifPrefs({ order_updates: prefs.order_updates, marketing: prefs.marketing });
        }).catch(() => {});
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
      if (!credential.identityToken) throw new Error('No identity token received.');

      const result = await verifyAppleSignIn({
        identityToken: credential.identityToken,
        firstName: credential.fullName?.givenName ?? undefined,
        lastName: credential.fullName?.familyName ?? undefined,
        email: credential.email ?? undefined,
      });

      await AsyncStorage.setItem('user_db_id', String(result.user_id));
      await setAuthToken(result.token);
      setUserDbId(result.user_id);

      const emailToUse = credential.email ?? (await AsyncStorage.getItem('user_email'));
      if (credential.email) await AsyncStorage.setItem('user_email', credential.email);
      if (emailToUse) {
        setUserEmail(emailToUse);
        fetchOrdersByEmail(emailToUse)
          .then((orders: any[]) => {
            const paid = orders
              .filter((o: any) => o.status === 'paid' || o.status === 'confirmed')
              .sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
            setRecentOrders(paid.slice(0, 3));
          })
          .catch(() => {});
      }

      fetchStandingOrders(result.user_id).then(setStandingOrders).catch(() => {});

      if (pushToken) {
        const { updatePushToken } = await import('../../lib/api');
        updatePushToken(result.user_id, pushToken).catch(() => {});
      }
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed. Please try again.');
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
      await setAuthToken(result.token);
      setUserDbId(result.user_id);
      fetchStandingOrders(result.user_id).then(setStandingOrders).catch(() => {});
      if (pushToken) {
        const { updatePushToken } = await import('../../lib/api');
        updatePushToken(result.user_id, pushToken).catch(() => {});
      }
    } catch {
      Alert.alert('Demo unavailable', 'The demo account is not available right now.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You\'ll need to sign in again to place orders.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await AsyncStorage.multiRemove(['user_email', 'user_db_id', 'verified', 'is_dj']);
          setUserEmail(null);
          setUserDbId(null);
          setIsVerifiedState(false);
          setStandingOrders([]);
          setRecentOrders([]);
          setOrder({ customer_email: '' });
        },
      },
    ]);
  };

  const handleEditName = () => {
    Alert.prompt('Display name', 'Enter your name', async (name) => {
      if (!name || name.trim().length < 2 || !userDbId) return;
      try {
        await updateDisplayName(userDbId, name.trim());
        await AsyncStorage.setItem('display_name', name.trim());
        setDisplayName(name.trim());
      } catch {}
    });
  };

  const handleCancelStanding = (id: number) => {
    Alert.alert('Cancel standing order?', 'This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel order', style: 'destructive',
        onPress: async () => {
          try {
            await cancelStandingOrder(id);
            setStandingOrders(prev => prev.filter(o => o.id !== id));
          } catch {
            Alert.alert('Could not cancel', 'Try again.');
          }
        },
      },
    ]);
  };

  const handleToggleStanding = async (id: number, current: string) => {
    const next = current === 'active' ? 'paused' : 'active';
    try {
      await updateStandingOrder(id, next);
      setStandingOrders(prev => prev.map(o => o.id === id ? { ...o, status: next } : o));
    } catch {
      Alert.alert('Could not update', 'Try again.');
    }
  };

  const handleAddPaymentMethod = async () => {
    setAddingPayment(true);
    try {
      const { client_secret } = await fetchSetupIntent();
      const { error: initErr } = await initPaymentSheet({
        setupIntentClientSecret: client_secret,
        merchantDisplayName: 'Maison Fraise',
      });
      if (initErr) throw new Error(initErr.message);
      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        if (presentErr.code !== 'Canceled') Alert.alert('Could not save card. Please try again.');
        return;
      }
      setHasPaymentMethod(true);
      setPaymentSaved(true);
      setTimeout(() => setPaymentSaved(false), 3000);
    } catch {
      Alert.alert('Could not save card. Please try again.');
    } finally {
      setAddingPayment(false);
    }
  };

  const handleShareReferral = () => {
    if (!referralCode) return;
    Share.share({ message: `Use my code ${referralCode} for 10% off your first Maison Fraise order 🍓` });
  };

  const handleApplyReferral = () => {
    Alert.prompt('Have a referral code?', 'Enter the code below', async (code) => {
      if (!code || !code.trim()) return;
      try {
        await applyReferralCode(code.trim().toUpperCase());
        Alert.alert('10% discount applied to your first order!');
      } catch {
        Alert.alert('Invalid code', 'That code could not be applied. Please check and try again.');
      }
    });
  };

  const handleNotifToggle = (key: 'order_updates' | 'marketing', value: boolean) => {
    if (!notifPrefs) return;
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    updateNotificationPrefs({ [key]: value }).catch(() => {});
  };

  const lastOrder = recentOrders[0] ?? null;

  const handleOrderAgain = () => {
    if (!lastOrder) return;
    const variety = varieties.find(v => v.id === lastOrder.variety_id);
    if (!variety) {
      Alert.alert('Not available', 'That variety isn\'t available today. Browse what\'s in season instead.');
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
    const nextPanel = !lastOrder.chocolate ? 'chocolate' : !lastOrder.finish ? 'finish' : 'when';
    jumpToPanel(nextPanel);
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
            </>
          ) : !loading ? (
            signingIn ? <ActivityIndicator color={c.accent} /> : (
              <View style={styles.signInStack}>
                {appleAvailable && (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={14}
                    style={styles.appleBtn}
                    onPress={handleAppleSignIn}
                  />
                )}
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
            {/* Quick access */}
            {userDbId && (
              <View style={[styles.verifiedActions, { borderColor: c.border }]}>
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={handleEditName}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: c.text }]}>Edit name</Text>
                    <Text style={[styles.actionSub, { color: c.muted }]}>{displayName ?? 'Set your display name'}</Text>
                  </View>
                  <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>

                <View style={[styles.actionRowDivider, { backgroundColor: c.border }]} />

                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => showPanel('order-history')}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: c.text }]}>Order history</Text>
                    <Text style={[styles.actionSub, { color: c.muted }]}>View all your past orders</Text>
                  </View>
                  <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>

                <View style={[styles.actionRowDivider, { backgroundColor: c.border }]} />

                <TouchableOpacity
                  style={[styles.actionRow, styles.actionRowLast]}
                  onPress={() => showPanel('search')}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: c.text }]}>Search</Text>
                    <Text style={[styles.actionSub, { color: c.muted }]}>Find varieties and locations</Text>
                  </View>
                  <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Order again */}
            {lastOrder && (
              <TouchableOpacity
                style={[styles.orderAgainRow, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={handleOrderAgain}
                activeOpacity={0.8}
              >
                <View style={styles.orderAgainInfo}>
                  <Text style={[styles.sectionLabel, { color: c.muted }]}>ORDER AGAIN</Text>
                  <Text style={[styles.orderAgainName, { color: c.text }]}>{lastOrder.variety_name ?? '—'}</Text>
                  <Text style={[styles.orderAgainSub, { color: c.muted }]}>
                    {CHOCOLATES.find(choc => choc.id === lastOrder.chocolate)?.name ?? lastOrder.chocolate ?? '—'}
                    {' · '}
                    {FINISHES.find(f => f.id === lastOrder.finish)?.name ?? lastOrder.finish ?? '—'}
                    {' · '}{lastOrder.quantity}
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: c.accent }]}>→</Text>
              </TouchableOpacity>
            )}

            {/* Recent orders */}
            {recentOrders.length > 1 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>RECENT ORDERS</Text>
                {recentOrders.slice(1).map((o: any) => (
                  <View key={o.id} style={[styles.row, { borderBottomColor: c.border }]}>
                    <Text style={[styles.rowName, { color: c.text }]}>{o.variety_name ?? '—'}</Text>
                    <Text style={[styles.rowMeta, { color: c.muted }]}>#{o.id}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Standing orders */}
            {standingOrders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.standingHeader}>
                  <Text style={[styles.sectionLabel, { color: c.muted }]}>STANDING ORDERS</Text>
                  {hasPaymentMethod && (
                    <Text style={[styles.cardSavedBadge, { color: c.accent }]}>✓ Card saved</Text>
                  )}
                </View>
                {!hasPaymentMethod && (
                  <TouchableOpacity
                    style={[styles.addPaymentBtn, { backgroundColor: c.card, borderColor: c.border }]}
                    onPress={handleAddPaymentMethod}
                    disabled={addingPayment}
                    activeOpacity={0.8}
                  >
                    {addingPayment
                      ? <ActivityIndicator size="small" color={c.accent} />
                      : <Text style={[styles.addPaymentText, { color: c.accent }]}>+ Add Payment Method</Text>
                    }
                  </TouchableOpacity>
                )}
                {paymentSaved && (
                  <Text style={[styles.paymentSavedText, { color: c.accent }]}>Payment method saved</Text>
                )}
                {standingOrders.map((so: any) => (
                  <View key={so.id} style={[styles.standingRow, { backgroundColor: c.card, borderColor: c.border }]}>
                    <View style={styles.standingInfo}>
                      <Text style={[styles.rowName, { color: c.text }]}>{so.variety_name ?? '—'}</Text>
                      {so.recipient_id === userDbId && (
                        <Text style={[styles.rowMeta, { color: c.accent }]}>🎁 Gift to you</Text>
                      )}
                      {so.recipient_id !== null && so.recipient_id !== undefined && so.recipient_id !== userDbId && (
                        <Text style={[styles.rowMeta, { color: c.muted }]}>Gift order</Text>
                      )}
                      <Text style={[styles.rowMeta, { color: c.muted }]}>{so.frequency} · {so.status}</Text>
                    </View>
                    <View style={styles.standingActions}>
                      <TouchableOpacity onPress={() => handleToggleStanding(so.id, so.status)} activeOpacity={0.7}>
                        <Text style={[styles.standingActionText, { color: c.accent }]}>
                          {so.status === 'active' ? 'Pause' : 'Resume'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleCancelStanding(so.id)} activeOpacity={0.7}>
                        <Text style={[styles.standingActionText, { color: c.muted }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Refer a Friend */}
            {userDbId && referralCode && (
              <View style={[styles.referralCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>REFER A FRIEND</Text>
                <Text style={[styles.referralCode, { color: c.text }]}>{referralCode}</Text>
                <Text style={[styles.referralUses, { color: c.muted }]}>{referralUses} {referralUses === 1 ? 'friend' : 'friends'} referred</Text>
                <TouchableOpacity
                  style={[styles.shareBtn, { backgroundColor: c.text }]}
                  onPress={handleShareReferral}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.shareBtnText, { color: c.ctaText }]}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleApplyReferral} activeOpacity={0.7} style={styles.haveCodeLink}>
                  <Text style={[styles.haveCodeText, { color: c.muted }]}>Have a code?</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Notification preferences */}
            {userDbId && notifPrefs && (
              <View style={[styles.notifCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>NOTIFICATIONS</Text>
                {(
                  [
                    { key: 'order_updates' as const, label: 'Order updates' },
                    { key: 'marketing' as const, label: 'Marketing' },
                  ] as const
                ).map(({ key, label }, index, arr) => (
                  <View key={key}>
                    <View style={styles.notifRow}>
                      <Text style={[styles.notifLabel, { color: c.text }]}>{label}</Text>
                      <Switch
                        value={notifPrefs[key]}
                        onValueChange={v => handleNotifToggle(key, v)}
                        trackColor={{ false: c.border, true: c.accent }}
                        thumbColor="#fff"
                      />
                    </View>
                    {index < arr.length - 1 && (
                      <View style={[styles.actionRowDivider, { backgroundColor: c.border }]} />
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Verification hint for unverified */}
            {!isVerified && userDbId && (
              <View style={styles.verifyHint}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>VERIFICATION</Text>
                <Text style={[styles.verifyHintText, { color: c.muted }]}>
                  Sign in with Apple and collect your first order in person to become a verified member.
                </Text>
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
  headerSpacer: { width: 40 },
  signOutBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  signOutText: { fontSize: 13, fontFamily: fonts.dmSans },
  appleBtn: { height: 44 },
  signInStack: { gap: 8, alignItems: 'center' },
  demoBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  demoBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  body: { padding: SPACING.md, gap: 12 },

  sectionLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginBottom: 6 },
  section: { gap: 0 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: { fontSize: 14, fontFamily: fonts.playfair },
  rowMeta: { fontSize: 12, fontFamily: fonts.dmMono },
  chevron: { fontSize: 20 },

  orderAgainRow: {
    borderRadius: 14,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  orderAgainInfo: { flex: 1, gap: 3 },
  orderAgainName: { fontSize: 15, fontFamily: fonts.playfair },
  orderAgainSub: { fontSize: 12, fontFamily: fonts.dmSans },

  verifiedActions: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    gap: 12,
  },
  actionRowLast: { paddingVertical: 10 },
  actionRowDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  actionInfo: { flex: 1, gap: 2 },
  actionTitle: { fontSize: 15, fontFamily: fonts.playfair },
  actionSub: { fontSize: 12, fontFamily: fonts.dmSans },

  standingRow: {
    borderRadius: 14,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  standingInfo: { flex: 1, gap: 3 },
  standingActions: { flexDirection: 'row', gap: 16 },
  standingActionText: { fontSize: 13, fontFamily: fonts.dmSans },

  standingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardSavedBadge: { fontSize: 12, fontFamily: fonts.dmMono },
  addPaymentBtn: {
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, marginBottom: 8,
  },
  addPaymentText: { fontSize: 14, fontFamily: fonts.dmSans, fontWeight: '600' },
  paymentSavedText: { fontSize: 12, fontFamily: fonts.dmSans, textAlign: 'center', marginBottom: 4 },

  referralCard: {
    borderRadius: 14, padding: SPACING.md, borderWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  referralCode: { fontSize: 28, fontFamily: fonts.dmMono, letterSpacing: 2 },
  referralUses: { fontSize: 13, fontFamily: fonts.dmSans },
  shareBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  shareBtnText: { fontSize: 14, fontFamily: fonts.dmSans, fontWeight: '700' },
  haveCodeLink: { alignItems: 'center', paddingVertical: 4 },
  haveCodeText: { fontSize: 11, fontFamily: fonts.dmMono },

  notifCard: {
    borderRadius: 14, padding: SPACING.md, borderWidth: StyleSheet.hairlineWidth, gap: 6,
  },
  notifRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  notifLabel: { fontSize: 14, fontFamily: fonts.dmSans },

  verifyHint: { gap: 5 },
  verifyHintText: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, fontStyle: 'italic' },
});
