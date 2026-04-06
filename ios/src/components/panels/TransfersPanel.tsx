import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchIncomingTransfers, acceptTransfer, cancelTransfer } from '../../lib/api';

export default function TransfersPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);

  useEffect(() => {
    fetchIncomingTransfers()
      .then(setTransfers)
      .catch(() => setTransfers([]))
      .finally(() => setLoading(false));
  }, []);

  const handleAccept = async (id: number) => {
    setActing(id);
    try {
      await acceptTransfer(id);
      setTransfers(ts => ts.map(t => t.id === id ? { ...t, status: 'accepted' } : t));
    } catch { } finally { setActing(null); }
  };

  const handleCancel = async (id: number) => {
    setActing(id);
    try {
      await cancelTransfer(id);
      setTransfers(ts => ts.filter(t => t.id !== id));
    } catch { } finally { setActing(null); }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>TRANSFERS</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      )}

      {!loading && transfers.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>No incoming transfers.</Text>
        </View>
      )}

      {!loading && (
        <FlatList
          data={transfers}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.variety, { color: c.text, fontFamily: fonts.playfair }]}>{item.variety_name ?? 'Standing order'}</Text>
              <Text style={[styles.meta, { color: c.muted, fontFamily: fonts.dmMono }]}>
                From {item.sender_email ?? 'someone'} · {item.tier ?? 'standard'}
              </Text>
              {item.note ? (
                <Text style={[styles.note, { color: c.muted, fontFamily: fonts.dmSans }]}>{item.note}</Text>
              ) : null}
              {item.status === 'pending' && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: c.accent }, acting === item.id && { opacity: 0.6 }]}
                    onPress={() => handleAccept(item.id)}
                    disabled={acting === item.id}
                    activeOpacity={0.8}
                  >
                    {acting === item.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.actionText, { fontFamily: fonts.dmMono }]}>ACCEPT</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: c.cardDark }]}
                    onPress={() => handleCancel(item.id)}
                    disabled={acting === item.id}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.actionText, { color: c.muted, fontFamily: fonts.dmMono }]}>DECLINE</Text>
                  </TouchableOpacity>
                </View>
              )}
              {item.status === 'accepted' && (
                <Text style={[styles.meta, { color: c.accent, fontFamily: fonts.dmMono }]}>Accepted</Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { fontSize: 28 },
  title: { fontSize: 14, letterSpacing: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14 },
  list: { padding: SPACING.md, gap: SPACING.sm },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 6 },
  variety: { fontSize: 20 },
  meta: { fontSize: 12, letterSpacing: 0.5 },
  note: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10 },
  actionText: { color: '#fff', fontSize: 12, letterSpacing: 1 },
});
