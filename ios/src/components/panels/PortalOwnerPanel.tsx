import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image,
  StyleSheet, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import {
  fetchMySubscribers,
  fetchPortalContent,
  fetchMyMembership,
} from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

function BlinkingCursor() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setVisible(v => !v), 500);
    return () => clearInterval(id);
  }, []);
  return <Text style={{ opacity: visible ? 1 : 0 }}>_</Text>;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtCents(cents: number): string {
  return `CA$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PortalOwnerPanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portalOptedIn, setPortalOptedIn] = useState(false);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [content, setContent] = useState<any[]>([]);
  const [fundIncome, setFundIncome] = useState<number>(0);
  const [myUserId, setMyUserId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const storedId = await AsyncStorage.getItem('user_db_id');
      const uid = storedId ? parseInt(storedId, 10) : null;
      setMyUserId(uid);

      const [membershipData, subs, portalData] = await Promise.all([
        fetchMyMembership().catch(() => null),
        fetchMySubscribers().catch(() => []),
        uid ? fetchPortalContent(uid).catch(() => []) : Promise.resolve([]),
      ]);

      const membership = membershipData?.membership;
      setPortalOptedIn(membership?.portal_opted_in ?? false);
      setFundIncome(membership?.portal_income_cents ?? 0);
      setSubscribers(subs);
      setContent(portalData);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleOptIn = () => {
    showPanel('portal-consent');
  };

  const numColumns = 3;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerPrompt, { color: c.accent }]}>{'> '}</Text>
          <Text style={[styles.headerTitle, { color: c.text }]}>{'your portal'}</Text>
          {loading && <BlinkingCursor />}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.accent} />
        }
      >
        {!loading && !portalOptedIn ? (
          // Opt-in prompt
          <View style={styles.optInContainer}>
            <Text style={[styles.prompt, { color: c.accent }]}>{'> enable your portal?'}</Text>
            <Text style={[styles.separator, { color: c.border }]}>{'────────────────────────────────'}</Text>
            <Text style={[styles.bodyText, { color: c.muted }]}>
              {'Members can purchase annual access\nto your exclusive content.\n\nMaison Fraise takes a 20% platform fee.'}
            </Text>
            <TouchableOpacity
              style={styles.actionLine}
              onPress={handleOptIn}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionText, { color: c.accent }]}>
                {'> ENABLE PORTAL_'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Status */}
            <Text style={[styles.separator, { color: c.border }]}>{'────────────────────────────────'}</Text>
            <View style={styles.statusBlock}>
              <Text style={[styles.statusLine, { color: c.text }]}>
                <Text style={[styles.label, { color: c.muted }]}>{'STATUS: '}</Text>
                <Text style={{ color: '#4CAF50' }}>{'ACTIVE'}</Text>
              </Text>
              <Text style={[styles.statusLine, { color: c.text }]}>
                <Text style={[styles.label, { color: c.muted }]}>{`SUBSCRIBERS [`}</Text>
                <Text>{subscribers.length}</Text>
                <Text style={[styles.label, { color: c.muted }]}>{']'}</Text>
              </Text>
              {fundIncome > 0 && (
                <Text style={[styles.statusLine, { color: c.text }]}>
                  <Text style={[styles.label, { color: c.muted }]}>{'FUND INCOME: '}</Text>
                  <Text>{fmtCents(fundIncome)}</Text>
                </Text>
              )}
            </View>

            {/* Subscribers */}
            {subscribers.length > 0 && (
              <>
                <Text style={[styles.separator, { color: c.border }]}>{'────────────────────────────────'}</Text>
                <Text style={[styles.sectionHeader, { color: c.muted }]}>{'SUBSCRIBERS'}</Text>
                {subscribers.map((sub: any, i: number) => (
                  <View key={sub.id ?? i} style={styles.subRow}>
                    <Text style={[styles.subDate, { color: c.muted }]}>
                      {`[${fmtDate(sub.started_at ?? sub.created_at ?? new Date().toISOString())}]`}
                    </Text>
                    <Text style={[styles.subName, { color: c.text }]}>
                      {`@${sub.display_name ?? 'unknown'}`}
                    </Text>
                    {sub.expires_at && (
                      <Text style={[styles.subExpiry, { color: c.muted }]}>
                        {`expires ${fmtDate(sub.expires_at)}`}
                      </Text>
                    )}
                  </View>
                ))}
              </>
            )}

            {/* Content */}
            <Text style={[styles.separator, { color: c.border }]}>{'────────────────────────────────'}</Text>
            <View style={styles.contentHeader}>
              <Text style={[styles.sectionHeader, { color: c.muted }]}>
                {`CONTENT [${content.length}]`}
              </Text>
              <TouchableOpacity
                style={styles.actionLine}
                onPress={() => showPanel('portal-upload')}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionText, { color: c.accent }]}>{'> upload new_'}</Text>
              </TouchableOpacity>
            </View>

            {content.length > 0 && (
              <View style={styles.grid}>
                {content.map((item: any, i: number) => (
                  <View key={item.id ?? i} style={styles.gridItem}>
                    {item.media_url ? (
                      <Image
                        source={{ uri: item.media_url }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.thumbnail, { backgroundColor: c.card }]} />
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const THUMB_SIZE = 110;

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
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerPrompt: { fontFamily: fonts.dmMono, fontSize: 12, letterSpacing: 1 },
  headerTitle: { fontFamily: fonts.dmMono, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  headerSpacer: { width: 40 },

  body: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, gap: 8 },
  separator: { fontFamily: fonts.dmMono, fontSize: 11, marginVertical: 4 },

  optInContainer: { gap: 16, paddingTop: SPACING.md },
  prompt: { fontFamily: fonts.dmMono, fontSize: 13 },
  bodyText: { fontFamily: fonts.dmMono, fontSize: 12, lineHeight: 20 },

  statusBlock: { gap: 6 },
  statusLine: { fontFamily: fonts.dmMono, fontSize: 12 },
  label: { fontFamily: fonts.dmMono, fontSize: 12 },

  sectionHeader: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  subRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  subDate: { fontFamily: fonts.dmMono, fontSize: 11 },
  subName: { fontFamily: fonts.dmMono, fontSize: 12 },
  subExpiry: { fontFamily: fonts.dmMono, fontSize: 11 },

  contentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionLine: { flexDirection: 'row', alignItems: 'center' },
  actionText: { fontFamily: fonts.dmMono, fontSize: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gridItem: { width: THUMB_SIZE, height: THUMB_SIZE },
  thumbnail: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 4 },
});
