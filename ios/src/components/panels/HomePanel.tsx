import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  RefreshControl, StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel, FraiseInvitation } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
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
          <Text style={[styles.balance, { color: c.muted }]}>
            {member.credit_balance} credit{member.credit_balance !== 1 ? 's' : ''}
          </Text>
        ) : null}
      </PanelHeader>

      {!member ? (
        <Card style={styles.onboardCard}>
          <Text style={[styles.onboardTitle, { color: c.text }]}>invitation only.</Text>
          <Text style={[styles.onboardBody, { color: c.muted }]}>
            box fraise is a private network. businesses select guests for experiences that don't exist anywhere else.{'\n\n'}sign in or create an account to get started.
          </Text>
          <PrimaryButton label="sign in →" onPress={() => showPanel('account')} />
        </Card>
      ) : pending.length === 0 && others.length === 0 ? (
        <Card style={styles.onboardCard}>
          <Text style={[styles.onboardTitle, { color: c.text }]}>
            {member.credit_balance > 0 ? 'you\'re eligible.' : 'get a credit.'}
          </Text>
          <Text style={[styles.onboardBody, { color: c.muted }]}>
            {member.credit_balance > 0
              ? 'businesses can now invite you to private experiences. invitations will appear here when you\'re selected.'
              : 'a box fraise credit is your entry into the network. hold one and businesses can invite you to private experiences.'
            }
          </Text>
          {member.credit_balance === 0 && (
            <PrimaryButton label="buy a credit →" onPress={() => showPanel('credits')} />
          )}
        </Card>
      ) : (
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
  row: {
    flexDirection: 'row',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACING.md,
    alignItems: 'flex-start',
  },
  lastBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowLeft: { flex: 1, gap: 4 },
  rowBiz: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  rowTitle: { fontSize: 14, fontFamily: fonts.dmMono, fontWeight: '500' },
  rowDesc: { fontSize: 11, fontFamily: fonts.dmMono, lineHeight: 16 },
  rowRight: { paddingTop: 2, flexShrink: 0 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
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
