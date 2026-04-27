import React from 'react';
import { Animated, View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../context/PanelContext';
import { useColors, fonts, type, SPACING } from '../theme';
import HomePanel from './panels/HomePanel';
import InvitationDetailPanel from './panels/InvitationDetailPanel';
import MyClaimsPanel from './panels/MyClaimsPanel';
import AccountPanel from './panels/AccountPanel';
import CreditsPanel from './panels/CreditsPanel';
const PANELS: Record<string, React.ComponentType<any>> = {
  home:                HomePanel,
  'invitation-detail': InvitationDetailPanel,
  'my-claims':         MyClaimsPanel,
  account:             AccountPanel,
  credits:             CreditsPanel,
};

export default function PanelNavigator() {
  const { currentPanel, slideAnim } = usePanel();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const CurrentComponent = PANELS[currentPanel] ?? HomePanel;

  return (
    <View style={[styles.outer, { backgroundColor: c.panelBg }]}>
      <Text style={[styles.eyebrow, { color: c.muted, paddingTop: insets.top + SPACING.md }]}>
        box fraise
      </Text>
      <Animated.View style={[styles.container, {
        backgroundColor: c.panelBg,
        transform: [{
          translateX: slideAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, SCREEN_WIDTH],
          }),
        }],
      }]}>
        <CurrentComponent />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, overflow: 'hidden' },
  eyebrow: {
    ...type.eyebrow,
    textTransform: 'uppercase',
    paddingHorizontal: SPACING.lg,
    paddingBottom: 10,
  },
  container: { flex: 1 },
});
