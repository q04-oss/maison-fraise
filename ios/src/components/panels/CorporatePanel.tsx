import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchCorporateAccount, fetchCorporateMembers, createCorporateAccount, inviteCorporateMember, removeCorporateMember } from '../../lib/api';

export default function CorporatePanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [account, setAccount] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchCorporateAccount().catch(() => null),
      fetchCorporateMembers().catch(() => []),
    ]).then(([acct, mems]) => {
      setAccount(acct);
      setMembers(mems ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!companyName.trim()) return;
    setCreating(true);
    try {
      const acct = await createCorporateAccount(companyName.trim());
      setAccount(acct);
    } catch { } finally { setCreating(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await inviteCorporateMember(inviteEmail.trim());
      setInviteEmail('');
    } catch { } finally { setInviting(false); }
  };

  const handleRemove = async (targetId: number) => {
    try {
      await removeCorporateMember(targetId);
      setMembers(ms => ms.filter(m => m.user_id !== targetId));
    } catch { }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>CORPORATE</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && !account && (
        <View style={styles.body}>
          <Text style={[styles.heading, { color: c.text, fontFamily: fonts.playfair }]}>Create a corporate account</Text>
          <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmSans }]}>
            Manage standing orders across your team from one account.
          </Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border, fontFamily: fonts.dmMono }]}
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="Company name"
            placeholderTextColor={c.muted}
          />
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: c.accent }, creating && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={creating || !companyName.trim()}
            activeOpacity={0.8}
          >
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { fontFamily: fonts.dmMono }]}>CREATE →</Text>}
          </TouchableOpacity>
        </View>
      )}

      {!loading && account && (
        <>
          <View style={[styles.accountCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.companyName, { color: c.text, fontFamily: fonts.playfair }]}>{account.company_name}</Text>
            <Text style={[styles.meta, { color: c.muted, fontFamily: fonts.dmMono }]}>{members.length} members</Text>
          </View>

          <View style={styles.inviteRow}>
            <TextInput
              style={[styles.inviteInput, { color: c.text, borderColor: c.border, fontFamily: fonts.dmMono }]}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="Invite by email"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity
              style={[styles.inviteBtn, { backgroundColor: c.accent }, inviting && { opacity: 0.6 }]}
              onPress={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              activeOpacity={0.8}
            >
              {inviting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.inviteBtnText, { fontFamily: fonts.dmMono }]}>INVITE</Text>}
            </TouchableOpacity>
          </View>

          <FlatList
            data={members}
            keyExtractor={item => String(item.user_id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={[styles.memberCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.memberName, { color: c.text, fontFamily: fonts.dmSans }]}>{item.email ?? item.display_name ?? `User #${item.user_id}`}</Text>
                <TouchableOpacity onPress={() => handleRemove(item.user_id)} activeOpacity={0.7}>
                  <Text style={[styles.removeText, { color: '#EF4444', fontFamily: fonts.dmMono }]}>REMOVE</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { fontSize: 28 },
  title: { fontSize: 14, letterSpacing: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.md },
  heading: { fontSize: 26, textAlign: 'center' },
  sub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  input: { width: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  btn: { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14 },
  btnText: { color: '#fff', fontSize: 13, letterSpacing: 1.5 },
  accountCard: { margin: SPACING.md, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md },
  companyName: { fontSize: 22 },
  meta: { fontSize: 12, letterSpacing: 0.5 },
  inviteRow: { flexDirection: 'row', paddingHorizontal: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.sm },
  inviteInput: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  inviteBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, justifyContent: 'center' },
  inviteBtnText: { color: '#fff', fontSize: 12, letterSpacing: 1 },
  list: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  memberCard: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACING.md, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberName: { fontSize: 14 },
  removeText: { fontSize: 11, letterSpacing: 1 },
});
