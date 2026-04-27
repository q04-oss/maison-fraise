import React, { useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../context/PanelContext';
import PanelNavigator from '../components/PanelNavigator';
import { fetchMe, fetchInvitations, getMemberToken, updatePushToken } from '../lib/api';
import { useColors, fonts } from '../theme';
import { useApp } from '../../App';

export default function AppScreen() {
  const { jumpToPanel, goHome, activeRootTab, setMember, setInvitations } = usePanel();
  const { pushToken, pendingScreen, clearPendingScreen } = useApp();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const bootstrap = useCallback(async () => {
    const token = await getMemberToken();
    if (token) {
      const [me, invs] = await Promise.all([fetchMe(), fetchInvitations()]);
      if (me) setMember(me);
      setInvitations(invs);
    }
  }, []);

  useEffect(() => { bootstrap(); }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') bootstrap();
    });
    return () => sub.remove();
  }, [bootstrap]);

  useEffect(() => {
    if (!pushToken) return;
    getMemberToken().then(t => { if (t) updatePushToken(pushToken).catch(() => {}); });
  }, [pushToken]);

  useEffect(() => {
    if (pendingScreen === 'my-claims') {
      clearPendingScreen();
      jumpToPanel('my-claims');
    } else if (pendingScreen === 'home') {
      clearPendingScreen();
      goHome();
    }
  }, [pendingScreen]);

  const tabs = [
    { key: 'discover', label: 'discover' },
    { key: 'claims',   label: 'going' },
    { key: 'account',  label: 'box' },
  ] as const;

  const handleTabPress = (key: 'discover' | 'claims' | 'account') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (key === 'discover') goHome();
    else if (key === 'claims') jumpToPanel('my-claims');
    else jumpToPanel('account');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={styles.panels}>
        <PanelNavigator />
      </View>
      <View style={[
        styles.tabBar,
        { borderTopColor: c.border, backgroundColor: c.panelBg, paddingBottom: insets.bottom },
      ]}>
        {tabs.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={styles.tabItem}
            onPress={() => handleTabPress(key)}
            activeOpacity={0.6}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeRootTab === key }}
          >
            <Text style={[styles.tabLabel, { color: activeRootTab === key ? c.text : c.muted }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  panels: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 44 },
  tabLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
});
