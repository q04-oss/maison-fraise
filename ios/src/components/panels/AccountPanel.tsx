import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, Alert, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import {
  memberLogin, memberSignup, fraiseAppleSignin,
  setMemberToken, deleteMemberToken, fetchInvitations,
} from '../../lib/api';
import { PanelHeader, Card, PrimaryButton } from '../ui';

export default function AccountPanel() {
  const { member, setMember, setInvitations, showPanel, goHome } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<'login' | 'signup'>('login');
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const reset = () => { setName(''); setEmail(''); setPassword(''); setError(null); };

  const handleLogin = async () => {
    setError(null);
    if (!email.trim() || !password) { setError('email and password required.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      const data = await memberLogin(email.trim().toLowerCase(), password);
      await setMemberToken(data.token!);
      setMember(data);
      setInvitations(await fetchInvitations());
      reset();
      goHome();
    } catch (err: any) {
      setError(err.message || 'login failed.');
    }
    setLoading(false);
  };

  const handleSignup = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError('name, email, and password (8+ chars) required.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      const data = await memberSignup(name.trim(), email.trim().toLowerCase(), password);
      await setMemberToken(data.token!);
      setMember(data);
      setInvitations([]);
      reset();
      goHome();
    } catch (err: any) {
      setError(err.message || 'signup failed.');
    }
    setLoading(false);
  };

  const handleAppleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean).join(' ');
      const data = await fraiseAppleSignin({
        identityToken: credential.identityToken!,
        name: fullName || undefined,
        email: credential.email ?? undefined,
      });
      await setMemberToken(data.token!);
      setMember(data);
      setInvitations(await fetchInvitations());
      reset();
      goHome();
    } catch (err: any) {
      if (err?.code !== 'ERR_REQUEST_CANCELED') {
        setError(err.message || 'apple sign in failed.');
      }
    }
    setLoading(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await deleteMemberToken();
          setMember(null);
          setInvitations([]);
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.panelBg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <PanelHeader title={member ? member.name : 'your box'} subtitle={!member ? 'open your box.' : undefined} />

      {member ? (
        // ── Signed in ──────────────────────────────────────────────────────────
        <View style={styles.body}>
          <Card style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: c.muted }]}>email</Text>
              <Text style={[styles.cardValue, { color: c.text }]}>{member.email}</Text>
            </View>
            <View style={[styles.cardRow, styles.cardRowBorder, { borderColor: c.border }]}>
              <Text style={[styles.cardLabel, { color: c.muted }]}>akènes</Text>
              <Text style={[styles.cardValue, { color: c.text }]}>{member.credit_balance}</Text>
            </View>
          </Card>

          {member.credit_balance > 0 && (
            <View style={styles.berryRow}>
              {Array.from({ length: Math.min(member.credit_balance, 12) }).map((_, i) => (
                <View key={i} style={styles.berry} />
              ))}
              {member.credit_balance > 12 && (
                <Text style={[styles.berryMore, { color: c.muted }]}>+{member.credit_balance - 12}</Text>
              )}
            </View>
          )}

          <PrimaryButton
            label="buy akènes"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              showPanel('credits');
            }}
          />

          <TouchableOpacity
            style={[styles.btnGhost, { borderColor: c.border }]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnGhostText, { color: c.muted }]}>sign out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // ── Auth form ──────────────────────────────────────────────────────────
        <View style={styles.body}>
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={9999}
              style={styles.appleBtn}
              onPress={handleAppleSignIn}
            />
          )}
          <View style={[styles.divider]}>
            <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
            <Text style={[styles.dividerText, { color: c.muted }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tabBtn, view === 'login' && { borderBottomColor: c.text }]}
              onPress={() => { setView('login'); reset(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabBtnText, { color: view === 'login' ? c.text : c.muted }]}>
                sign in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, view === 'signup' && { borderBottomColor: c.text }]}
              onPress={() => { setView('signup'); reset(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabBtnText, { color: view === 'signup' ? c.text : c.muted }]}>
                create account
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {view === 'signup' && (
              <Field label="your name" c={c}>
                <TextInput
                  style={[styles.input, { backgroundColor: c.searchBg, borderColor: c.searchBorder, color: c.text, fontFamily: fonts.dmMono }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="full name"
                  placeholderTextColor={c.muted}
                  autoCapitalize="words"
                  autoComplete="name"
                />
              </Field>
            )}
            <Field label="email" c={c}>
              <TextInput
                style={[styles.input, { backgroundColor: c.searchBg, borderColor: c.searchBorder, color: c.text, fontFamily: fonts.dmMono }]}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={c.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </Field>
            <Field label="password" c={c}>
              <TextInput
                style={[styles.input, { backgroundColor: c.searchBg, borderColor: c.searchBorder, color: c.text, fontFamily: fonts.dmMono }]}
                value={password}
                onChangeText={setPassword}
                placeholder={view === 'signup' ? '8+ characters' : '••••••••'}
                placeholderTextColor={c.muted}
                secureTextEntry
                autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                onSubmitEditing={view === 'login' ? handleLogin : handleSignup}
                returnKeyType="go"
              />
            </Field>

            {error ? (
              <Text style={[styles.errText, { color: '#C0392B' }]}>{error}</Text>
            ) : null}

            <PrimaryButton
              label={view === 'login' ? 'sign in' : 'create account'}
              onPress={view === 'login' ? handleLogin : handleSignup}
              loading={loading}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Field({ label, children, c }: { label: string; children: React.ReactNode; c: any }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: c.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: SPACING.md },
  body: { paddingHorizontal: SPACING.lg, gap: SPACING.md },
  card: { marginBottom: SPACING.xs },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
  },
  cardRowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  cardLabel: { fontSize: 12, fontFamily: fonts.dmMono },
  cardValue: { fontSize: 12, fontFamily: fonts.dmMono },
  btnGhost: {
    borderRadius: 9999,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnGhostText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 1 },
  appleBtn: {
    height: 44,
    width: '100%',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 11, fontFamily: fonts.dmMono },
  tabs: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
  },
  tabBtn: {
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: 'transparent',
  },
  tabBtnText: { fontSize: 13, fontFamily: fonts.dmMono },
  form: { gap: SPACING.sm },
  field: { gap: 6 },
  fieldLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  input: {
    fontSize: 14,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errText: { fontSize: 12, fontFamily: fonts.dmMono },
  berryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: SPACING.sm,
  },
  berry: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C0392B',
  },
  berryMore: { fontSize: 11, fontFamily: fonts.dmMono, alignSelf: 'center' },
});
