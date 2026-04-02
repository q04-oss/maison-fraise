import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { fetchActivityFeed } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const TYPE_ICON: Record<string, string> = {
  nomination: '★',
  placement: '⬡',
  rsvp: '✦',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function ActivityFeedPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const [feed, setFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFeed = (isRefresh = false) => {
    AsyncStorage.getItem('user_db_id').then(id => {
      if (!id) { setLoading(false); return; }
      fetchActivityFeed(parseInt(id))
        .then(setFeed)
        .catch(() => {})
        .finally(() => { setLoading(false); if (isRefresh) setRefreshing(false); });
    });
  };

  useEffect(() => { loadFeed(); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadFeed(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Activity</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : feed.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Text style={{ fontSize: 32, color: c.border }}>活</Text>
            <Text style={{ fontFamily: fonts.dmSans, color: c.muted, fontSize: 15, fontStyle: 'italic' }}>
              Nothing yet. Follow people to see their activity.
            </Text>
          </View>
        ) : (
          feed.map((item, i) => (
            <View key={i} style={[styles.row, { borderBottomColor: c.border }]}>
              <Text style={[styles.icon, { color: c.accent }]}>{TYPE_ICON[item.type] ?? '·'}</Text>
              <View style={styles.content}>
                <Text style={[styles.actor, { color: c.text }]}>{item.actor_name}</Text>
                <Text style={[styles.subject, { color: c.muted }]}>{item.subject}</Text>
              </View>
              <Text style={[styles.date, { color: c.muted }]}>{fmtDate(item.created_at)}</Text>
            </View>
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
  empty: { textAlign: 'center', marginTop: 60, fontFamily: fonts.dmSans, fontStyle: 'italic', paddingHorizontal: 40 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  icon: { fontSize: 16, width: 20, textAlign: 'center' },
  content: { flex: 1, gap: 3 },
  actor: { fontSize: 15, fontFamily: fonts.playfair },
  subject: { fontSize: 12, fontFamily: fonts.dmSans },
  date: { fontSize: 10, fontFamily: fonts.dmMono, flexShrink: 0 },
});
