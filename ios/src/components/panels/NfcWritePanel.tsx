import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { writeNfcToken, cancelNfc } from '../../lib/nfc';

type State = 'writing' | 'success' | 'error';

export default function NfcWritePanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const nfcToken: string = panelData?.nfc_token ?? '';
  const varietyName: string = panelData?.variety_name ?? 'Order';
  const customerEmail: string = panelData?.customer_email ?? '';

  const [state, setState] = useState<State>('writing');
  const [errorMsg, setErrorMsg] = useState('');

  const write = async () => {
    setState('writing');
    setErrorMsg('');
    try {
      await writeNfcToken(nfcToken);
      setState('success');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Write failed. Try again.');
      setState('error');
    }
  };

  useEffect(() => {
    if (!nfcToken) {
      setState('error');
      setErrorMsg('No NFC token for this order.');
      return;
    }
    write();
    return () => { cancelNfc(); };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => { cancelNfc(); goBack(); }} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>TAG BOX</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.orderName, { color: c.text, fontFamily: fonts.playfair }]}>{varietyName}</Text>
        {!!customerEmail && (
          <Text style={[styles.email, { color: c.muted, fontFamily: fonts.dmSans }]}>{customerEmail}</Text>
        )}

        <View style={styles.stateBlock}>
          {state === 'writing' && (
            <>
              <ActivityIndicator size="large" color={c.accent} />
              <Text style={[styles.instruction, { color: c.text, fontFamily: fonts.playfair }]}>
                Hold phone to the tag.
              </Text>
              <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmSans }]}>
                Place on the NFC sticker inside the box lid.
              </Text>
            </>
          )}

          {state === 'success' && (
            <>
              <View style={[styles.badge, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.badgeIcon, { color: c.accent }]}>✓</Text>
              </View>
              <Text style={[styles.instruction, { color: c.text, fontFamily: fonts.playfair }]}>Tagged.</Text>
              <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmSans }]}>
                Sticker is linked to this order.
              </Text>
              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: c.accent }]}
                onPress={goBack}
                activeOpacity={0.8}
              >
                <Text style={[styles.doneBtnText, { fontFamily: fonts.dmSans }]}>Done</Text>
              </TouchableOpacity>
            </>
          )}

          {state === 'error' && (
            <>
              <Text style={[styles.instruction, { color: c.text, fontFamily: fonts.playfair }]}>
                Didn't catch it.
              </Text>
              <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmSans }]}>{errorMsg}</Text>
              {!!nfcToken && (
                <TouchableOpacity
                  style={[styles.retryBtn, { borderColor: c.border, backgroundColor: c.card }]}
                  onPress={write}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.retryBtnText, { color: c.accent, fontFamily: fonts.playfair }]}>
                    Try again
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
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
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 13, letterSpacing: 2 },
  headerSpacer: { width: 28 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  orderName: { fontSize: 22, textAlign: 'center' },
  email: { fontSize: 12, textAlign: 'center' },
  stateBlock: {
    marginTop: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
    width: '100%',
  },
  badge: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeIcon: { fontSize: 32 },
  instruction: { fontSize: 26, textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  doneBtn: {
    marginTop: SPACING.sm,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 15 },
  retryBtn: {
    marginTop: SPACING.sm,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryBtnText: { fontSize: 14 },
});
