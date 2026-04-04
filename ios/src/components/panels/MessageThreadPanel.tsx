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
import { fetchThread, sendMessage, acceptOffer, confirmOfferPayment } from '../../lib/api';
import { useApp } from '../../../App';

export default function MessageThreadPanel() {
  const { goBack, panelData, setPanelData, jumpToPanel, businesses, setActiveLocation, setOrder } = usePanel();
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
  const otherName: string = panelData?.displayName ?? panelData?.userCode ?? 'Unknown';
  const otherCode: string = panelData?.userCode ?? otherName;

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
  confirmText: { fontSize: 17, fontFamily: fonts.playfair },
});
