import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchRenewalStatus, renewStandingOrder } from '../../lib/api';

export default function StandingOrderRenewalPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [renewing, setRenewing] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchRenewalStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  const handleRenew = async () => {
    if (!status?.id) return;
    setRenewing(true);
    try {
      await renewStandingOrder(status.id);
      setDone(true);
    } catch {
      // silently ignore for now
    } finally {
      setRenewing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>RENEWAL</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.body}>
        {loading && <ActivityIndicator color={c.accent} />}

        {!loading && !status && (
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>
            No active standing order found.
          </Text>
        )}

        {!loading && status && !done && (
          <>
            <Text style={[styles.varietyName, { color: c.text, fontFamily: fonts.playfair }]}>
              {status.variety_name}
            </Text>
            {status.expires_at && (
              <Text style={[styles.meta, { color: c.muted, fontFamily: fonts.dmMono }]}>
                Expires {new Date(status.expires_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
            )}
            {status.days_until_expiry !== null && (
              <Text style={[styles.meta, { color: status.days_until_expiry <= 30 ? '#EF4444' : c.muted, fontFamily: fonts.dmMono }]}>
                {status.days_until_expiry > 0 ? `${status.days_until_expiry} days remaining` : 'Expired'}
              </Text>
            )}
            <Text style={[styles.price, { color: c.text, fontFamily: fonts.playfair }]}>
              CA${((status.price_cents ?? 29500) * (status.quantity ?? 1) / 100).toFixed(2)} / year
            </Text>
            {status.can_renew && (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: c.accent }, renewing && { opacity: 0.6 }]}
                onPress={handleRenew}
                disabled={renewing}
                activeOpacity={0.8}
              >
                {renewing
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={[styles.btnText, { fontFamily: fonts.dmMono }]}>RENEW FOR ANOTHER YEAR →</Text>
                }
              </TouchableOpacity>
            )}
            {!status.can_renew && (
              <Text style={[styles.meta, { color: c.muted, fontFamily: fonts.dmSans }]}>
                Renewal opens 60 days before expiry.
              </Text>
            )}
          </>
        )}

        {done && (
          <Text style={[styles.varietyName, { color: c.accent, fontFamily: fonts.playfair }]}>
            Renewed. See you next season.
          </Text>
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
  varietyName: { fontSize: 28, textAlign: 'center' },
  meta: { fontSize: 12, letterSpacing: 0.5, textAlign: 'center' },
  price: { fontSize: 22, textAlign: 'center' },
  btn: { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14, marginTop: SPACING.md },
  btnText: { color: '#fff', fontSize: 13, letterSpacing: 1.5 },
  empty: { fontSize: 14, textAlign: 'center' },
});
