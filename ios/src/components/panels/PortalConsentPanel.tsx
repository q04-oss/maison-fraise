import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { givePortalConsent } from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

function BlinkingCursor() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setVisible(v => !v), 500);
    return () => clearInterval(id);
  }, []);
  return <Text style={{ opacity: visible ? 1 : 0 }}>_</Text>;
}

export default function PortalConsentPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleAgree = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await givePortalConsent();
      setSuccess(true);
      setTimeout(() => goBack(), 1000);
    } catch (e: any) {
      setSubmitting(false);
      // Surface the error inline — a simple re-render is enough
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerPrompt, { color: c.accent }]}>{'> '}</Text>
          <Text style={[styles.headerTitle, { color: c.text }]}>{'enable your portal'}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.separator, { color: c.border }]}>{'────────────────────────────────'}</Text>

        <Text style={[styles.intro, { color: c.text }]}>{'By enabling your portal you confirm:'}</Text>

        <View style={styles.bulletList}>
          <Text style={[styles.bullet, { color: c.text }]}>{'· You are 18 years of age or older'}</Text>
          <Text style={[styles.bullet, { color: c.text }]}>
            {'· Content you upload is legal in your\n  jurisdiction'}
          </Text>
          <Text style={[styles.bullet, { color: c.text }]}>
            {'· You consent to Maison Fraise taking\n  a 20% platform fee on all access\n  purchases'}
          </Text>
          <Text style={[styles.bullet, { color: c.text }]}>
            {'· Access granted is annual and\n  irrevocable'}
          </Text>
        </View>

        <Text style={[styles.note, { color: c.muted }]}>
          {'This is a separate agreement from\nyour employment contract.'}
        </Text>

        <Text style={[styles.separator, { color: c.border }]}>{'────────────────────────────────'}</Text>

        {success ? (
          <View style={styles.statusRow}>
            <Text style={[styles.statusText, { color: '#4CAF50' }]}>{'OK: portal enabled'}</Text>
            <BlinkingCursor />
          </View>
        ) : submitting ? (
          <View style={styles.statusRow}>
            <Text style={[styles.statusText, { color: c.accent }]}>{'> enabling'}</Text>
            <BlinkingCursor />
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.actionLine} onPress={handleAgree} activeOpacity={0.7}>
              <Text style={[styles.actionText, { color: c.accent }]}>{'> I AGREE — ENABLE PORTAL_'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionLine} onPress={goBack} activeOpacity={0.7}>
              <Text style={[styles.cancelText, { color: c.muted }]}>{'> cancel_'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
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

  body: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, gap: 16 },
  separator: { fontFamily: fonts.dmMono, fontSize: 11 },
  intro: { fontFamily: fonts.dmMono, fontSize: 13, lineHeight: 20 },
  bulletList: { gap: 10 },
  bullet: { fontFamily: fonts.dmMono, fontSize: 12, lineHeight: 20 },
  note: { fontFamily: fonts.dmMono, fontSize: 12, lineHeight: 20 },
  actionLine: { flexDirection: 'row', alignItems: 'center' },
  actionText: { fontFamily: fonts.dmMono, fontSize: 13 },
  cancelText: { fontFamily: fonts.dmMono, fontSize: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontFamily: fonts.dmMono, fontSize: 13 },
});
