import React from 'react';
import { View, StyleSheet } from 'react-native';
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

const PANELS: Record<string, React.ComponentType<any>> = {
  home: HomePanel,
  ask: AskPanel,
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
  const { currentPanel } = usePanel();
  const CurrentComponent = PANELS[currentPanel] ?? HomePanel;

  return (
    <View style={styles.container}>
      <CurrentComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
