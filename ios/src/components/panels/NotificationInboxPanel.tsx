import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { fetchNotifications, markNotificationRead } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function NotificationInboxPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotes = (isRefresh = false) => {
    AsyncStorage.getItem('user_db_id').then(id => {
      if (!id) { setLoading(false); return; }
      fetchNotifications(parseInt(id))
        .then(setNotes)
        .catch(() => {})
        .finally(() => { setLoading(false); if (isRefresh) setRefreshing(false); });
    });
  };

  useEffect(() => { loadNotes(); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadNotes(true);
  };

  const handlePress = async (n: any) => {
    if (!n.read) {
      await markNotificationRead(n.id).catch(() => {});
      setNotes(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : notes.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Text style={{ fontSize: 32, color: c.border }}>知</Text>
            <Text style={{ fontFamily: fonts.dmSans, color: c.muted, fontSize: 15, fontStyle: 'italic' }}>
              You're all caught up.
            </Text>
          </View>
        ) : (
          notes.map(n => (
            <TouchableOpacity
              key={n.id}
              style={[styles.row, { borderBottomColor: c.border }, !n.read && { backgroundColor: c.card }]}
              onPress={() => handlePress(n)}
              activeOpacity={0.75}
            >
              {!n.read && <View style={[styles.dot, { backgroundColor: c.accent }]} />}
              <View style={styles.rowContent}>
                <Text style={[styles.rowTitle, { color: c.text }]}>{n.title}</Text>
                <Text style={[styles.rowBody, { color: c.muted }]} numberOfLines={2}>{n.body}</Text>
              </View>
              <Text style={[styles.rowDate, { color: c.muted }]}>{fmtDate(n.created_at)}</Text>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  empty: { textAlign: 'center', marginTop: 60, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  rowContent: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14, fontFamily: fonts.playfair },
  rowBody: { fontSize: 12, fontFamily: fonts.dmSans },
  rowDate: { fontSize: 10, fontFamily: fonts.dmMono, flexShrink: 0 },
});
