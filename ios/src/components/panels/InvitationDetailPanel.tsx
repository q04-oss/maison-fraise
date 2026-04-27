import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel, FraiseInvitation } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { acceptInvitation, declineInvitation, fetchMe, getMemberToken } from '../../lib/api';
import { PanelHeader, PrimaryButton } from '../ui';

export default function InvitationDetailPanel() {
  const {
    goBack, showPanel, panelData, activeInvitation,
    member, setMember, invitations, setInvitations,
  } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const inv: FraiseInvitation | null = panelData?.invitation ?? activeInvitation;

  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);

  if (!inv) {
    return (
      <View style={[styles.center, { backgroundColor: c.panelBg }]}>
        <Text style={[styles.muted, { color: c.muted }]}>no invitation selected.</Text>
      </View>
    );
  }

  const updateInvitation = (updated: Partial<FraiseInvitation>) => {
    setInvitations(invitations.map(i => i.id === inv.id ? { ...i, ...updated } : i));
  };

  const handleAccept = async () => {
    const token = await getMemberToken();
    if (!token) { showPanel('account'); return; }
    if (!member || member.credit_balance < 1) { showPanel('credits'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    try {
      const result = await acceptInvitation(inv.event_id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJustAccepted(true);
      updateInvitation({ status: 'accepted', responded_at: new Date().toISOString() });
      fetchMe().then(me => { if (me) setMember(me); }).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'something went wrong.');
    }
    setLoading(false);
  };

  const handleDecline = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError(null);
    try {
      await declineInvitation(inv.event_id);
      updateInvitation({ status: 'declined', responded_at: new Date().toISOString() });
      fetchMe().then(me => { if (me) setMember(me); }).catch(() => {});
      goBack();
    } catch (err: any) {
      setError(err.message || 'something went wrong.');
    }
    setLoading(false);
  };

  const isPending  = inv.status === 'pending';
  const isAccepted = inv.status === 'accepted' || inv.status === 'confirmed';
  const isDeclined = inv.status === 'declined';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.panelBg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <PanelHeader
        title={inv.title}
        subtitle={inv.event_date ?? undefined}
        back
        onBack={goBack}
      >
        <Text style={[styles.biz, { color: c.muted }]}>{inv.business_name}</Text>
      </PanelHeader>

      {inv.description ? (
        <Text style={[styles.desc, { color: c.muted }]}>{inv.description}</Text>
      ) : null}

      {error ? (
        <Text style={[styles.error, { color: '#C0392B' }]}>{error}</Text>
      ) : null}

      {isAccepted ? (
        <View style={[styles.acceptedCard, { borderColor: c.border }]}>
          <Text style={[styles.doneTitle, { color: c.text }]}>you're in.</Text>
          {justAccepted && member && (
            <Text style={[styles.doneSub, { color: c.muted }]}>
              {member.credit_balance} akène{member.credit_balance !== 1 ? 's' : ''} remaining
            </Text>
          )}
          <Text style={[styles.doneSub, { color: c.muted }]}>
            you'll be notified when the date is set.
          </Text>
        </View>
      ) : isDeclined ? (
        <Text style={[styles.doneTitle, { color: c.muted, paddingHorizontal: SPACING.lg }]}>declined.</Text>
      ) : isPending ? (
        <View style={styles.actions}>
          {!member ? (
            <PrimaryButton label="sign in to accept" onPress={() => showPanel('account')} />
          ) : member.credit_balance < 1 ? (
            <>
              <Text style={[styles.noCredits, { color: c.muted }]}>
                you need an akène to accept.
              </Text>
              <PrimaryButton label="add to your box" onPress={() => showPanel('credits')} />
            </>
          ) : (
            <PrimaryButton
              label="accept"
              onPress={handleAccept}
              loading={loading}
            />
          )}
          {member && (
            <TouchableOpacity
              onPress={handleDecline}
              activeOpacity={0.6}
              disabled={loading}
              style={styles.declineBtn}
            >
              <Text style={[styles.declineBtnText, { color: c.muted }]}>decline</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {isPending && (
        <Text style={[styles.note, { color: c.muted }]}>
          accepting uses 1 akène (CA$120). date tbd — you'll be notified when it's set. full refund if it doesn't work for you.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: SPACING.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 13, fontFamily: fonts.dmMono },
  biz: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  desc: {
    fontSize: 13,
    fontFamily: fonts.dmMono,
    lineHeight: 20,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  notice: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    padding: SPACING.sm,
  },
  noticeText: { fontSize: 12, fontFamily: fonts.dmMono },
  error: {
    fontSize: 12,
    fontFamily: fonts.dmMono,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  actions: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  noCredits: { fontSize: 12, fontFamily: fonts.dmMono },
  declineBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  declineBtnText: { fontSize: 12, fontFamily: fonts.dmMono },
  doneCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.md,
    gap: 4,
  },
  acceptedCard: {
    marginHorizontal: SPACING.lg,
    padding: SPACING.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  doneTitle: { fontSize: 20, fontFamily: fonts.dmMono, fontWeight: '500' },
  doneSub: { fontSize: 12, fontFamily: fonts.dmMono, lineHeight: 18 },
  note: {
    fontSize: 11,
    fontFamily: fonts.dmMono,
    lineHeight: 17,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
});
