import React from 'react';
import { Animated, StyleSheet, Dimensions } from 'react-native';
import { usePanel } from '../context/PanelContext';
import HomePanel from './panels/HomePanel';
import AskPanel from './panels/AskPanel';
import VarietyPanel from './panels/VarietyPanel';
import ChocolatePanel from './panels/ChocolatePanel';
import FinishPanel from './panels/FinishPanel';
import QuantityPanel from './panels/QuantityPanel';
import WhenPanel from './panels/WhenPanel';
import ReviewPanel from './panels/ReviewPanel';
import ConfirmationPanel from './panels/ConfirmationPanel';
import NFCPanel from './panels/NFCPanel';
import VerifiedPanel from './panels/VerifiedPanel';
import StandingOrderPanel from './panels/StandingOrderPanel';
import ProfilePanel from './panels/ProfilePanel';
import LocationPanel from './panels/LocationPanel';
import GiftNotePanel from './panels/GiftNotePanel';

const SCREEN_WIDTH = Dimensions.get('window').width;

const PANELS: Record<string, React.ComponentType<any>> = {
  home: HomePanel,
  profile: ProfilePanel,
  location: LocationPanel,
  ask: AskPanel,
  'gift-note': GiftNotePanel,
  variety: VarietyPanel,
  chocolate: ChocolatePanel,
  finish: FinishPanel,
  quantity: QuantityPanel,
  when: WhenPanel,
  review: ReviewPanel,
  confirmation: ConfirmationPanel,
  nfc: NFCPanel,
  verified: VerifiedPanel,
  standingOrder: StandingOrderPanel,
};

export default function PanelNavigator() {
  const { currentPanel, slideAnim } = usePanel();
  const CurrentComponent = PANELS[currentPanel] ?? HomePanel;

  return (
    <Animated.View style={[styles.container, {
      transform: [{
        translateX: slideAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, SCREEN_WIDTH],
        }),
      }],
    }]}>
      <CurrentComponent />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
});
