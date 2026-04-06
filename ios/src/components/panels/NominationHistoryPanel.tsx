import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { fetchNominationsGiven, fetchNominationsReceived } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

type NominationGiven = { popup_name: string; nominee_name: string; created_at: string };
type NominationReceived = { popup_name: string; nominator_name: string; created_at: string };

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

type Tab = 'received' | 'given';

export default function NominationHistoryPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('received');
  const [given, setGiven] = useState<NominationGiven[]>([]);
  const [received, setReceived] = useState<NominationReceived[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(async stored => {
      if (!stored) { setLoading(false); return; }
      const uid = parseInt(stored, 10);
      try {
        const [g, r] = await Promise.all([
          fetchNominationsGiven(uid),
          fetchNominationsReceived(uid),
        ]);
        setGiven(g);
        setReceived(r);
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const renderReceived = () => {
    if (received.length === 0) {
      return (
        <Text style={[styles.emptyText, { color: c.muted }]}>
          No nominations received yet.
        </Text>
      );
    }
    return received.map((item, idx) => (
      <View
        key={idx}
        style={[styles.row, { borderBottomColor: c.border }]}
      >
        <View style={styles.rowMain}>
          <Text style={[styles.rowTitle, { color: c.text }]}>{item.popup_name}</Text>
          <Text style={[styles.rowPerson, { color: c.muted }]}>
            ← {item.nominator_name}
          </Text>
        </View>
        <Text style={[styles.rowDate, { color: c.muted }]}>{formatDate(item.created_at)}</Text>
      </View>
    ));
  };

  const renderGiven = () => {
    if (given.length === 0) {
      return (
        <Text style={[styles.emptyText, { color: c.muted }]}>
          No nominations given yet.
        </Text>
      );
    }
    return given.map((item, idx) => (
      <View
        key={idx}
        style={[styles.row, { borderBottomColor: c.border }]}
      >
        <View style={styles.rowMain}>
          <Text style={[styles.rowTitle, { color: c.text }]}>{item.popup_name}</Text>
          <Text style={[styles.rowPerson, { color: c.muted }]}>
            {item.nominee_name} →
          </Text>
        </View>
        <Text style={[styles.rowDate, { color: c.muted }]}>{formatDate(item.created_at)}</Text>
      </View>
    ));
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>Nominations</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab('received')}
          activeOpacity={0.7}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'received' ? c.accent : c.muted },
          ]}>
            Received ({received.length})
          </Text>
          {activeTab === 'received' && (
            <View style={[styles.tabUnderline, { backgroundColor: c.accent }]} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab('given')}
          activeOpacity={0.7}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'given' ? c.accent : c.muted },
          ]}>
            Given ({given.length})
          </Text>
          {activeTab === 'given' && (
            <View style={[styles.tabUnderline, { backgroundColor: c.accent }]} />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: (insets.bottom || SPACING.md) + SPACING.md }}
        >
          {activeTab === 'received' ? renderReceived() : renderGiven()}
        </ScrollView>
      )}
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
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  tabText: {
    fontSize: 13,
    fontFamily: fonts.dmSans,
    fontWeight: '600',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '15%',
    right: '15%',
    height: 2,
    borderRadius: 1,
  },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  rowMain: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontFamily: fonts.playfair },
  rowPerson: { fontSize: 12, fontFamily: fonts.dmSans },
  rowDate: { fontSize: 10, fontFamily: fonts.dmMono },

  emptyText: {
    fontSize: 14,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
});
