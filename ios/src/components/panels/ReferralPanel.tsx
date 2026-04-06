import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchReferralCode } from '../../lib/api';

export default function ReferralPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReferralCode()
      .then(data => setCode(data?.code ?? null))
      .catch(() => setCode(null))
      .finally(() => setLoading(false));
  }, []);

  const handleShare = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Use my referral code to join the Maison Fraise waitlist: ${code}`,
      });
    } catch { }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>REFERRALS</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.body}>
        {loading && <ActivityIndicator color={c.accent} />}

        {!loading && (
          <>
            <Text style={[styles.heading, { color: c.text, fontFamily: fonts.playfair }]}>Your referral code</Text>
            <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmSans }]}>
              Share this code with friends. When they join the waitlist with your code, you both earn legitimacy points.
            </Text>

            {code ? (
              <>
                <View style={[styles.codeBox, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={[styles.code, { color: c.accent, fontFamily: fonts.dmMono }]}>{code}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: c.accent }]}
                  onPress={handleShare}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnText, { fontFamily: fonts.dmMono }]}>SHARE CODE →</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmSans }]}>
                Your code will appear here once your account is verified.
              </Text>
            )}
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
  codeBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  code: { fontSize: 32, letterSpacing: 4 },
  btn: { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14 },
  btnText: { color: '#fff', fontSize: 13, letterSpacing: 1.5 },
});
