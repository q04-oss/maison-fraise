import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import {
  fetchAdCampaigns, createAdCampaign, toggleAdCampaign,
  fetchAdConnectStatus, createAdConnectOnboarding, broadcastAdCampaign,
} from '../../lib/api';

type Screen = 'list' | 'create';

export default function AdCampaignsPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const [screen, setScreen] = useState<Screen>('list');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectStatus, setConnectStatus] = useState<{ has_account: boolean; onboarded: boolean } | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  // Create form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'proximity' | 'remote'>('proximity');
  const [valueDollars, setValueDollars] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([fetchAdCampaigns(), fetchAdConnectStatus()]);
      setCampaigns(c);
      setConnectStatus(s);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleConnectOnboard = async () => {
    setOnboarding(true);
    try {
      const { url } = await createAdConnectOnboarding();
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not start Stripe onboarding.');
    } finally {
      setOnboarding(false);
    }
  };

  const handleCreate = async () => {
    const value_cents = Math.round(parseFloat(valueDollars) * 100);
    if (!title.trim() || !body.trim() || isNaN(value_cents) || value_cents < 1) {
      Alert.alert('Missing fields', 'Fill in all fields and set a valid payout amount.');
      return;
    }
    setCreating(true);
    try {
      await createAdCampaign({ title: title.trim(), body: body.trim(), type, value_cents });
      setTitle(''); setBody(''); setValueDollars(''); setType('proximity');
      setScreen('list');
      load();
    } catch (e: any) {
      const msg = e.message === 'stripe_connect_required'
        ? 'You need to complete Stripe Connect setup before creating campaigns.'
        : e.message ?? 'Could not create campaign.';
      Alert.alert('Error', msg);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (campaign: any) => {
    try {
      const updated = await toggleAdCampaign(campaign.id);
      setCampaigns(prev => prev.map(c => c.id === campaign.id ? updated : c));
    } catch (e: any) {
      const msg = e.message === 'no_budget' ? 'Fund this campaign before activating it.' : e.message ?? 'Could not toggle.';
      Alert.alert('Error', msg);
    }
  };

  const handleBroadcast = async (campaign: any) => {
    Alert.alert('Broadcast ad?', `Send "${campaign.title}" to all users now?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send', onPress: async () => {
          try {
            const { sent } = await broadcastAdCampaign(campaign.id);
            Alert.alert('Sent', `Delivered to ${sent} user${sent !== 1 ? 's' : ''}.`);
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not broadcast.');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={screen === 'create' ? () => setScreen('list') : goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>{screen === 'create' ? 'New Campaign' : 'Ad Campaigns'}</Text>
        {screen === 'list' && (
          <TouchableOpacity onPress={() => setScreen('create')} style={styles.newBtn} activeOpacity={0.7}>
            <Text style={[styles.newBtnText, { color: c.accent }]}>+ new</Text>
          </TouchableOpacity>
        )}
        {screen === 'create' && <View style={styles.newBtn} />}
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : screen === 'create' ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Connect status warning */}
          {connectStatus && !connectStatus.onboarded && (
            <View style={[styles.connectBanner, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.connectText, { color: c.muted }]}>
                Stripe Connect required to create campaigns.
              </Text>
              <TouchableOpacity onPress={handleConnectOnboard} disabled={onboarding} activeOpacity={0.7}>
                <Text style={[styles.connectLink, { color: c.accent }]}>
                  {onboarding ? 'opening…' : 'set up payouts →'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.fieldLabel, { color: c.muted }]}>TITLE</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Fresh strawberries today"
            placeholderTextColor={c.muted}
            maxLength={60}
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>BODY</Text>
          <TextInput
            style={[styles.input, styles.inputMulti, { color: c.text, borderColor: c.border }]}
            value={body}
            onChangeText={setBody}
            placeholder="What you want users to know"
            placeholderTextColor={c.muted}
            multiline
            maxLength={200}
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>TYPE</Text>
          <View style={styles.typeRow}>
            {(['proximity', 'remote'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.typeChip, { borderColor: type === t ? c.accent : c.border }]}
                onPress={() => setType(t)}
                activeOpacity={0.7}
              >
                <Text style={[styles.typeChipText, { color: type === t ? c.accent : c.muted }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.typeHint, { color: c.muted }]}>
            {type === 'proximity' ? 'Shown when a user walks near your beacon.' : 'Sent directly to all opted-in users.'}
          </Text>

          <Text style={[styles.fieldLabel, { color: c.muted }]}>PAYOUT PER ACCEPT (CA$)</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={valueDollars}
            onChangeText={setValueDollars}
            placeholder="e.g. 0.50"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
          />

          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: c.accent }, creating && { opacity: 0.5 }]}
            onPress={handleCreate}
            disabled={creating}
            activeOpacity={0.8}
          >
            <Text style={[styles.createBtnText, { color: c.ctaText ?? '#fff' }]}>
              {creating ? 'Creating…' : 'Create Campaign'}
            </Text>
          </TouchableOpacity>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Connect status */}
          {connectStatus && !connectStatus.onboarded && (
            <View style={[styles.connectBanner, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.connectText, { color: c.muted }]}>Stripe Connect not set up.</Text>
              <TouchableOpacity onPress={handleConnectOnboard} disabled={onboarding} activeOpacity={0.7}>
                <Text style={[styles.connectLink, { color: c.accent }]}>
                  {onboarding ? 'opening…' : 'set up payouts →'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {campaigns.length === 0 ? (
            <Text style={[styles.empty, { color: c.muted }]}>No campaigns yet.</Text>
          ) : campaigns.map(campaign => {
            const remaining = campaign.budget_cents - campaign.spent_cents;
            const remainingDollars = (remaining / 100).toFixed(2);
            const budgetDollars = (campaign.budget_cents / 100).toFixed(2);
            return (
              <View key={campaign.id} style={[styles.campaignCard, { borderColor: c.border, backgroundColor: c.card }]}>
                <View style={styles.campaignTop}>
                  <View style={styles.campaignMeta}>
                    <Text style={[styles.campaignType, { color: c.accent }]}>{campaign.type.toUpperCase()}</Text>
                    <Text style={[styles.campaignTitle, { color: c.text }]}>{campaign.title}</Text>
                    <Text style={[styles.campaignBody, { color: c.muted }]} numberOfLines={2}>{campaign.body}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.activeToggle, { borderColor: campaign.active ? c.accent : c.border }]}
                    onPress={() => handleToggle(campaign)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.activeToggleText, { color: campaign.active ? c.accent : c.muted }]}>
                      {campaign.active ? 'active' : 'off'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.campaignStats}>
                  <Text style={[styles.statText, { color: c.muted }]}>
                    CA${(campaign.value_cents / 100).toFixed(2)} per accept
                  </Text>
                  <Text style={[styles.statText, { color: c.muted }]}>
                    budget CA${budgetDollars}  ·  CA${remainingDollars} left
                  </Text>
                </View>
                {campaign.type === 'remote' && campaign.active && (
                  <TouchableOpacity
                    style={[styles.broadcastBtn, { borderColor: c.accent }]}
                    onPress={() => handleBroadcast(campaign)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.broadcastBtnText, { color: c.accent }]}>broadcast now →</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          <View style={{ height: SPACING.xl }} />
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
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.playfair, textAlign: 'center' },
  newBtn: { width: 60, alignItems: 'flex-end' },
  newBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md },
  connectBanner: {
    marginTop: SPACING.md, padding: 14, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, gap: 6,
  },
  connectText: { fontSize: 13, fontFamily: fonts.dmSans },
  connectLink: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  empty: { fontSize: 14, fontFamily: fonts.dmSans, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  fieldLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: SPACING.md, marginBottom: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, fontSize: 15, fontFamily: fonts.dmSans },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  typeChipText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  typeHint: { fontSize: 11, fontFamily: fonts.dmSans, fontStyle: 'italic', marginTop: 6 },
  createBtn: { marginTop: SPACING.lg, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  createBtnText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 1 },
  campaignCard: {
    marginTop: SPACING.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 8,
  },
  campaignTop: { flexDirection: 'row', gap: 12 },
  campaignMeta: { flex: 1, gap: 3 },
  campaignType: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  campaignTitle: { fontSize: 16, fontFamily: fonts.playfair },
  campaignBody: { fontSize: 12, fontFamily: fonts.dmSans },
  activeToggle: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  activeToggleText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  campaignStats: { gap: 2 },
  statText: { fontSize: 11, fontFamily: fonts.dmMono },
  broadcastBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 4 },
  broadcastBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
