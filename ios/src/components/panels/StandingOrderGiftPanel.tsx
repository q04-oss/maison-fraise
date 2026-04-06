import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { giftStandingOrder } from '../../lib/api';

export default function StandingOrderGiftPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGift = async () => {
    if (!recipientEmail.trim()) return;
    setSending(true);
    setError(null);
    try {
      await giftStandingOrder({ recipient_email: recipientEmail.trim(), note: note.trim() || undefined });
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>GIFT A SLOT</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.body}>
        {done ? (
          <Text style={[styles.heading, { color: c.accent, fontFamily: fonts.playfair }]}>
            Gift sent. They'll be notified.
          </Text>
        ) : (
          <>
            <Text style={[styles.heading, { color: c.text, fontFamily: fonts.playfair }]}>
              Gift your standing order
            </Text>
            <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmSans }]}>
              Transfer your slot to someone else for the upcoming season.
            </Text>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border, fontFamily: fonts.dmMono }]}
              value={recipientEmail}
              onChangeText={setRecipientEmail}
              placeholder="Recipient email"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={[styles.input, styles.inputMulti, { color: c.text, borderColor: c.border, fontFamily: fonts.dmSans }]}
              value={note}
              onChangeText={setNote}
              placeholder="Personal note (optional)"
              placeholderTextColor={c.muted}
              multiline
              numberOfLines={3}
            />
            {error && (
              <Text style={[styles.error, { fontFamily: fonts.dmSans }]}>{error}</Text>
            )}
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: c.accent }, sending && { opacity: 0.6 }]}
              onPress={handleGift}
              disabled={sending || !recipientEmail.trim()}
              activeOpacity={0.8}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { fontFamily: fonts.dmMono }]}>SEND GIFT →</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { fontSize: 28 },
  title: { fontSize: 14, letterSpacing: 2 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.md },
  heading: { fontSize: 26, textAlign: 'center' },
  sub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  input: { width: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  btn: { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14 },
  btnText: { color: '#fff', fontSize: 13, letterSpacing: 1.5 },
  error: { color: '#EF4444', fontSize: 13, textAlign: 'center' },
});
