import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, TextInput, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';

interface Conversation {
  other_user_id: number;
  display_name: string | null;
  user_code: string | null;
  is_shop: boolean;
  last_body: string;
  last_at: string;
  unread_count: number;
}

function msgTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return String(date.getHours());
  const days = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (days < 7) return ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][date.getDay()];
  return `${days}j`;
}

export default function ConversationsPanel() {
  const { goBack, showPanel, panelData } = usePanel();
  const c = useColors();

  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(() => {
    import('../../lib/api').then(({ fetchConversations }) => {
      fetchConversations()
        .then(setConvos)
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // User search for compose
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const { searchUsers } = await import('../../lib/api');
        const results = await searchUsers(q);
        setSearchResults(results);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // If launched from push with a specific user_id, go straight to that thread
  useEffect(() => {
    if (panelData?.user_id && !loading) {
      const convo = convos.find(c => c.other_user_id === panelData.user_id);
      if (convo) {
        showPanel('chat-thread', {
          userId: convo.other_user_id,
          displayName: convo.display_name ?? convo.user_code ?? 'user',
        });
      }
    }
  }, [loading, panelData]);

  const openThread = (convo: Conversation) => {
    showPanel('chat-thread', {
      userId: convo.other_user_id,
      displayName: convo.display_name ?? convo.user_code ?? 'user',
    });
  };

  const handleLongPress = (convo: Conversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      convo.display_name ?? convo.user_code ?? 'user',
      'Archive this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              const { archiveConversation } = await import('../../lib/api');
              await archiveConversation(convo.other_user_id);
              setConvos(prev => prev.filter(c => c.other_user_id !== convo.other_user_id));
            } catch {
              Alert.alert('Error', 'Could not archive conversation.');
            }
          },
        },
      ],
    );
  };

  if (composing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setComposing(false); setSearchQuery(''); setSearchResults([]); }} style={styles.backBtn} activeOpacity={0.6}>
            <Text style={[styles.backText, { color: c.muted }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>new message</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <View style={styles.searchWrap}>
          <TextInput
            style={[styles.searchInput, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
            placeholder="search people..."
            placeholderTextColor={c.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {searching && <ActivityIndicator color={c.muted} style={{ marginTop: SPACING.md }} />}
        {searchResults.map(u => (
          <TouchableOpacity
            key={u.id}
            style={[styles.row, { borderBottomColor: c.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              showPanel('chat-thread', { userId: u.id, displayName: u.display_name ?? u.user_code ?? 'user' });
            }}
            activeOpacity={0.7}
          >
            <View style={styles.rowBody}>
              <Text style={[styles.name, { color: c.text }]}>{u.display_name ?? u.user_code ?? 'user'}</Text>
              {u.save_count > 0 && (
                <Text style={[styles.preview, { color: c.muted }]}>{u.save_count} saves</Text>
              )}
            </View>
            <Text style={[styles.time, { color: c.muted }]}>→</Text>
          </TouchableOpacity>
        ))}
        {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
          <Text style={[styles.empty, { color: c.muted }]}>no results</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.6}>
          <Text style={[styles.backText, { color: c.muted }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>strawberry chat</Text>
        <TouchableOpacity onPress={() => setComposing(true)} style={styles.composeBtn} activeOpacity={0.7}>
          <Text style={[styles.composeText, { color: c.muted }]}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.divider, { backgroundColor: c.border }]} />

      {loading ? (
        <ActivityIndicator color={c.muted} style={{ marginTop: SPACING.lg }} />
      ) : convos.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>no conversations yet</Text>
      ) : (
        <FlatList
          data={convos}
          keyExtractor={item => String(item.other_user_id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: c.border }]}
              onPress={() => openThread(item)}
              onLongPress={() => handleLongPress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, { color: c.text }]}>
                    {item.display_name ?? item.user_code ?? 'user'}
                  </Text>
                  <Text style={[styles.time, { color: c.muted }]}>{msgTimestamp(item.last_at)}</Text>
                </View>
                <Text style={[styles.preview, { color: c.muted }]} numberOfLines={1}>
                  {item.last_body}
                </Text>
              </View>
              {item.unread_count > 0 && (
                <View style={[styles.badge, { backgroundColor: c.text }]}>
                  <Text style={[styles.badgeText, { color: c.sheetBg }]}>
                    {item.unread_count > 9 ? '9+' : item.unread_count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 20 },
  title: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md, marginBottom: 4 },
  empty: { fontSize: 13, fontFamily: fonts.dmMono, paddingHorizontal: SPACING.md, paddingTop: SPACING.lg },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowBody: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontSize: 15, fontFamily: fonts.dmSans },
  time: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  preview: { fontSize: 12, fontFamily: fonts.dmSans },
  badge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: SPACING.sm },
  badgeText: { fontSize: 9, fontFamily: fonts.dmMono },
  composeBtn: { marginLeft: 'auto' as any, paddingHorizontal: 4 },
  composeText: { fontSize: 22, lineHeight: 26 },
  searchWrap: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  searchInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontFamily: fonts.dmSans },
});
