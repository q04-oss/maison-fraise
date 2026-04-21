import React, { createContext, useContext, useRef, useState, ReactNode, useCallback } from 'react';
import { Animated, Dimensions } from 'react-native';

export type RootTab = 'discover' | 'order' | 'me';

export type PanelId =
  | 'home'
  | 'location'
  | 'verified'
  | 'batch-preference'
  | 'partner-detail'
  | 'order-history'
  | 'verifyNFC'
  | 'my-profile'
  | 'staff-orders'
  | 'walk-in'
  | 'walk-in-write'
  | 'walk-in-inventory'
  | 'nfc-write'
  | 'nfc-reveal'
  | 'merch'
  | 'gift'
  | 'donate'
  | 'send-credit';

export interface OrderState {
  variety_id: number | null;
  variety_name: string | null;
  price_cents: number | null;
  chocolate: string | null;
  chocolate_name: string | null;
  finish: string | null;
  finish_name: string | null;
  quantity: number;
  location_id: number | null;
  location_name: string | null;
  is_gift: boolean;
  gift_note: string | null;
  customer_email: string;
  ordered_at_popup: boolean;
  // post-confirm
  order_id: number | null;
  order_status: string | null;
  delivery_date: string | null;
  nfc_token: string | null;
  total_cents: number | null;
}

export interface Variety {
  id: number;
  name: string;
  price_cents: number;
  stock_remaining: number;
  location_id?: number;
  description?: string;
  farm?: string;
  flag?: string;
  tab?: string;
  freshnessLevel?: number;
  freshnessColor?: string;
  harvestDate?: string;
  tag?: string;
  image_url?: string;
  avg_rating?: number | null;
  rating_count?: number;
  sort_order?: number;
}

export interface Business {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  description?: string;
  instagram_handle?: string;
  neighbourhood?: string;
  launched_at?: string;
  ends_at?: string;
  dj_name?: string;
  organizer_note?: string;
  rsvp_count?: number;
  capacity?: number;
  entrance_fee_cents?: number;
  is_audition?: boolean;
  audition_status?: 'pending' | 'passed' | 'failed';
  placed_user_name?: string | null;
  shop_user_id?: number | null;
  starts_at?: string;
  host_user_id?: number | null;
  checkin_token?: string | null;
  contact?: string | null;
  hours?: string | null;
  venture_id?: number | null;
  has_toilet?: boolean;
  toilet_fee_cents?: number;
  allows_walkin?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

const defaultOrder: OrderState = {
  variety_id: null,
  variety_name: null,
  price_cents: null,
  chocolate: null,
  chocolate_name: null,
  finish: null,
  finish_name: null,
  quantity: 4,
  location_id: null,
  location_name: null,
  is_gift: false,
  gift_note: null,
  customer_email: '',
  ordered_at_popup: false,
  order_id: null,
  order_status: null,
  delivery_date: null,
  nfc_token: null,
  total_cents: null,
};

interface PanelContextValue {
  stack: PanelId[];
  currentPanel: PanelId;
  slideAnim: Animated.Value;
  isAnimating: boolean;
  order: OrderState;
  varieties: Variety[];
  businesses: Business[];
  activeLocation: Business | null;
  userCoords: { latitude: number; longitude: number } | null;
  setOrder: (partial: Partial<OrderState>) => void;
  setVarieties: (v: Variety[]) => void;
  setBusinesses: (b: Business[]) => void;
  setActiveLocation: (b: Business | null) => void;
  setUserCoords: (coords: { latitude: number; longitude: number } | null) => void;
  panelData: Record<string, any> | null;
  setPanelData: (data: Record<string, any> | null) => void;
  showPanel: (id: PanelId, data?: Record<string, any>) => void;
  jumpToPanel: (id: PanelId) => void;
  lastNavType: React.MutableRefObject<'show' | 'jump'>;
  goBack: () => void;
  goHome: () => void;
  sheetHeight: number;
  setSheetHeight: (h: number) => void;
  highlightedBizId: number | null;
  setHighlightedBizId: (id: number | null) => void;
  suppressCollapseBack: React.MutableRefObject<boolean>;
  activeRootTab: RootTab;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<PanelId[]>(['home']);
  const [currentPanel, setCurrentPanel] = useState<PanelId>('home');
  const [isAnimating, setIsAnimating] = useState(false);
  const [order, setOrderState] = useState<OrderState>(defaultOrder);
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeLocation, setActiveLocation] = useState<Business | null>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [panelData, setPanelData] = useState<Record<string, any> | null>(null);
  const [highlightedBizId, setHighlightedBizId] = useState<number | null>(null);
  const activeRootTab: RootTab = currentPanel === 'order-history' ? 'order' : currentPanel === 'my-profile' ? 'me' : 'discover';
  const slideAnim = useRef(new Animated.Value(0)).current;
  const animSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNavType = useRef<'show' | 'jump'>('show');
  const suppressCollapseBack = useRef(false);

  const clearAnimSafety = () => {
    if (animSafetyRef.current) { clearTimeout(animSafetyRef.current); animSafetyRef.current = null; }
  };
  const startAnimSafety = (done: () => void) => {
    clearAnimSafety();
    animSafetyRef.current = setTimeout(done, 600);
  };

  const setOrder = useCallback((partial: Partial<OrderState>) => {
    setOrderState(prev => ({ ...prev, ...partial }));
  }, []);

  const showPanel = useCallback((id: PanelId, data?: Record<string, any>) => {
    if (isAnimating) return;
    lastNavType.current = 'show';
    setIsAnimating(true);
    setPanelData(data ?? null);
    slideAnim.setValue(1);
    setCurrentPanel(id);
    setStack(prev => [...prev, id]);
    const done = () => { clearAnimSafety(); setIsAnimating(false); };
    startAnimSafety(done);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    }).start(() => done());
  }, [isAnimating, slideAnim]);

  const goBack = useCallback(() => {
    if (isAnimating || stack.length <= 1) return;
    setIsAnimating(true);
    const done = () => {
      clearAnimSafety();
      const newStack = stack.slice(0, -1);
      setStack(newStack);
      setCurrentPanel(newStack[newStack.length - 1]);
      slideAnim.setValue(0);
      setIsAnimating(false);
    };
    startAnimSafety(done);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start(() => done());
  }, [isAnimating, stack, slideAnim]);

  const goHome = useCallback(() => {
    clearAnimSafety();
    slideAnim.stopAnimation();
    setStack(['home']);
    setCurrentPanel('home');
    slideAnim.setValue(0);
    setIsAnimating(false);
    setOrderState(prev => ({ ...defaultOrder, location_id: prev.location_id, location_name: prev.location_name }));
  }, [slideAnim]);

  // Direct navigation that bypasses isAnimating — for external triggers like map marker presses
  const jumpToPanel = useCallback((id: PanelId) => {
    lastNavType.current = 'jump';
    setIsAnimating(false);
    slideAnim.setValue(0);
    setCurrentPanel(id);
    setStack(['home', id]);
  }, [slideAnim]);

  return (
    <PanelContext.Provider value={{
      stack, currentPanel, slideAnim, isAnimating,
      order, varieties, businesses, activeLocation, userCoords,
      setOrder, setVarieties, setBusinesses, setActiveLocation, setUserCoords,
      panelData, setPanelData,
      showPanel, jumpToPanel, goBack, goHome, lastNavType,
      sheetHeight, setSheetHeight,
      highlightedBizId, setHighlightedBizId,
      suppressCollapseBack,
      activeRootTab,
    }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanel must be used within PanelProvider');
  return ctx;
}
