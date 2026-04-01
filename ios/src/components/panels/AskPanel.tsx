import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { askClaude } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

interface Message {
  role: 'user' | 'claude';
  text: string;
}

export default function AskPanel() {
  const { goBack, order, varieties, businesses, setOrder, showPanel } = usePanel();
  const c = useColors();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<any>(null);
  const [displayedResponse, setDisplayedResponse] = useState('');
  const cursorAnim = useRef(new Animated.Value(1)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const typewriterReveal = (text: string) => {
    let i = 0;
    setDisplayedResponse('');
    const interval = setInterval(() => {
      i++;
      setDisplayedResponse(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 18);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    setDisplayedResponse('');
    setAction(null);

    try {
      const result = await askClaude(q, varieties, businesses);
      typewriterReveal(result.response);
      if (result.action?.type === 'order' && result.action.variety_id) {
        setAction(result.action);
      }
      setMessages(prev => [...prev, { role: 'claude', text: result.response }]);
    } catch {
      typewriterReveal('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOrderAction = () => {
    if (!action) return;
    setOrder({
      variety_id: action.variety_id,
      chocolate: action.chocolate,
      finish: action.finish,
      quantity: action.quantity ?? 4,
    });
    goBack();
    showPanel('chocolate');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Ask anything.</Text>
        <Text style={[styles.headerSub, { color: c.muted }]}>I know today's varieties, the chocolates, and the farm.</Text>
      </View>

      {messages.length === 0 && (
        <View style={styles.promptRow}>
          {["What's sweetest today?", "Something for a gift", "Tell me about the farm"].map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.promptChip, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => {
                const p_text = p;
                setMessages(prev => [...prev, { role: 'user', text: p_text }]);
                setLoading(true);
                setDisplayedResponse('');
                setAction(null);
                askClaude(p_text, varieties, businesses)
                  .then(result => {
                    typewriterReveal(result.response);
                    if (result.action?.type === 'order' && result.action.variety_id) setAction(result.action);
                    setMessages(prev => [...prev, { role: 'claude', text: result.response }]);
                  })
                  .catch(() => typewriterReveal('Something went wrong. Try again.'))
                  .finally(() => setLoading(false));
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.promptText, { color: c.text }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView style={styles.history} contentContainerStyle={{ paddingBottom: 16 }}>
        {messages.slice(0, -1).map((m, i) => (
          <Text
            key={i}
            style={[
              styles.historyText,
              { color: m.role === 'user' ? c.muted : c.text },
            ]}
          >
            {m.text}
          </Text>
        ))}

        {displayedResponse !== '' && (
          <Text style={[styles.claudeResponse, { color: c.text }]}>{displayedResponse}</Text>
        )}
        {loading && displayedResponse === '' && (
          <Text style={[styles.claudeResponse, { color: c.muted }]}>_</Text>
        )}

        {action && (
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={handleOrderAction}
            activeOpacity={0.9}
          >
            <Text style={[styles.actionVariety, { color: c.text }]}>{varieties.find(v => v.id === action.variety_id)?.name ?? 'Recommendation'}</Text>
            <Text style={[styles.actionDetail, { color: c.muted }]}>{action.chocolate} · {action.finish}</Text>
            <View style={[styles.actionBtn, { backgroundColor: c.accent }]}>
              <Text style={styles.actionBtnText}>Order this →</Text>
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={[styles.inputRow, { borderTopColor: c.border, backgroundColor: c.cardDark }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: c.text }]}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          placeholder="Ask about today's strawberries…"
          placeholderTextColor={c.muted}
          selectionColor={c.accent}
        />
        {input === '' && (
          <Animated.View style={[styles.fakeCursor, { opacity: cursorAnim, backgroundColor: c.accent }]} />
        )}
      </View>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <TouchableOpacity onPress={() => { goBack(); TrueSheet.present('main-sheet', 1); }} activeOpacity={0.6} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: c.accent }]}>Back</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: SPACING.md, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 28, fontFamily: fonts.playfair },
  headerSub: { fontSize: 13, fontFamily: fonts.dmSans, marginTop: 4 },
  promptRow: { paddingHorizontal: SPACING.md, paddingBottom: 12, gap: 8 },
  promptChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth },
  promptText: { fontSize: 13, fontFamily: fonts.dmSans },
  history: { flex: 1, paddingHorizontal: SPACING.md },
  historyText: { fontSize: 14, fontFamily: fonts.dmSans, marginBottom: 12, lineHeight: 22 },
  claudeResponse: { fontSize: 15, fontFamily: fonts.dmSans, lineHeight: 24, marginBottom: 12 },
  actionCard: {
    borderRadius: 14,
    padding: SPACING.md,
    marginTop: 16,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionVariety: { fontSize: 18, fontFamily: fonts.playfair },
  actionDetail: { fontSize: 13, fontFamily: fonts.dmSans },
  actionBtn: {
    marginTop: 8,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  actionBtnText: { color: '#fff', fontSize: 13, fontFamily: fonts.dmSans, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.dmSans,
    paddingVertical: 4,
  },
  fakeCursor: {
    position: 'absolute',
    left: SPACING.md,
    top: 18,
    width: 2,
    height: 16,
    borderRadius: 1,
  },
  footer: { padding: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
  backLink: { alignItems: 'center', paddingVertical: 4 },
  backLinkText: { fontSize: 15, fontFamily: fonts.dmSans },
});
