import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { respondToAdImpression } from '../../lib/api';

export default function AdOfferPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const [responding, setResponding] = useState(false);
  const [responded, setResponded] = useState<boolean | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const impressionId: number = panelData?.impression_id;
  const title: string = panelData?.title ?? 'Ad offer';
  const body: string = panelData?.body ?? '';
  const valueCents: number = panelData?.value_cents ?? 0;

  const handleRespond = async (accepted: boolean) => {
    if (!impressionId || responding) return;
    setResponding(true);
    try {
      const result = await respondToAdImpression(impressionId, accepted);
      setResponded(accepted);
      setNewBalance(result.new_balance_cents);
    } catch {
      setResponding(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>Ad Offer</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.adLabel, { color: c.accent }]}>
          earn CA${(valueCents / 100).toFixed(2)} if you accept
        </Text>
        <Text style={[styles.adTitle, { color: c.text }]}>{title}</Text>
        <Text style={[styles.adBody, { color: c.muted }]}>{body}</Text>

        {responded !== null ? (
          <View style={styles.respondedBlock}>
            <Text style={[styles.respondedTitle, { color: c.text }]}>
              {responded ? 'Accepted' : 'Declined'}
            </Text>
            {responded && newBalance !== null && (
              <Text style={[styles.respondedBalance, { color: c.muted }]}>
                Your ad balance: CA${(newBalance / 100).toFixed(2)}
              </Text>
            )}
            <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.doneBtn}>
              <Text style={[styles.doneBtnText, { color: c.accent }]}>done →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, styles.denyBtn, { borderColor: c.border }]}
              onPress={() => handleRespond(false)}
              disabled={responding}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: c.muted }]}>deny</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.acceptBtn, { backgroundColor: c.accent }]}
              onPress={() => handleRespond(true)}
              disabled={responding}
              activeOpacity={0.7}
            >
              {responding ? (
                <ActivityIndicator color={c.ctaText ?? '#fff'} />
              ) : (
                <Text style={[styles.btnText, { color: c.ctaText ?? '#fff' }]}>accept</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
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
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: fonts.playfair, textAlign: 'center' },
  content: { flex: 1, padding: SPACING.lg, gap: 14, justifyContent: 'center' },
  adLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  adTitle: { fontSize: 28, fontFamily: fonts.playfair },
  adBody: { fontSize: 15, fontFamily: fonts.dmSans, lineHeight: 22 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: SPACING.md },
  btn: { flex: 1, paddingVertical: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  denyBtn: { borderWidth: StyleSheet.hairlineWidth },
  acceptBtn: {},
  btnText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 1 },
  respondedBlock: { gap: 8, marginTop: SPACING.md, alignItems: 'center' },
  respondedTitle: { fontSize: 22, fontFamily: fonts.playfair },
  respondedBalance: { fontSize: 13, fontFamily: fonts.dmMono },
  doneBtn: { marginTop: 12 },
  doneBtnText: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
