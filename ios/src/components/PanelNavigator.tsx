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
import VentureEarningsPanel from './panels/VentureEarningsPanel';
import VendorStallPanel from './panels/VendorStallPanel';
import MarketAdminPanel from './panels/MarketAdminPanel';
import AdCampaignsPanel from './panels/AdCampaignsPanel';
import ToiletPanel from './panels/ToiletPanel';
import PersonalToiletPanel from './panels/PersonalToiletPanel';
import ItineraryPanel from './panels/ItineraryPanel';
import ItineraryDetailPanel from './panels/ItineraryDetailPanel';
import HealthProfilePanel from './panels/HealthProfilePanel';
import PersonalizedMenuPanel from './panels/PersonalizedMenuPanel';
import BusinessMenuPanel from './panels/BusinessMenuPanel';
import ReservationOffersPanel from './panels/ReservationOffersPanel';
import ReservationDiscoveryPanel from './panels/ReservationDiscoveryPanel';
import ReservationBookingPanel from './panels/ReservationBookingPanel';
import PortraitTokensPanel from './panels/PortraitTokensPanel';
import PortraitTokenDetailPanel from './panels/PortraitTokenDetailPanel';
import PortraitLicenseRequestPanel from './panels/PortraitLicenseRequestPanel';
import EveningTokensPanel from './panels/EveningTokensPanel';
import DiscoveryPanel from './panels/DiscoveryPanel';
import PortraitFeedPanel from './panels/PortraitFeedPanel';
import MyProfilePanel from './panels/MyProfilePanel';
import GreenhousePanel from './panels/GreenhousePanel';
import GreenhouseDetailPanel from './panels/GreenhouseDetailPanel';
import ShopMenuPanel from './panels/ShopMenuPanel';
import MarketHomePanel from './panels/market/MarketHomePanel';
import MarketCartPanel from './panels/market/MarketCartPanel';
import MarketOrdersPanel from './panels/market/MarketOrdersPanel';
import VendorPanel from './panels/market/VendorPanel';
import ARBoxPanel from './panels/ARBoxPanel';
import StaffOrdersPanel from './panels/StaffOrdersPanel';
import StandingOrderRenewalPanel from './panels/StandingOrderRenewalPanel';
import WaitlistPanel from './panels/WaitlistPanel';
import StandingOrderGiftPanel from './panels/StandingOrderGiftPanel';
import TransfersPanel from './panels/TransfersPanel';
import DropsPanel from './panels/DropsPanel';
import DropDetailPanel from './panels/DropDetailPanel';
import PreordersPanel from './panels/PreordersPanel';
import BundlesPanel from './panels/BundlesPanel';
import CorporatePanel from './panels/CorporatePanel';
import ReferralPanel from './panels/ReferralPanel';
import LeaderboardPanel from './panels/LeaderboardPanel';
import FarmVisitsPanel from './panels/FarmVisitsPanel';
import VarietyPassportPanel from './panels/VarietyPassportPanel';
import SeasonalCalendarPanel from './panels/SeasonalCalendarPanel';
import SupplierHarvestPanel from './panels/SupplierHarvestPanel';
import NutritionDashboardPanel from './panels/NutritionDashboardPanel';
import FraiseChatInboxPanel from './panels/FraiseChatInboxPanel';
import WebhooksPanel from './panels/WebhooksPanel';
import EditorialFeedPanel from './panels/EditorialFeedPanel';
import EditorialPiecePanel from './panels/EditorialPiecePanel';
import WritePiecePanel from './panels/WritePiecePanel';
import DjOfferPanel from './panels/DjOfferPanel';
import NominationPanel from './panels/NominationPanel';
import NominationHistoryPanel from './panels/NominationHistoryPanel';
import CampaignCommissionPanel from './panels/CampaignCommissionPanel';
import NotificationsPanel from './panels/NotificationsPanel';
import UserProfilePanel from './panels/UserProfilePanel';
import TastingJournalPanel from './panels/TastingJournalPanel';
import ProposalsPanel from './panels/ProposalsPanel';
import ARVideoFeedPanel from './panels/ARVideoFeedPanel';
import ARVideoDetailPanel from './panels/ARVideoDetailPanel';
import SubmitARVideoPanel from './panels/SubmitARVideoPanel';
import TastingFeedPanel from './panels/TastingFeedPanel';
import ArtAuctionPanel from './panels/ArtAuctionPanel';
import NfcWritePanel from './panels/NfcWritePanel';
import { TierGate, PANEL_TIER_REQUIREMENTS } from './TierGate';

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
  'venture-earnings': VentureEarningsPanel,
  'vendor-stall': VendorStallPanel,
  'market-admin': MarketAdminPanel,
  'ad-campaigns': AdCampaignsPanel,
  'toilet': ToiletPanel,
  'personal-toilet': PersonalToiletPanel,
  'itinerary': ItineraryPanel,
  'itinerary-detail': ItineraryDetailPanel,
  'health-profile': HealthProfilePanel,
  'personalized-menu': PersonalizedMenuPanel,
  'business-menu': BusinessMenuPanel,
  'reservation-offers': ReservationOffersPanel,
  'reservation-discovery': ReservationDiscoveryPanel,
  'reservation-booking': ReservationBookingPanel,
  'portrait-tokens': PortraitTokensPanel,
  'portrait-token-detail': PortraitTokenDetailPanel,
  'portrait-licensing': PortraitLicenseRequestPanel,
  'evening-tokens': EveningTokensPanel,
  'discovery': DiscoveryPanel,
  'portrait-feed': PortraitFeedPanel,
  'my-profile': MyProfilePanel,
  'greenhouse': GreenhousePanel,
  'greenhouse-detail': GreenhouseDetailPanel,
  'shop-menu': ShopMenuPanel,
  'market-home': MarketHomePanel,
  'market-cart': MarketCartPanel,
  'market-orders': MarketOrdersPanel,
  'market-vendor': VendorPanel,
  'ar-box': ARBoxPanel,
  'staff-orders': StaffOrdersPanel,
  'standing-order-renewal': StandingOrderRenewalPanel,
  'waitlist': WaitlistPanel,
  'standing-order-gift': StandingOrderGiftPanel,
  'transfers': TransfersPanel,
  'drops': DropsPanel,
  'drop-detail': DropDetailPanel,
  'preorders': PreordersPanel,
  'bundles': BundlesPanel,
  'corporate': CorporatePanel,
  'referral': ReferralPanel,
  'leaderboard': LeaderboardPanel,
  'farm-visits': FarmVisitsPanel,
  'variety-passport': VarietyPassportPanel,
  'seasonal-calendar': SeasonalCalendarPanel,
  'supplier-harvest': SupplierHarvestPanel,
  'nutrition-dashboard': NutritionDashboardPanel,
  'fraise-chat-inbox': FraiseChatInboxPanel,
  'webhooks': WebhooksPanel,
  'editorial-feed': EditorialFeedPanel,
  'editorial-piece': EditorialPiecePanel,
  'write-piece': WritePiecePanel,
  'dj-offer': DjOfferPanel,
  'nomination': NominationPanel,
  'nomination-history': NominationHistoryPanel,
  'campaign-commission': CampaignCommissionPanel,
  'notifications': NotificationsPanel,
  'user-profile': UserProfilePanel,
  'tasting-journal': TastingJournalPanel,
  'proposals': ProposalsPanel,
  'ar-video-feed': ARVideoFeedPanel,
  'ar-video-detail': ARVideoDetailPanel,
  'submit-ar-video': SubmitARVideoPanel,
  'tasting-feed': TastingFeedPanel,
  'art-auctions': ArtAuctionPanel,
  'nfc-write': NfcWritePanel,
};

