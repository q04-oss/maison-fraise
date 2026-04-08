import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { generateGiftNote } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const TONES = [
  { id: 'warm', label: 'Warm' },
  { id: 'funny', label: 'Funny' },
  { id: 'poetic', label: 'Poetic' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'omakase', label: 'おまかせ' },
] as const;

type Tone = typeof TONES[number]['id'];

export default function GiftNotePanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [tone, setTone] = useState<Tone>('warm');
  const [note, setNote] = useState(order.gift_note ?? '');
  const [recipientContext, setRecipientContext] = useState('');
  const [generating, setGenerating] = useState(false);

  const NOTE_LIMIT = 160;
  const [generateNudge, setGenerateNudge] = useState(false);

  const handleGenerate = async () => {
    if (tone !== 'omakase' && !recipientContext.trim()) {
      setGenerateNudge(true);
      return;
    }
    setGenerateNudge(false);
    setGenerating(true);
    try {
      const result = await generateGiftNote(tone, order.variety_name ?? '', recipientContext);
      setNote(result.note.slice(0, NOTE_LIMIT));
    } catch {
      // fail silently — user can type manually
    } finally {
      setGenerating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.panelBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>For them.</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.controls, { borderBottomColor: c.border }]}>
        <View style={styles.contextRow}>
          <TextInput
            style={[styles.contextInput, { color: c.text }]}
            value={recipientContext}
            onChangeText={v => { setRecipientContext(v); if (v.trim()) setGenerateNudge(false); }}
            placeholder="Who's it for?"
            placeholderTextColor={c.muted}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.generateBtn, { borderColor: c.border, opacity: generating ? 0.5 : 1 }]}
            onPress={handleGenerate}
            disabled={generating}
            activeOpacity={0.75}
          >
            {generating
              ? <ActivityIndicator size="small" color={c.accent} />
              : <Text style={[styles.generateBtnText, { color: c.accent }]}>Generate</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.toneRow}>
          {TONES.map(t => {
            const active = tone === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.toneChip, { backgroundColor: active ? c.accent : 'transparent', borderColor: active ? 'transparent' : c.border }]}
                onPress={() => setTone(t.id)}
                activeOpacity={0.75}
              >
                <Text style={[styles.toneChipText, { color: active ? '#fff' : c.muted }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {generateNudge && (
        <Text style={[styles.nudgeText, { color: '#FF3B30' }]}>Fill in who it's for first.</Text>
      )}
      <View style={styles.noteWrapper}>
        <TextInput
          style={[styles.noteInput, { color: c.text }]}
          value={note}
          onChangeText={v => setNote(v.slice(0, NOTE_LIMIT))}
          placeholder="Write a note, or generate one above…"
          placeholderTextColor={c.muted}
          multiline
          textAlignVertical="top"
          scrollEnabled
          maxLength={NOTE_LIMIT}
        />
        <Text style={[styles.charCount, { color: note.length > NOTE_LIMIT * 0.9 ? '#FF3B30' : c.muted }]}>
          {note.length}/{NOTE_LIMIT}
        </Text>
      </View>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: note.trim() ? c.accent : c.card, borderWidth: note.trim() ? 0 : StyleSheet.hairlineWidth, borderColor: c.border }]}
          onPress={() => { setOrder({ gift_note: note.trim() || null }); showPanel('review'); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.ctaText, { color: note.trim() ? '#fff' : c.muted }]}>
            {note.trim() ? 'Continue' : 'Skip — no note'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  controls: {
    paddingHorizontal: SPACING.md,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contextInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.dmSans,
    paddingVertical: 6,
  },
  generateBtn: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateBtnText: { fontSize: 13, fontFamily: fonts.dmSans, fontWeight: '600' },
  toneRow: { flexDirection: 'row', gap: 8 },
  toneChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  toneChipText: { fontSize: 13, fontFamily: fonts.dmSans },
  nudgeText: { fontSize: 12, fontFamily: fonts.dmSans, paddingHorizontal: SPACING.md },
  noteWrapper: { flex: 1 },
  noteInput: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: 28,
    fontSize: 15,
    fontFamily: fonts.dmSans,
    lineHeight: 24,
  },
  charCount: { position: 'absolute', bottom: 10, right: SPACING.md, fontSize: 11, fontFamily: fonts.dmMono },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
});
