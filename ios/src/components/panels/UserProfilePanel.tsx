import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import {
  fetchUserProfile,
  fetchFollowing,
  followUser,
  unfollowUser,
} from '../../lib/api';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

type ProfileData = {
  user: {
    id: number;
    display_name: string | null;
    membership_tier: string | null;
    portrait_url: string | null;
    worker_status: string | null;
    portal_opted_in: boolean;
    is_patron: boolean;
    is_founder: boolean;
  };
  editorial_pieces: { id: number; title: string; tag: string | null; published_at: string; commission_cents: number | null }[];
  patron_tokens: { season_year: number; location_name: string }[];
  founded_greenhouses: { id: number; name: string; location: string; status: string }[];
};

export default function UserProfilePanel() {
  const { goBack, panelData, showPanel, setPanelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const userId: number | undefined = panelData?.userId;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (userId == null) { setLoading(false); return; }

    const load = async () => {
      try {
        const [data, storedId] = await Promise.all([
          fetchUserProfile(userId),
          AsyncStorage.getItem('user_db_id'),
        ]);
        setProfile(data);

        if (storedId) {
          const currentUserId = parseInt(storedId, 10);
          const followingList = await fetchFollowing(currentUserId);
          const isFollowing = Array.isArray(followingList)
            ? followingList.some((u: any) => u.id === userId || u.user_id === userId)
            : false;
          setFollowing(isFollowing);
        }
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId]);

  const handleFollowToggle = async () => {
    if (followLoading) return;
    setFollowLoading(true);
    try {
      if (following) {
        await unfollowUser(userId!);
        setFollowing(false);
      } else {
        await followUser(userId!);
        setFollowing(true);
      }
    } catch {
      // non-fatal
    } finally {
      setFollowLoading(false);
    }
  };

  const user = profile?.user;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>PROFILE</Text>
        <View style={styles.headerRight}>
          {!loading && user && (
            <TouchableOpacity
              onPress={handleFollowToggle}
              activeOpacity={0.7}
              disabled={followLoading}
              style={[styles.followBtn, { borderColor: c.accent }]}
            >
              {followLoading ? (
                <ActivityIndicator color={c.accent} size="small" />
              ) : (
                <Text style={[styles.followBtnText, { color: c.accent }]}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : !profile ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: c.muted }]}>Profile not found.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: (insets.bottom || SPACING.md) + SPACING.lg }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Identity block */}
          <View style={[styles.identityBlock, { borderBottomColor: c.border }]}>
            <Text style={[styles.displayName, { color: c.text }]}>
              {user!.display_name ?? 'Anonymous'}
            </Text>
            <View style={styles.badgeRow}>
              {user!.membership_tier && (
                <View style={[styles.badge, { borderColor: c.accent }]}>
                  <Text style={[styles.badgeText, { color: c.accent }]}>
                    {user!.membership_tier.toUpperCase()}
                  </Text>
                </View>
              )}
              {user!.worker_status === 'active' && (
                <View style={[styles.badge, { borderColor: c.border }]}>
                  <Text style={[styles.badgeText, { color: c.muted }]}>STAFF</Text>
                </View>
              )}
              {user!.is_patron && (
                <View style={[styles.badge, { borderColor: c.border }]}>
                  <Text style={[styles.badgeText, { color: c.muted }]}>PATRON</Text>
                </View>
              )}
              {user!.is_founder && (
                <View style={[styles.badge, { borderColor: c.border }]}>
                  <Text style={[styles.badgeText, { color: c.muted }]}>FOUNDER</Text>
                </View>
              )}
            </View>
          </View>

          {/* Editorial pieces */}
          {profile.editorial_pieces.length > 0 && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>PIECES</Text>
              {profile.editorial_pieces.map(piece => (
                <TouchableOpacity
                  key={piece.id}
                  style={[styles.pieceRow, { borderBottomColor: c.border }]}
                  onPress={() => {
                    setPanelData({ pieceId: piece.id });
                    showPanel('editorial-piece');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pieceTitle, { color: c.text }]}>{piece.title}</Text>
                  <View style={styles.pieceMeta}>
                    {piece.tag && (
                      <View style={[styles.tagPill, { borderColor: c.border }]}>
                        <Text style={[styles.tagText, { color: c.muted }]}>{piece.tag}</Text>
                      </View>
                    )}
                    <Text style={[styles.pieceDate, { color: c.muted }]}>
                      {formatDate(piece.published_at)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Patron tokens */}
          {profile.patron_tokens.length > 0 && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>PATRON</Text>
              {profile.patron_tokens.map((token, idx) => (
                <View key={idx} style={[styles.simpleRow, { borderBottomColor: c.border }]}>
                  <Text style={[styles.simpleRowPrimary, { color: c.text }]}>
                    {token.location_name}
                  </Text>
                  <Text style={[styles.simpleRowSecondary, { color: c.muted }]}>
                    {token.season_year}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Founded greenhouses */}
          {profile.founded_greenhouses.length > 0 && (
            <View style={[styles.section, { borderBottomColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>FOUNDED</Text>
              {profile.founded_greenhouses.map(gh => (
                <View key={gh.id} style={[styles.simpleRow, { borderBottomColor: c.border }]}>
                  <Text style={[styles.simpleRowPrimary, { color: c.text }]}>{gh.name}</Text>
                  <Text style={[styles.simpleRowSecondary, { color: c.muted }]}>{gh.location}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
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
  headerRight: { width: 90, alignItems: 'flex-end' },
  followBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  followBtnText: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1.5 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: fonts.dmSans, fontSize: 14 },

  scroll: { paddingBottom: 60 },

  identityBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  displayName: { fontFamily: fonts.playfair, fontSize: 28 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: 4 },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1.5 },

  section: {
    paddingTop: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
    letterSpacing: 1.5,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },

  pieceRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  pieceTitle: { fontFamily: fonts.playfair, fontSize: 15 },
  pieceMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  tagPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 0.5 },
  pieceDate: { fontFamily: fonts.dmMono, fontSize: 10 },

  simpleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  simpleRowPrimary: { fontFamily: fonts.playfair, fontSize: 15, flex: 1 },
  simpleRowSecondary: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 0.5, marginLeft: SPACING.sm },
});