const FULL_HEIGHT_PANELS = new Set([
  'nfc-write', 'verified', 'standingOrder', 'partner-detail', 'order-history',
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
  'venture-earnings',
  'vendor-stall',
  'market-admin',
  'ad-campaigns',
  'toilet',
  'personal-toilet',
  'itinerary',
  'itinerary-detail',
  'health-profile',
  'personalized-menu',
  'business-menu',
  'reservation-offers',
  'reservation-discovery',
  'reservation-booking',
  'portrait-tokens',
  'portrait-token-detail',
  'portrait-licensing',
  'evening-tokens',
  'discovery',
  'portrait-feed',
  'my-profile',
  'greenhouse',
  'greenhouse-detail',
  'shop-menu',
  'market-home', 'market-cart', 'market-orders', 'market-vendor',
  'ar-box',
  'staff-orders',
  'standing-order-renewal',
  'waitlist',
  'standing-order-gift',
  'transfers',
  'drops',
  'drop-detail',
  'preorders',
  'bundles',
  'corporate',
  'referral',
  'leaderboard',
  'farm-visits',
  'variety-passport',
  'seasonal-calendar',
  'supplier-harvest',
  'nutrition-dashboard',
  'fraise-chat-inbox',
  'webhooks',
  'editorial-feed',
  'editorial-piece',
  'write-piece',
  'dj-offer',
  'nomination',
  'nomination-history',
  'campaign-commission',
  'notifications',
  'user-profile',
  'tasting-journal',
  'proposals',
  'ar-video-feed',
  'ar-video-detail',
  'submit-ar-video',
  'tasting-feed',
  'art-auctions',
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
      <TierGate required={PANEL_TIER_REQUIREMENTS[currentPanel] ?? null} panelName={currentPanel}>
        <CurrentComponent />
      </TierGate>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
