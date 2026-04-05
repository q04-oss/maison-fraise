import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { closeVenture, removeVentureMember, changeVentureMemberRole } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

const ROLES: Array<'worker' | 'contractor'> = ['worker', 'contractor'];

export default function VentureManagePanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();

  const ventureId = panelData?.ventureId as number;
  const [venture, setVenture] = useState<any>(panelData?.venture ?? null);
  const [busy, setBusy] = useState(false);

  const handleClose = () => {
    Alert.alert(
      'Close venture',
      'This will mark the venture as closed. Members will still be able to view it. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close venture', style: 'destructive', onPress: async () => {
            setBusy(true);
            try {
              await closeVenture(ventureId);
              Alert.alert('Closed', 'Venture has been closed.');
              goBack();
            } catch {
              Alert.alert('Error', 'Could not close venture.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleRemove = (member: any) => {
    Alert.alert(
      'Remove member',
      `Remove ${member.display_name} from this venture?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            setBusy(true);
            try {
              await removeVentureMember(ventureId, member.user_id);
              setVenture((v: any) => ({
                ...v,
                members: v.members.filter((m: any) => m.user_id !== member.user_id),
              }));
            } catch (e: any) {
              const msg = e?.message === 'cannot_remove_owner' ? 'Cannot remove the owner.'
                : 'Could not remove member.';
              Alert.alert('Error', msg);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleRoleChange = async (member: any, role: 'worker' | 'contractor') => {
    if (member.role === role) return;
    setBusy(true);
    try {
      await changeVentureMemberRole(ventureId, member.user_id, role);
      setVenture((v: any) => ({
        ...v,
        members: v.members.map((m: any) =>
          m.user_id === member.user_id ? { ...m, role } : m
        ),
      }));
    } catch {
      Alert.alert('Error', 'Could not change role.');
    } finally {
      setBusy(false);
    }
  };

  const nonOwnerMembers = venture?.members?.filter((m: any) => m.role !== 'owner') ?? [];

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>manage venture</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* Members */}
        {nonOwnerMembers.length > 0 && (
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>MEMBERS</Text>
            {nonOwnerMembers.map((m: any) => (
              <View key={m.user_id} style={[styles.memberRow, { borderBottomColor: c.border }]}>
                <Text style={[styles.memberName, { color: c.text }]}>{m.display_name}</Text>
                <View style={styles.memberControls}>
                  {ROLES.map(r => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => handleRoleChange(m, r)}
                      disabled={busy}
                      activeOpacity={0.7}
                      style={[
                        styles.roleChip,
                        { borderColor: c.border },
                        m.role === r && { backgroundColor: c.text, borderColor: c.text },
                      ]}
                    >
                      <Text style={[styles.roleChipText, { color: m.role === r ? c.background : c.muted }]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => handleRemove(m)}
                    disabled={busy}
                    activeOpacity={0.7}
                    style={styles.removeBtn}
                  >
                    <Text style={[styles.removeText, { color: c.muted }]}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {nonOwnerMembers.length === 0 && (
          <Text style={[styles.empty, { color: c.muted }]}>no members to manage yet</Text>
        )}

        {/* Close venture */}
        <View style={[styles.section, { borderBottomColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.muted }]}>DANGER ZONE</Text>
          <TouchableOpacity
            style={[styles.closeBtn, { borderColor: c.border }, busy && { opacity: 0.5 }]}
            onPress={handleClose}
            disabled={busy}
            activeOpacity={0.7}
          >
            <Text style={[styles.closeBtnText, { color: c.muted }]}>close venture</Text>
          </TouchableOpacity>
        </View>
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
  headerCenter: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 28 },
  title: { fontSize: 17, fontFamily: fonts.playfair },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 13,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    paddingHorizontal: SPACING.md,
  },
  section: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  sectionLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberName: { fontSize: 14, fontFamily: fonts.dmSans, flex: 1 },
  memberControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleChipText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  removeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  removeText: { fontSize: 18, lineHeight: 20 },
  closeBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
