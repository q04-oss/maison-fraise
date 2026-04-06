import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchTastingFeed, reactToTastingEntry } from '../../lib/api';

const EMOJI_OPTIONS = ['🍓', '❤️', '🌿', '✨', '🔥'];

type TastingEntry = {
  id: number;
  variety_id: number | null;
  rating: number;
  notes: string | null;
  created_at: string;
  variety_name: string | null;
  author_user_id: number;
  author_display_name: string;
  author_portrait_url: string | null;
  social_tier: string | null;
  reactions: Record<string, number>;
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function renderStars(rating: number, accentColor: string, mutedColor: string) {
  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map(i => (
        <Text key={i} style={[starStyles.star, { color: i <= rating ? accentColor : mutedColor }]}>
          ★
        </Text>
      ))}
    </View>
  );
}

const starStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  star: { fontSize: 13 },
});

export default function TastingFeedPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState<TastingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reactedEntries, setReactedEntries] = useState<Record<number, Set<string>>>({});

  useEffect(() => {
    fetchTastingFeed()
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleReact = useCallback(async (entryId: number, emoji: string) => {
    setReactedEntries(prev => {
      const existing = new Set(prev[entryId] ?? []);
      const alreadyReacted = existing.has(emoji);
      if (alreadyReacted) {
        existing.delete(emoji);
      } else {
        existing.add(emoji);
      }
      return { ...prev, [entryId]: existing };
    });

    setEntries(prev =>
      prev.map(entry => {
        if (entry.id !== entryId) return entry;
        const current = entry.reactions[emoji] ?? 0;
        const alreadyReacted = (reactedEntries[entryId] ?? new Set()).has(emoji);
        return {
          ...entry,
          reactions: {
            ...entry.reactions,
            [emoji]: alreadyReacted ? Math.max(0, current - 1) : current + 1,
          },
        };
      }),
    );

    try {
      await reactToTastingEntry(entryId, emoji);
    } catch {
      // non-fatal; optimistic update stays
    }
  }, [reactedEntries]);

  const renderItem = useCallback(({ item }: { item: TastingEntry }) => {
    const myReactions = reactedEntries[item.id] ?? new Set<string>();
    const reactionKeys = Object.keys(item.reactions).filter(e => (item.reactions[e] ?? 0) > 0);

    return (
      <View style={[styles.card, { borderBottomColor: c.border }]}>
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <Text style={[styles.authorName, { color: c.text }]}>
              {item.author_display_name}
            </Text>
            {item.variety_name ? (
              <Text style={[styles.varietyName, { color: c.muted }]}>
                {item.variety_name}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.timeAgo, { color: c.muted }]}>{timeAgo(item.created_at)}</Text>
        </View>

        {renderStars(item.rating, c.accent, c.border)}

        {item.notes ? (
          <Text style={[styles.notes, { color: c.text }]} numberOfLines={2}>
            {item.notes}
          </Text>
        ) : null}

        {reactionKeys.length > 0 && (
          <View style={styles.reactionsRow}>
            {reactionKeys.map(emoji => {
              const count = item.reactions[emoji] ?? 0;
              const reacted = myReactions.has(emoji);
              return (
                <TouchableOpacity
                  key={emoji}
                  activeOpacity={0.7}
                  onPress={() => handleReact(item.id, emoji)}
                  style={[
                    styles.reactionPill,
                    {
                      backgroundColor: reacted ? c.accent + '22' : c.card,
                      borderColor: reacted ? c.accent : c.border,
                    },
                  ]}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={[styles.reactionCount, { color: reacted ? c.accent : c.muted }]}>
                    {count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  }, [c, reactedEntries, handleReact]);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>TASTING FEED</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={styles.loader} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            entries.length === 0 && styles.listContentEmpty,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: c.muted }]}>
                No tasting notes yet.
              </Text>
            </View>
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
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backText: { fontSize: 28, lineHeight: 34 },
  title: { fontFamily: fonts.dmMono, fontSize: 14, letterSpacing: 2 },
  loader: { marginTop: 40 },
  listContent: { paddingBottom: SPACING.xl },
  listContentEmpty: { flex: 1 },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    fontStyle: 'italic',
  },
  card: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardTopLeft: { flex: 1, gap: 2 },
  authorName: { fontFamily: fonts.playfair, fontSize: 16 },
  varietyName: {
    fontFamily: fonts.dmMono,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  timeAgo: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
    letterSpacing: 0.3,
    marginLeft: SPACING.sm,
  },
  notes: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    lineHeight: 20,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: 2,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontFamily: fonts.dmMono, fontSize: 11 },
});
