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
import { usePanel } from '../../context/PanelContext';
import {
  verifyAppleSignIn, setAuthToken, deleteAuthToken,
  fetchOrdersByEmail, fetchTimeSlots,
  demoLogin, updateDisplayName,
  createOrder, confirmOrder, operatorLogin,
} from '../../lib/api';
import { CHOCOLATES, FINISHES, getDateOptions } from '../../data/seed';
import { useColors, fonts, SPACING } from '../../theme';

const SHEET_NAME = 'main-sheet';

type OrderStep = 'variety' | 'chocolate' | 'finish' | 'quantity' | 'when' | 'review' | 'confirmed';

export default function TerminalPanel() {
  const { goHome, showPanel, setOrder, order, setActiveLocation, varieties, businesses, activeLocation, panelData, setPanelData } = usePanel();
  const { pushToken, reviewMode } = useApp();
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
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [operatorCode, setOperatorCode] = useState('');
  const [showOperatorLogin, setShowOperatorLogin] = useState(false);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
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
    date: string | null;
    time_slot_id: number | null;
    time_slot_time: string | null;
  }>({
    variety_id: null, variety_name: null, price_cents: null,
    chocolate: null, chocolate_name: null,
    finish: null, finish_name: null,
    quantity: 4,
    date: null, time_slot_id: null, time_slot_time: null,
  });
  const [slots, setSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<any | null>(null);

  const DATE_OPTIONS = useMemo(() => getDateOptions(), []);

  const location = activeLocation ?? businesses.find(b => b.id === order.location_id) ?? null;
  const isPopup = location?.type === 'popup';

  // Load time slots when date + location set
  useEffect(() => {
    if (!location?.id || !inlineOrder.date) return;
    setLoadingSlots(true);
    fetchTimeSlots(location.id, inlineOrder.date)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [location?.id, inlineOrder.date]);

  // Auto-scroll when step advances
  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  useEffect(() => {
    if (orderOpen && orderStep !== 'variety') scrollToBottom();
  }, [orderStep]);

  // Auto-set popup date on inline order when location is a popup
  useEffect(() => {
    if (isPopup && location?.launched_at && !inlineOrder.date) {
      setInlineOrder(p => ({ ...p, date: location.launched_at!.split('T')[0] }));
    }
  }, [isPopup, location?.launched_at]);

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
    ]).then(([email, verified, dbId, chatEmail, name, shopFlag]) => {
      setIsVerified(verified === 'true');
      if (shopFlag === 'true') setIsShop(true);
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

  const resetInlineOrder = () => {
    setInlineOrder({ variety_id: null, variety_name: null, price_cents: null, chocolate: null, chocolate_name: null, finish: null, finish_name: null, quantity: 4, date: null, time_slot_id: null, time_slot_time: null });
    setOrderStep('variety');
    setConfirmedOrder(null);
    setSlots([]);
  };

  const handlePay = async () => {
    const email = userEmail;
    if (!email || !email.includes('@')) { Alert.alert('Email required', 'Sign in to place an order.'); return; }
    if (!location?.id) { Alert.alert('No location', 'Select a collection point on the map first.'); return; }
    if (!inlineOrder.variety_id || !inlineOrder.chocolate || !inlineOrder.finish || !inlineOrder.time_slot_id || !inlineOrder.date) {
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
        time_slot_id: inlineOrder.time_slot_id!,
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
      setOrder({ order_id: confirmed.id, location_id: location.id });
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

  const lastOrder = recentOrders[0] ?? null;

  const totalCents = (inlineOrder.price_cents ?? 0) * inlineOrder.quantity;

  const visibleSlots = useMemo(() => {
    if (!inlineOrder.date || !DATE_OPTIONS[0]) return slots;
    const isToday = inlineOrder.date === DATE_OPTIONS[0].isoDate;
    if (!isToday) return slots;
    return slots.filter(slot => {
      const [h, m = 0] = (slot.time ?? '').split(':').map(Number);
      const slotTime = new Date(); slotTime.setHours(h, m, 0, 0);
      return slotTime > new Date();
    });
  }, [slots, inlineOrder.date, DATE_OPTIONS]);

  // Step label helpers
  const stepDone = (step: OrderStep) => {
    const order = ['variety', 'chocolate', 'finish', 'quantity', 'when', 'review', 'confirmed'];
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
            {isShop ? (
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
              </View>
            ) : (
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
                <TouchableOpacity onPress={() => setEditingName(true)} onLongPress={handleSignOut} delayLongPress={600} activeOpacity={0.7}>
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

            {/* ORDER section */}
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <View style={styles.orderToggle}>
              <TouchableOpacity
                onPress={() => {
                  if (orderStep === 'confirmed') { resetInlineOrder(); setOrderOpen(true); }
                  else setOrderOpen(v => !v);
                }}
                activeOpacity={0.7}
                style={styles.orderToggleLeft}
              >
                <Text style={[styles.label, { color: c.muted }]}>ORDER</Text>
                {location && (
                  <Text style={[styles.orderHint, { color: c.muted }]}>{location.name}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => showPanel('order-history')} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 12, right: 4 }}>
                <Text style={[styles.label, { color: c.accent }]}>→</Text>
              </TouchableOpacity>
            </View>

            {orderOpen && (
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
                    <Text style={[styles.confirmedTitle, { color: c.text }]}>order placed</Text>
                    <Text style={[styles.confirmedDetail, { color: c.muted }]}>
                      {inlineOrder.variety_name}{'  ·  '}{inlineOrder.chocolate_name}{'  ·  '}{inlineOrder.finish_name}{'  ·  '}×{inlineOrder.quantity}
                    </Text>
                    <Text style={[styles.confirmedDetail, { color: c.muted }]}>{inlineOrder.time_slot_time}  ·  {location?.name}</Text>
                    {confirmedOrder.nfc_token && (
                      <Text style={[styles.confirmedHint, { color: c.accent }]}>tap to collect at the shop</Text>
                    )}
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
                      <TouchableOpacity onPress={() => { setOrderStep('variety'); setInlineOrder(p => ({ ...p, chocolate: null, chocolate_name: null, finish: null, finish_name: null, time_slot_id: null, time_slot_time: null, date: null })); }} activeOpacity={0.7}>
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
                          <TouchableOpacity onPress={() => { setOrderStep('chocolate'); setInlineOrder(p => ({ ...p, finish: null, finish_name: null, time_slot_id: null, time_slot_time: null, date: null })); }} activeOpacity={0.7}>
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
                          <TouchableOpacity onPress={() => { setOrderStep('finish'); setInlineOrder(p => ({ ...p, time_slot_id: null, time_slot_time: null, date: null })); }} activeOpacity={0.7}>
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
                          <TouchableOpacity onPress={() => { setOrderStep('quantity'); setInlineOrder(p => ({ ...p, time_slot_id: null, time_slot_time: null, date: null })); }} activeOpacity={0.7}>
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
                              <TouchableOpacity onPress={() => setOrderStep('when')} activeOpacity={0.7} style={styles.qtyConfirm}>
                                <Text style={[styles.label, { color: c.accent }]}>CONFIRM</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </>
                    )}

                    {/* Step: When */}
                    {(orderStep === 'when' || stepDone('when')) && (
                      <>
                        <View style={[styles.rowDivider, { backgroundColor: c.border }]} />
                        {stepDone('when') ? (
                          <TouchableOpacity onPress={() => { setOrderStep('when'); setInlineOrder(p => ({ ...p, time_slot_id: null, time_slot_time: null })); }} activeOpacity={0.7}>
                            <Text style={[styles.stepSummary, { color: c.muted }]}>{inlineOrder.time_slot_time}</Text>
                          </TouchableOpacity>
                        ) : (
                          <>
                            <Text style={[styles.stepLabel, { color: c.muted }]}>when</Text>
                            {!isPopup && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
                                {DATE_OPTIONS.map((d, idx) => {
                                  const sel = inlineOrder.date === d.isoDate;
                                  return (
                                    <TouchableOpacity
                                      key={idx}
                                      style={[styles.dateChip, sel && { backgroundColor: c.accent }]}
                                      onPress={() => setInlineOrder(p => ({ ...p, date: d.isoDate, time_slot_id: null, time_slot_time: null }))}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={[styles.dateLabel, { color: sel ? 'rgba(255,255,255,0.7)' : c.muted }]}>{d.label}</Text>
                                      <Text style={[styles.dateNum, { color: sel ? '#fff' : c.text }]}>{d.dayNum}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </ScrollView>
                            )}
                            {loadingSlots ? (
                              <ActivityIndicator color={c.accent} style={{ marginVertical: 12 }} />
                            ) : visibleSlots.length === 0 && inlineOrder.date ? (
                              <Text style={[styles.emptyHint, { color: c.muted }]}>No slots available.</Text>
                            ) : (
                              visibleSlots.map((slot, i) => {
                                const available = (slot.capacity ?? 0) - (slot.booked ?? 0);
                                const sel = inlineOrder.time_slot_id === slot.id;
                                return (
                                  <React.Fragment key={slot.id}>
                                    {i > 0 && <View style={[styles.rowDivider, { backgroundColor: c.border }]} />}
                                    <TouchableOpacity
                                      style={[styles.optionRow, available <= 0 && { opacity: 0.35 }]}
                                      disabled={available <= 0}
                                      onPress={() => {
                                        setInlineOrder(p => ({ ...p, time_slot_id: slot.id, time_slot_time: slot.time?.substring(0, 5) ?? '' }));
                                        setOrderStep('review');
                                      }}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={[styles.optionName, { color: sel ? c.accent : c.text }]}>{slot.time?.substring(0, 5) ?? ''}</Text>
                                      <Text style={[styles.optionMeta, { color: c.muted }]}>{available} left</Text>
                                    </TouchableOpacity>
                                  </React.Fragment>
                                );
                              })
                            )}
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
                          <Text style={[styles.reviewDetail, { color: c.muted }]}>{inlineOrder.time_slot_time}  ·  {location?.name}</Text>
                          <View style={styles.reviewFooter}>
                            <Text style={[styles.reviewTotal, { color: c.text }]}>CA${(totalCents / 100).toFixed(2)}</Text>
                            <TouchableOpacity
                              style={[styles.payBtn, { backgroundColor: c.accent }, paying && { opacity: 0.5 }]}
                              onPress={handlePay}
                              disabled={paying}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.payBtnText, { color: c.ctaText }]}>{paying ? 'Processing…' : 'Place Order'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </>
                    )}
                  </>
                )}
              </View>
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
  reviewFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  reviewTotal: { fontSize: 24, fontFamily: fonts.playfair },
  payBtn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 },
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
  operatorInput: { width: '100%', height: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 16, fontSize: 22, fontFamily: fonts.dmMono, textAlign: 'center', letterSpacing: 4 },
  operatorSubmit: { width: '100%', height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
