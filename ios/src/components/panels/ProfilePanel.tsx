import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../../context/PanelContext';
import { signInWithApple, fetchStandingOrders, updateStandingOrder, cancelStandingOrder } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function ProfilePanel() {
  const { goHome } = usePanel();
  const c = useColors();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isVerified, setIsVerifiedState] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [standingOrders, setStandingOrders] = useState<any[]>([]);

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

    AsyncStorage.getItem('user_db_id').then(async (dbId) => {
      if (dbId) {
        try {
          const orders = await fetchStandingOrders(parseInt(dbId, 10));
          setStandingOrders(orders);
        } catch {}
      }
    });
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

  const handleCancelStanding = (id: number) => {
    Alert.alert('Cancel standing order?', 'This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel order', style: 'destructive',
        onPress: async () => {
          try {
            await cancelStandingOrder(id);
            setStandingOrders(prev => prev.filter(o => o.id !== id));
          } catch {
            Alert.alert('Could not cancel', 'Try again.');
          }
        },
      },
    ]);
  };

  const handleToggleStanding = async (id: number, current: string) => {
    const next = current === 'active' ? 'paused' : 'active';
    try {
      await updateStandingOrder(id, next);
      setStandingOrders(prev => prev.map(o => o.id === id ? { ...o, status: next } : o));
    } catch {
      Alert.alert('Could not update', 'Try again.');
    }
  };

  const handleClose = () => {
    goHome();
    TrueSheet.present('main-sheet', 1);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <TouchableOpacity onPress={handleClose} style={styles.backBtn} activeOpacity={0.7}>
        <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {!userEmail && appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleBtn}
                onPress={handleAppleSignIn}
              />
            )}
            {signingIn && <ActivityIndicator color={c.accent} />}

            {userEmail && (
              <View style={styles.identityRow}>
                <Text style={[styles.userEmail, { color: c.text }]}>{userEmail}</Text>
                {isVerified && (
                  <Text style={[styles.verifiedBadge, { color: c.accent }]}>Verified member</Text>
                )}
              </View>
            )}

            {!isVerified && (
              <View style={[styles.instructionCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.instructionTitle, { color: c.text }]}>How to get verified</Text>
                <View style={styles.step}>
                  <Text style={[styles.stepNum, { color: c.accent }]}>1</Text>
                  <Text style={[styles.instructionText, { color: c.muted }]}>
                    Sign in with Apple above. This creates your Maison Fraise account.
                  </Text>
                </View>
                <View style={styles.step}>
                  <Text style={[styles.stepNum, { color: c.accent }]}>2</Text>
                  <Text style={[styles.instructionText, { color: c.muted }]}>
                    Place an order and collect it in person.
                  </Text>
                </View>
                <View style={styles.step}>
                  <Text style={[styles.stepNum, { color: c.accent }]}>3</Text>
                  <Text style={[styles.instructionText, { color: c.muted }]}>
                    Open your box and tap your phone to the NFC chip inside the lid. Verification is instant.
                  </Text>
                </View>
                <Text style={[styles.instructionSub, { color: c.muted }]}>
                  Verified members unlock standing orders and early campaign access.
                </Text>
              </View>
            )}

            {standingOrders.length > 0 && (
              <View style={[styles.standingSection, { borderColor: c.border }]}>
                <Text style={[styles.standingHeader, { color: c.muted }]}>STANDING ORDERS</Text>
                {standingOrders.map((so: any) => (
                  <View key={so.id} style={[styles.standingRow, { backgroundColor: c.card, borderColor: c.border }]}>
                    <View style={styles.standingInfo}>
                      <Text style={[styles.standingName, { color: c.text }]}>{so.variety_name ?? '—'}</Text>
                      <Text style={[styles.standingSub, { color: c.muted }]}>{so.frequency} · {so.status}</Text>
                    </View>
                    <View style={styles.standingActions}>
                      <TouchableOpacity onPress={() => handleToggleStanding(so.id, so.status)} activeOpacity={0.7}>
                        <Text style={[styles.standingActionText, { color: c.accent }]}>
                          {so.status === 'active' ? 'Pause' : 'Resume'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleCancelStanding(so.id)} activeOpacity={0.7}>
                        <Text style={[styles.standingActionText, { color: c.muted }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { paddingHorizontal: SPACING.md, paddingTop: 12, paddingBottom: 4 },
  backBtnText: { fontSize: 22, lineHeight: 28 },
  body: { padding: SPACING.md, gap: SPACING.md },
  appleBtn: { width: '100%', height: 52 },
  identityRow: { paddingVertical: SPACING.sm, gap: 6 },
  userEmail: { fontSize: 17, fontFamily: fonts.playfair },
  verifiedBadge: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 1 },
  instructionCard: { borderRadius: 14, padding: SPACING.md, gap: 14, borderWidth: StyleSheet.hairlineWidth },
  instructionTitle: { fontSize: 16, fontFamily: fonts.playfair },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { fontSize: 13, fontFamily: fonts.dmMono, width: 16, paddingTop: 2 },
  instructionText: { flex: 1, fontSize: 14, lineHeight: 22, fontFamily: fonts.dmSans },
  instructionSub: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 18, fontStyle: 'italic' },
  standingSection: { gap: 8 },
  standingHeader: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  standingRow: { borderRadius: 14, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  standingInfo: { flex: 1, gap: 3 },
  standingName: { fontSize: 15, fontFamily: fonts.playfair },
  standingSub: { fontSize: 12, fontFamily: fonts.dmSans },
  standingActions: { flexDirection: 'row', gap: 16 },
  standingActionText: { fontSize: 13, fontFamily: fonts.dmSans },
});
