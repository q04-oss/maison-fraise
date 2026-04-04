import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchThread, sendMessage } from '../../lib/api';

export default function MessageThreadPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [myId, setMyId] = useState<number | null>(null);
  const flatRef = useRef<FlatList>(null);

  const otherId: number = panelData?.userId;
  const otherName: string = panelData?.displayName ?? panelData?.userCode ?? 'Unknown';

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(id => { if (id) setMyId(parseInt(id, 10)); });
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
    if (!text.trim() || !otherId || sending) return;
    const body = text.trim();
    setText('');
    setSending(true);
    try {
      const msg = await sendMessage(otherId, body);
      setMessages(prev => [...prev, msg]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.panelBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>{otherName}</Text>
        <View style={styles.headerSpacer} />
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
              <View style={[styles.bubble, isMine ? [styles.bubbleMine, { backgroundColor: c.accent }] : [styles.bubbleTheirs, { backgroundColor: c.card }]]}>
                <Text style={[
                  styles.bubbleText,
                  { color: isMine ? '#fff' : c.text },
                ]}>{item.body}</Text>
                <View style={styles.bubbleMeta}>
                  <Text style={[styles.bubbleTime, { color: isMine ? 'rgba(255,255,255,0.55)' : c.muted }]}>
                    {formatTime(item.created_at)}
                  </Text>
                  {isMine && (
                    <Text style={[styles.readReceipt, { color: item.read ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)' }]}>
                      {item.read ? '✓✓' : '✓'}
                    </Text>
                  )}
                </View>
              </View>
            );
          }}
        />
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
      </View>
    </KeyboardAvoidingView>
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
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: fonts.playfair },
  headerSpacer: { width: 28 },
  messageList: { padding: SPACING.md, gap: 8 },
  bubble: {
    maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 2,
  },
  bubbleMine: { alignSelf: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start' },
  bubbleText: { fontSize: 15, fontFamily: fonts.dmSans, lineHeight: 21 },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bubbleTime: { fontSize: 10, fontFamily: fonts.dmMono },
  readReceipt: { fontSize: 10, fontFamily: fonts.dmMono },
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
});
