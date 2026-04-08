import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useStripe } from '@stripe/stripe-react-native';
import { useApp } from '../../../App';
import ARBoxModule from '../../lib/NativeARBoxModule';
import { usePanel } from '../../context/PanelContext';
import {
  verifyAppleSignIn, setAuthToken, deleteAuthToken,
  fetchOrdersByEmail,
  demoLogin, updateDisplayName,
  createOrder, confirmOrder, payOrderWithBalance, operatorLogin,
  startIdentityVerification, fetchMyVentures,
  fetchMyMarketOrders, collectMarketOrder, fetchAdBalance, fetchAvailableAds,
  respondToAdImpression, fetchStaffOrders,
  fetchMyNodeApplication, submitNodeApplication, NodeApplication,
} from '../../lib/api';
import { CHOCOLATES, FINISHES } from '../../data/seed';
import { useColors, fonts, SPACING } from '../../theme';

const SHEET_NAME = 'main-sheet';

type OrderStep = 'variety' | 'chocolate' | 'finish' | 'quantity' | 'review' | 'confirmed';

export default function TerminalPanel() {
  const { goHome, showPanel, setOrder, order, setActiveLocation, varieties, businesses, activeLocation, panelData, setPanelData } = usePanel();
  const { pushToken, reviewMode, enableReviewMode } = useApp();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const c = useColors();
  const scrollRef = useRef<ScrollView>(null);

  // Auth state
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [fraiseChatEmail, setFraiseChatEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [editingName, setEditingName] = useState(false);
  const [isShop, setIsShop] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [staffOrders, setStaffOrders] = useState<any[]>([]);
  const [staffPin, setStaffPin] = useState('');
  const [staffPinInput, setStaffPinInput] = useState('');
  const [staffPinNeeded, setStaffPinNeeded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [operatorCode, setOperatorCode] = useState('');
  const [showOperatorLogin, setShowOperatorLogin] = useState(false);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [idVerifyCode, setIdVerifyCode] = useState('');
  const [showIdVerify, setShowIdVerify] = useState(false);
  const [idVerifyLoading, setIdVerifyLoading] = useState(false);
  const [idVerifyAttested, setIdVerifyAttested] = useState(false);
  const [myVentures, setMyVentures] = useState<any[]>([]);
  const [marketOrders, setMarketOrders] = useState<any[]>([]);
  const [adBalanceCents, setAdBalanceCents] = useState(0);
  const [availableAds, setAvailableAds] = useState<any[]>([]);
  const [nodeApplication, setNodeApplication] = useState<NodeApplication | null | undefined>(undefined);
  const [nodeAppForm, setNodeAppForm] = useState({ business_name: '', address: '', neighbourhood: '', description: '', instagram_handle: '' });
  const [nodeAppSubmitting, setNodeAppSubmitting] = useState(false);
const nameInputRef = useRef<TextInput>(null);

  // Inline order state
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderStep, setOrderStep] = useState<OrderStep>('variety');
  const [inlineOrder, setInlineOrder] = useState<{
    variety_id: number | null;
    variety_name: string | null;
    price_cents: number | null;
    chocolate: string | null;
    chocolate_name: string | null;
    finish: string | null;
    finish_name: string | null;
    quantity: number;
  }>({
    variety_id: null, variety_name: null, price_cents: null,
    chocolate: null, chocolate_name: null,
    finish: null, finish_name: null,
    quantity: 4,
  });
  const [paying, setPaying] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<any | null>(null);

  const location = activeLocation ?? businesses.find(b => b.id === order.location_id) ?? null;
  const isPopup = location?.type === 'popup';

  // Auto-scroll when step advances
  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  useEffect(() => {
    if (orderOpen && orderStep !== 'variety') scrollToBottom();
  }, [orderStep]);

  // Auto-open or reset order based on how terminal was triggered
  useEffect(() => {
    if (panelData?.openOrder) {
      setOrderOpen(true);
      if (panelData.preselectedVariety) {
        const v = panelData.preselectedVariety;
        setInlineOrder(p => ({ ...p, variety_id: v.id, variety_name: v.name, price_cents: v.price_cents }));
        setOrderStep('chocolate');
      }
      setPanelData(null);
    } else if (panelData?.resetOrder) {
      setOrderOpen(false);
      resetInlineOrder();
      setPanelData(null);
    }
  }, [panelData]);

  // Auth init
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('user_email'),
      AsyncStorage.getItem('verified'),
      AsyncStorage.getItem('user_db_id'),
      AsyncStorage.getItem('fraise_chat_email'),
      AsyncStorage.getItem('display_name'),
      AsyncStorage.getItem('is_shop'),
      AsyncStorage.getItem('is_staff'),
    ]).then(([email, verified, dbId, chatEmail, name, shopFlag, staffFlag]) => {
      setIsVerified(verified === 'true');
      if (shopFlag === 'true') setIsShop(true);
      if (staffFlag === 'true') {
        setIsStaff(true);
        AsyncStorage.getItem('staff_pin').then(pin => {
          if (pin) {
            setStaffPin(pin);
            setStaffPinInput(pin);
            const today = new Date().toISOString().slice(0, 10);
            fetchStaffOrders(pin, today).then(setStaffOrders).catch(() => {});
          } else {
            setStaffPinNeeded(true);
          }
        });
      }
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
        fetchMyVentures().then(setMyVentures).catch(() => {});
        fetchMyMarketOrders().then(setMarketOrders).catch(() => {});
        fetchAdBalance().then(r => setAdBalanceCents(r.ad_balance_cents)).catch(() => {});
        fetchAvailableAds().then(setAvailableAds).catch(() => {});
        if (verified === 'true') {
          fetchMyNodeApplication().then(setNodeApplication).catch(() => setNodeApplication(null));
        }
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
      if (result.verified) { await AsyncStorage.setItem('verified', 'true'); setIsVerified(true); }
      if (result.fraise_chat_email) { await AsyncStorage.setItem('fraise_chat_email', result.fraise_chat_email); setFraiseChatEmail(result.fraise_chat_email); }
      if (result.display_name) { await AsyncStorage.setItem('display_name', result.display_name); setDisplayName(result.display_name); }
      const email = credential.email ?? result.email ?? null;
      if (email) {
        await AsyncStorage.setItem('user_email', email);
        setUserEmail(email);
        fetchOrdersByEmail()
          .then((orders: any[]) => {
            const paid = orders.filter((o: any) => o.status === 'paid' || o.status === 'confirmed').sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
            setRecentOrders(paid.slice(0, 5));
          }).catch(() => {});
      }
      if (pushToken) { const { updatePushToken } = await import('../../lib/api'); updatePushToken(pushToken).catch(() => {}); }
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED' && !userDbId) Alert.alert('Sign in failed', 'Please try again.');
    } finally { setSigningIn(false); }
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
      enableReviewMode();
      if (pushToken) { const { updatePushToken } = await import('../../lib/api'); updatePushToken(pushToken).catch(() => {}); }
    } catch (e: any) {
      Alert.alert('Demo unavailable', String(e?.message ?? e));
    } finally { setSigningIn(false); }
  };

  const handleOperatorLogin = async () => {
    const code = operatorCode.trim().toUpperCase();
    if (code.length !== 6) { Alert.alert('Enter your 6-character operator code.'); return; }
    setSigningIn(true);
    try {
      const result = await operatorLogin(code);
      const shopEmail = result.fraise_chat_email ?? `shop-${result.user_id}@fraise.chat`;
      await AsyncStorage.multiSet([
        ['user_db_id', String(result.user_id)],
        ['user_email', shopEmail],
        ['is_shop', 'true'],
        ['display_name', result.display_name ?? ''],
        ['fraise_chat_email', result.fraise_chat_email ?? ''],
      ]);
      await setAuthToken(result.token);
      setUserDbId(result.user_id);
      setIsShop(true);
      setDisplayName(result.display_name ?? '');
      setFraiseChatEmail(result.fraise_chat_email ?? '');
      setUserEmail(shopEmail);
      setShowOperatorLogin(false);
      setOperatorCode('');
    } catch {
      Alert.alert('Invalid code', 'Check your operator code and try again.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', "You'll need to sign in again to place orders.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await AsyncStorage.multiRemove(['user_email', 'user_db_id', 'verified', 'is_dj', 'fraise_chat_email', 'display_name', 'is_shop']);
          await deleteAuthToken();
          setUserEmail(null); setUserDbId(null); setIsVerified(false); setIsShop(false);
          setFraiseChatEmail(null); setDisplayName(''); setRecentOrders([]);
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

  const handleSubmitNodeApp = async () => {
    const { business_name, address } = nodeAppForm;
    if (!business_name.trim() || !address.trim()) {
      Alert.alert('Required', 'Business name and address are required.');
      return;
    }
    setNodeAppSubmitting(true);
    try {
      await submitNodeApplication({
        business_name: business_name.trim(),
        address: address.trim(),
        neighbourhood: nodeAppForm.neighbourhood.trim() || undefined,
        description: nodeAppForm.description.trim() || undefined,
        instagram_handle: nodeAppForm.instagram_handle.trim() || undefined,
      });
      const updated = await fetchMyNodeApplication();
      setNodeApplication(updated);
    } catch (err: any) {
      Alert.alert('Submission failed', err?.message ?? 'Try again.');
    } finally {
      setNodeAppSubmitting(false);
    }
  };

  const resetInlineOrder = () => {
    setInlineOrder({ variety_id: null, variety_name: null, price_cents: null, chocolate: null, chocolate_name: null, finish: null, finish_name: null, quantity: 4 });
    setOrderStep('variety');
    setConfirmedOrder(null);
  };

  const handlePay = async () => {
    const email = userEmail;
    if (!email || !email.includes('@')) { Alert.alert('Email required', 'Sign in to place an order.'); return; }
    if (!location?.id) { Alert.alert('No location', 'Select a collection point on the map first.'); return; }
    if (!inlineOrder.variety_id || !inlineOrder.chocolate || !inlineOrder.finish) {
      Alert.alert('Incomplete', 'Something is missing from your order.'); return;
    }
    const totalCents = (inlineOrder.price_cents ?? 0) * inlineOrder.quantity;
    if (totalCents === 0) { Alert.alert('Price unavailable', 'Go back and reselect your variety.'); return; }

    const isPopupLive = (() => {
      if (location?.type !== 'popup' || !location.launched_at) return false;
      const start = new Date(location.launched_at);
      const end = location.ends_at ? new Date(location.ends_at) : new Date(start.getTime() + 4 * 60 * 60 * 1000);
      const now = new Date();
      return now >= start && now < end;
    })();

    setPaying(true);
    let paymentCollected = false;
    try {
      const { order: created, client_secret } = await createOrder({
        variety_id: inlineOrder.variety_id!,
        location_id: location.id,
        chocolate: inlineOrder.chocolate!,
        finish: inlineOrder.finish!,
        quantity: inlineOrder.quantity,
        is_gift: false,
        customer_email: email,
        push_token: pushToken,
        gift_note: null,
        ordered_at_popup: isPopupLive,
        excess_amount_cents: undefined,
      });

      let confirmed;
      if (reviewMode) {
        confirmed = await confirmOrder(created.id);
      } else {
        const { error: initErr } = await initPaymentSheet({
          merchantDisplayName: 'Maison Fraise',
          paymentIntentClientSecret: client_secret,
          applePay: { merchantCountryCode: 'CA', merchantIdentifier: 'merchant.com.maisonfraise.app' },
          googlePay: { merchantCountryCode: 'CA', testEnv: __DEV__ },
          defaultBillingDetails: { email },
          appearance: {
            colors: {
              primary: c.accent, background: '#FFFFFF',
              componentBackground: '#F7F5F2', componentText: '#1C1C1E',
              componentBorder: '#E5E1DA', placeholderText: '#8E8E93',
            },
          },
        });
        if (initErr) throw new Error(initErr.message);
        TrueSheet.present(SHEET_NAME, 0);
        const { error: presentErr } = await presentPaymentSheet();
        if (presentErr) {
          setTimeout(() => TrueSheet.present(SHEET_NAME, 1), 150);
          if (presentErr.code === 'Canceled') { setPaying(false); return; }
          throw new Error(presentErr.message);
        }
        paymentCollected = true;
        confirmed = await confirmOrder(created.id);
      }

      if (confirmed.user_db_id) await AsyncStorage.setItem('user_db_id', String(confirmed.user_db_id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmedOrder(confirmed);
      setOrderStep('confirmed');
      setOrder({ order_id: confirmed.id, order_status: confirmed.status, delivery_date: (confirmed as any).delivery_date ?? null, location_id: location.id });
      // Refresh order history
      fetchOrdersByEmail()
        .then((orders: any[]) => {
          const paid = orders.filter((o: any) => o.status === 'paid' || o.status === 'confirmed').sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
          setRecentOrders(paid.slice(0, 5));
        }).catch(() => {});
    } catch (err: unknown) {
      if (paymentCollected) {
        Alert.alert('Payment received.', 'Your order is confirmed — check your order history for details.');
        setTimeout(() => TrueSheet.present(SHEET_NAME, 1), 150);
      } else {
        Alert.alert('Something went wrong.', err instanceof Error ? err.message : 'Try again.');
      }
    } finally {
      setPaying(false);
    }
  };

  const handlePayWithBalance = async () => {
    if (!location?.id || !inlineOrder.variety_id || !inlineOrder.chocolate || !inlineOrder.finish) {
      Alert.alert('Incomplete', 'Something is missing from your order.'); return;
    }
    setPaying(true);
    try {
      const confirmed = await payOrderWithBalance({
        variety_id: inlineOrder.variety_id!,
        location_id: location.id,
        chocolate: inlineOrder.chocolate!,
        finish: inlineOrder.finish!,
        quantity: inlineOrder.quantity,
        is_gift: false,
        push_token: pushToken,
        gift_note: null,
      });
      if (confirmed.user_db_id) await AsyncStorage.setItem('user_db_id', String(confirmed.user_db_id));
      setAdBalanceCents(prev => prev - totalCents);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmedOrder(confirmed);
      setOrderStep('confirmed');
      setOrder({ order_id: confirmed.id, order_status: confirmed.status, delivery_date: (confirmed as any).delivery_date ?? null, location_id: location.id });
      fetchOrdersByEmail()
        .then((orders: any[]) => {
          const paid = orders.filter((o: any) => o.status === 'paid' || o.status === 'confirmed').sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
          setRecentOrders(paid.slice(0, 5));
        }).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Try again.';
      if (msg === 'insufficient_balance') {
        Alert.alert('Insufficient balance', 'Your ad earnings don\'t cover this order. Pay with card instead.');
      } else if (msg === 'sold_out') {
        Alert.alert('Sold out', 'This variety is no longer available.');
      } else {
        Alert.alert('Something went wrong.', msg);
      }
    } finally {
      setPaying(false);
    }
  };

  const lastOrder = recentOrders[0] ?? null;

  const totalCents = (inlineOrder.price_cents ?? 0) * inlineOrder.quantity;

  // Step label helpers
  const stepDone = (step: OrderStep) => {
    const order = ['variety', 'chocolate', 'finish', 'quantity', 'review', 'confirmed'];
    return order.indexOf(orderStep) > order.indexOf(step);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : userEmail ? (
          <>
            {/* ── Operator (shop) view ── */}
            {false && isShop ? (
              <View style={styles.operatorBlock}>
                <Text style={[styles.operatorTag, { color: c.accent }]}>fraise.chat</Text>
                <TouchableOpacity onPress={handleSignOut} onLongPress={handleSignOut} delayLongPress={600} activeOpacity={0.7}>
                  <Text style={[styles.name, { color: c.text }]}>{displayName}</Text>
                </TouchableOpacity>
                {fraiseChatEmail && (
                  <Text style={[styles.chatEmail, { color: c.muted }]}>{fraiseChatEmail}</Text>
                )}
                <View style={[styles.divider, { backgroundColor: c.border, marginTop: 20 }]} />
                <TouchableOpacity
                  style={styles.inboxBtn}
                  onPress={() => showPanel('conversations')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.label, { color: c.muted }]}>INBOX</Text>
                  <Text style={[styles.label, { color: c.accent }]}>→</Text>
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                {showIdVerify ? (
                  <View style={styles.block}>
                    <Text style={[styles.label, { color: c.muted }]}>MEMBER CODE</Text>
                    <TextInput
                      style={[styles.operatorInput, { color: c.text, borderColor: c.border, marginTop: 8 }]}
                      placeholder="e.g. ABC123"
                      placeholderTextColor={c.muted}
                      value={idVerifyCode}
                      onChangeText={t => setIdVerifyCode(t.toUpperCase())}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={8}
                      returnKeyType="go"
                    />
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}
                      onPress={() => setIdVerifyAttested(v => !v)}
                      activeOpacity={0.7}
                    >
                      <View style={{
                        width: 18, height: 18, borderRadius: 4,
                        borderWidth: 1.5, borderColor: idVerifyAttested ? c.text : c.border,
                        backgroundColor: idVerifyAttested ? c.text : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {idVerifyAttested && <Text style={{ color: c.background, fontSize: 11, fontWeight: '700' }}>✓</Text>}
                      </View>
                      <Text style={[styles.demoText, { color: c.muted, flex: 1 }]}>
                        I have physically examined this member's government-issued ID
                      </Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                      <TouchableOpacity
                        style={[styles.operatorSubmit, { backgroundColor: c.text, flex: 1 }, (idVerifyLoading || !idVerifyAttested) && { opacity: 0.4 }]}
                        disabled={idVerifyLoading || !idVerifyCode.trim() || !idVerifyAttested}
                        onPress={async () => {
                          if (!idVerifyCode.trim() || idVerifyLoading || !idVerifyAttested) return;
                          setIdVerifyLoading(true);
                          try {
                            await startIdentityVerification(idVerifyCode.trim());
                            Alert.alert('Sent', 'Member will be notified to complete their ID scan.');
                            setIdVerifyCode('');
                            setIdVerifyAttested(false);
                            setShowIdVerify(false);
                          } catch (e: any) {
                            const msg = e.message === 'user_not_found' ? 'Member not found.'
                              : e.message === 'user_must_be_nfc_verified_first' ? 'Member must have collected an order in person first.'
                              : 'Could not start verification.';
                            Alert.alert('Error', msg);
                          } finally {
                            setIdVerifyLoading(false);
                          }
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.demoText, { color: c.ctaText }]}>
                          {idVerifyLoading ? 'starting…' : 'start verification'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setShowIdVerify(false); setIdVerifyCode(''); setIdVerifyAttested(false); }}
                        activeOpacity={0.6}
                        style={[styles.operatorSubmit, { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, flex: 0.4 }]}
                      >
                        <Text style={[styles.demoText, { color: c.muted }]}>cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.inboxBtn}
                    onPress={() => setShowIdVerify(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.label, { color: c.muted }]}>ID VERIFY</Text>
                    <Text style={[styles.label, { color: c.accent }]}>→</Text>
                  </TouchableOpacity>
                )}
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('variety-management')} activeOpacity={0.7}>
                  <Text style={[styles.label, { color: c.muted }]}>VARIETIES</Text>
                  <Text style={[styles.label, { color: c.accent }]}>→</Text>
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('tournament-operator')} activeOpacity={0.7}>
                  <Text style={[styles.label, { color: c.muted }]}>TOURNAMENTS</Text>
                  <Text style={[styles.label, { color: c.accent }]}>→</Text>
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('ad-campaigns')} activeOpacity={0.7}>
                  <Text style={[styles.label, { color: c.muted }]}>AD CAMPAIGNS</Text>
                  <Text style={[styles.label, { color: c.accent }]}>→</Text>
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: c.border }]} />
              </View>
            ) : (
            <>
            {/* Identity block */}
            {false && <View style={styles.identityBlock}>
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
                <TouchableOpacity onPress={() => setEditingName(true)} onLongPress={handleSignOut} delayLongPress={600} activeOpacity={0.7}>
                  <Text style={[styles.name, { color: c.text }]}>{displayName || 'Add a name'}</Text>
                </TouchableOpacity>
              )}
              {fraiseChatEmail ? (
                <TouchableOpacity onPress={() => showPanel('conversations')} activeOpacity={0.7}>
                  <Text style={[styles.chatEmail, { color: c.muted }]}>{fraiseChatEmail}</Text>
                </TouchableOpacity>
              ) : null}
              {adBalanceCents > 0 && (
                <Text style={[styles.chatEmail, { color: c.muted }]}>
                  ad earnings: CA${(adBalanceCents / 100).toFixed(2)}
                </Text>
              )}
            </View>}

            {/* ORDER section */}
            <View style={styles.orderBody}>

                {/* No location warning */}
                {!location && (
                  <View style={styles.noLocationBlock}>
                    <Text style={[styles.noLocationText, { color: c.muted }]}>no location selected</Text>
                    <Text style={[styles.noLocationHint, { color: c.muted }]}>tap a marker on the map to choose a shop</Text>
                  </View>
                )}

                {/* Confirmed state */}
                {orderStep === 'confirmed' && confirmedOrder && (
                  <View style={styles.confirmedBlock}>
                    <Text style={[styles.confirmedTitle, { color: c.text }]}>
                      {confirmedOrder.status === 'queued' ? 'in the queue' : 'order placed'}
                    </Text>
                    <Text style={[styles.confirmedDetail, { color: c.muted }]}>
                      {inlineOrder.variety_name}{'  ·  '}{inlineOrder.chocolate_name}{'  ·  '}{inlineOrder.finish_name}{'  ·  '}×{inlineOrder.quantity}
                    </Text>
                    <Text style={[styles.confirmedDetail, { color: c.muted }]}>{location?.name}</Text>
                    {confirmedOrder.status === 'queued' ? (
                      <Text style={[styles.confirmedHint, { color: c.muted }]}>we'll notify you when your batch fills</Text>
                    ) : confirmedOrder.nfc_token ? (
                      <Text style={[styles.confirmedHint, { color: c.accent }]}>tap to collect at the shop</Text>
                    ) : null}
                    {location?.shop_user_id && (
                      <TouchableOpacity
                        onPress={() => {
                          setPanelData({
                            userId: location.shop_user_id,
                            displayName: location.name,
                            isShop: true,
                          });
                          showPanel('messageThread');
                        }}
                        style={styles.openConvoBtn}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.label, { color: c.text }]}>open conversation  →</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => { resetInlineOrder(); }} style={styles.newOrderBtn} activeOpacity={0.7}>
                      <Text style={[styles.label, { color: c.accent }]}>NEW ORDER</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Step: Variety */}
                {location && orderStep !== 'confirmed' && (
                  <>
                    {stepDone('variety') ? (
                      <TouchableOpacity onPress={() => { setOrderStep('variety'); setInlineOrder(p => ({ ...p, chocolate: null, chocolate_name: null, finish: null, finish_name: null })); }} activeOpacity={0.7}>
                        <Text style={[styles.stepSummary, { color: c.text }]}>{inlineOrder.variety_name}</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <Text style={[styles.stepLabel, { color: c.muted }]}>variety</Text>
                        {varieties.length === 0 ? (
                          <Text style={[styles.emptyHint, { color: c.muted }]}>No varieties available today.</Text>
                        ) : (
                          varieties.map((v, i) => (
                            <React.Fragment key={v.id}>
                              {i > 0 && <View style={[styles.rowDivider, { backgroundColor: c.border }]} />}
                              <TouchableOpacity
                                style={styles.optionRow}
                                onPress={() => {
                                  setInlineOrder(p => ({ ...p, variety_id: v.id, variety_name: v.name, price_cents: v.price_cents }));
                                  setOrderStep('chocolate');
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.optionName, { color: c.text }]}>{v.name}</Text>
                                <Text style={[styles.optionMeta, { color: c.muted }]}>CA${(v.price_cents / 100).toFixed(0)}</Text>
                              </TouchableOpacity>
                            </React.Fragment>
                          ))
                        )}
                      </>
                    )}

                    {/* Step: Chocolate */}
                    {(orderStep === 'chocolate' || stepDone('chocolate')) && (
                      <>
                        <View style={[styles.rowDivider, { backgroundColor: c.border }]} />
                        {stepDone('chocolate') ? (
                          <TouchableOpacity onPress={() => { setOrderStep('chocolate'); setInlineOrder(p => ({ ...p, finish: null, finish_name: null })); }} activeOpacity={0.7}>
                            <Text style={[styles.stepSummary, { color: c.muted }]}>{inlineOrder.chocolate_name}</Text>
                          </TouchableOpacity>
                        ) : (
                          <>
                            <Text style={[styles.stepLabel, { color: c.muted }]}>chocolate</Text>
                            {CHOCOLATES.map((choc, i) => (
                              <React.Fragment key={choc.id}>
                                {i > 0 && <View style={[styles.rowDivider, { backgroundColor: c.border }]} />}
                                <TouchableOpacity
                                  style={styles.optionRow}
                                  onPress={() => {
                                    setInlineOrder(p => ({ ...p, chocolate: choc.id, chocolate_name: choc.name }));
                                    setOrderStep('finish');
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <View style={[styles.swatch, { backgroundColor: choc.swatchColor }]} />
                                  <Text style={[styles.optionName, { color: c.text }]}>{choc.name}</Text>
                                </TouchableOpacity>
                              </React.Fragment>
                            ))}
                          </>
                        )}
                      </>
                    )}

                    {/* Step: Finish */}
                    {(orderStep === 'finish' || stepDone('finish')) && (
                      <>
                        <View style={[styles.rowDivider, { backgroundColor: c.border }]} />
                        {stepDone('finish') ? (
                          <TouchableOpacity onPress={() => { setOrderStep('finish'); }} activeOpacity={0.7}>
                            <Text style={[styles.stepSummary, { color: c.muted }]}>{inlineOrder.finish_name}</Text>
                          </TouchableOpacity>
                        ) : (
                          <>
                            <Text style={[styles.stepLabel, { color: c.muted }]}>finish</Text>
                            {FINISHES.map((fin, i) => (
                              <React.Fragment key={fin.id}>
                                {i > 0 && <View style={[styles.rowDivider, { backgroundColor: c.border }]} />}
                                <TouchableOpacity
                                  style={styles.optionRow}
                                  onPress={() => {
                                    setInlineOrder(p => ({ ...p, finish: fin.id, finish_name: fin.name }));
                                    setOrderStep('quantity');
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.optionName, { color: c.text }]}>{fin.name}</Text>
                                  {fin.description && <Text style={[styles.optionMeta, { color: c.muted }]}>{fin.description}</Text>}
                                </TouchableOpacity>
                              </React.Fragment>
                            ))}
                          </>
                        )}
                      </>
                    )}

                    {/* Step: Quantity */}
                    {(orderStep === 'quantity' || stepDone('quantity')) && (
                      <>
                        <View style={[styles.rowDivider, { backgroundColor: c.border }]} />
                        {stepDone('quantity') ? (
                          <TouchableOpacity onPress={() => { setOrderStep('quantity'); }} activeOpacity={0.7}>
                            <Text style={[styles.stepSummary, { color: c.muted }]}>×{inlineOrder.quantity}</Text>
                          </TouchableOpacity>
                        ) : (
                          <>
                            <Text style={[styles.stepLabel, { color: c.muted }]}>quantity</Text>
                            <View style={styles.qtyRow}>
                              <TouchableOpacity onPress={() => setInlineOrder(p => ({ ...p, quantity: Math.max(1, p.quantity - 1) }))} activeOpacity={0.7} style={styles.qtyBtn}>
                                <Text style={[styles.qtyBtnText, { color: c.accent }]}>−</Text>
                              </TouchableOpacity>
                              <Text style={[styles.qtyValue, { color: c.text }]}>{inlineOrder.quantity}</Text>
                              <TouchableOpacity onPress={() => setInlineOrder(p => ({ ...p, quantity: Math.min(12, p.quantity + 1) }))} activeOpacity={0.7} style={styles.qtyBtn}>
                                <Text style={[styles.qtyBtnText, { color: c.accent }]}>+</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setOrderStep('review')} activeOpacity={0.7} style={styles.qtyConfirm}>
                                <Text style={[styles.label, { color: c.accent }]}>CONFIRM</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </>
                    )}

                    {/* Step: Review */}
                    {orderStep === 'review' && (
                      <>
                        <View style={[styles.rowDivider, { backgroundColor: c.border }]} />
                        <View style={styles.reviewBlock}>
                          <Text style={[styles.reviewVariety, { color: c.text }]}>{inlineOrder.variety_name}</Text>
                          <Text style={[styles.reviewDetail, { color: c.muted }]}>
                            {inlineOrder.chocolate_name}{'  ·  '}{inlineOrder.finish_name}{'  ·  '}×{inlineOrder.quantity}
                          </Text>
                          <Text style={[styles.reviewDetail, { color: c.muted }]}>{location?.name}</Text>
                          <View style={styles.reviewFooter}>
                            <Text style={[styles.reviewTotal, { color: c.text }]}>CA${(totalCents / 100).toFixed(2)}</Text>
                            <View style={styles.reviewPayBtns}>
                              {userDbId && adBalanceCents >= totalCents && (
                                <TouchableOpacity
                                  style={[styles.payBtn, { backgroundColor: c.accent }, paying && { opacity: 0.5 }]}
                                  onPress={handlePayWithBalance}
                                  disabled={paying}
                                  activeOpacity={0.8}
                                >
                                  <Text style={[styles.payBtnText, { color: c.ctaText }]}>
                                    {paying ? 'Processing…' : `use ad balance  ·  CA$${(adBalanceCents / 100).toFixed(2)}`}
                                  </Text>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                style={[styles.payBtn, userDbId && adBalanceCents >= totalCents ? [styles.payBtnOutline, { borderColor: c.border }] : { backgroundColor: c.accent }, paying && { opacity: 0.5 }]}
                                onPress={handlePay}
                                disabled={paying}
                                activeOpacity={0.8}
                              >
                                <Text style={[styles.payBtnText, { color: userDbId && adBalanceCents >= totalCents ? c.text : c.ctaText }]}>
                                  {paying ? 'Processing…' : 'pay with card'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </>
                    )}
                  </>
                )}
              </View>

            {reviewMode && (<>
            {/* VENTURES */}
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('ventures')} activeOpacity={0.7}>
              <Text style={[styles.label, { color: c.muted }]}>VENTURES</Text>
              <Text style={[styles.label, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('venture-earnings')} activeOpacity={0.7}>
              <Text style={[styles.label, { color: c.muted }]}>VENTURE EARNINGS</Text>
              <Text style={[styles.label, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            {myVentures.length > 0 && myVentures.map((v: any) => (
              <TouchableOpacity
                key={v.id}
                style={styles.myVentureRow}
                onPress={() => showPanel('venture-detail', { ventureId: v.id })}
                activeOpacity={0.7}
              >
                <Text style={[styles.myVentureName, { color: c.text }]} numberOfLines={1}>{v.name}</Text>
                {v.ceo_type === 'dorotka' && (
                  <Text style={[styles.myVentureTag, { color: c.accent, borderColor: c.accent }]}>D</Text>
                )}
              </TouchableOpacity>
            ))}

            {/* MARKET section */}
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('market')} activeOpacity={0.7}>
              <Text style={[styles.label, { color: c.muted }]}>MARKET</Text>
              <Text style={[styles.label, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            {marketOrders.length > 0 && marketOrders.slice(0, 3).map((mo: any) => (
              <TouchableOpacity
                key={mo.id}
                style={[styles.marketOrderRow, { borderBottomColor: c.border }]}
                onPress={async () => {
                  if (mo.status !== 'paid') return;
                  Alert.alert(
                    'Confirm collection?',
                    `${mo.product_name} from ${mo.vendor_name}`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Collected', onPress: async () => {
                          try {
                            await collectMarketOrder(mo.id);
                            setMarketOrders(prev => prev.map(o => o.id === mo.id ? { ...o, status: 'collected' } : o));
                          } catch { Alert.alert('Error', 'Could not confirm collection.'); }
                        }
                      },
                    ]
                  );
                }}
                activeOpacity={mo.status === 'paid' ? 0.7 : 1}
              >
                <View style={styles.marketOrderLeft}>
                  <Text style={[styles.marketOrderName, { color: c.text }]} numberOfLines={1}>{mo.product_name}</Text>
                  <Text style={[styles.marketOrderMeta, { color: c.muted }]}>{mo.vendor_name}  ·  {mo.market_name}</Text>
                </View>
                <Text style={[styles.marketOrderStatus, { color: mo.status === 'paid' ? c.accent : c.muted }]}>
                  {mo.status === 'paid' ? 'collect →' : mo.status}
                </Text>
              </TouchableOpacity>
            ))}
            {isVerified && (
              <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('vendor-stall')} activeOpacity={0.7}>
                <Text style={[styles.label, { color: c.muted }]}>MY STALL</Text>
                <Text style={[styles.label, { color: c.accent }]}>→</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('personal-toilet')} activeOpacity={0.7}>
              <Text style={[styles.label, { color: c.muted }]}>MY TOILET</Text>
              <Text style={[styles.label, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('itinerary')} activeOpacity={0.7}>
              <Text style={[styles.label, { color: c.muted }]}>ITINERARIES</Text>
              <Text style={[styles.label, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('health-profile')} activeOpacity={0.7}>
              <Text style={[styles.label, { color: c.muted }]}>HEALTH PROFILE</Text>
              <Text style={[styles.label, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('portrait-tokens')} activeOpacity={0.7}>
              <Text style={[styles.label, { color: c.muted }]}>PORTRAIT TOKENS</Text>
              <Text style={[styles.label, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('reservation-discovery')} activeOpacity={0.7}>
              <Text style={[styles.label, { color: c.muted }]}>SPONSORED DINNERS</Text>
              <Text style={[styles.label, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('reservation-booking')} activeOpacity={0.7}>
              <Text style={[styles.label, { color: c.muted }]}>MY BOOKINGS</Text>
              <Text style={[styles.label, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            {isVerified && !isShop && nodeApplication !== undefined && (
              <>
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                {nodeApplication === null ? (
                  <>
                    <Text style={[styles.label, { color: c.muted, paddingVertical: 10 }]}>BECOME A PICKUP NODE</Text>
                    <TextInput
                      style={[styles.nodeAppInput, { color: c.text, borderColor: c.border }]}
                      placeholder="Business name"
                      placeholderTextColor={c.muted}
                      value={nodeAppForm.business_name}
                      onChangeText={v => setNodeAppForm(p => ({ ...p, business_name: v }))}
                      returnKeyType="next"
                    />
                    <TextInput
                      style={[styles.nodeAppInput, { color: c.text, borderColor: c.border }]}
                      placeholder="Address"
                      placeholderTextColor={c.muted}
                      value={nodeAppForm.address}
                      onChangeText={v => setNodeAppForm(p => ({ ...p, address: v }))}
                      returnKeyType="next"
                    />
                    <TextInput
                      style={[styles.nodeAppInput, { color: c.text, borderColor: c.border }]}
                      placeholder="Neighbourhood (optional)"
                      placeholderTextColor={c.muted}
                      value={nodeAppForm.neighbourhood}
                      onChangeText={v => setNodeAppForm(p => ({ ...p, neighbourhood: v }))}
                      returnKeyType="next"
                    />
                    <TextInput
                      style={[styles.nodeAppInput, styles.nodeAppTextarea, { color: c.text, borderColor: c.border }]}
                      placeholder="Tell us about your space (optional)"
                      placeholderTextColor={c.muted}
                      value={nodeAppForm.description}
                      onChangeText={v => setNodeAppForm(p => ({ ...p, description: v }))}
                      multiline
                      returnKeyType="next"
                    />
                    <TextInput
                      style={[styles.nodeAppInput, { color: c.text, borderColor: c.border }]}
                      placeholder="Instagram handle (optional)"
                      placeholderTextColor={c.muted}
                      value={nodeAppForm.instagram_handle}
                      onChangeText={v => setNodeAppForm(p => ({ ...p, instagram_handle: v }))}
                      autoCapitalize="none"
                      returnKeyType="done"
                    />
                    <TouchableOpacity
                      style={[styles.nodeAppSubmitBtn, { backgroundColor: nodeAppSubmitting ? c.border : c.accent }]}
                      onPress={handleSubmitNodeApp}
                      disabled={nodeAppSubmitting}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.nodeAppSubmitText, { color: c.ctaText ?? '#fff' }]}>
                        {nodeAppSubmitting ? 'Submitting…' : 'Apply'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : nodeApplication.status === 'pending' ? (
                  <View style={[styles.nodeAppStatus, { borderColor: c.border }]}>
                    <Text style={[styles.label, { color: c.muted }]}>NODE APPLICATION</Text>
                    <Text style={[styles.nodeAppStatusName, { color: c.text }]}>{nodeApplication.business_name}</Text>
                    <Text style={[styles.nodeAppStatusBadge, { color: c.muted }]}>Under review</Text>
                  </View>
                ) : nodeApplication.status === 'rejected' ? (
                  <View style={[styles.nodeAppStatus, { borderColor: c.border }]}>
                    <Text style={[styles.label, { color: c.muted }]}>NODE APPLICATION</Text>
                    <Text style={[styles.nodeAppStatusName, { color: c.text }]}>{nodeApplication.business_name}</Text>
                    <Text style={[styles.nodeAppStatusBadge, { color: c.muted }]}>
                      Not approved{nodeApplication.admin_notes ? ` · ${nodeApplication.admin_notes}` : ''}
                    </Text>
                    <TouchableOpacity
                      style={[styles.nodeAppSubmitBtn, { backgroundColor: c.accent, marginTop: 8 }]}
                      onPress={() => setNodeApplication(null)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.nodeAppSubmitText, { color: c.ctaText ?? '#fff' }]}>Apply again</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            )}

            {isShop && (
              <>
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('business-menu')} activeOpacity={0.7}>
                  <Text style={[styles.label, { color: c.muted }]}>RESTAURANT MENU</Text>
                  <Text style={[styles.label, { color: c.accent }]}>→</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('reservation-offers')} activeOpacity={0.7}>
                  <Text style={[styles.label, { color: c.muted }]}>SPONSORED DINNERS ↑</Text>
                  <Text style={[styles.label, { color: c.accent }]}>→</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('portrait-licensing')} activeOpacity={0.7}>
                  <Text style={[styles.label, { color: c.muted }]}>PORTRAIT LICENSING</Text>
                  <Text style={[styles.label, { color: c.accent }]}>→</Text>
                </TouchableOpacity>
              </>
            )}
            {isShop && (
              <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('market-admin')} activeOpacity={0.7}>
                <Text style={[styles.label, { color: c.muted }]}>MARKET ADMIN</Text>
                <Text style={[styles.label, { color: c.accent }]}>→</Text>
              </TouchableOpacity>
            )}

            {/* AD OFFERS */}
            {availableAds.length > 0 && (
              <>
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                <Text style={[styles.label, { color: c.muted, paddingVertical: 10 }]}>AD OFFERS</Text>
                {availableAds.map((ad: any) => (
                  <View key={ad.impression_id} style={[styles.adOfferCard, { borderColor: c.border, backgroundColor: c.card }]}>
                    <View style={styles.adOfferTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.adOfferBiz, { color: c.accent }]}>{ad.business_name.toUpperCase()}</Text>
                        <Text style={[styles.adOfferTitle, { color: c.text }]}>{ad.title}</Text>
                        <Text style={[styles.adOfferBody, { color: c.muted }]} numberOfLines={3}>{ad.body}</Text>
                      </View>
                      <Text style={[styles.adOfferValue, { color: c.accent }]}>CA${(ad.value_cents / 100).toFixed(2)}</Text>
                    </View>
                    <View style={styles.adOfferBtns}>
                      <TouchableOpacity
                        style={[styles.adOfferBtn, { borderColor: c.border }]}
                        onPress={async () => {
                          try {
                            await respondToAdImpression(ad.impression_id, false);
                            setAvailableAds(prev => prev.filter(a => a.impression_id !== ad.impression_id));
                          } catch { /* ignore */ }
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.adOfferBtnText, { color: c.muted }]}>deny</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.adOfferBtn, { backgroundColor: c.accent }]}
                        onPress={async () => {
                          try {
                            const { new_balance_cents } = await respondToAdImpression(ad.impression_id, true);
                            setAdBalanceCents(new_balance_cents);
                            setAvailableAds(prev => prev.filter(a => a.impression_id !== ad.impression_id));
                          } catch { /* ignore */ }
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.adOfferBtnText, { color: c.ctaText ?? '#fff' }]}>accept</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

</>)}

            {/* ── Utility shortcuts ── */}
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('verifyNFC')} activeOpacity={0.7}>
              <Text style={[styles.label, { color: c.muted }]}>SCAN BOX</Text>
              <Text style={[styles.label, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
            {isStaff && (
              <>
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('nfc-write', { nfc_token: 'fraise-thankyou' })} activeOpacity={0.7}>
                  <Text style={[styles.label, { color: c.muted }]}>WRITE GENERIC TAG</Text>
                  <Text style={[styles.label, { color: c.accent }]}>→</Text>
                </TouchableOpacity>
                {location?.allows_walkin && (
                  <>
                    <View style={[styles.divider, { backgroundColor: c.border }]} />
                    <TouchableOpacity style={styles.inboxBtn} onPress={() => showPanel('walk-in-write')} activeOpacity={0.7}>
                      <Text style={[styles.label, { color: c.muted }]}>WRITE WALK-IN TAGS</Text>
                      <Text style={[styles.label, { color: c.accent }]}>→</Text>
                    </TouchableOpacity>
                  </>
                )}
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                {staffPinNeeded ? (
                  <View style={styles.staffPinRow}>
                    <TextInput
                      style={[styles.staffPinInput, { color: c.text, borderColor: c.border, fontFamily: fonts.dmMono }]}
                      value={staffPinInput}
                      onChangeText={setStaffPinInput}
                      placeholder="staff pin"
                      placeholderTextColor={c.muted}
                      secureTextEntry
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={async () => {
                        const pin = staffPinInput.trim();
                        if (!pin) return;
                        const today = new Date().toISOString().slice(0, 10);
                        try {
                          const data = await fetchStaffOrders(pin, today);
                          await AsyncStorage.setItem('staff_pin', pin);
                          setStaffPin(pin);
                          setStaffOrders(data);
                          setStaffPinNeeded(false);
                        } catch { Alert.alert('Incorrect PIN'); }
                      }}
                    />
                  </View>
                ) : staffOrders.filter(o => o.nfc_token && ['paid','preparing','ready'].includes(o.status)).length > 0 ? (
                  <>
                    <Text style={[styles.label, { color: c.muted, paddingVertical: 10 }]}>TAG BOXES</Text>
                    {staffOrders
                      .filter(o => o.nfc_token && ['paid','preparing','ready'].includes(o.status))
                      .map(o => (
                        <TouchableOpacity
                          key={o.id}
                          style={[styles.staffOrderRow, { borderBottomColor: c.border }]}
                          onPress={() => showPanel('nfc-write', {
                            nfc_token: o.nfc_token,
                            variety_name: o.variety_name,
                            customer_email: o.customer_email,
                          })}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.staffOrderName, { color: c.text, fontFamily: fonts.playfair }]}>{o.variety_name}</Text>
                            <Text style={[styles.staffOrderMeta, { color: c.muted, fontFamily: fonts.dmMono }]}>{o.customer_email}</Text>
                          </View>
                          <Text style={[styles.label, { color: c.accent }]}>TAG →</Text>
                        </TouchableOpacity>
                      ))}
                  </>
                ) : null}
              </>
            )}
            {reviewMode && (
              <>
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                <TouchableOpacity
                  style={styles.inboxBtn}
                  onPress={() => ARBoxModule.presentAR({
                    variety_id: 1, variety_name: 'Albion', farm: 'Domaine Lacroix',
                    harvest_date: '2026-04-05', quantity: 2, chocolate: 'dark', finish: 'floral',
                    brix_score: 11.4, growing_method: 'organic', altitude_m: 320,
                    soil_type: 'sandy loam', farm_photo_url: null,
                    tasting_notes: ['bright', 'citrus', 'sweet'],
                    variety_description: 'A classic Californian variety with bright acidity and rich sweetness.',
                    carbon_footprint_kg: 0.12, sunlight_hours: 8,
                    pairing_suggestions: ['dark chocolate', 'aged brie'],
                    collectif_name: null, show_referral_bubble: false,
                    tasting_word_cloud: [], batch_members: [], lot_companions: [],
                  }).catch(() => {})}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.label, { color: c.muted }]}>TRY AR</Text>
                  <Text style={[styles.label, { color: c.accent }]}>→</Text>
                </TouchableOpacity>
              </>
            )}

</>
            )}
          </>
        ) : (
          <View style={styles.signInBlock}>
            <Text style={[styles.signInPrompt, { color: c.muted }]}>sign in to continue</Text>
            <View style={styles.signInButtons}>
              {signingIn ? <ActivityIndicator color={c.accent} /> : showOperatorLogin ? (
                <>
                  <TextInput
                    style={[styles.operatorInput, { color: c.text, borderColor: c.border }]}
                    placeholder="operator code"
                    placeholderTextColor={c.muted}
                    value={operatorCode}
                    onChangeText={t => setOperatorCode(t.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={6}
                    returnKeyType="go"
                    onSubmitEditing={handleOperatorLogin}
                  />
                  <TouchableOpacity onPress={handleOperatorLogin} activeOpacity={0.7} style={[styles.operatorSubmit, { backgroundColor: c.accent }]}>
                    <Text style={[styles.demoText, { color: c.ctaText }]}>log in as operator</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowOperatorLogin(false); setOperatorCode(''); }} activeOpacity={0.6}>
                    <Text style={[styles.demoText, { color: c.muted }]}>cancel</Text>
                  </TouchableOpacity>
                </>
              ) : (
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
                  <TouchableOpacity onPress={() => setShowOperatorLogin(true)} activeOpacity={0.6}>
                    <Text style={[styles.demoText, { color: c.muted }]}>operator login</Text>
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
  identityBlock: { paddingTop: 4, paddingBottom: SPACING.md, gap: 6, alignItems: 'center' },
  name: { fontSize: 32, fontFamily: fonts.playfair, textAlign: 'center' },
  nameInput: { fontSize: 32, fontFamily: fonts.playfair, padding: 0, textAlign: 'center' },
  chatEmail: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  divider: { height: StyleSheet.hairlineWidth },
  block: { paddingVertical: SPACING.md, gap: 8 },
  blockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  orderToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  orderToggleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  noLocationBlock: { paddingVertical: 12, gap: 6 },
  noLocationText: { fontSize: 13, fontFamily: fonts.playfair, fontStyle: 'italic' },
  noLocationHint: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  orderHint: { flex: 1, fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5, textAlign: 'center' },
  orderBody: { paddingBottom: SPACING.md, gap: 0 },
  stepLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, paddingTop: 12, paddingBottom: 4 },
  stepSummary: { fontSize: 15, fontFamily: fonts.playfair, paddingVertical: 10 },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  optionName: { flex: 1, fontSize: 15, fontFamily: fonts.playfair },
  optionMeta: { fontSize: 11, fontFamily: fonts.dmMono },
  swatch: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  rowDivider: { height: StyleSheet.hairlineWidth },
  emptyHint: { fontSize: 12, fontFamily: fonts.dmSans, fontStyle: 'italic', paddingVertical: 8 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 20 },
  qtyBtn: { padding: 4 },
  qtyBtnText: { fontSize: 22, fontFamily: fonts.playfair, lineHeight: 28 },
  qtyValue: { fontSize: 22, fontFamily: fonts.playfair, minWidth: 32, textAlign: 'center' },
  qtyConfirm: { flex: 1, alignItems: 'flex-end' },
  dateRow: { flexDirection: 'row', gap: 6, paddingVertical: 8 },
  dateChip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 52 },
  dateLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  dateNum: { fontSize: 22, fontFamily: fonts.playfair, marginTop: 2 },
  reviewBlock: { paddingTop: 12, gap: 6 },
  reviewVariety: { fontSize: 22, fontFamily: fonts.playfair },
  reviewDetail: { fontSize: 12, fontFamily: fonts.dmMono },
  reviewFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, gap: 12 },
  reviewTotal: { fontSize: 24, fontFamily: fonts.playfair },
  reviewPayBtns: { flex: 1, gap: 8, alignItems: 'flex-end' },
  payBtn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 },
  payBtnOutline: { borderWidth: 1 },
  payBtnText: { fontSize: 14, fontFamily: fonts.dmSans, fontWeight: '700' },
  confirmedBlock: { paddingTop: 12, gap: 8 },
  confirmedTitle: { fontSize: 22, fontFamily: fonts.playfair },
  confirmedDetail: { fontSize: 12, fontFamily: fonts.dmMono },
  confirmedHint: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5, fontStyle: 'italic' },
  openConvoBtn: { paddingTop: 12, paddingBottom: 4 },
  newOrderBtn: { paddingTop: 8 },
  orderVariety: { fontSize: 22, fontFamily: fonts.playfair },
  orderDetail: { fontSize: 12, fontFamily: fonts.dmMono },
  historyRow: { gap: 2 },
  historyVariety: { fontSize: 15, fontFamily: fonts.playfair },
  historyDetail: { fontSize: 11, fontFamily: fonts.dmMono },
  signInBlock: { paddingTop: 0, alignItems: 'center', gap: 0 },
  signInPrompt: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1, paddingTop: 28, paddingBottom: SPACING.sm },
  signInButtons: { paddingTop: 48, gap: 16, alignItems: 'center', width: '100%' },
  appleBtn: { height: 44, width: '100%' },
  demoText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  operatorBlock: { paddingTop: 4, paddingBottom: SPACING.md, gap: 6, alignItems: 'center' },
  operatorTag: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase', paddingTop: 8 },
  inboxBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, width: '100%' },
  myVentureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingLeft: 12 },
  myVentureName: { fontSize: 13, fontFamily: fonts.dmSans, flex: 1 },
  myVentureTag: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1, borderWidth: 1, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  marketOrderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingLeft: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  marketOrderLeft: { flex: 1, gap: 2 },
  marketOrderName: { fontSize: 13, fontFamily: fonts.dmSans },
  marketOrderMeta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  marketOrderStatus: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  operatorInput: { width: '100%', height: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 16, fontSize: 22, fontFamily: fonts.dmMono, textAlign: 'center', letterSpacing: 4 },
  operatorSubmit: { width: '100%', height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  adOfferCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 8, gap: 10 },
  adOfferTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  adOfferBiz: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  adOfferTitle: { fontSize: 15, fontFamily: fonts.playfair, marginTop: 2 },
  adOfferBody: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 16, marginTop: 2 },
  adOfferValue: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  adOfferBtns: { flexDirection: 'row', gap: 8 },
  adOfferBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  adOfferBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  staffPinRow: { paddingHorizontal: 16, paddingVertical: 10 },
  staffPinInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, letterSpacing: 2 },
  staffOrderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  staffOrderName: { fontSize: 15 },
  staffOrderMeta: { fontSize: 10, opacity: 0.6, marginTop: 2 },
  nodeAppInput: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: fonts.dmSans,
    marginHorizontal: 16, marginBottom: 8,
  },
  nodeAppTextarea: { minHeight: 72, textAlignVertical: 'top' },
  nodeAppSubmitBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginHorizontal: 16, marginTop: 4, marginBottom: 8 },
  nodeAppSubmitText: { fontSize: 14, fontFamily: fonts.playfair },
  nodeAppStatus: { marginHorizontal: 16, marginVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, gap: 4 },
  nodeAppStatusName: { fontSize: 16, fontFamily: fonts.playfair },
  nodeAppStatusBadge: { fontSize: 12, fontFamily: fonts.dmMono },
});
