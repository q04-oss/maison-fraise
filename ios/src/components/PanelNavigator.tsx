import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../context/PanelContext';
import { useColors } from '../theme';
import HomePanel from './panels/HomePanel';
import TerminalPanel from './panels/TerminalPanel';
import LocationPanel from './panels/LocationPanel';
import VerifiedPanel from './panels/VerifiedPanel';
import BatchPreferencePanel from './panels/StandingOrderPanel';
import PartnerDetailPanel from './panels/PartnerDetailPanel';
import OrderHistoryPanel from './panels/OrderHistoryPanel';
import SearchPanel from './panels/SearchPanel';
import ReceiptPanel from './panels/ReceiptPanel';
import VerifyNFCPanel from './panels/VerifyNFCPanel';
import MyProfilePanel from './panels/MyProfilePanel';
import NotificationsPanel from './panels/NotificationsPanel';
import StaffOrdersPanel from './panels/StaffOrdersPanel';
import WalkInPanel from './panels/WalkInPanel';
import WalkInWritePanel from './panels/WalkInWritePanel';
import WalkInInventoryPanel from './panels/WalkInInventoryPanel';
import NfcWritePanel from './panels/NfcWritePanel';
import NfcRevealPanel from './panels/NfcRevealPanel';
import MerchPanel from './panels/MerchPanel';
import GiftPanel from './panels/GiftPanel';
import ClaimGiftPanel from './panels/ClaimGiftPanel';
import DonatePanel from './panels/DonatePanel';
import { TierGate, PANEL_TIER_REQUIREMENTS } from './TierGate';

const PANELS: Record<string, React.ComponentType<any>> = {
  home: HomePanel,
  terminal: TerminalPanel,
  location: LocationPanel,
  verified: VerifiedPanel,
  'batch-preference': BatchPreferencePanel,
  'partner-detail': PartnerDetailPanel,
  'order-history': OrderHistoryPanel,
  'search': SearchPanel,
  'receipt': ReceiptPanel,
  'verifyNFC': VerifyNFCPanel,
  'my-profile': MyProfilePanel,
  'notifications': NotificationsPanel,
  'staff-orders': StaffOrdersPanel,
  'walk-in': WalkInPanel,
  'walk-in-write': WalkInWritePanel,
  'walk-in-inventory': WalkInInventoryPanel,
  'nfc-write': NfcWritePanel,
  'nfc-reveal': NfcRevealPanel,
  'merch': MerchPanel,
  'gift': GiftPanel,
  'claim-gift': ClaimGiftPanel,
  'donate': DonatePanel,
};

const FULL_HEIGHT_PANELS = new Set([
  'nfc-write', 'walk-in', 'walk-in-write', 'walk-in-inventory',
  'verified', 'batch-preference', 'order-history',
  'search', 'receipt',
  'notifications', 'staff-orders',
  'merch',
  'gift',
  'claim-gift',
]);

// Panels that collapse the sheet so native system UI (NFC prompt) appears unobstructed
const COLLAPSED_PANELS = new Set<string>();

export default function PanelNavigator() {
  const { currentPanel, slideAnim, lastNavType } = usePanel();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const c = useColors();
  const CurrentComponent = PANELS[currentPanel] ?? HomePanel;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (COLLAPSED_PANELS.has(currentPanel) && lastNavType.current === 'show') {
      timerRef.current = setTimeout(() => TrueSheet.resize('main-sheet', 0), 0);
    } else if (FULL_HEIGHT_PANELS.has(currentPanel) && lastNavType.current === 'show') {
      timerRef.current = setTimeout(() => TrueSheet.resize('main-sheet', 2), 350);
    } else if (currentPanel === 'home' && mountedRef.current) {
      timerRef.current = setTimeout(() => TrueSheet.resize('main-sheet', 1), 350);
    }
    mountedRef.current = true;
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [currentPanel]);

  return (
    <Animated.View style={[styles.container, {
      backgroundColor: c.panelBg,
      transform: [{
        translateX: slideAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, SCREEN_WIDTH],
        }),
      }],
    }]}>
      <TierGate required={PANEL_TIER_REQUIREMENTS[currentPanel] ?? null} panelName={currentPanel}>
        <CurrentComponent />
      </TierGate>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
