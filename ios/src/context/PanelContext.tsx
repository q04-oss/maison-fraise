import React, { createContext, useContext, useRef, useState, ReactNode, useCallback } from 'react';
import { Animated, Dimensions } from 'react-native';
import { FraiseInvitation, FraiseMember } from '../lib/api';

export type PanelId = 'home' | 'invitation-detail' | 'my-claims' | 'account' | 'credits';
export type RootTab = 'discover' | 'claims' | 'account';

export { FraiseInvitation, FraiseMember };

const SCREEN_WIDTH = Dimensions.get('window').width;

interface PanelContextValue {
  // navigation
  stack: PanelId[];
  currentPanel: PanelId;
  slideAnim: Animated.Value;
  isAnimating: boolean;
  showPanel: (id: PanelId, data?: Record<string, any>) => void;
  jumpToPanel: (id: PanelId) => void;
  goBack: () => void;
  goHome: () => void;
  lastNavType: React.MutableRefObject<'show' | 'jump'>;
  panelData: Record<string, any> | null;
  setPanelData: (data: Record<string, any> | null) => void;
  activeRootTab: RootTab;

  // domain
  member: FraiseMember | null;
  setMember: (m: FraiseMember | null) => void;
  invitations: FraiseInvitation[];
  setInvitations: (inv: FraiseInvitation[]) => void;
  activeInvitation: FraiseInvitation | null;
  setActiveInvitation: (inv: FraiseInvitation | null) => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [stack, setStack]               = useState<PanelId[]>(['home']);
  const [currentPanel, setCurrentPanel] = useState<PanelId>('home');
  const [isAnimating, setIsAnimating]   = useState(false);
  const [panelData, setPanelData]       = useState<Record<string, any> | null>(null);
  const [member, setMember]             = useState<FraiseMember | null>(null);
  const [invitations, setInvitations]   = useState<FraiseInvitation[]>([]);
  const [activeInvitation, setActiveInvitation] = useState<FraiseInvitation | null>(null);

  const slideAnim   = useRef(new Animated.Value(0)).current;
  const safetyRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNavType = useRef<'show' | 'jump'>('show');

  const activeRootTab: RootTab =
    currentPanel === 'my-claims' ? 'claims'  :
    currentPanel === 'account'   ? 'account' : 'discover';

  const clearSafety = () => {
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
  };

  const showPanel = useCallback((id: PanelId, data?: Record<string, any>) => {
    if (isAnimating) return;
    lastNavType.current = 'show';
    setIsAnimating(true);
    setPanelData(data ?? null);
    slideAnim.setValue(1);
    setCurrentPanel(id);
    setStack(prev => [...prev, id]);
    const done = () => { clearSafety(); setIsAnimating(false); };
    safetyRef.current = setTimeout(done, 600);
    Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => done());
  }, [isAnimating, slideAnim]);

  const goBack = useCallback(() => {
    if (isAnimating || stack.length <= 1) return;
    setIsAnimating(true);
    const done = () => {
      clearSafety();
      const newStack = stack.slice(0, -1);
      setStack(newStack);
      setCurrentPanel(newStack[newStack.length - 1]);
      slideAnim.setValue(0);
      setIsAnimating(false);
    };
    safetyRef.current = setTimeout(done, 600);
    Animated.timing(slideAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start(() => done());
  }, [isAnimating, stack, slideAnim]);

  const goHome = useCallback(() => {
    clearSafety();
    slideAnim.stopAnimation();
    setStack(['home']);
    setCurrentPanel('home');
    slideAnim.setValue(0);
    setIsAnimating(false);
  }, [slideAnim]);

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
      showPanel, jumpToPanel, goBack, goHome, lastNavType,
      panelData, setPanelData,
      activeRootTab,
      member, setMember,
      invitations, setInvitations,
      activeInvitation, setActiveInvitation,
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
