import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { claimDrop, joinDropWaitlist, leaveDropWaitlist } from '../../lib/api';

export default function DropDetailPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const drop = panelData?.drop as any;
  const [claiming, setClaiming] = useState(false);
  const [waitlisting, setWaitlisting] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [onWaitlist, setOnWaitlist] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    try {
      await claimDrop(drop.id);
      setClaimed(true);
    } catch (e: any) {
      if (e?.message?.includes('sold_out')) {
        setError('Sold out. Join the waitlist to be notified if a slot opens.');
      } else {
        setError(e?.message ?? 'Could not claim.');
      }
    } finally {
      setClaiming(false); }
  };

  const handleWaitlist = async () => {
    setWaitlisting(true);
    try {
      if (onWaitlist) {
        await leaveDropWaitlist(drop.id);
        setOnWaitlist(false);
      } else {
        await joinDropWaitlist(drop.id);
        setOnWaitlist(true);
      }
    } catch { } finally { setWaitlisting(false); }
  };

  if (!drop) return null;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>DROP</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.varietyName, { color: c.text, fontFamily: fonts.playfair }]}>
          {drop.variety_name ?? drop.title}
        </Text>
        {drop.description ? (
          <Text style={[styles.desc, { color: c.muted, fontFamily: fonts.dmSans }]}>{drop.description}</Text>
        ) : null}
        <View style={styles.row}>
          <Text style={[styles.meta, { color: c.muted, fontFamily: fonts.dmMono }]}>{drop.quantity} available</Text>
          {drop.price_cents != null && (
            <Text style={[styles.price, { color: c.text, fontFamily: fonts.playfair }]}>
              CA${(drop.price_cents / 100).toFixed(2)}
            </Text>
          )}
        </View>

        {error && <Text style={[styles.error, { fontFamily: fonts.dmSans }]}>{error}</Text>}

        {claimed ? (
          <Text style={[styles.success, { color: c.accent, fontFamily: fonts.playfair }]}>Claimed. Check your orders.</Text>
        ) : drop.status === 'open' ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: c.accent }, claiming && { opacity: 0.6 }]}
            onPress={handleClaim}
            disabled={claiming}
            activeOpacity={0.8}
          >
            {claiming ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { fontFamily: fonts.dmMono }]}>CLAIM THIS DROP →</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: onWaitlist ? c.cardDark : c.accent }, waitlisting && { opacity: 0.6 }]}
            onPress={handleWaitlist}
            disabled={waitlisting}
            activeOpacity={0.8}
          >
            {waitlisting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.btnText, { color: onWaitlist ? c.muted : '#fff', fontFamily: fonts.dmMono }]}>
                {onWaitlist ? 'LEAVE WAITLIST' : 'JOIN WAITLIST →'}
              </Text>
            )}
          </TouchableOpacity>
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
  varietyName: { fontSize: 32, textAlign: 'center' },
  desc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  meta: { fontSize: 13, letterSpacing: 0.5 },
  price: { fontSize: 22 },
  btn: { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14 },
  btnText: { color: '#fff', fontSize: 13, letterSpacing: 1.5 },
  error: { color: '#EF4444', fontSize: 13, textAlign: 'center' },
  success: { fontSize: 22, textAlign: 'center' },
});
