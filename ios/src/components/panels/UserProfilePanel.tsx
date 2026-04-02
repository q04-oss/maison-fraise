import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { fetchPublicProfile, followUser, unfollowUser, fetchFollowStatus } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function UserProfilePanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const userId: number | null = panelData?.userId ?? null;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    AsyncStorage.getItem('user_db_id').then(async storedId => {
      const cid = storedId ? parseInt(storedId) : null;
      setCurrentUserId(cid);
      try {
        const [profileData] = await Promise.all([
          fetchPublicProfile(userId),
        ]);
        setProfile(profileData);
        if (cid && cid !== userId) {
          const status = await fetchFollowStatus(userId, cid).catch(() => null);
          if (status) setIsFollowing(status.is_following);
        }
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    });
  }, [userId]);

  const handleFollowToggle = async () => {
    if (!userId || !currentUserId || followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(userId, currentUserId);
        setIsFollowing(false);
      } else {
        await followUser(userId, currentUserId);
        setIsFollowing(true);
      }
    } catch {
      // non-fatal
    } finally {
      setFollowLoading(false);
    }
  };

  const showFollowBtn = currentUserId !== null && userId !== null && currentUserId !== userId;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
          {profile?.display_name ?? '—'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : !profile ? (
          <Text style={[styles.empty, { color: c.muted }]}>Profile not found.</Text>
        ) : (
          <>
            {/* Stats row */}
            <View style={[styles.statsRow, { borderColor: c.border }]}>
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: c.text }]}>{profile.follower_count}</Text>
                <Text style={[styles.statLabel, { color: c.muted }]}>FOLLOWERS</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: c.border }]} />
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: c.text }]}>{profile.nomination_count}</Text>
                <Text style={[styles.statLabel, { color: c.muted }]}>NOMINATIONS</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: c.border }]} />
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: c.text }]}>{profile.past_placements}</Text>
                <Text style={[styles.statLabel, { color: c.muted }]}>PLACEMENTS</Text>
              </View>
            </View>

            {/* Follow button */}
            {showFollowBtn && (
              <TouchableOpacity
                style={[
                  styles.followBtn,
                  isFollowing
                    ? { borderColor: c.border, backgroundColor: 'transparent' }
                    : { borderColor: c.accent, backgroundColor: c.accent },
                ]}
                onPress={handleFollowToggle}
                disabled={followLoading}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.followBtnText,
                    { color: isFollowing ? c.muted : '#0C0C0E' },
                  ]}
                >
                  {followLoading ? '…' : isFollowing ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Active placement */}
            {profile.active_placement && (
              <View style={[styles.placementCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.placedDot} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.placementLabel, { color: c.muted }]}>CURRENTLY AT</Text>
                  <Text style={[styles.placementBiz, { color: c.text }]}>{profile.active_placement.business_name}</Text>
                  <Text style={[styles.placementAddr, { color: c.muted }]}>{profile.active_placement.business_address}</Text>
                </View>
              </View>
            )}

            {/* Tags */}
            <View style={styles.tagsRow}>
              {profile.is_dj && (
                <View style={[styles.tag, { borderColor: c.border }]}>
                  <Text style={[styles.tagText, { color: c.muted }]}>DJ</Text>
                </View>
              )}
              {profile.follower_count >= 10 && (
                <View style={[styles.tag, { borderColor: c.border }]}>
                  <Text style={[styles.tagText, { color: c.muted }]}>Scene regular</Text>
                </View>
              )}
              {profile.past_placements >= 2 && (
                <View style={[styles.tag, { borderColor: c.border }]}>
                  <Text style={[styles.tagText, { color: c.muted }]}>Returning talent</Text>
                </View>
              )}
            </View>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  body: { padding: SPACING.md, gap: 14 },
  empty: { textAlign: 'center', marginTop: 60, fontFamily: fonts.dmSans, fontStyle: 'italic' },

  statsRow: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: 'hidden',
  },
  statBlock: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 },
  statDivider: { width: StyleSheet.hairlineWidth },
  statValue: { fontSize: 22, fontFamily: fonts.playfair },
  statLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },

  followBtn: { marginTop: 4, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  followBtnText: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 1.5 },

  placementCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  placedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9973A', marginTop: 4 },
  placementLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  placementBiz: { fontSize: 16, fontFamily: fonts.playfair },
  placementAddr: { fontSize: 12, fontFamily: fonts.dmSans },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  tagText: { fontSize: 11, fontFamily: fonts.dmMono },
});
