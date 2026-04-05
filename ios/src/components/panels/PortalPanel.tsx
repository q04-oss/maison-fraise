import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, FlatList, Image,
  StyleSheet, ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useStripe } from '@stripe/stripe-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import {
  givePortalConsent,
  fetchMyPortalAccess, fetchMySubscribers,
  fetchMyPortalContent, fetchPortalContent,
  fetchIdentitySession,
  uploadToCloudinary, uploadPortalContent,
} from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

function fmtCAD(cents: number) {
  return `CA$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
}

function fmtExpiry(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CELL = Math.floor((Dimensions.get('window').width - SPACING.md * 2 - 4) / 3);

type Tab = 'mine' | 'access';

export default function PortalPanel() {
  const { goBack, showPanel, panelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const viewOwnerId: number | null = panelData?.ownerId ?? null;
  const viewOwnerName: string | null = panelData?.ownerName ?? null;

  const { presentIdentityVerificationSheet } = useStripe();

  const [verified, setVerified] = useState<boolean | null>(null);
  const [consented, setConsented] = useState<boolean | null>(null);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [pendingSession, setPendingSession] = useState<{ verificationSessionId: string; ephemeralKeySecret: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [tab, setTab] = useState<Tab>('mine');
  const [myContent, setMyContent] = useState<any[]>([]);
  const [accessList, setAccessList] = useState<any[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [viewContent, setViewContent] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmingConsent, setConfirmingConsent] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('verified'),
      AsyncStorage.getItem('portal_opted_in'),
      AsyncStorage.getItem('identity_verified'),
    ]).then(([v, p, id]) => {
      setVerified(v === 'true');
      setConsented(p === 'true');
      setIdentityVerified(id === 'true');
    });
  }, []);

  const loadViewContent = useCallback(async () => {
    if (!viewOwnerId) return;
    setLoading(true);
    try {
      const content = await fetchPortalContent(viewOwnerId);
      setViewContent(content);
    } catch (e: any) {
      if (e.message === 'identity_verification_required') {
        Alert.alert('ID verification required', 'Visit a shop to verify your identity before viewing portal content.');
      } else {
        Alert.alert('Access required', 'You need an active subscription to view this portal.');
      }
      goBack();
    } finally {
      setLoading(false);
    }
  }, [viewOwnerId]);

  const loadMain = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, access, subs] = await Promise.all([
        fetchMyPortalContent(),
        fetchMyPortalAccess(),
        fetchMySubscribers(),
      ]);
      setMyContent(mine);
      setAccessList(access);
      setSubscribers(subs);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (verified !== true || consented !== true) return;
    if (viewOwnerId) {
      loadViewContent();
    } else {
      loadMain();
      // Check for a pending operator-initiated identity session
      if (!identityVerified) {
        fetchIdentitySession().then(data => {
          if (data.already_verified) {
            AsyncStorage.setItem('identity_verified', 'true');
            setIdentityVerified(true);
          } else if (data.session) {
            setPendingSession(data.session);
          }
        }).catch(() => {});
      }
    }
  }, [verified, consented, viewOwnerId]);

  const handleConsent = async () => {
    setConfirmingConsent(true);
    try {
      await givePortalConsent();
      await AsyncStorage.setItem('portal_opted_in', 'true');
      setConsented(true);
    } catch {
      Alert.alert('Error', 'Could not save consent. Please try again.');
    } finally {
      setConfirmingConsent(false);
    }
  };

  const handleUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload to your portal.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      base64: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(result.assets[0].base64!, 'image');
      await uploadPortalContent(url, 'photo');
      await loadMain();
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleVerifyIdentity = async () => {
    if (!pendingSession || verifying) return;
    setVerifying(true);
    try {
      const { error } = await presentIdentityVerificationSheet({
        verificationSessionId: pendingSession.verificationSessionId,
        ephemeralKeySecret: pendingSession.ephemeralKeySecret,
      });
      if (error) {
        if (error.code !== 'Canceled') {
          Alert.alert('Verification incomplete', 'Please try again or visit the shop.');
        }
        return;
      }
      // Submitted — verification is async, webhook will confirm and push-notify
      setPendingSession(null);
      Alert.alert(
        'Documents submitted',
        "We'll verify your ID and notify you when complete. This usually takes a few minutes.",
      );
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const earnings = subscribers.reduce(
    (sum, s) => sum + ((s.amount_cents ?? 0) - (s.platform_cut_cents ?? 0)),
    0,
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (verified === null || consented === null) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  // ── Verification gate (must be verified in-person first) ──────────────────
  if (!verified) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>portal</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={[styles.consentScroll, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={[styles.consentTitle, { color: c.text }]}>verification required</Text>
          <Text style={[styles.consentDesc, { color: c.muted }]}>
            Portal access is limited to members who have verified their identity in person at a Maison Fraise shop.
          </Text>
          <View style={[styles.consentList, { borderColor: c.border }]}>
            <Text style={[styles.consentItem, { color: c.muted }]}>· Visit any Maison Fraise location</Text>
            <Text style={[styles.consentItem, { color: c.muted }]}>· Tap your phone to collect your first order</Text>
            <Text style={[styles.consentItem, { color: c.muted }]}>· Your account is verified on the spot</Text>
          </View>
          <TouchableOpacity
            style={[styles.consentBtn, { backgroundColor: c.text }]}
            onPress={() => showPanel('verifyNFC')}
            activeOpacity={0.8}
          >
            <Text style={[styles.consentBtnText, { color: c.ctaText }]}>verify in person →</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Consent gate ─────────────────────────────────────────────────────────
  if (!consented) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>portal</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={[styles.consentScroll, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={[styles.consentTitle, { color: c.text }]}>18+ content</Text>
          <Text style={[styles.consentDesc, { color: c.muted }]}>
            This section contains content for adults only. It may include explicit material shared by creators you choose to subscribe to.
          </Text>
          <View style={[styles.consentList, { borderColor: c.border }]}>
            <Text style={[styles.consentItem, { color: c.muted }]}>· You are at least 18 years of age</Text>
            <Text style={[styles.consentItem, { color: c.muted }]}>· You consent to viewing adult content</Text>
            <Text style={[styles.consentItem, { color: c.muted }]}>· Your confirmation is recorded with your account</Text>
          </View>
          <TouchableOpacity
            style={[styles.consentBtn, { backgroundColor: c.text }, confirmingConsent && { opacity: 0.5 }]}
            onPress={handleConsent}
            disabled={confirmingConsent}
            activeOpacity={0.8}
          >
            <Text style={[styles.consentBtnText, { color: c.ctaText }]}>
              {confirmingConsent ? 'saving…' : 'I confirm — I am 18+'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Content viewer (ownerId provided) ────────────────────────────────────
  if (viewOwnerId) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
            {viewOwnerName ? viewOwnerName.toLowerCase() : 'portal'}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={viewContent}
            keyExtractor={i => String(i.id)}
            numColumns={3}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.md, paddingTop: 2, paddingBottom: insets.bottom + 40, gap: 2 }}
            columnWrapperStyle={{ gap: 2 }}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: c.muted }]}>no content yet</Text>
            }
            renderItem={({ item }) => (
              <Image
                source={{ uri: item.media_url }}
                style={[styles.cell, { backgroundColor: c.border }]}
                resizeMode="cover"
              />
            )}
          />
        )}
      </View>
    );
  }

  // ── Main portal (mine / access tabs) ─────────────────────────────────────
  const mineHeader = (
    <View>
      {/* Stats */}
      <View style={[styles.statsRow, { borderBottomColor: c.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: c.text }]}>{subscribers.length}</Text>
          <Text style={[styles.statLabel, { color: c.muted }]}>subscribers</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: c.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: c.text }]}>{fmtCAD(earnings)}</Text>
          <Text style={[styles.statLabel, { color: c.muted }]}>earned</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: c.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: c.text }]}>{myContent.length}</Text>
          <Text style={[styles.statLabel, { color: c.muted }]}>posts</Text>
        </View>
      </View>
      {/* Upload — locked behind government ID verification */}
      {identityVerified ? (
        <TouchableOpacity
          style={[styles.uploadRow, { borderBottomColor: c.border }]}
          onPress={handleUpload}
          disabled={uploading}
          activeOpacity={0.7}
        >
          <Text style={[styles.uploadText, { color: uploading ? c.muted : c.accent }]}>
            {uploading ? 'uploading…' : '+ add photo'}
          </Text>
        </TouchableOpacity>
      ) : pendingSession ? (
        <TouchableOpacity
          style={[styles.uploadRow, { borderBottomColor: c.border }]}
          onPress={handleVerifyIdentity}
          disabled={verifying}
          activeOpacity={0.7}
        >
          <Text style={[styles.uploadText, { color: verifying ? c.muted : c.accent }]}>
            {verifying ? 'opening verification…' : 'verify your ID to start posting →'}
          </Text>
          <Text style={[styles.uploadHint, { color: c.muted }]}>
            scan your passport or driver's license
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.uploadRow, { borderBottomColor: c.border }]}>
          <Text style={[styles.uploadText, { color: c.muted }]}>
            id verification required to post
          </Text>
          <Text style={[styles.uploadHint, { color: c.muted }]}>
            visit a shop — staff will start your verification
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>portal</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          style={[styles.tab, tab === 'mine' && { borderBottomColor: c.text, borderBottomWidth: 1.5 }]}
          onPress={() => setTab('mine')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: tab === 'mine' ? c.text : c.muted }]}>mine</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'access' && { borderBottomColor: c.text, borderBottomWidth: 1.5 }]}
          onPress={() => setTab('access')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: tab === 'access' ? c.text : c.muted }]}>
            access{accessList.length > 0 ? ` · ${accessList.length}` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : tab === 'mine' ? (
        <FlatList
          data={myContent}
          keyExtractor={i => String(i.id)}
          numColumns={3}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.md, paddingTop: 2, paddingBottom: insets.bottom + 40, gap: 2 }}
          columnWrapperStyle={{ gap: 2 }}
          ListHeaderComponent={mineHeader}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: c.muted }]}>no posts yet</Text>
          }
          renderItem={({ item }) => (
            <Image
              source={{ uri: item.media_url }}
              style={[styles.cell, { backgroundColor: c.border }]}
              resizeMode="cover"
            />
          )}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {accessList.length === 0 ? (
            <Text style={[styles.empty, { color: c.muted }]}>no active subscriptions</Text>
          ) : (
            accessList.map(row => (
              <TouchableOpacity
                key={row.id}
                style={[styles.accessRow, { borderBottomColor: c.border }]}
                onPress={() => showPanel('portal', { ownerId: row.owner_id, ownerName: row.owner_display_name })}
                activeOpacity={0.75}
              >
                <Text style={[styles.accessName, { color: c.text }]}>
                  {row.owner_display_name ?? `user ${row.owner_id}`}
                </Text>
                <Text style={[styles.accessMeta, { color: c.muted }]}>
                  expires {fmtExpiry(row.expires_at)}  →
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 0 },
  tabText: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },

  empty: {
    textAlign: 'center', marginTop: 60, fontSize: 13,
    fontFamily: fonts.dmSans, fontStyle: 'italic',
  },

  // Consent
  consentScroll: { padding: SPACING.md, paddingTop: 48, gap: 16 },
  consentTitle: { fontSize: 28, fontFamily: fonts.playfair, textAlign: 'center' },
  consentDesc: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22, textAlign: 'center' },
  consentList: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    padding: SPACING.md, gap: 8, marginTop: 8,
  },
  consentItem: { fontFamily: fonts.dmSans, fontSize: 13, lineHeight: 22 },
  consentBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  consentBtnText: { fontFamily: fonts.dmSans, fontSize: 15, fontWeight: '700' },

  // Stats
  statsRow: {
    flexDirection: 'row', paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: StyleSheet.hairlineWidth },
  statValue: { fontSize: 22, fontFamily: fonts.playfair },
  statLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase' },

  // Upload
  uploadRow: {
    paddingHorizontal: SPACING.md, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  uploadText: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 0.5 },
  uploadHint: { fontFamily: fonts.dmSans, fontSize: 11, fontStyle: 'italic', marginTop: 3 },

  // Grid
  cell: { width: CELL, height: CELL },

  // Access tab
  accessRow: {
    paddingHorizontal: SPACING.md, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 4,
  },
  accessName: { fontSize: 18, fontFamily: fonts.playfair },
  accessMeta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
