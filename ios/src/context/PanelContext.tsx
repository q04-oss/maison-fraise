import React, { createContext, useContext, useRef, useState, ReactNode, useCallback } from 'react';
import { Animated, Dimensions } from 'react-native';

export type PanelId =
  | 'home'
  | 'profile'
  | 'location'
  | 'ask'
  | 'gift-note'
  | 'variety'
  | 'chocolate'
  | 'finish'
  | 'quantity'
  | 'when'
  | 'review'
  | 'confirmation'
  | 'nfc'
  | 'verified'
  | 'standingOrder';

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
  time_slot_id: number | null;
  time_slot_time: string | null;
  date: string | null;
  is_gift: boolean;
  gift_note: string | null;
  customer_email: string;
  // post-confirm
  order_id: number | null;
  nfc_token: string | null;
  total_cents: number | null;
}

export interface Variety {
  id: number;
  name: string;
  price_cents: number;
  stock_remaining: number;
  description?: string;
  farm?: string;
  flag?: string;
  tab?: string;
  freshnessLevel?: number;
  freshnessColor?: string;
  harvestDate?: string;
  tag?: string;
}

export interface Business {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  description?: string;
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
  time_slot_id: null,
  time_slot_time: null,
  date: null,
  is_gift: false,
  gift_note: null,
  customer_email: '',
  order_id: null,
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
  setOrder: (partial: Partial<OrderState>) => void;
  setVarieties: (v: Variety[]) => void;
  setBusinesses: (b: Business[]) => void;
  setActiveLocation: (b: Business | null) => void;
  showPanel: (id: PanelId) => void;
  goBack: () => void;
  goHome: () => void;
  sheetIndexRef: React.MutableRefObject<number>;
  sheetHeight: number;
  setSheetHeight: (h: number) => void;
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
  const [sheetHeight, setSheetHeight] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const sheetIndexRef = useRef(1);

  const setOrder = useCallback((partial: Partial<OrderState>) => {
    setOrderState(prev => ({ ...prev, ...partial }));
  }, []);

  const showPanel = useCallback((id: PanelId) => {
    if (isAnimating) return;
    setIsAnimating(true);
    slideAnim.setValue(1);
    setCurrentPanel(id);
    setStack(prev => [...prev, id]);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    }).start(() => setIsAnimating(false));
  }, [isAnimating, currentPanel, slideAnim]);

  const goBack = useCallback(() => {
    if (isAnimating || stack.length <= 1) return;
    setIsAnimating(true);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      const newStack = stack.slice(0, -1);
      setStack(newStack);
      setCurrentPanel(newStack[newStack.length - 1]);
      slideAnim.setValue(0);
      setIsAnimating(false);
    });
  }, [isAnimating, stack, slideAnim]);

  const goHome = useCallback(() => {
    setStack(['home']);
    setCurrentPanel('home');
    slideAnim.setValue(0);
    setIsAnimating(false);
    setOrderState(defaultOrder);
  }, [slideAnim]);

  return (
    <PanelContext.Provider value={{
      stack, currentPanel, slideAnim, isAnimating,
      order, varieties, businesses, activeLocation,
      setOrder, setVarieties, setBusinesses, setActiveLocation,
      showPanel, goBack, goHome, sheetIndexRef,
      sheetHeight, setSheetHeight,
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
