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

  const handleTabPress = (tab: 'discover' | 'members' | 'claims' | 'account') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (tab === 'discover')      goHome();
    else if (tab === 'members')  jumpToPanel('members');
    else if (tab === 'claims')   jumpToPanel('my-claims');
    else                         jumpToPanel('account');
    // Double-tap on active tab always resets to that tab's root (handled by jumpToPanel resetting stack)
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
        {(['discover', 'members', 'claims', 'account'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={styles.tabItem}
            onPress={() => handleTabPress(tab)}
            activeOpacity={0.6}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeRootTab === tab }}
          >
            <Text style={[styles.tabLabel, { color: activeRootTab === tab ? c.text : c.muted }]}>
              {tab}
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
    height: 44,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
});
