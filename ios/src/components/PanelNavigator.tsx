import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../context/PanelContext';
import HomePanel from './panels/HomePanel';
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
import PopupRequestPanel from './panels/PopupRequestPanel';
import PopupDetailPanel from './panels/PopupDetailPanel';
import DjOfferPanel from './panels/DjOfferPanel';
import NominationPanel from './panels/NominationPanel';
import PartnerDetailPanel from './panels/PartnerDetailPanel';
import CampaignCommissionPanel from './panels/CampaignCommissionPanel';
import ContractOfferPanel from './panels/ContractOfferPanel';
import LookbookPanel from './panels/LookbookPanel';
import UserProfilePanel from './panels/UserProfilePanel';
import OrderHistoryPanel from './panels/OrderHistoryPanel';
import NotificationInboxPanel from './panels/NotificationInboxPanel';
import ActivityFeedPanel from './panels/ActivityFeedPanel';

const PANELS: Record<string, React.ComponentType<any>> = {
  home: HomePanel,
  profile: ProfilePanel,
  location: LocationPanel,
  'gift-note': GiftNotePanel,
  chocolate: ChocolatePanel,
  finish: FinishPanel,
  quantity: QuantityPanel,
  when: WhenPanel,
  review: ReviewPanel,
  confirmation: ConfirmationPanel,
  nfc: NFCPanel,
  verified: VerifiedPanel,
  standingOrder: StandingOrderPanel,
  'popup-request': PopupRequestPanel,
  'popup-detail': PopupDetailPanel,
  'dj-offer': DjOfferPanel,
  'nomination': NominationPanel,
  'partner-detail': PartnerDetailPanel,
  'campaign-commission': CampaignCommissionPanel,
  'contract-offer': ContractOfferPanel,
  'lookbook': LookbookPanel,
  'user-profile': UserProfilePanel,
  'order-history': OrderHistoryPanel,
  'notification-inbox': NotificationInboxPanel,
  'activity-feed': ActivityFeedPanel,
};

// Panels that should always expand the sheet to full height
const FULL_HEIGHT_PANELS = new Set([
  'location', 'chocolate', 'finish', 'quantity', 'gift-note', 'when', 'review', 'confirmation', 'nfc', 'verified', 'standingOrder',
  'popup-request', 'popup-detail', 'dj-offer', 'nomination', 'partner-detail', 'campaign-commission', 'contract-offer',
  'lookbook', 'user-profile', 'order-history', 'notification-inbox', 'activity-feed',
]);

// Panels that expand to medium height
const MEDIUM_HEIGHT_PANELS = new Set<string>();

export default function PanelNavigator() {
  const { currentPanel, slideAnim } = usePanel();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const CurrentComponent = PANELS[currentPanel] ?? HomePanel;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (FULL_HEIGHT_PANELS.has(currentPanel)) {
      timerRef.current = setTimeout(() => TrueSheet.present('main-sheet', 2), 350);
    } else if (MEDIUM_HEIGHT_PANELS.has(currentPanel)) {
      timerRef.current = setTimeout(() => TrueSheet.present('main-sheet', 1), 350);
    } else if (currentPanel === 'home' && mountedRef.current) {
      // Collapse to medium when navigating back to home — skip on initial mount
      timerRef.current = setTimeout(() => TrueSheet.present('main-sheet', 1), 350);
    }
    mountedRef.current = true;
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [currentPanel]);

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
  container: { flex: 1, backgroundColor: 'transparent' },
});
