import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../../context/PanelContext';
import { generateGiftNote } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const TONES = ['warm', 'funny', 'poetic', 'minimal'] as const;

export default function GiftNotePanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [tone, setTone] = useState<'warm' | 'funny' | 'poetic' | 'minimal'>('warm');
  const [note, setNote] = useState(order.gift_note ?? '');
  const [generating, setGenerating] = useState(false);

  useEffect(() => { TrueSheet.present('main-sheet', 2); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateGiftNote(tone, order.variety_name ?? '', '');
      setNote(result.note);
    } catch {
      // fail silently — user can type manually
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>For them.</Text>
        <View style={styles.headerSpacer} />
      </View>
      <Text style={[styles.subtitle, { color: c.muted }]}>We'll include a handwritten note card.</Text>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: c.muted }]}>TONE</Text>
        <View style={styles.toneRow}>
          {TONES.map(t => (
            <TouchableOpacity
              key={t}
              style={[
                styles.toneChip,
                { backgroundColor: c.optionCard, borderColor: c.optionCardBorder },
                tone === t && { backgroundColor: c.accent, borderColor: 'transparent' },
              ]}
              onPress={() => setTone(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toneText, { color: tone === t ? '#fff' : c.text }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.generateBtn, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={handleGenerate}
          disabled={generating}
          activeOpacity={0.8}
        >
          {generating
            ? <ActivityIndicator size="small" color={c.accent} />
            : <Text style={[styles.generateBtnText, { color: c.accent }]}>Generate with AI</Text>
          }
        </TouchableOpacity>

        <TextInput
          style={[styles.noteInput, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
          value={note}
          onChangeText={setNote}
          placeholder="Write something, or generate above…"
          placeholderTextColor={c.muted}
          multiline
          textAlignVertical="top"
        />

        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.accent }]}
          onPress={() => { setOrder({ gift_note: note || null }); showPanel('when'); }}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => { setOrder({ gift_note: null }); showPanel('when'); }}
          activeOpacity={0.6}
        >
          <Text style={[styles.skipText, { color: c.muted }]}>Skip — no note</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 22, lineHeight: 28 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  subtitle: { textAlign: 'center', fontSize: 13, fontFamily: fonts.dmSans, paddingTop: 10, paddingBottom: 4, paddingHorizontal: SPACING.md },
  body: { padding: SPACING.md, gap: SPACING.md },
  sectionLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  toneRow: { flexDirection: 'row', gap: 8 },
  toneChip: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  toneText: { fontSize: 13, fontFamily: fonts.dmSans },
  generateBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  generateBtnText: { fontSize: 14, fontFamily: fonts.playfair },
  noteInput: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    fontSize: 15,
    fontFamily: fonts.dmSans,
    lineHeight: 24,
    minHeight: 140,
  },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  cta: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#FFFFFF' },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, fontFamily: fonts.dmSans },
});
