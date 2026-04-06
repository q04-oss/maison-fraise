import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, Keyboard, ActivityIndicator, Alert,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStripe } from '@stripe/stripe-react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchThread, sendMessage, acceptOffer, confirmOfferPayment, fetchNearbyJobs, applyForJob, JobPosting, acceptDinnerInvite, declineDinnerInvite, confirmEveningToken } from '../../lib/api';
import { logStrawberries } from '../../lib/HealthKitService';
import { useApp } from '../../../App';

export default function MessageThreadPanel() {
  const { goBack, panelData, setPanelData, jumpToPanel, businesses, setActiveLocation, setOrder, showPanel } = usePanel();
  const { pushToken } = useApp();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [acceptingOffer, setAcceptingOffer] = useState<number | null>(null);
  const flatRef = useRef<FlatList>(null);

  const otherId: number = panelData?.userId;
  const isShop: boolean = panelData?.isShop ?? false;
  const businessId: number | null = panelData?.businessId ?? null;
  const otherName: string = panelData?.displayName ?? panelData?.userCode ?? 'Unknown';
  const otherCode: string = panelData?.userCode ?? otherName;

  const [actingInvite, setActingInvite] = useState<number | null>(null);

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<number>>(new Set());
  const [applyingJobId, setApplyingJobId] = useState<number | null>(null);
  const [loggedHealthIds, setLoggedHealthIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    AsyncStorage.multiGet(['user_db_id', 'user_email']).then(pairs => {
      const id = pairs[0][1];
      const email = pairs[1][1];
      if (id) setMyId(parseInt(id, 10));
      if (email) setMyEmail(email);
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const load = useCallback(() => {
    if (!otherId) { setLoading(false); return; }
    fetchThread(otherId)
      .then(setMessages)
      .finally(() => setLoading(false));
  }, [otherId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isShop && businessId) {
      fetchNearbyJobs(businessId).then(setJobs).catch(() => {});
    }
  }, [isShop, businessId]);

  // Poll every 5s to pick up read receipt updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (otherId) fetchThread(otherId).then(setMessages).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [otherId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [messages]);

  const handleAcceptOffer = async (messageId: number) => {
    if (!myEmail) { Alert.alert('Sign in required', 'Please sign in to place an order.'); return; }
    setAcceptingOffer(messageId);
    try {
      const { client_secret, total_cents } = await acceptOffer(messageId, myEmail, pushToken ?? undefined);
      await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Maison Fraise',
        applePay: { merchantCountryCode: 'CA' },
        style: 'alwaysLight',
      });
      const { error } = await presentPaymentSheet();
      if (error) {
        if (error.code !== 'Canceled') Alert.alert('Payment failed', error.message);
        return;
      }
      const { order_id, nfc_token } = await confirmOfferPayment(messageId);
      // Update the offer message locally to reflect paid status
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, metadata: { ...m.metadata, status: 'paid', order_id, nfc_token } } : m
      ));
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong');
    } finally {
      setAcceptingOffer(null);
    }
  };

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    if (!otherId) { setSendError('no recipient'); return; }
    const body = text.trim();
    setText('');
    setSendError(null);
    setSending(true);
    try {
      const msg = await sendMessage(otherId, body);
      setMessages(prev => [...prev, msg]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setText(body);
      setSendError(e?.message ?? 'send failed');
    } finally {
      setSending(false);
    }
  };

  const handleApplyJob = async (jobId: number) => {
    setApplyingJobId(jobId);
    try {
      await applyForJob(jobId);
      setAppliedJobIds(prev => new Set(prev).add(jobId));
    } catch (e: any) {
      if (e.message === 'Already applied') {
        setAppliedJobIds(prev => new Set(prev).add(jobId));
      } else {
        Alert.alert('could not apply', e.message ?? 'try again');
      }
    } finally {
      setApplyingJobId(null);
    }
  };

  const handleAcceptInvite = async (messageId: number) => {
    setActingInvite(messageId);
    try {
      const result = await acceptDinnerInvite(messageId);
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, metadata: { ...m.metadata, status: result.status === 'confirmed' ? 'confirmed' : 'accepted' } }
          : m
      ));
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not accept');
    } finally {
      setActingInvite(null);
    }
  };

  const handleDeclineInvite = async (messageId: number) => {
    setActingInvite(messageId);
    try {
      await declineDinnerInvite(messageId);
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, metadata: { ...m.metadata, status: 'declined' } } : m
      ));
    } catch { /* ignore */ } finally {
      setActingInvite(null);
    }
  };

  const handleRememberEvening = async (messageId: number, bookingId: number) => {
    setActingInvite(messageId);
    try {
      const result = await confirmEveningToken(bookingId);
      const newStatus = result.status === 'minted' ? 'minted' : 'remember';
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, metadata: { ...m.metadata, status: newStatus } } : m
      ));
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not confirm');
    } finally {
      setActingInvite(null);
    }
  };

  const handleOrder = () => {
    const shopBusiness = businesses?.find((b: any) => b.shop_user_id === otherId);
    if (shopBusiness) {
      setActiveLocation(shopBusiness);
      setOrder({ location_id: shopBusiness.id, location_name: shopBusiness.name });
    }
    setPanelData({ openOrder: true });
    jumpToPanel('terminal');
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingBottom: keyboardHeight }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>{otherName}</Text>
          {isShop && <Text style={[styles.shopLabel, { color: c.accent }]}>fraise.chat</Text>}
        </View>
        {isShop ? (
          <TouchableOpacity onPress={handleOrder} style={styles.orderBtn} activeOpacity={0.7}>
            <Text style={[styles.orderBtnText, { color: c.muted }]}>order →</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.messageList}
          ListHeaderComponent={jobs.length > 0 ? (
            <View>
              {jobs.map(job => {
                const applied = appliedJobIds.has(job.id);
                const applying = applyingJobId === job.id;
                const payLabel = job.pay_type === 'hourly'
                  ? `$${(job.pay_cents / 100).toFixed(0)}/hr`
                  : `$${(job.pay_cents / 100).toLocaleString()}/yr`;
                return (
                  <View key={job.id} style={[styles.jobCard, { borderColor: c.border, backgroundColor: c.card }]}>
                    <Text style={[styles.jobLabel, { color: c.accent }]}>position available</Text>
                    <Text style={[styles.jobTitle, { color: c.text }]}>{job.title}</Text>
                    <Text style={[styles.jobPay, { color: c.accent }]}>{payLabel}</Text>
                    {job.description ? (
                      <Text style={[styles.jobDesc, { color: c.muted }]}>{job.description}</Text>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => handleApplyJob(job.id)}
                      disabled={applied || applying}
                      style={[styles.jobApplyBtn, { borderColor: applied ? c.border : c.accent }]}
                      activeOpacity={0.7}
                    >
                      {applying
                        ? <ActivityIndicator size="small" color={c.accent} />
                        : <Text style={[styles.jobApplyText, { color: applied ? c.muted : c.accent }]}>
                            {applied ? 'applied ✓' : 'apply →'}
                          </Text>
                      }
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : null}
          renderItem={({ item }) => {
            const isMine = item.sender_id === myId;

            if (item.type === 'offer') {
              const meta = item.metadata ?? {};
              const isPaid = meta.status === 'paid';
              const isAccepting = acceptingOffer === item.id;
              const CHOC: Record<string, string> = { guanaja_70: 'guanaja 70%', caraibe_66: 'caraïbe 66%', jivara_40: 'jivara 40%', ivoire_blanc: 'ivoire blanc' };
              const FIN: Record<string, string> = { plain: 'plain', fleur_de_sel: 'fleur de sel', or_fin: 'or fin' };
              return (
                <View style={[styles.offerCard, { borderColor: c.border, backgroundColor: c.card }]}>
                  <View style={styles.offerHeader}>
                    <Text style={[styles.offerLabel, { color: c.accent }]}>offer</Text>
                    <Text style={[styles.messageTime, { color: c.muted }]}>{formatTime(item.created_at)}</Text>
                  </View>
                  <Text style={[styles.offerVariety, { color: c.text }]}>{meta.variety_name}</Text>
                  <Text style={[styles.offerDetail, { color: c.muted }]}>
                    {[CHOC[meta.chocolate] ?? meta.chocolate, FIN[meta.finish] ?? meta.finish, `×${meta.quantity}`].join('  ·  ')}
                  </Text>
                  <Text style={[styles.offerDetail, { color: c.muted }]}>{meta.slot_date}  {meta.slot_time}</Text>
                  <View style={styles.offerFooter}>
                    <Text style={[styles.offerPrice, { color: c.text }]}>CA${((meta.total_cents ?? 0) / 100).toFixed(2)}</Text>
                    {!isMine && !isPaid && (
                      <TouchableOpacity
                        style={[styles.offerBtn, { borderColor: c.accent }]}
                        onPress={() => handleAcceptOffer(item.id)}
                        disabled={isAccepting}
                        activeOpacity={0.7}
                      >
                        {isAccepting
                          ? <ActivityIndicator size="small" color={c.accent} />
                          : <Text style={[styles.offerBtnText, { color: c.accent }]}>pay →</Text>
                        }
                      </TouchableOpacity>
                    )}
                    {isPaid && <Text style={[styles.offerBtnText, { color: c.muted }]}>paid ✓</Text>}
                  </View>
                </View>
              );
            }

            if (item.type === 'dinner_invite') {
              const meta = item.metadata ?? {};
              const status = meta.status ?? 'pending';
              const isActing = actingInvite === item.id;
              const windowOpen = meta.window_closes_at && new Date(meta.window_closes_at) > new Date();
              const showRemember = status === 'confirmed' && windowOpen;

              if (status === 'declined') return null;

              return (
                <View style={[styles.dinnerCard, { borderColor: c.border, backgroundColor: c.card }]}>
                  <Text style={[styles.offerLabel, { color: c.accent }]}>evening invitation</Text>
                  <Text style={[styles.offerVariety, { color: c.text }]}>{meta.offer_title ?? meta.business_name}</Text>
                  <Text style={[styles.offerDetail, { color: c.muted }]}>{meta.business_name}</Text>
                  {(meta.reservation_date || meta.reservation_time) && (
                    <Text style={[styles.offerDetail, { color: c.muted }]}>
                      {[meta.reservation_date, meta.reservation_time].filter(Boolean).join(' · ')}
                    </Text>
                  )}

                  {status === 'pending' && (
                    <View style={styles.offerFooter}>
                      <TouchableOpacity
                        style={[styles.offerBtn, { borderColor: c.border }]}
                        onPress={() => handleDeclineInvite(item.id)}
                        disabled={isActing} activeOpacity={0.7}
                      >
                        {isActing ? <ActivityIndicator size="small" color={c.muted} /> :
                          <Text style={[styles.offerBtnText, { color: c.muted }]}>decline</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.offerBtn, { borderColor: c.accent }]}
                        onPress={() => handleAcceptInvite(item.id)}
                        disabled={isActing} activeOpacity={0.7}
                      >
                        {isActing ? <ActivityIndicator size="small" color={c.accent} /> :
                          <Text style={[styles.offerBtnText, { color: c.accent }]}>accept →</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  {status === 'accepted' && (
                    <Text style={[styles.offerDetail, { color: c.muted, marginTop: 8 }]}>
                      You're confirmed — waiting for your companion.
                    </Text>
                  )}

                  {status === 'confirmed' && meta.companion_name && !showRemember && (
                    <Text style={[styles.offerDetail, { color: c.muted, marginTop: 8 }]}>
                      Your companion is {meta.companion_name}.
                    </Text>
                  )}

                  {showRemember && (
                    <View>
                      {meta.companion_name && (
                        <Text style={[styles.offerDetail, { color: c.muted, marginTop: 8 }]}>
                          Evening with {meta.companion_name}.
                        </Text>
                      )}
                      <TouchableOpacity
                        style={[styles.offerBtn, { borderColor: c.accent, marginTop: 10, alignSelf: 'flex-start' }]}
                        onPress={() => handleRememberEvening(item.id, meta.booking_id)}
                        disabled={isActing} activeOpacity={0.7}
                      >
                        {isActing ? <ActivityIndicator size="small" color={c.accent} /> :
                          <Text style={[styles.offerBtnText, { color: c.accent }]}>remember this evening</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  {status === 'minted' && (
                    <View style={styles.mintedRow}>
                      <Text style={[styles.offerDetail, { color: c.accent, letterSpacing: 1 }]}>
                        evening remembered · #{String(meta.booking_id).padStart(4, '0')}
                      </Text>
                      {meta.companion_user_id && meta.companion_name && (
                        <TouchableOpacity
                          style={[styles.offerBtn, { borderColor: c.accent, marginTop: 8, alignSelf: 'flex-start' }]}
                          onPress={() => {
                            showPanel('messageThread', {
                              userId: meta.companion_user_id,
                              displayName: meta.companion_name,
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.offerBtnText, { color: c.accent }]}>
                            message {meta.companion_name} →
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {status === 'expired' && (
                    <Text style={[styles.offerDetail, { color: c.muted, marginTop: 8 }]}>
                      This evening has passed.
                    </Text>
                  )}
                </View>
              );
            }

            if (item.type === 'order_confirm') {
              const meta = item.metadata ?? {};
              return (
                <View style={[styles.confirmCard, { borderColor: c.border }]}>
                  <Text style={[styles.offerLabel, { color: c.accent }]}>confirmed</Text>
                  <Text style={[styles.confirmText, { color: c.text }]}>{meta.variety_name}</Text>
                  <Text style={[styles.offerDetail, { color: c.muted }]}>{meta.slot_date}  ·  {meta.slot_time}</Text>
                  {meta.nfc_token && (
                    <Text style={[styles.offerDetail, { color: c.accent, letterSpacing: 2 }]}>{meta.nfc_token}</Text>
                  )}
                </View>
              );
            }

            if (item.type === 'gift') {
              const meta = item.metadata ?? {};
              const isPaid = meta.status === 'confirmed';
              return (
                <View style={[styles.confirmCard, { borderColor: c.border }]}>
                  <Text style={[styles.offerLabel, { color: c.accent }]}>gift sent</Text>
                  <Text style={[styles.confirmText, { color: c.text }]}>{meta.variety_name} × {meta.quantity}</Text>
                  <Text style={[styles.offerDetail, { color: c.muted }]}>{meta.slot_date} · {meta.slot_time}</Text>
                  <Text style={[styles.offerDetail, { color: isPaid ? c.muted : c.accent }]}>
                    {isPaid ? 'confirmed ✓' : 'pending payment'}
                  </Text>
                </View>
              );
            }

            if (item.type === 'gift_confirm') {
              const meta = item.metadata ?? {};
              const alreadyLogged = loggedHealthIds.has(item.id);
              return (
                <View style={[styles.confirmCard, { borderColor: c.border }]}>
                  <Text style={[styles.offerLabel, { color: c.accent }]}>gift for you</Text>
                  <Text style={[styles.confirmText, { color: c.text }]}>{meta.variety_name} × {meta.quantity}</Text>
                  <Text style={[styles.offerDetail, { color: c.muted }]}>{meta.slot_date} · {meta.slot_time}</Text>
                  {meta.nfc_token && (
                    <Text style={[styles.offerDetail, { color: c.accent, letterSpacing: 2 }]}>{meta.nfc_token}</Text>
                  )}
                  {alreadyLogged ? (
                    <Text style={[styles.offerDetail, { color: c.muted }]}>logged to Health ✓</Text>
                  ) : (
                    <TouchableOpacity
                      onPress={async () => {
                        const qty = parseInt(String(meta.quantity), 10);
                        const ok = await logStrawberries(qty);
                        if (ok) {
                          setLoggedHealthIds(prev => new Set([...prev, item.id]));
                        } else {
                          Alert.alert('Health not available', 'Could not log to Apple Health. Check permissions in Settings.');
                        }
                      }}
                      activeOpacity={0.7}
                      style={[styles.offerBtn, { borderColor: c.border, marginTop: 8 }]}
                    >
                      <Text style={[styles.offerBtnText, { color: c.accent }]}>log {meta.quantity} strawberries to Health</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }

            return (
              <View style={[styles.message, { borderBottomColor: c.border }]}>
                <View style={styles.messageMeta}>
                  <Text style={[styles.senderLabel, { color: c.accent }]}>
                    {isMine ? 'you' : otherCode.toLowerCase()}
                  </Text>
                  <Text style={[styles.messageTime, { color: c.muted }]}>
                    {formatTime(item.created_at)}{isMine ? `  ${item.read ? '✓✓' : '✓'}` : ''}
                  </Text>
                </View>
                <Text style={[styles.messageText, { color: c.text }]}>{item.body}</Text>
              </View>
            );
          }}
        />
      )}

      {sendError && (
        <Text style={[styles.errorText, { color: c.muted, backgroundColor: c.panelBg }]}>{sendError}</Text>
      )}
      <View style={[styles.composer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md, backgroundColor: c.panelBg }]}>
        <Text style={[styles.prompt, { color: c.accent }]}>{sending ? '·' : '>'}</Text>
        <TextInput
          style={[styles.input, { color: c.text }]}
          placeholder="..."
          placeholderTextColor={c.muted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          blurOnSubmit={false}
          multiline
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() || sending}
          style={styles.sendBtn}
          activeOpacity={0.7}
        >
          <Text style={[styles.sendBtnText, { color: text.trim() && !sending ? c.accent : c.muted }]}>↑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  title: { textAlign: 'center', fontSize: 17, fontFamily: fonts.playfair },
  shopLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1 },
  headerSpacer: { width: 28 },
  messageList: { paddingVertical: SPACING.sm },
  message: { paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 5 },
  messageMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  senderLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1, textTransform: 'uppercase' },
  messageTime: { fontSize: 10, fontFamily: fonts.dmMono },
  messageText: { fontSize: 15, fontFamily: fonts.dmSans, lineHeight: 22 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  prompt: { fontSize: 15, fontFamily: fonts.dmMono, paddingBottom: 11 },
  input: {
    flex: 1, paddingVertical: 10,
    fontSize: 15, fontFamily: fonts.dmMono, maxHeight: 120,
  },
  orderBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  orderBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  sendBtn: { paddingBottom: 8, paddingHorizontal: 4 },
  sendBtnText: { fontSize: 22, fontFamily: fonts.dmMono },
  errorText: { fontSize: 11, fontFamily: fonts.dmMono, paddingHorizontal: SPACING.md, paddingVertical: 4 },
  offerCard: {
    marginHorizontal: SPACING.md, marginVertical: 8,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    padding: SPACING.md, gap: 6,
  },
  offerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  offerLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase' },
  offerVariety: { fontSize: 20, fontFamily: fonts.playfair },
  offerDetail: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  offerFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  offerPrice: { fontSize: 15, fontFamily: fonts.dmMono },
  offerBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  offerBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  confirmCard: {
    marginHorizontal: SPACING.md, marginVertical: 8,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    padding: SPACING.md, gap: 6,
  },
  dinnerCard: {
    marginHorizontal: SPACING.md, marginVertical: 8,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    padding: SPACING.md, gap: 6,
  },
  confirmText: { fontSize: 17, fontFamily: fonts.playfair },
  jobCard: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    padding: SPACING.md, gap: 5,
  },
  jobLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase' },
  jobTitle: { fontSize: 20, fontFamily: fonts.playfair },
  jobPay: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  jobDesc: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20 },
  jobApplyBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 4 },
  jobApplyText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  mintedRow: { gap: 4 },
});
