import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { signInWithApple } from '../lib/api';
import { setVerified } from '../lib/userId';
import { useColors, fonts } from '../theme';
import { SPACING } from '../theme';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isVerified, setIsVerifiedState] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('user_email'),
      AsyncStorage.getItem('verified'),
      AppleAuthentication.isAvailableAsync().catch(() => false),
    ]).then(([email, verified, available]) => {
      if (email) setUserEmail(email);
      setIsVerifiedState(verified === 'true');
      setAppleAvailable(available as boolean);
    }).finally(() => setLoading(false));
  }, []);

  const handleAppleSignIn = async () => {
    setSigningIn(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token received.');
      const result = await signInWithApple(credential.identityToken);
      await AsyncStorage.setItem('user_db_id', String(result.user_db_id));
      await AsyncStorage.setItem('user_email', result.email);
      setUserEmail(result.email);
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed', err.message ?? 'Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backText, { color: c.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>Profile</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.md, gap: SPACING.md, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Identity */}
            <View style={styles.avatarSection}>
              <View style={[styles.avatar, { backgroundColor: c.card, borderColor: c.border }]}>
                {userEmail ? (
                  <Text style={[styles.avatarInitial, { color: c.accent }]}>
                    {userEmail[0].toUpperCase()}
                  </Text>
                ) : (
                  <View style={[styles.avatarHollow, { borderColor: c.muted }]} />
                )}
              </View>
              {userEmail ? (
                <View style={styles.identityText}>
                  <Text style={[styles.userEmail, { color: c.text }]}>{userEmail}</Text>
                  {isVerified && (
                    <Text style={[styles.verifiedBadge, { color: c.accent }]}>Verified member</Text>
                  )}
                </View>
              ) : (
                <Text style={[styles.guestLabel, { color: c.muted }]}>Not signed in</Text>
              )}
            </View>

            {/* Sign in with Apple */}
            {!userEmail && appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={isDark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleBtn}
                onPress={handleAppleSignIn}
              />
            )}
            {signingIn && <ActivityIndicator color={c.accent} />}

            {/* Verification instructions */}
            {!isVerified && (
              <View style={[styles.instructionCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.instructionTitle, { color: c.text }]}>How to get verified</Text>
                <Text style={[styles.instructionText, { color: c.muted }]}>
                  Place an order. When you pick it up, open the box and tap your phone to the NFC chip inside the lid.
                </Text>
                <Text style={[styles.instructionText, { color: c.muted }]}>
                  Verification links your order to your account and unlocks standing orders and campaign access.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 6, marginBottom: 8 },
  backText: { fontSize: 15, fontFamily: fonts.dmSans },
  headerTitle: { fontSize: 34, fontFamily: fonts.playfair },
  avatarSection: { alignItems: 'center', paddingVertical: SPACING.lg, gap: 12 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 32, fontFamily: fonts.playfair },
  avatarHollow: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  identityText: { alignItems: 'center', gap: 4 },
  userEmail: { fontSize: 15, fontFamily: fonts.dmSans },
  verifiedBadge: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 1 },
  guestLabel: { fontSize: 13, fontFamily: fonts.dmSans },
  appleBtn: { width: '100%', height: 52 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
instructionCard: { borderRadius: 14, padding: SPACING.md, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  instructionTitle: { fontSize: 16, fontFamily: fonts.playfair },
  instructionText: { fontSize: 14, lineHeight: 22, fontFamily: fonts.dmSans },
});
