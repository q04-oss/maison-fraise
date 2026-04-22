import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { confirmMemory, MemoryPrompt } from '../../lib/api';

export default function MemoryPromptPanel() {
  const { panelData, goBack, showPanel } = usePanel();
  const c = useColors();

  const prompt: MemoryPrompt = panelData?.prompt;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'waiting' | 'minted' | null>(null);
  const [partnerId, setPartnerId] = useState<number | null>(null);

  const handleConfirm = useCallback(async (confirmed: boolean) => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await confirmMemory(prompt.booking_id, confirmed);
      if (!confirmed) {
        goBack();
        return;
      }
      if (res.minted && res.partner_id) {
        setPartnerId(res.partner_id);
        setResult('minted');
      } else {
        setResult('waiting');
      }
    } catch {
      goBack();
    } finally {
      setLoading(false);
    }
  }, [prompt, goBack]);

  if (result === 'minted') {
    return (
      <View style={styles.container}>
        <View style={styles.body}>
          <Text style={[styles.headline, { color: c.text }]}>A shared memory.</Text>
          <Text style={[styles.sub, { color: c.muted }]}>
            You both remembered dinner at {prompt?.business_name}.
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnYes, { backgroundColor: c.text }]}
            onPress={() => partnerId && showPanel('chat-thread', {
              userId: partnerId,
              displayName: prompt?.partner_name ?? 'user',
            })}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, { color: c.sheetBg }]}>open conversation</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { borderColor: c.border }]}
            onPress={goBack}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: c.muted }]}>later</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (result === 'waiting') {
    return (
      <View style={styles.container}>
        <View style={styles.body}>
          <Text style={[styles.headline, { color: c.text }]}>Remembered.</Text>
          <Text style={[styles.sub, { color: c.muted }]}>
            Waiting for {prompt?.partner_name} to confirm. If they remember too, a conversation will open between you.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { borderColor: c.border }]}
            onPress={goBack}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: c.muted }]}>done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.6}>
        <Text style={[styles.backText, { color: c.muted }]}>←</Text>
      </TouchableOpacity>

      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: c.muted }]}>
          {prompt?.reservation_date ?? 'an evening'}
        </Text>
        <Text style={[styles.headline, { color: c.text }]}>
          Do you remember dinner at {prompt?.business_name}?
        </Text>
        {!!prompt?.partner_name && (
          <Text style={[styles.companionLine, { color: c.muted }]}>
            with {prompt.partner_name}
          </Text>
        )}

        {loading ? (
          <ActivityIndicator color={c.muted} style={{ marginTop: SPACING.xl }} />
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnYes, { backgroundColor: c.text }]}
              onPress={() => handleConfirm(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnText, { color: c.sheetBg }]}>yes, I remember</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { borderColor: c.border }]}
              onPress={() => handleConfirm(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: c.muted }]}>no thanks</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontSize: 20 },
  body: { flex: 1, justifyContent: 'center', paddingBottom: 80, gap: 12 },
  eyebrow: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  headline: { fontSize: 28, fontFamily: fonts.playfair, lineHeight: 36 },
  companionLine: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  sub: { fontSize: 15, fontFamily: fonts.dmSans, lineHeight: 22 },
  actions: { marginTop: SPACING.lg, gap: 12 },
  btn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 2, paddingVertical: 14, alignItems: 'center' },
  btnYes: { borderWidth: 0 },
  btnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
});
