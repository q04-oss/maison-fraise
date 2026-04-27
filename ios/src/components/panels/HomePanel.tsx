import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  RefreshControl, StyleSheet, Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel, FraiseInvitation } from '../../context/PanelContext';
import { useColors, fonts, type, SPACING } from '../../theme';
import { fetchInvitations, getMemberToken } from '../../lib/api';
import { PanelHeader, PillBadge, Card, PrimaryButton } from '../ui';

function invitationColor(inv: FraiseInvitation, c: any): string {
  if (inv.status === 'accepted')  return '#27AE60';
  if (inv.status === 'confirmed') return c.text;
  return c.border;
}

function invitationLabel(inv: FraiseInvitation): string {
  if (inv.status === 'accepted')  return 'accepted';
  if (inv.status === 'confirmed') return 'confirmed';
  if (inv.status === 'declined')  return 'declined';
  return 'invited';
}

function InvitationRow({ inv, onPress }: { inv: FraiseInvitation; onPress: () => void }) {
  const c = useColors();
  const color = invitationColor(inv, c);

  return (
    <TouchableOpacity
      style={[styles.row, { borderTopColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rowBiz, { color: c.muted }]} numberOfLines={1}>
          {inv.business_name}
        </Text>
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={2}>
          {inv.title}
        </Text>
        {inv.description ? (
          <Text style={[styles.rowDesc, { color: c.muted }]} numberOfLines={2}>
            {inv.description}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        <PillBadge label={invitationLabel(inv)} color={color} />
      </View>
    </TouchableOpacity>
  );
}

export default function HomePanel() {
  const { showPanel, setActiveInvitation, invitations, setInvitations, member, jumpToPanel } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const token = await getMemberToken();
      if (token) setInvitations(await fetchInvitations());
    } catch {}
    setRefreshing(false);
  }, []);

  const openInvitation = (inv: FraiseInvitation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveInvitation(inv);
    showPanel('invitation-detail', { invitation: inv });
  };

  const pending = invitations.filter(i => i.status === 'pending');
  const others  = invitations.filter(i => i.status !== 'pending');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.panelBg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 16 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.muted} />
      }
    >
      <PanelHeader title={member ? member.name : 'fraise'}>
        {member ? (
          <Pressable onPress={() => showPanel('credits')}>
            <View style={[styles.boxBadge, { borderColor: c.border }]}>
              <Text style={[styles.boxBadgeNum, { color: c.muted }]}>{member.credit_balance}</Text>
            </View>
          </Pressable>
        ) : null}
      </PanelHeader>

      {!member ? null : (
        <View>
          {pending.length > 0 && (
            <>
              {pending.map(inv => (
                <InvitationRow key={inv.id} inv={inv} onPress={() => openInvitation(inv)} />
              ))}
            </>
          )}
          {others.length > 0 && (
            <>
              {pending.length > 0 && (
                <Text style={[styles.sectionLabel, { color: c.muted }]}>past</Text>
              )}
              {others.map(inv => (
                <InvitationRow key={inv.id} inv={inv} onPress={() => openInvitation(inv)} />
              ))}
            </>
          )}
          <View style={[styles.lastBorder, { borderBottomColor: c.border }]} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: SPACING.md },
  balance: { fontSize: 12, fontFamily: fonts.dmMono, marginTop: 2 },
  boxBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  boxBadgeNum: { fontSize: 11, fontFamily: fonts.dmMono },
  row: {
    flexDirection: 'row',
    paddingTop: 20,
    paddingBottom: 22,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACING.md,
    alignItems: 'flex-start',
  },
  lastBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowLeft: { flex: 1 },
  rowBiz: {
    ...type.eyebrow,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  rowTitle: { ...type.heading, marginBottom: 6 },
  rowDesc: { ...type.small },
  rowRight: { paddingTop: 4, flexShrink: 0 },
  sectionLabel: {
    ...type.eyebrow,
    textTransform: 'uppercase',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  onboardCard: { marginHorizontal: SPACING.lg, gap: SPACING.md, padding: SPACING.lg },
  onboardTitle: { fontSize: 15, fontFamily: fonts.dmMono, fontWeight: '500' },
  onboardBody: { fontSize: 12, fontFamily: fonts.dmMono, lineHeight: 19 },
  empty: {
    fontSize: 13,
    fontFamily: fonts.dmMono,
    paddingHorizontal: SPACING.lg,
    lineHeight: 20,
  },
});
