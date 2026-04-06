import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchFraiseMessages, markMessageRead, deleteFraiseMessage } from '../../lib/api';

export default function FraiseChatInboxPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    fetchFraiseMessages()
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, []);

  const handleExpand = async (id: number, isRead: boolean) => {
    setExpanded(prev => prev === id ? null : id);
    if (!isRead) {
      try {
        await markMessageRead(id);
        setMessages(ms => ms.map(m => m.id === id ? { ...m, read_at: new Date().toISOString() } : m));
      } catch { }
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await deleteFraiseMessage(id);
      setMessages(ms => ms.filter(m => m.id !== id));
      if (expanded === id) setExpanded(null);
    } catch { } finally { setDeleting(null); }
  };

  const unreadCount = messages.filter(m => !m.read_at).length;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>INBOX</Text>
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: c.accent }]}>
              <Text style={[styles.badgeText, { fontFamily: fonts.dmMono }]}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && messages.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>No messages yet.</Text>
          <Text style={[styles.emptySub, { color: c.muted, fontFamily: fonts.dmMono }]}>Messages sent to your @fraise.chat address appear here.</Text>
        </View>
      )}

      {!loading && (
        <FlatList
          data={messages}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isRead = !!item.read_at;
            const isExpanded = expanded === item.id;
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: c.card, borderColor: isRead ? c.border : c.accent }]}
                onPress={() => handleExpand(item.id, isRead)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.fromRow}>
                    {!isRead && <View style={[styles.dot, { backgroundColor: c.accent }]} />}
                    <Text style={[styles.from, { color: c.text, fontFamily: fonts.dmMono }]} numberOfLines={1}>
                      {item.from_address ?? 'unknown'}
                    </Text>
                  </View>
                  <Text style={[styles.date, { color: c.muted, fontFamily: fonts.dmMono }]}>
                    {new Date(item.received_at ?? item.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <Text style={[styles.subject, { color: c.text, fontFamily: fonts.dmSans, fontWeight: isRead ? '400' : '600' }]} numberOfLines={isExpanded ? undefined : 1}>
                  {item.subject ?? '(no subject)'}
                </Text>
                {isExpanded && item.text_body ? (
                  <>
                    <Text style={[styles.body, { color: c.muted, fontFamily: fonts.dmSans }]}>{item.text_body}</Text>
                    <TouchableOpacity
                      style={[styles.deleteBtn, deleting === item.id && { opacity: 0.5 }]}
                      onPress={() => handleDelete(item.id)}
                      disabled={deleting === item.id}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.deleteText, { fontFamily: fonts.dmMono }]}>
                        {deleting === item.id ? 'Deleting…' : 'DELETE'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { fontSize: 28 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { fontSize: 14, letterSpacing: 2 },
  badge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  empty: { fontSize: 14 },
  emptySub: { fontSize: 11, letterSpacing: 0.5, textAlign: 'center' },
  list: { padding: SPACING.md, gap: SPACING.sm },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  from: { fontSize: 12, letterSpacing: 0.3, flex: 1 },
  date: { fontSize: 11, letterSpacing: 0.3 },
  subject: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 13, lineHeight: 20, marginTop: 4 },
  deleteBtn: { alignSelf: 'flex-end', paddingTop: SPACING.sm },
  deleteText: { color: '#EF4444', fontSize: 11, letterSpacing: 1 },
});
