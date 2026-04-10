import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

type Notification = {
  id: number;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

function typeTag(type: string): string {
  switch (type) {
    case 'nomination_received': return 'NOM';
    case 'follow':              return 'FOL';
    case 'membership_expired':
    case 'membership_expiring': return 'MBR';
    case 'editorial_commission': return 'EDI';
    default:                    return type.toUpperCase().slice(0, 3);
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export default function NotificationsPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    try {
      const data = await fetchNotifications(0);
      setNotifications(data);
    } catch {
      // fail silently — stale state is fine
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const handleMarkRead = async (id: number) => {
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
    try {
      await markNotificationRead(id);
    } catch {
      // Revert on failure
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: false } : n))
      );
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    // Optimistic
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await markAllNotificationsRead();
    } catch {
      // Revert
      setNotifications(prev => prev.map(n => ({ ...n, read: false })));
    } finally {
      setMarkingAll(false);
    }
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const unread = !item.read;
    return (
      <TouchableOpacity
        style={[
          styles.row,
          { borderBottomColor: c.border },
          unread && { backgroundColor: c.card },
        ]}
        onPress={() => !item.read && handleMarkRead(item.id)}
        activeOpacity={unread ? 0.75 : 1}
      >
        {/* Unread bar */}
        {unread && (
          <View style={[styles.unreadBar, { backgroundColor: c.accent }]} />
        )}
        {!unread && <View style={styles.unreadBarPlaceholder} />}

        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <Text style={[styles.tag, { color: c.accent, fontFamily: fonts.dmMono }]}>
              {typeTag(item.type)}
            </Text>
            <Text
              style={[
                styles.rowTitle,
                { color: unread ? c.text : c.muted, fontFamily: fonts.dmMono },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={[styles.rowDate, { color: c.muted, fontFamily: fonts.dmMono }]}>
              {fmtDate(item.created_at)}
            </Text>
          </View>
          <Text
            style={[
              styles.rowBody,
              { color: unread ? c.text : c.muted, fontFamily: fonts.dmSans },
            ]}
            numberOfLines={3}
          >
            {item.body}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>NOTIFICATIONS</Text>
        <TouchableOpacity
          onPress={handleMarkAll}
          disabled={markingAll || notifications.every(n => n.read)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.markAll,
              {
                color: notifications.every(n => n.read) ? c.muted : c.accent,
                fontFamily: fonts.dmMono,
              },
            ]}
          >
            {markingAll ? '…' : 'mark all'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            notifications.length === 0 ? styles.emptyContainer : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.accent}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>
              No notifications yet.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 28 },
  title: { fontSize: 14, letterSpacing: 2 },
  markAll: { fontSize: 11, letterSpacing: 0.5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 40 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  empty: { fontSize: 14, textAlign: 'center', fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 72,
  },
  unreadBar: {
    width: 2,
    alignSelf: 'stretch',
  },
  unreadBarPlaceholder: {
    width: 2,
  },
  rowContent: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tag: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  rowTitle: {
    flex: 1,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  rowDate: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
  rowBody: {
    fontSize: 14,
    lineHeight: 20,
  },
});
