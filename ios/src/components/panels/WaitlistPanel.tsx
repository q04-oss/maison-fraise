import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchWaitlistPosition, joinWaitlist, claimWaitlistSlot } from '../../lib/api';

export default function WaitlistPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    fetchWaitlistPosition()
      .then(setPosition)
      .catch(() => setPosition(null))
      .finally(() => setLoading(false));
  }, []);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const result = await joinWaitlist(referralCode.trim() || undefined);
      setPosition({ on_waitlist: true, status: 'waiting', position: result.position, total: result.position });
    } catch { } finally { setJoining(false); }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await claimWaitlistSlot();
      setPosition((p: any) => ({ ...p, status: 'claimed' }));
    } catch { } finally { setClaiming(false); }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>WAITLIST</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.body}>
        {loading && <ActivityIndicator color={c.accent} />}

        {!loading && !position?.on_waitlist && (
          <>
            <Text style={[styles.heading, { color: c.text, fontFamily: fonts.playfair }]}>Join the waitlist</Text>
            <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmSans }]}>
              A standing order slot opens when a member lapses. You'll be notified and have 48 hours to claim.
            </Text>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border, fontFamily: fonts.dmMono }]}
              value={referralCode}
              onChangeText={setReferralCode}
              placeholder="Referral code (optional)"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: c.accent }, joining && { opacity: 0.6 }]}
              onPress={handleJoin}
              disabled={joining}
              activeOpacity={0.8}
            >
              {joining ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { fontFamily: fonts.dmMono }]}>JOIN WAITLIST →</Text>}
            </TouchableOpacity>
          </>
        )}

        {!loading && position?.on_waitlist && position.status === 'waiting' && (
          <>
            <Text style={[styles.bigNum, { color: c.accent, fontFamily: fonts.playfair }]}>#{position.position}</Text>
            <Text style={[styles.heading, { color: c.text, fontFamily: fonts.playfair }]}>in line</Text>
            <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmMono }]}>
              {position.total} people waiting
            </Text>
          </>
        )}

        {!loading && position?.on_waitlist && position.status === 'offered' && (
          <>
            <Text style={[styles.heading, { color: c.accent, fontFamily: fonts.playfair }]}>A slot is available!</Text>
            {position.claim_expires_at && (
              <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmMono }]}>
                Expires {new Date(position.claim_expires_at).toLocaleString()}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: c.accent }, claiming && { opacity: 0.6 }]}
              onPress={handleClaim}
              disabled={claiming}
              activeOpacity={0.8}
            >
              {claiming ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { fontFamily: fonts.dmMono }]}>CLAIM YOUR SPOT →</Text>}
            </TouchableOpacity>
          </>
        )}

        {!loading && position?.on_waitlist && position.status === 'claimed' && (
          <Text style={[styles.heading, { color: c.accent, fontFamily: fonts.playfair }]}>Spot claimed. Welcome.</Text>
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
  btn: { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14 },
  btnText: { color: '#fff', fontSize: 13, letterSpacing: 1.5 },
  bigNum: { fontSize: 72, lineHeight: 80 },
});
