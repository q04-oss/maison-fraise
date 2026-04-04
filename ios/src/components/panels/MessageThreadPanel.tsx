import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, Keyboard, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchThread, sendMessage } from '../../lib/api';

export default function MessageThreadPanel() {
  const { goBack, panelData, setPanelData, jumpToPanel, businesses, setActiveLocation, setOrder } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const flatRef = useRef<FlatList>(null);

  const otherId: number = panelData?.userId;
  const isShop: boolean = panelData?.isShop ?? false;
  const otherName: string = panelData?.displayName ?? panelData?.userCode ?? 'Unknown';
  const otherCode: string = panelData?.userCode ?? otherName;

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(id => { if (id) setMyId(parseInt(id, 10)); });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const load = useCallback(() => {
    if (!otherId) return;
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
});
