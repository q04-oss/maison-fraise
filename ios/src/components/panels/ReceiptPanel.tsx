import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { fetchOrderReceipt } from '../../lib/api';
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function ReceiptPanel() {
  const { goBack, showPanel, panelData } = usePanel();
  const c = useColors();
  const orderId: number | null = panelData?.orderId ?? null;

  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<any>(null);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    fetchOrderReceipt(orderId)
      .then(data => setReceipt(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  const worker = receipt?.worker ?? null;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerPrompt, { color: c.accent }]}>{'> '}</Text>
          <Text style={[styles.headerTitle, { color: c.text }]}>{'receipt'}</Text>
          {loading && <BlinkingCursor />}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.separator, { color: c.border }]}>{'────────────────────────────────'}</Text>

        {!loading && receipt && (
          <>
            <View style={styles.row}>
              <Text style={[styles.label, { color: c.muted }]}>{'VARIETY'}</Text>
              <Text style={[styles.value, { color: c.text }]}>{receipt.variety_name ?? '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: c.muted }]}>{'TOTAL'}</Text>
              <Text style={[styles.value, { color: c.text }]}>
                {receipt.total_cents != null ? fmtCents(receipt.total_cents) : '—'}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: c.muted }]}>{'DATE'}</Text>
              <Text style={[styles.value, { color: c.text }]}>
                {receipt.created_at ? fmtDate(receipt.created_at) : '—'}
              </Text>
            </View>

            {worker && (
              <>
                <Text style={[styles.separator, { color: c.border }]}>{'────────────────────────────────'}</Text>
                <Text style={[styles.sectionHeader, { color: c.muted }]}>{'SERVED BY'}</Text>

                <View style={styles.workerRow}>
                  {worker.portrait_url ? (
                    <View style={[styles.avatarCircle, { borderColor: c.border }]}>
                      {/* We intentionally use a View placeholder here — Image would require import */}
                    </View>
                  ) : (
                    <View style={[styles.avatarCircle, { backgroundColor: c.card, borderColor: c.border }]}>
                      <Text style={[styles.avatarInitials, { color: c.text }]}>
                        {initials(worker.display_name ?? '')}
                      </Text>
                    </View>
                  )}
                  <View style={styles.workerMeta}>
                    <Text style={[styles.workerName, { color: c.text }]}>
                      {`${worker.display_name ?? '—'}  ·  Maison`}
                    </Text>
                  </View>
                </View>

                {worker.portal_opted_in && (
                  <TouchableOpacity
                    style={styles.actionLine}
                    onPress={() => showPanel('portal-subscriber')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.actionText, { color: c.accent }]}>{'> request portal access_'}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}

        {!loading && !receipt && (
          <Text style={[styles.mutedText, { color: c.muted }]}>{'ERR: receipt not found'}</Text>
        )}

        <View style={{ height: 40 }} />
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
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerPrompt: { fontFamily: fonts.dmMono, fontSize: 12, letterSpacing: 1 },
  headerTitle: { fontFamily: fonts.dmMono, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  headerSpacer: { width: 40 },

  body: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, gap: 12 },
  separator: { fontFamily: fonts.dmMono, fontSize: 11 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 1.5 },
  value: { fontFamily: fonts.dmMono, fontSize: 13 },
  sectionHeader: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  workerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontFamily: fonts.dmMono, fontSize: 14 },
  workerMeta: { flex: 1 },
  workerName: { fontFamily: fonts.dmMono, fontSize: 13 },
  actionLine: { flexDirection: 'row', alignItems: 'center' },
  actionText: { fontFamily: fonts.dmMono, fontSize: 13 },
  mutedText: { fontFamily: fonts.dmMono, fontSize: 12 },
});
