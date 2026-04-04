import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchConversations } from '../../lib/api';

export default function ConversationsPanel() {
  const { goHome, showPanel, setPanelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchConversations()
      .then(setConversations)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, []);

  const openThread = (conv: any) => {
    setPanelData({ userId: conv.other_user_id, displayName: conv.display_name, userCode: conv.user_code });
    showPanel('messageThread');
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goHome} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Messages</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: c.muted }]}>No conversations yet.</Text>
          <Text style={[styles.emptyHint, { color: c.muted }]}>Connect with someone via NFC to start messaging.</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => String(item.other_user_id)}
          contentContainerStyle={{ paddingTop: SPACING.sm }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: c.border }]}
              onPress={() => openThread(item)}
              activeOpacity={0.8}
            >
              <View style={styles.rowMain}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, { color: c.text }]}>
                    {item.display_name ?? item.user_code ?? 'Unknown'}
                  </Text>
                  <Text style={[styles.time, { color: c.muted }]}>{formatTime(item.last_at)}</Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={[styles.preview, { color: c.muted }]} numberOfLines={1}>
                    {item.last_body}
                  </Text>
                  {item.unread_count > 0 && (
                    <View style={[styles.badge, { backgroundColor: c.accent }]}>
                      <Text style={styles.badgeText}>{item.unread_count}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
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
  backBtn: { paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: fonts.playfair },
  headerSpacer: { width: 28 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.md, gap: 8 },
  emptyText: { fontSize: 17, fontFamily: fonts.playfair },
  emptyHint: { fontSize: 13, fontFamily: fonts.dmSans, textAlign: 'center', lineHeight: 20 },
  row: { paddingHorizontal: SPACING.md, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowMain: { gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontSize: 15, fontFamily: fonts.playfair },
  time: { fontSize: 11, fontFamily: fonts.dmMono },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  preview: { fontSize: 13, fontFamily: fonts.dmSans, flex: 1 },
  badge: { borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 },
  badgeText: { fontSize: 11, fontFamily: fonts.dmMono, color: '#fff' },
});
