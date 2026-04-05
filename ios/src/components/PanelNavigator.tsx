import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../context/PanelContext';
import { useColors } from '../theme';
import HomePanel from './panels/HomePanel';
import TerminalPanel from './panels/TerminalPanel';
import LocationPanel from './panels/LocationPanel';
import VerifiedPanel from './panels/VerifiedPanel';
import StandingOrderPanel from './panels/StandingOrderPanel';
import PartnerDetailPanel from './panels/PartnerDetailPanel';
import OrderHistoryPanel from './panels/OrderHistoryPanel';
import SearchPanel from './panels/SearchPanel';
import ReceiptPanel from './panels/ReceiptPanel';
import VerifyNFCPanel from './panels/VerifyNFCPanel';
import ConversationsPanel from './panels/ConversationsPanel';
import MessageThreadPanel from './panels/MessageThreadPanel';
import JobDetailPanel from './panels/JobDetailPanel';
import PopupDetailPanel from './panels/PopupDetailPanel';
import CollectifListPanel from './panels/CollectifListPanel';
import CollectifDetailPanel from './panels/CollectifDetailPanel';
import CollectifCreatePanel from './panels/CollectifCreatePanel';
import MarketPanel from './panels/MarketPanel';
import MarketStallPanel from './panels/MarketStallPanel';
import PortalPanel from './panels/PortalPanel';
import TokensPanel from './panels/TokensPanel';
import TokenDetailPanel from './panels/TokenDetailPanel';
import TournamentsPanel from './panels/TournamentsPanel';
import TournamentDetailPanel from './panels/TournamentDetailPanel';
import CreatorEarningsPanel from './panels/CreatorEarningsPanel';
import VarietyManagementPanel from './panels/VarietyManagementPanel';
import TournamentOperatorPanel from './panels/TournamentOperatorPanel';
import VenturesPanel from './panels/VenturesPanel';
import VentureDetailPanel from './panels/VentureDetailPanel';
import VentureCreatePanel from './panels/VentureCreatePanel';
import VentureManagePanel from './panels/VentureManagePanel';
import DorotkaProfilePanel from './panels/DorotkaProfilePanel';

const PANELS: Record<string, React.ComponentType<any>> = {
  home: HomePanel,
  terminal: TerminalPanel,
  location: LocationPanel,
  verified: VerifiedPanel,
  standingOrder: StandingOrderPanel,
  'partner-detail': PartnerDetailPanel,
  'order-history': OrderHistoryPanel,
  'search': SearchPanel,
  'receipt': ReceiptPanel,
  'verifyNFC': VerifyNFCPanel,
  'conversations': ConversationsPanel,
  'messageThread': MessageThreadPanel,
  'jobDetail': JobDetailPanel,
  'popup-detail': PopupDetailPanel,
  'collectif-list': CollectifListPanel,
  'collectif-detail': CollectifDetailPanel,
  'collectif-create': CollectifCreatePanel,
  'market': MarketPanel,
  'market-stall': MarketStallPanel,
  'portal': PortalPanel,
  'tokens': TokensPanel,
  'token-detail': TokenDetailPanel,
  'tournaments': TournamentsPanel,
  'tournament-detail': TournamentDetailPanel,
  'creator-earnings': CreatorEarningsPanel,
  'variety-management': VarietyManagementPanel,
  'tournament-operator': TournamentOperatorPanel,
  'ventures': VenturesPanel,
  'venture-detail': VentureDetailPanel,
  'venture-create': VentureCreatePanel,
  'venture-manage': VentureManagePanel,
  'dorotka-profile': DorotkaProfilePanel,
};

const FULL_HEIGHT_PANELS = new Set([
  'verified', 'standingOrder', 'partner-detail', 'order-history',
  'search', 'receipt', 'verifyNFC', 'conversations', 'messageThread', 'jobDetail',
  'popup-detail', 'collectif-list', 'collectif-detail', 'collectif-create',
  'market', 'market-stall', 'portal', 'tokens', 'token-detail', 'tournaments', 'tournament-detail',
  'creator-earnings',
  'variety-management',
  'tournament-operator',
  'ventures',
  'venture-detail',
  'venture-create',
  'venture-manage',
  'dorotka-profile',
]);

export default function PanelNavigator() {
  const { currentPanel, slideAnim, lastNavType } = usePanel();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const c = useColors();
  const CurrentComponent = PANELS[currentPanel] ?? HomePanel;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (FULL_HEIGHT_PANELS.has(currentPanel) && lastNavType.current === 'show') {
      timerRef.current = setTimeout(() => TrueSheet.present('main-sheet', 2), 350);
    } else if (currentPanel === 'home' && mountedRef.current) {
      timerRef.current = setTimeout(() => TrueSheet.present('main-sheet', 1), 350);
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
      <CurrentComponent />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
