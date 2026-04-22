import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { formatHours24 } from '../../lib/geo';

interface Message {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  type: string;
  metadata: any;
  created_at: string;
  read: boolean;
  encrypted?: boolean;
  ephemeral_key?: string | null;
}

function formatTime(iso: string): string {
  return String(new Date(iso).getHours());
}

export default function ChatThreadPanel() {
  const { panelData, goBack } = usePanel();
  const c = useColors();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const otherId: number = panelData?.userId;
  const displayName: string = panelData?.displayName ?? 'user';

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [myId, setMyId] = useState<number | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [pendingMessages, setPendingMessages] = useState<{ key: string; body: string }[]>([]);
  const listRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    AsyncStorage.multiGet(['user_db_id', 'user_email']).then(([idEntry, emailEntry]) => {
      if (idEntry[1]) setMyId(parseInt(idEntry[1], 10));
      if (emailEntry[1]) setMyEmail(emailEntry[1]);
    });
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [{ fetchThread }, { decryptMessage }] = await Promise.all([
        import('../../lib/api'),
        import('../../lib/crypto'),
      ]);
      const msgs = await fetchThread(otherId);
      // Decrypt any E2E messages
      const decrypted = await Promise.all(msgs.map(async (m: Message) => {
        if (!m.encrypted) return m;
        const plaintext = await decryptMessage(m);
        return { ...m, body: plaintext };
      }));
      setMessages(decrypted);
      setHasMore(decrypted.length >= 50);
      if (!silent) setLoading(false);
    } catch {
      if (!silent) setLoading(false);
    }
  }, [otherId]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const [{ fetchThread }, { decryptMessage }] = await Promise.all([
        import('../../lib/api'),
        import('../../lib/crypto'),
      ]);
      const oldest = messages[0];
      const older = await fetchThread(otherId, oldest.id);
      if (older.length === 0) {
        setHasMore(false);
      } else {
        const decrypted = await Promise.all(older.map(async (m: Message) => {
          if (!m.encrypted) return m;
          const plaintext = await decryptMessage(m);
          return { ...m, body: plaintext };
        }));
        setMessages(prev => [...decrypted, ...prev]);
        if (decrypted.length < 50) setHasMore(false);
      }
    } catch { /* non-fatal */ } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMore, messages, otherId]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    const tempKey = `pending-${Date.now()}`;
    setText('');
    setSending(true);
    setPendingMessages(prev => [...prev, { key: tempKey, body }]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const [{ sendMessage }, { encryptMessage }] = await Promise.all([
        import('../../lib/api'),
        import('../../lib/crypto'),
      ]);
      // Attempt E2E encryption; fall back to plaintext silently
      const encrypted = await encryptMessage(otherId, body);
      const msg = await sendMessage(otherId, encrypted
        ? encrypted.ciphertext
        : body,
        encrypted
          ? { encrypted: true, ephemeral_key: encrypted.ephemeralKey, nonce: encrypted.nonce }
          : undefined,
      );
      setPendingMessages(prev => prev.filter(p => p.key !== tempKey));
      setMessages(prev => [...prev, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {
      setPendingMessages(prev => prev.filter(p => p.key !== tempKey));
      setFailedIds(prev => new Set(prev).add(tempKey));
      // Restore text for retry
      setText(body);
      Alert.alert('Failed to send', 'Your message could not be delivered. Tap send to retry.');
    } finally {
      setSending(false);
    }
  }, [text, sending, otherId]);

  const handleAcceptOffer = useCallback(async (messageId: number) => {
    const email = myEmail ?? '';
    if (!email) {
      Alert.alert('Email required', 'Sign in with Apple to accept offers.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { acceptOffer } = await import('../../lib/api');
      const { client_secret, total_cents } = await acceptOffer(messageId, email);

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Maison Fraise',
        allowsDelayedPaymentMethods: false,
      });
      if (initError) { Alert.alert('Payment error', initError.message); return; }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') Alert.alert('Payment failed', presentError.message);
        return;
      }

      const { confirmOfferPayment } = await import('../../lib/api');
      await confirmOfferPayment(messageId);
      load(true);
    } catch (e: any) {
      Alert.alert('Could not accept offer', e?.message ?? 'Try again.');
    }
  }, [myEmail, initPaymentSheet, presentPaymentSheet, load]);

  const renderMessage = ({ item: m }: { item: Message }) => {
    const isMine = myId !== null && m.sender_id === myId;

    // Memory unlock card — centred system message
    if (m.type === 'memory_unlock') {
      const meta = m.metadata ?? {};
      return (
        <View style={styles.systemCard}>
          <Text style={[styles.systemLabel, { color: c.muted }]}>memory</Text>
          <Text style={[styles.systemBody, { color: c.text }]}>
            {meta.business_name ?? 'a shared dinner'}
          </Text>
        </View>
      );
    }

    // Dinner invite card
    if (m.type === 'dinner_invite') {
      const meta = m.metadata ?? {};
      const status = meta.status ?? 'pending';
      const isConfirmed = status === 'confirmed';
      const isDeclined = status === 'declined';
      const isPending = status === 'pending';
      const isRecipient = myId !== null && m.recipient_id === myId;

      const handleAccept = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
          const { acceptDinnerInvite } = await import('../../lib/api');
          await acceptDinnerInvite(m.id);
          load(true);
        } catch (e: any) {
          Alert.alert('Could not accept', e?.message ?? 'Try again.');
        }
      };

      const handleDecline = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
          const { declineDinnerInvite } = await import('../../lib/api');
          await declineDinnerInvite(m.id);
          load(true);
        } catch { /* non-fatal */ }
      };

      return (
        <View style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}>
          <Text style={[styles.cardTag, { color: c.muted }]}>dinner invite</Text>
          <Text style={[styles.cardTitle, { color: c.text }]}>{meta.offer_title ?? meta.business_name}</Text>
          {meta.reservation_date && (
            <Text style={[styles.cardMeta, { color: c.muted }]}>{meta.reservation_date}</Text>
          )}
          {isConfirmed && meta.companion_name && (
            <Text style={[styles.cardMeta, { color: c.muted }]}>with {meta.companion_name}</Text>
          )}
          {isConfirmed && meta.window_closes_at && (
            <Text style={[styles.cardMeta, { color: c.muted }]}>
              memory window closes {new Date(meta.window_closes_at).toLocaleDateString()}
            </Text>
          )}
          {isPending && isRecipient ? (
            <View style={styles.cardActions}>
              <TouchableOpacity style={[styles.cardBtn, { backgroundColor: c.text }]} onPress={handleAccept} activeOpacity={0.8}>
                <Text style={[styles.cardBtnText, { color: c.sheetBg }]}>accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cardBtnGhost, { borderColor: c.border }]} onPress={handleDecline} activeOpacity={0.7}>
                <Text style={[styles.cardBtnText, { color: c.muted }]}>decline</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.cardFooter}>
              <Text style={[styles.cardStatus, { color: isConfirmed ? c.text : c.muted }]}>
                {isConfirmed ? 'confirmed ✓' : isDeclined ? 'declined' : status}
              </Text>
              <Text style={[styles.msgTime, { color: c.muted }]}>{formatTime(m.created_at)}</Text>
            </View>
          )}
        </View>
      );
    }

    // Offer card — shop sends a purchase offer to a customer
    if (m.type === 'offer') {
      const meta = m.metadata ?? {};
      const status = meta.status ?? 'pending';
      const isPaid = status === 'paid';
      const isPending = status === 'pending';
      const isRecipient = myId !== null && m.recipient_id === myId;
      const priceFmt = meta.total_cents ? `CA$${(meta.total_cents / 100).toFixed(2)}` : '';

      return (
        <View style={[styles.card, { borderColor: c.border, backgroundColor: c.card, alignSelf: isMine ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.cardTag, { color: c.muted }]}>offer</Text>
          <Text style={[styles.cardTitle, { color: c.text }]}>{meta.variety_name}</Text>
          {meta.chocolate && (
            <Text style={[styles.cardMeta, { color: c.muted }]}>{meta.chocolate} · {meta.finish}</Text>
          )}
          {meta.quantity && (
            <Text style={[styles.cardMeta, { color: c.muted }]}>qty {meta.quantity}</Text>
          )}
          {meta.slot_date && (
            <Text style={[styles.cardMeta, { color: c.muted }]}>
              {meta.slot_date}{meta.slot_time ? ` · ${formatHours24(meta.slot_time)}` : ''}
            </Text>
          )}
          {priceFmt ? <Text style={[styles.cardPrice, { color: c.text }]}>{priceFmt}</Text> : null}
          {isPending && isRecipient ? (
            <TouchableOpacity
              style={[styles.cardBtn, { backgroundColor: c.text, marginTop: 10 }]}
              onPress={() => handleAcceptOffer(m.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.cardBtnText, { color: c.sheetBg }]}>accept & pay</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.cardFooter}>
              <Text style={[styles.cardStatus, { color: isPaid ? c.text : c.muted }]}>
                {isPaid ? 'paid ✓' : status}
              </Text>
              <Text style={[styles.msgTime, { color: c.muted }]}>{formatTime(m.created_at)}</Text>
            </View>
          )}
        </View>
      );
    }

    // Gift confirm card — shown to recipient when a gift is confirmed
    if (m.type === 'gift_confirm') {
      const meta = m.metadata ?? {};
      return (
        <View style={[styles.systemCard, { paddingHorizontal: SPACING.md }]}>
          <Text style={[styles.systemLabel, { color: c.muted }]}>gift</Text>
          <Text style={[styles.systemBody, { color: c.text }]}>{meta.variety_name} × {meta.quantity}</Text>
          {meta.slot_date && (
            <Text style={[styles.cardMeta, { color: c.muted, textAlign: 'center' }]}>
              pick up {meta.slot_date}{meta.slot_time ? ` · ${formatHours24(meta.slot_time)}` : ''}
            </Text>
          )}
          {meta.nfc_token && (
            <Text style={[styles.nfcToken, { color: c.muted }]}>{meta.nfc_token}</Text>
          )}
        </View>
      );
    }

    // Order confirm card — shown after offer payment
    if (m.type === 'order_confirm') {
      const meta = m.metadata ?? {};
      return (
        <View style={[styles.systemCard, { paddingHorizontal: SPACING.md }]}>
          <Text style={[styles.systemLabel, { color: c.muted }]}>order confirmed</Text>
          <Text style={[styles.systemBody, { color: c.text }]}>{meta.variety_name}</Text>
          {meta.slot_date && (
            <Text style={[styles.cardMeta, { color: c.muted, textAlign: 'center' }]}>
              {meta.slot_date}{meta.slot_time ? ` · ${formatHours24(meta.slot_time)}` : ''}
            </Text>
          )}
          {meta.nfc_token && (
            <Text style={[styles.nfcToken, { color: c.muted }]}>{meta.nfc_token}</Text>
          )}
        </View>
      );
    }

    // Plain text bubble
    return (
      <View style={[styles.bubbleWrap, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <View style={[
          styles.bubble,
          isMine
            ? { backgroundColor: c.text }
            : { backgroundColor: c.card, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth },
        ]}>
          <Text style={[styles.bubbleText, { color: isMine ? c.sheetBg : c.text }]}>{m.body}</Text>
        </View>
        <Text style={[styles.msgTime, { color: c.muted }]}>{formatTime(m.created_at)}</Text>
      </View>
    );
  };

  // Pending message (optimistic, not yet confirmed)
  const renderPending = (pm: { key: string; body: string }) => (
    <View key={pm.key} style={[styles.bubbleWrap, styles.bubbleMine]}>
      <View style={[styles.bubble, { backgroundColor: c.text, opacity: 0.5 }]}>
        <Text style={[styles.bubbleText, { color: c.sheetBg }]}>{pm.body}</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.6}>
          <Text style={[styles.backText, { color: c.muted }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.name, { color: c.text }]}>{displayName}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: c.border }]} />

      {/* Messages */}
      {loading ? (
        <ActivityIndicator color={c.muted} style={{ marginTop: SPACING.lg }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          onStartReached={loadOlderMessages}
          onStartReachedThreshold={0.1}
          ListHeaderComponent={loadingOlder ? <ActivityIndicator color={c.muted} style={{ marginBottom: 8 }} /> : null}
          ListFooterComponent={<>{pendingMessages.map(renderPending)}</>}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: c.muted }]}>start the conversation.</Text>
          }
        />
      )}

      {/* Composer */}
      <View style={[styles.composer, { borderTopColor: c.border }]}>
        <TextInput
          style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
          value={text}
          onChangeText={setText}
          placeholder="..."
          placeholderTextColor={c.muted}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: text.trim() ? c.text : c.border }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator color={c.sheetBg} size="small" />
            : <Text style={[styles.sendArrow, { color: c.sheetBg }]}>↑</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 20 },
  name: { fontSize: 17, fontFamily: fonts.playfair },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  listContent: { padding: SPACING.md, gap: 6, flexGrow: 1 },
  empty: { fontSize: 13, fontFamily: fonts.dmMono, textAlign: 'center', marginTop: 40 },

  bubbleWrap: { maxWidth: '78%', gap: 3 },
  bubbleMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 20 },
  msgTime: { fontSize: 9, fontFamily: fonts.dmMono },

  systemCard: { alignSelf: 'center', alignItems: 'center', gap: 3, paddingVertical: SPACING.md },
  systemLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  systemBody: { fontSize: 13, fontFamily: fonts.playfair },
  nfcToken: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: 4 },

  card: { alignSelf: 'flex-start', maxWidth: '80%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 5 },
  cardTag: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  cardTitle: { fontSize: 16, fontFamily: fonts.playfair },
  cardMeta: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  cardPrice: { fontSize: 16, fontFamily: fonts.playfair, marginTop: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  cardStatus: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  cardBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 4 },
  cardBtnGhost: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  cardBtnText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1 },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: SPACING.sm, paddingHorizontal: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, fontFamily: fonts.dmSans, maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendArrow: { fontSize: 18 },
});
