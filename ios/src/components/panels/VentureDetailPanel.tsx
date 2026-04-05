import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { fetchVenture, joinVenture, leaveVenture, postVentureUpdate, fetchVentureContracts } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

export default function VentureDetailPanel() {
  const { goBack, panelData, showPanel } = usePanel();
  const c = useColors();
  const ventureId = panelData?.ventureId as number;

  const [venture, setVenture] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [postBody, setPostBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(v => { if (v) setMyUserId(parseInt(v, 10)); });
  }, []);

  const load = useCallback(() => {
    if (!ventureId) return;
    fetchVenture(ventureId)
      .then(setVenture)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ventureId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ventureId || !myUserId) return;
    fetchVentureContracts(ventureId).then(setContracts).catch(() => {});
  }, [ventureId, myUserId]);

  const isMember = venture?.members?.some((m: any) => m.user_id === myUserId);
  const myRole = venture?.members?.find((m: any) => m.user_id === myUserId)?.role ?? null;
  const isOwner = myRole === 'owner';
  const isDorotka = venture?.ceo_type === 'dorotka';

  const handleJoin = async () => {
    setJoining(true);
    try {
      await joinVenture(ventureId);
      load();
    } catch (e: any) {
      const msg = e?.message === 'already_a_member' ? 'You are already a member.'
        : e?.message === 'venture_closed' ? 'This venture is no longer active.'
        : 'Could not join. Try again.';
      Alert.alert('Error', msg);
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    Alert.alert('Leave venture', 'Are you sure you want to leave this venture?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive', onPress: async () => {
          setLeaving(true);
          try {
            await leaveVenture(ventureId);
            goBack();
          } catch (e: any) {
            Alert.alert('Error', 'Could not leave venture.');
          } finally {
            setLeaving(false);
          }
        },
      },
    ]);
  };

  const handlePost = async () => {
    if (!postBody.trim() || posting) return;
    setPosting(true);
    try {
      await postVentureUpdate(ventureId, postBody.trim());
      setPostBody('');
      load();
    } catch {
      Alert.alert('Error', 'Could not post update.');
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
        </View>
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!venture) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={[styles.empty, { color: c.muted }]}>venture not found</Text>
      </View>
    );
  }

  const cutPercent = (venture.fraise_cut_bps / 100).toFixed(0);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{venture.name}</Text>
        </View>
        {isOwner ? (
          <TouchableOpacity
            onPress={() => showPanel('venture-manage', { ventureId, venture })}
            activeOpacity={0.7}
            style={styles.manageBtn}
          >
            <Text style={[styles.manageBtnText, { color: c.accent }]}>manage</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* CEO / type */}
        <View style={[styles.section, { borderBottomColor: c.border }]}>
          {isDorotka ? (
            <View style={styles.dorotkaRow}>
              <View style={[styles.dorotkaTag, { borderColor: c.accent }]}>
                <Text style={[styles.dorotkaTagText, { color: c.accent }]}>DOROTKA</Text>
              </View>
              <Text style={[styles.metaText, { color: c.muted }]}>worker co-op · AI-led</Text>
            </View>
          ) : (
            <Text style={[styles.metaText, { color: c.muted }]}>
              led by {venture.ceo_display_name ?? 'unknown'} · human-led
            </Text>
          )}
          {venture.description ? (
            <Text style={[styles.description, { color: c.text }]}>{venture.description}</Text>
          ) : null}
          <Text style={[styles.metaText, { color: c.muted }]}>
            fraise cut: {cutPercent}%
          </Text>
        </View>

        {/* Members */}
        <View style={[styles.section, { borderBottomColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.muted }]}>MEMBERS</Text>
          {venture.members.length === 0 ? (
            <Text style={[styles.empty, { color: c.muted }]}>no members yet</Text>
          ) : (
            venture.members.map((m: any) => (
              <View key={m.user_id} style={styles.memberRow}>
                <Text style={[styles.memberName, { color: c.text }]}>{m.display_name}</Text>
                <Text style={[styles.memberRole, { color: c.muted }]}>{m.role}</Text>
              </View>
            ))
          )}
          {!isMember && (
            <TouchableOpacity
              style={[styles.joinBtn, { backgroundColor: c.text }, joining && { opacity: 0.5 }]}
              onPress={handleJoin}
              disabled={joining}
              activeOpacity={0.8}
            >
              <Text style={[styles.joinBtnText, { color: c.background }]}>
                {joining ? 'joining…' : 'join venture'}
              </Text>
            </TouchableOpacity>
          )}
          {isMember && !isOwner && (
            <TouchableOpacity
              style={[styles.leaveBtn, { borderColor: c.border }, leaving && { opacity: 0.5 }]}
              onPress={handleLeave}
              disabled={leaving}
              activeOpacity={0.7}
            >
              <Text style={[styles.joinBtnText, { color: c.muted }]}>
                {leaving ? 'leaving…' : 'leave venture'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Revenue splits (members only) */}
        {isMember && venture.revenue_splits?.length > 0 && (
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>REVENUE SPLITS</Text>
            <View style={[styles.splitRow, { borderBottomColor: c.border }]}>
              <Text style={[styles.splitName, { color: c.muted }]}>fraise</Text>
              <Text style={[styles.splitPct, { color: c.muted }]}>{(venture.fraise_cut_bps / 100).toFixed(0)}%</Text>
            </View>
            {venture.revenue_splits.map((s: any) => (
              <View key={s.user_id} style={[styles.splitRow, { borderBottomColor: c.border }]}>
                <Text style={[styles.splitName, { color: c.text }]}>{s.display_name}</Text>
                <Text style={[styles.splitPct, { color: c.text }]}>{(s.share_bps / 100).toFixed(0)}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Venture contracts (members only) */}
        {isMember && contracts.length > 0 && (
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>CONTRACTS</Text>
            {contracts.map((ct: any) => (
              <View key={ct.id} style={[styles.contractRow, { borderBottomColor: c.border }]}>
                <View style={styles.contractLeft}>
                  <Text style={[styles.contractName, { color: c.text }]}>{ct.display_name}</Text>
                  {ct.business_name && (
                    <Text style={[styles.contractBiz, { color: c.muted }]}>{ct.business_name}</Text>
                  )}
                </View>
                <View style={styles.contractRight}>
                  <Text style={[styles.contractStatus, { color: ct.status === 'active' ? c.accent : c.muted }]}>{ct.status}</Text>
                  <Text style={[styles.contractDate, { color: c.muted }]}>
                    {new Date(ct.starts_at).toLocaleDateString('en-CA')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Post update (members only) */}
        {isMember && (
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>POST UPDATE</Text>
            <TextInput
              style={[styles.postInput, { color: c.text, borderColor: c.border }]}
              placeholder="What's happening in this venture…"
              placeholderTextColor={c.muted}
              value={postBody}
              onChangeText={setPostBody}
              multiline
            />
            <TouchableOpacity
              style={[styles.postBtn, { backgroundColor: c.text }, (!postBody.trim() || posting) && { opacity: 0.4 }]}
              onPress={handlePost}
              disabled={!postBody.trim() || posting}
              activeOpacity={0.8}
            >
              <Text style={[styles.joinBtnText, { color: c.background }]}>
                {posting ? 'posting…' : 'post'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Feed */}
        {venture.posts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>UPDATES</Text>
            {venture.posts.map((p: any) => (
              <View key={p.id} style={[styles.postRow, { borderBottomColor: c.border }]}>
                <View style={styles.postMeta}>
                  <Text style={[styles.postAuthor, { color: c.text }]}>{p.display_name}</Text>
                  <Text style={[styles.postDate, { color: c.muted }]}>
                    {new Date(p.created_at).toLocaleDateString('en-CA')}
                  </Text>
                </View>
                <Text style={[styles.postBody, { color: c.text }]}>{p.body}</Text>
              </View>
            ))}
          </View>
        )}
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
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerSpacer: { width: 28 },
  title: { fontSize: 17, fontFamily: fonts.playfair },
  empty: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
  },
  section: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  sectionLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase' },
  dorotkaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dorotkaTag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  dorotkaTagText: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  metaText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  description: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 20 },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberName: { fontSize: 14, fontFamily: fonts.dmSans },
  memberRole: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  joinBtn: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  leaveBtn: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderWidth: StyleSheet.hairlineWidth },
  joinBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  manageBtn: { paddingVertical: 4 },
  manageBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  postInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: fonts.dmSans,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  postBtn: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  postRow: { paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  postMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  postAuthor: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  postDate: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  postBody: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 20 },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  splitName: { fontSize: 13, fontFamily: fonts.dmSans },
  splitPct: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  contractRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  contractLeft: { flex: 1, gap: 2 },
  contractName: { fontSize: 13, fontFamily: fonts.dmSans },
  contractBiz: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  contractRight: { alignItems: 'flex-end', gap: 2 },
  contractStatus: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5, textTransform: 'uppercase' },
  contractDate: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
});
