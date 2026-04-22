import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback, ScrollView,
  StyleSheet, Linking, Alert, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStripe } from '@stripe/stripe-react-native';
import * as Haptics from 'expo-haptics';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { PARTNER_MENUS, CHOCOLATES, FINISHES, PartnerMenu, MenuSection, MenuItem } from '../../data/seed';
import { createOrder, confirmOrder, payOrderWithBalance, fetchAdBalance, fetchBusinessVisitCount, getOrCreateMyMap, addToMap } from '../../lib/api';
import { haversineKm, formatHours24 } from '../../lib/geo';
import { useApp } from '../../../App';

const SHEET_NAME = 'main-sheet';
const SUPPORT_PRESETS = [300, 500, 1000, 2500];

type CartItem = {
  key: string;
  type: 'menu';
  name: string;
  price_cents: number;
  quantity: number;
} | {
  key: string;
  type: 'strawberry';
  variety_id: number;
  variety_name: string;
  price_cents: number;
  chocolate?: string | null;
  chocolate_name?: string | null;
  finish?: string | null;
  finish_name?: string | null;
  quantity: number;
};

function formatHarvestDate(iso: string): string {
  const d = new Date(iso);
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function parsePriceCents(price: string): number {
  const val = parseFloat(price.replace(/[^0-9.]/g, ''));
  return isNaN(val) ? 0 : Math.round(val * 100);
}

function formatContact(contact: string): { label: string; url: string } | null {
  const trimmed = contact.trim();
  if (trimmed.includes('@') && !trimmed.startsWith('@')) return { label: trimmed, url: `mailto:${trimmed}` };
  if (/^\+?[\d\s\-()]{7,}$/.test(trimmed)) return { label: trimmed, url: `tel:${trimmed.replace(/\s/g, '')}` };
  return null;
}

function MenuItemRow({ item, c, onPress }: { item: MenuItem; c: any; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <View style={styles.menuItemTop}>
        <Text style={[styles.menuItemName, { color: c.text }]}>{item.item}</Text>
        {!!item.price && <Text style={[styles.menuItemPrice, { color: c.text }]}>{item.price}</Text>}
      </View>
      {!!item.description && <Text style={[styles.menuItemDesc, { color: c.muted }]}>{item.description}</Text>}
      {item.tags && item.tags.length > 0 && (
        <View style={styles.menuItemTags}>
          {item.tags.map(tag => <Text key={tag} style={[styles.menuTag, { color: c.muted, borderColor: c.border }]}>{tag}</Text>)}
        </View>
      )}
      {item.addOns && item.addOns.length > 0 && (
        <View style={styles.addOns}>
          {item.addOns.map(a => (
            <View key={a.item} style={styles.addOnRow}>
              <Text style={[styles.addOnItem, { color: c.muted }]}>+ {a.item}</Text>
              <Text style={[styles.addOnPrice, { color: c.muted }]}>{a.price}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function FruitItemRow({ variety, c, onPress, dimmed }: { variety: any; c: any; onPress?: () => void; dimmed?: boolean }) {
  const freshColor = variety.freshnessColor ?? c.accent;
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <View style={styles.menuItemTop}>
        <Text style={[styles.menuItemName, { color: dimmed ? c.muted : c.text }]}>{variety.name}</Text>
        <Text style={[styles.menuItemPrice, { color: dimmed ? c.muted : c.text }]}>CA${(variety.price_cents / 100).toFixed(0)}</Text>
      </View>
      <View style={styles.provenanceRow}>
        {!!variety.farm && <Text style={[styles.menuItemDesc, { color: c.muted }]}>{variety.farm}</Text>}
        {!!(variety.farm && variety.harvestDate) && <Text style={[styles.menuItemDesc, { color: c.border }]}>  ·  </Text>}
        {!!variety.harvestDate && <Text style={[styles.menuItemDesc, { color: c.muted }]}>récolte {formatHarvestDate(variety.harvestDate)}</Text>}
        <View style={[styles.freshDot, { backgroundColor: freshColor, marginLeft: 6 }]} />
      </View>
      {!!variety.description && <Text style={[styles.menuItemDesc, { color: c.muted }]}>{variety.description}</Text>}
    </TouchableOpacity>
  );
}

function MenuSectionBlock({ section, c, onItemPress, onSectionLayout }: {
  section: MenuSection; c: any;
  onItemPress?: (item: MenuItem) => void;
  onSectionLayout?: (title: string, y: number) => void;
}) {
  return (
    <View style={styles.menuSection} onLayout={(e) => onSectionLayout?.(section.section, e.nativeEvent.layout.y)}>
      <View style={styles.menuSectionHeader}>
        <Text style={[styles.menuSectionTitle, { color: c.text }]}>{section.section}</Text>
        {!!section.note && <Text style={[styles.menuSectionNote, { color: c.muted }]}>{section.note}</Text>}
      </View>
      {section.items.map((item, i) => (
        <MenuItemRow key={i} item={item} c={c} onPress={item.price && onItemPress ? () => onItemPress(item) : undefined} />
      ))}
    </View>
  );
}

export default function PartnerDetailPanel() {
  const { panelData, varieties, activeLocation, businesses, userCoords, setOrder, suppressCollapseBack } = usePanel();
  const { pushToken } = useApp();
  const c = useColors();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const scrollRef = useRef<ScrollView>(null);

  const biz = panelData?.partnerBusiness;

  // ── Auth ──
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [adBalanceCents, setAdBalanceCents] = useState(0);
  const [visitCount, setVisitCount] = useState<number | null>(null);
  const [mapAdded, setMapAdded] = useState(false);

  const VISITS_REQUIRED = 4;

  useEffect(() => {
    AsyncStorage.multiGet(['user_email', 'user_db_id']).then(([email, dbId]) => {
      if (email[1]) setUserEmail(email[1]);
      if (dbId[1]) setUserDbId(parseInt(dbId[1], 10));
    });
    fetchAdBalance().then(r => setAdBalanceCents(r.ad_balance_cents)).catch(() => {});
    if (biz?.id) {
      fetchBusinessVisitCount(biz.id).then(c => setVisitCount(c)).catch(() => setVisitCount(0));
    }
  }, [biz?.id]);

  const handleAddToMap = useCallback(async () => {
    if (!biz?.id) return;
    if (!userDbId) { Alert.alert('Sign in required', 'Sign in to save places to your map.'); return; }
    const visits = visitCount ?? 0;
    if (visits < VISITS_REQUIRED) {
      const remaining = VISITS_REQUIRED - visits;
      Alert.alert(
        'Not yet',
        `Visit ${biz.name} ${remaining} more ${remaining === 1 ? 'time' : 'times'} to add it to your map. Your beacon needs to detect you there.`,
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const map = await getOrCreateMyMap();
      await addToMap(map.id, biz.id);
      setMapAdded(true);
    } catch {
      Alert.alert('Something went wrong', 'Try again.');
    }
  }, [biz, userDbId]);

  // ── Menu tabs ──
  const [activeTab, setActiveTab] = useState(0);

  // ── Cart ──
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // ── Inline menu item add ──
  const [addingItem, setAddingItem] = useState<MenuItem | null>(null);
  const [addingQty, setAddingQty] = useState(1);

  // ── Inline fruit add (from FRUITS section) ──
  type FruitDraft = { variety_id: number; variety_name: string; price_cents: number; quantity: number };
  const [addingFruit, setAddingFruit] = useState<FruitDraft | null>(null);

  // ── Chocolate enhancement (optional, within checkout) ──
  const [chocolateOpen, setChocolateOpen] = useState(false);
  const [chocolateStep, setChocolateStep] = useState<'chocolate' | 'finish'>('chocolate');
  const [chocolateDraft, setChocolateDraft] = useState<{ chocolate: string | null; chocolate_name: string | null; finish: string | null; finish_name: string | null }>({ chocolate: null, chocolate_name: null, finish: null, finish_name: null });

  // ── Support ──
  const [supportCents, setSupportCents] = useState<number | null>(null);

  // ── Payment ──
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState<any>(null);

  // ── Scroll / section tracking ──
  const sectionPositionsRef = useRef<{ title: string; y: number }[]>([]);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [sectionJumpOpen, setSectionJumpOpen] = useState(false);

  useEffect(() => {
    sectionPositionsRef.current = [];
    setCurrentSection(null);
    setSectionJumpOpen(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeTab]);

  const handleScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const positions = sectionPositionsRef.current;
    if (!positions.length) return;
    const match = [...positions].reverse().find(s => y >= s.y - 50);
    const title = match?.title ?? null;
    setCurrentSection(prev => prev === title ? prev : title);
  }, []);

  const handleSectionLayout = useCallback((title: string, y: number) => {
    const positions = sectionPositionsRef.current;
    const idx = positions.findIndex(s => s.title === title);
    if (idx >= 0) positions[idx].y = y;
    else { positions.push({ title, y }); positions.sort((a, b) => a.y - b.y); }
  }, []);

  const strawberryVarieties = varieties.filter((v: any) => (v.variety_type ?? 'strawberry') === 'strawberry');
  const hasStrawberryInCart = cart.some(i => i.type === 'strawberry');
  const hasChocolateOnCart = cart.some(i => i.type === 'strawberry' && !!i.chocolate);
  const cartSubtotalCents = cart.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
  // supportCents is displayed as a voluntary tip but not yet charged — exclude from payment total
  const cartTotalCents = cartSubtotalCents;
  const canPayWithBalance = !!(userDbId && adBalanceCents >= cartTotalCents && !cart.some(i => i.type === 'menu'));

  const pickupLocation = useMemo(() => {
    if (activeLocation && (activeLocation.type === 'collection' || activeLocation.type === 'popup')) return activeLocation;
    if (!userCoords) return null;
    const candidates = businesses.filter((b: any) => b.lat && b.lng && b.type === 'collection');
    if (!candidates.length) return null;
    return candidates.reduce((best: any, b: any) => {
      const d = haversineKm(userCoords.latitude, userCoords.longitude, b.lat, b.lng);
      return d < best.dist ? { biz: b, dist: d } : best;
    }, { biz: candidates[0], dist: Infinity }).biz;
  }, [activeLocation, businesses, userCoords]);

  const resetCart = () => {
    setCart([]); setCheckoutOpen(false); setAddingItem(null);
    setAddingFruit(null);
    setChocolateOpen(false); setChocolateStep('chocolate');
    setChocolateDraft({ chocolate: null, chocolate_name: null, finish: null, finish_name: null });
    setSupportCents(null); setConfirmed(null);
  };

  const confirmAddFruit = () => {
    if (!addingFruit) return;
    setCart(prev => [...prev, { key: `strawberry_${Date.now()}`, type: 'strawberry', variety_id: addingFruit.variety_id, variety_name: addingFruit.variety_name, price_cents: addingFruit.price_cents, quantity: addingFruit.quantity }]);
    setAddingFruit(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const applyChocolate = () => {
    if (!chocolateDraft.chocolate || !chocolateDraft.finish) return;
    setCart(prev => prev.map(i => i.type === 'strawberry' ? { ...i, chocolate: chocolateDraft.chocolate, chocolate_name: chocolateDraft.chocolate_name, finish: chocolateDraft.finish, finish_name: chocolateDraft.finish_name } : i));
    setChocolateOpen(false);
    setChocolateStep('chocolate');
    setChocolateDraft({ chocolate: null, chocolate_name: null, finish: null, finish_name: null });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleMenuItemPress = (item: MenuItem) => {
    setAddingItem(item); setAddingQty(1);
    TrueSheet.resize(SHEET_NAME, 1);
  };

  const confirmAddMenuItem = () => {
    if (!addingItem?.price) return;
    setCart(prev => [...prev, { key: `menu_${addingItem.item}_${Date.now()}`, type: 'menu', name: addingItem.item, price_cents: parsePriceCents(addingItem.price!), quantity: addingQty }]);
    setAddingItem(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };


  const handlePay = async () => {
    if (!userEmail) { Alert.alert('Sign in required', 'Sign in via your profile to place an order.'); return; }
    const strawberryItem = cart.find(i => i.type === 'strawberry') as Extract<CartItem, { type: 'strawberry' }> | undefined;
    if (cart.some(i => i.type === 'menu')) { Alert.alert('Coming soon', 'Menu ordering will be available shortly.'); return; }
    if (!strawberryItem) return;
    if (!pickupLocation) { Alert.alert('No pickup location', 'Enable location access or move closer to a collection point.'); return; }
    setPaying(true);
    try {
      const created = await createOrder({ variety_id: strawberryItem.variety_id, location_id: pickupLocation.id as number, chocolate: strawberryItem.chocolate ?? null, finish: strawberryItem.finish ?? null, quantity: strawberryItem.quantity, is_gift: false, customer_email: userEmail ?? '', push_token: pushToken, gift_note: null });
      const { error: initErr } = await initPaymentSheet({ merchantDisplayName: 'Box Fraise', paymentIntentClientSecret: created.client_secret, applePay: { merchantCountryCode: 'CA', merchantIdentifier: 'merchant.com.boxfraise.app' }, appearance: { colors: { primary: c.accent, background: '#FFFFFF', componentBackground: '#F7F5F2', componentText: '#1C1C1E', componentBorder: '#E5E1DA', placeholderText: '#8E8E93' } } });
      if (initErr) throw new Error(initErr.message);
      suppressCollapseBack.current = true;
      TrueSheet.present(SHEET_NAME, 0);
      let presentErr: any;
      try {
        ({ error: presentErr } = await presentPaymentSheet());
      } finally {
        suppressCollapseBack.current = false;
      }
      if (presentErr) { setTimeout(() => TrueSheet.present(SHEET_NAME, 1), 150); if (presentErr.code === 'Canceled') { setPaying(false); return; } throw new Error(presentErr.message); }
      const confirmedOrder = await confirmOrder(created.order.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmed(confirmedOrder);
      setOrder({ order_id: confirmedOrder.id, order_status: confirmedOrder.status, location_id: pickupLocation.id });
      setTimeout(() => TrueSheet.present(SHEET_NAME, 1), 150);
    } catch (err: any) {
      Alert.alert('Something went wrong.', err.message ?? 'Try again.');
    } finally { setPaying(false); }
  };

  const handlePayWithBalance = async () => {
    const strawberryItem = cart.find(i => i.type === 'strawberry') as Extract<CartItem, { type: 'strawberry' }> | undefined;
    if (!strawberryItem) return;
    if (!pickupLocation) { Alert.alert('No pickup location', 'Enable location access or move closer to a collection point.'); return; }
    setPaying(true);
    try {
      const confirmedOrder = await payOrderWithBalance({ variety_id: strawberryItem.variety_id, location_id: pickupLocation.id, chocolate: strawberryItem.chocolate ?? null, finish: strawberryItem.finish ?? null, quantity: strawberryItem.quantity, is_gift: false, push_token: pushToken, gift_note: null });
      setAdBalanceCents(prev => prev - cartTotalCents);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmed(confirmedOrder);
      setOrder({ order_id: confirmedOrder.id, order_status: confirmedOrder.status, location_id: pickupLocation.id });
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Try again.';
      if (msg === 'insufficient_balance') Alert.alert('Insufficient balance', 'Pay with card instead.');
      else if (msg === 'sold_out') Alert.alert('Sold out', 'This variety is no longer available.');
      else Alert.alert('Something went wrong.', msg);
    } finally { setPaying(false); }
  };

  if (!biz) return null;

  const bizNameLower = biz.name?.toLowerCase() ?? '';
  const baseBizName = bizNameLower.replace(/\s*[\u2014\u2013-]\s*.*$/, '').trim();
  const menuKey = Object.keys(PARTNER_MENUS).find(k => k.toLowerCase() === bizNameLower) ?? Object.keys(PARTNER_MENUS).find(k => k.toLowerCase() === baseBizName) ?? biz.name;
  const menus: PartnerMenu[] = PARTNER_MENUS[menuKey] ?? [];
  const hasMenu = menus.length > 0;
  const activeMenu = menus[activeTab];
  const contactInfo = biz.contact ? formatContact(biz.contact) : null;

  const openStatus = (() => {
    if (!biz.hours) return null;
    const now = new Date();
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const today = dayNames[now.getDay()];
    const lc = biz.hours.toLowerCase();
    const hasDays = /mon|tue|wed|thu|fri|sat|sun/.test(lc);
    if (hasDays && !lc.includes(today)) return { label: 'closed today', open: false };
    const timeMatch = lc.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–\-to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!timeMatch) return null;
    const toMin = (h: string, m: string, mer: string) => { let hour = parseInt(h); if (mer === 'pm' && hour !== 12) hour += 12; if (mer === 'am' && hour === 12) hour = 0; return hour * 60 + (parseInt(m) || 0); };
    const openMin = toMin(timeMatch[1], timeMatch[2], timeMatch[3]);
    const closeMin = toMin(timeMatch[4], timeMatch[5], timeMatch[6] || (openMin > toMin(timeMatch[4], timeMatch[5], 'am') ? 'pm' : 'am'));
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return nowMin >= openMin && nowMin < closeMin ? { label: 'open now', open: true } : { label: 'closed', open: false };
  })();

  const handleDirections = () => {
    if (!biz.lat || !biz.lng) return;
    const apple = `maps://maps.apple.com/?daddr=${biz.lat},${biz.lng}&dirflg=d`;
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${biz.lat},${biz.lng}`;
    Linking.canOpenURL(apple).then(ok => Linking.openURL(ok ? apple : fallback)).catch(() => {});
  };

  const handleContactPress = () => {
    if (!contactInfo) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(contactInfo.url);
  };

  const handleFruitPress = (v: any) => {
    setAddingFruit({ variety_id: v.id, variety_name: v.name, price_cents: v.price_cents, quantity: 4 });
    TrueSheet.resize(SHEET_NAME, 1);
  };

  const openCheckout = () => {
    setAddingFruit(null);
    setCheckoutOpen(true);
    TrueSheet.resize(SHEET_NAME, 1);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 350);
  };

  // ── Context-aware top sticky bar ──
  const stickyTop = (() => {
    if (addingItem || addingFruit) return null;
    if (checkoutOpen) {
      if (chocolateOpen) {
        const label = chocolateDraft.chocolate_name
          ? `${chocolateDraft.chocolate_name.toLowerCase()}  ·  ${chocolateStep === 'finish' ? 'finish' : ''}`.trim()
          : 'chocolate';
        return { label, onPress: () => { setChocolateOpen(false); setChocolateStep('chocolate'); }, isSection: false };
      }
      return { label: '← back', onPress: () => setCheckoutOpen(false), isSection: false };
    }
    if (cart.length > 0) {
      return { label: `${cart.length} item${cart.length > 1 ? 's' : ''}  ·  CA$${(cartTotalCents / 100).toFixed(2)}  →`, onPress: openCheckout, isSection: false };
    }
    if ((hasMenu || strawberryVarieties.length > 0) && currentSection) {
      return { label: currentSection.toLowerCase(), onPress: () => setSectionJumpOpen(true), isSection: true };
    }
    return null;
  })();

  const showPayBar = checkoutOpen && cart.length > 0 && !chocolateOpen && !confirmed;

  const payBarSub = [
    biz.name.toLowerCase(),
    pickupLocation && cart.some(i => i.type === 'strawberry') ? pickupLocation.name.toLowerCase() : null,
  ].filter(Boolean).join('  ·  ');

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>

      {/* Tab bar — hidden in checkout */}
      {hasMenu && menus.length > 1 && !checkoutOpen && (
        <View style={[styles.tabBar, { borderBottomColor: c.border }]}>
          {menus.map((m, i) => (
            <TouchableOpacity key={m.label} style={styles.tab} onPress={() => setActiveTab(i)} activeOpacity={0.7}>
              <Text style={[styles.tabText, { color: activeTab === i ? c.text : c.muted }]}>{m.label}</Text>
              {activeTab === i && <View style={[styles.tabUnderline, { backgroundColor: c.accent }]} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Inline fruit add bar — same pattern as addingItem, menu stays visible below */}
      {addingFruit && (
        <View style={[styles.stickyBar, styles.stickyBarRow, { borderBottomColor: c.border, backgroundColor: c.panelBg }]}>
          <Text style={[styles.stickyBarText, { color: c.text, flex: 1 }]} numberOfLines={1}>{addingFruit.variety_name.toLowerCase()}</Text>
          <TouchableOpacity onPress={() => setAddingFruit(p => p ? { ...p, quantity: Math.max(1, p.quantity - 1) } : p)} activeOpacity={0.7} style={styles.stickyBarBtn}>
            <Text style={[styles.stickyBarText, { color: c.accent }]}>−</Text>
          </TouchableOpacity>
          <Text style={[styles.stickyBarText, { color: c.text }]}>{addingFruit.quantity}</Text>
          <TouchableOpacity onPress={() => setAddingFruit(p => p ? { ...p, quantity: Math.min(12, p.quantity + 1) } : p)} activeOpacity={0.7} style={styles.stickyBarBtn}>
            <Text style={[styles.stickyBarText, { color: c.accent }]}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmAddFruit} activeOpacity={0.7} style={styles.stickyBarBtn}>
            <Text style={[styles.infoAction, { color: c.accent }]}>add →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAddingFruit(null)} activeOpacity={0.6} style={styles.stickyBarBtn}>
            <Text style={[styles.infoAction, { color: c.muted }]}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Inline add bar — shown when a menu item is being added */}
      {addingItem && (
        <View style={[styles.stickyBar, styles.stickyBarRow, { borderBottomColor: c.border, backgroundColor: c.panelBg }]}>
          <Text style={[styles.stickyBarText, { color: c.text, flex: 1 }]} numberOfLines={1}>{addingItem.item.toLowerCase()}</Text>
          <TouchableOpacity onPress={() => setAddingQty(q => Math.max(1, q - 1))} activeOpacity={0.7} style={styles.stickyBarBtn}>
            <Text style={[styles.stickyBarText, { color: c.accent }]}>−</Text>
          </TouchableOpacity>
          <Text style={[styles.stickyBarText, { color: c.text }]}>{addingQty}</Text>
          <TouchableOpacity onPress={() => setAddingQty(q => Math.min(12, q + 1))} activeOpacity={0.7} style={styles.stickyBarBtn}>
            <Text style={[styles.stickyBarText, { color: c.accent }]}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmAddMenuItem} activeOpacity={0.7} style={styles.stickyBarBtn}>
            <Text style={[styles.infoAction, { color: c.accent }]}>add →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAddingItem(null)} activeOpacity={0.6} style={styles.stickyBarBtn}>
            <Text style={[styles.infoAction, { color: c.muted }]}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Context-aware top sticky bar */}
      {stickyTop && (
        <TouchableOpacity
          onPress={stickyTop.onPress ?? undefined}
          disabled={!stickyTop.onPress}
          activeOpacity={stickyTop.onPress ? 0.7 : 1}
          style={[styles.stickyBar, { borderBottomColor: c.border, backgroundColor: c.panelBg }]}
        >
          <Text style={[styles.stickyBarText, { color: c.text }]}>{stickyTop.label}</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={100}
      >

        {/* Identity + meta */}
        <View style={[styles.infoCompact, { borderBottomColor: c.border }]}>
          <Text style={styles.metaLine}>
            <Text style={{ color: c.text }}>{biz.name.toLowerCase()}</Text>
            {[openStatus?.label, biz.neighbourhood, biz.hours].filter(Boolean).length > 0 && (
              <Text style={{ color: c.muted }}>{'  ·  ' + [openStatus?.label, biz.neighbourhood, biz.hours ? formatHours24(biz.hours) : null].filter(Boolean).join('  ·  ')}</Text>
            )}
          </Text>
          {!!biz.description && <Text style={[styles.description, { color: c.muted }]}>{biz.description}</Text>}
          <View style={styles.infoActions}>
            {(biz.lat && biz.lng) && (
              <TouchableOpacity onPress={handleDirections} activeOpacity={0.6}>
                <Text style={[styles.infoAction, { color: c.muted }]}>directions</Text>
              </TouchableOpacity>
            )}
            {contactInfo && (
              <TouchableOpacity onPress={handleContactPress} activeOpacity={0.6}>
                <Text style={[styles.infoAction, { color: c.muted }]}>{contactInfo.label}</Text>
              </TouchableOpacity>
            )}
            {!hasMenu && strawberryVarieties.length > 0 && !checkoutOpen && (
              <TouchableOpacity onPress={openCheckout} activeOpacity={0.6}>
                <Text style={[styles.infoAction, { color: c.muted }]}>order</Text>
              </TouchableOpacity>
            )}
            {mapAdded ? (
              <Text style={[styles.infoAction, { color: c.accent }]}>on map ✓</Text>
            ) : (
              <TouchableOpacity onPress={handleAddToMap} activeOpacity={0.6}>
                {visitCount !== null && visitCount < VISITS_REQUIRED ? (
                  <Text style={[styles.infoAction, { color: c.muted }]}>{visitCount}/{VISITS_REQUIRED} visits</Text>
                ) : (
                  <Text style={[styles.infoAction, { color: visitCount !== null && visitCount >= VISITS_REQUIRED ? c.text : c.muted }]}>+ map</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Checkout view */}
        {checkoutOpen && (
          <View style={[styles.infoBlock, { borderBottomColor: c.border }]}>
            {confirmed ? (
              <>
                <Text style={[styles.fieldValue, { color: c.text }]}>
                  {confirmed.status === 'queued' ? "you're in the queue." : 'order placed.'}
                </Text>
                {confirmed.status === 'queued' && (
                  <Text style={[styles.description, { color: c.muted }]}>card held — charged when batch fills</Text>
                )}
                <TouchableOpacity onPress={resetCart} activeOpacity={0.7}>
                  <Text style={[styles.infoAction, { color: c.muted }]}>new order →</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {cart.map(item => (
                  <View key={item.key} style={styles.cartItemRow}>
                    <Text style={[styles.fieldValue, { color: c.text, flex: 1 }]}>
                      {item.type === 'strawberry'
                        ? [item.variety_name, item.chocolate_name, item.finish_name].filter(Boolean).map(s => s!.toLowerCase()).join('  ·  ')
                        : item.name.toLowerCase()}
                    </Text>
                    <Text style={[styles.fieldValue, { color: c.muted }]}>×{item.quantity}</Text>
                    <TouchableOpacity onPress={() => setCart(prev => prev.filter(i => i.key !== item.key))} activeOpacity={0.6}>
                      <Text style={[styles.infoAction, { color: c.muted }]}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {hasStrawberryInCart && !hasChocolateOnCart && (
                  !chocolateOpen ? (
                    <TouchableOpacity onPress={() => setChocolateOpen(true)} activeOpacity={0.6}>
                      <Text style={[styles.infoAction, { color: c.muted }]}>add chocolate?</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      {chocolateStep === 'chocolate' && (CHOCOLATES as any[]).map((choc: any) => (
                        <TouchableOpacity key={choc.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setChocolateDraft(p => ({ ...p, chocolate: choc.id, chocolate_name: choc.name })); setChocolateStep('finish'); }} activeOpacity={0.7}>
                          <Text style={[styles.fieldValue, { color: c.text }]}>{choc.name.toLowerCase()}  →</Text>
                        </TouchableOpacity>
                      ))}
                      {chocolateStep === 'finish' && (FINISHES as any[]).map((fin: any) => (
                        <TouchableOpacity key={fin.id} onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          const choc = chocolateDraft.chocolate;
                          const chocName = chocolateDraft.chocolate_name;
                          setCart(prev => prev.map(i => i.type === 'strawberry' ? { ...i, chocolate: choc, chocolate_name: chocName, finish: fin.id, finish_name: fin.name } : i));
                          setChocolateOpen(false);
                          setChocolateStep('chocolate');
                          setChocolateDraft({ chocolate: null, chocolate_name: null, finish: null, finish_name: null });
                        }} activeOpacity={0.7}>
                          <Text style={[styles.fieldValue, { color: c.text }]}>{fin.name.toLowerCase()}  →</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity onPress={() => { setChocolateOpen(false); setChocolateStep('chocolate'); setChocolateDraft({ chocolate: null, chocolate_name: null, finish: null, finish_name: null }); }} activeOpacity={0.6}>
                        <Text style={[styles.infoAction, { color: c.muted }]}>×</Text>
                      </TouchableOpacity>
                    </>
                  )
                )}

                {!chocolateOpen && (
                  <View style={styles.supportRow}>
                    <Text style={[styles.infoAction, { color: c.muted }]}>support</Text>
                    <View style={styles.presetRow}>
                      {SUPPORT_PRESETS.map(cents => (
                        <TouchableOpacity key={cents} onPress={() => { setSupportCents(prev => prev === cents ? null : cents); Haptics.selectionAsync(); }} activeOpacity={0.7}>
                          <Text style={[styles.presetChip, { color: supportCents === cents ? c.accent : c.muted }]}>${cents / 100}</Text>
                        </TouchableOpacity>
                      ))}
                      {supportCents !== null && (
                        <TouchableOpacity onPress={() => setSupportCents(null)} activeOpacity={0.6}>
                          <Text style={[styles.presetChip, { color: c.muted }]}>×</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

                {!chocolateOpen && (
                  <TouchableOpacity onPress={resetCart} activeOpacity={0.6}>
                    <Text style={[styles.description, { color: c.muted }]}>cancel</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        {/* Menu sections */}
        {!checkoutOpen && hasMenu && activeMenu && activeMenu.sections.map((section, i) => (
          <MenuSectionBlock key={i} section={section} c={c} onItemPress={handleMenuItemPress} onSectionLayout={handleSectionLayout} />
        ))}

        {/* FRUITS section — platform-owned, always present */}
        {!checkoutOpen && strawberryVarieties.length > 0 && (
          <View style={styles.menuSection} onLayout={(e) => handleSectionLayout('FRUITS', e.nativeEvent.layout.y)}>
            <View style={styles.menuSectionHeader}>
              <Text style={[styles.menuSectionTitle, { color: c.text }]}>FRUITS</Text>
            </View>
            {strawberryVarieties.map((v: any) => (
              <FruitItemRow
                key={v.id}
                variety={v}
                c={c}
                dimmed={hasStrawberryInCart}
                onPress={!hasStrawberryInCart ? () => handleFruitPress(v) : undefined}
              />
            ))}
          </View>
        )}

        <View style={{ height: showPayBar ? 80 : 48 }} />
      </ScrollView>

      {/* Bottom sticky pay bar */}
      {showPayBar && (
        <View style={[styles.payBar, { borderTopColor: c.border, backgroundColor: c.panelBg }]}>
          <Text style={[styles.payBarSub, { color: c.muted }]}>{payBarSub}</Text>
          <View style={styles.payBarRow}>
            <Text style={[styles.stickyBarText, { color: c.text }]}>CA${(cartTotalCents / 100).toFixed(2)}</Text>
            <View style={styles.payBarActions}>
              {canPayWithBalance && (
                <TouchableOpacity onPress={handlePayWithBalance} disabled={paying} activeOpacity={0.7}>
                  <Text style={[styles.infoAction, { color: c.muted }]}>balance →</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handlePay} disabled={paying} activeOpacity={0.7}>
                {paying
                  ? <ActivityIndicator color={c.accent} size="small" />
                  : <Text style={[styles.infoAction, { color: c.accent }]}>pay →</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Section jump overlay */}
      {sectionJumpOpen && (
        <>
          <TouchableOpacity style={[StyleSheet.absoluteFill, { zIndex: 9 }]} onPress={() => setSectionJumpOpen(false)} activeOpacity={1} />
          <View style={[styles.sectionJumpList, { backgroundColor: c.panelBg, borderBottomColor: c.border }]}>
            {sectionPositionsRef.current.map(s => (
              <TouchableOpacity
                key={s.title}
                onPress={() => { scrollRef.current?.scrollTo({ y: s.y, animated: true }); setSectionJumpOpen(false); }}
                activeOpacity={0.7}
                style={[styles.sectionJumpItem, { borderBottomColor: c.border }]}
              >
                <Text style={[styles.sectionJumpText, { color: s.title === currentSection ? c.text : c.muted }]}>
                  {s.title.toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },

  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACING.md },
  tab: { marginRight: SPACING.md, paddingVertical: 12, position: 'relative' },
  tabText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5, borderRadius: 1 },

  stickyBar: { paddingHorizontal: SPACING.md, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  stickyBarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stickyBarBtn: { paddingVertical: 2 },
  stickyBarText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },

  payBar: { paddingHorizontal: SPACING.md, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  payBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payBarActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  payBarSub: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 0.5 },

  sectionJumpList: {
    position: 'absolute', top: 0, left: 0, right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 10,
  },
  sectionJumpItem: { paddingHorizontal: SPACING.md, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionJumpText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },

  infoCompact: { paddingHorizontal: SPACING.md, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  metaLine: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  infoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 2 },
  infoAction: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5, textDecorationLine: 'underline', textDecorationStyle: 'solid' },

  description: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22, fontStyle: 'italic' },
  infoBlock: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  fieldValue: { fontSize: 14, fontFamily: fonts.dmSans },
  varietyRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },

  cartItemRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  supportRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  presetRow: { flexDirection: 'row', gap: 12 },
  presetChip: { fontSize: 14, fontFamily: fonts.dmSans },

  menuSection: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: SPACING.sm },
  menuSectionHeader: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: 8, gap: 2 },
  menuSectionTitle: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  provenanceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  freshDot: { width: 6, height: 6, borderRadius: 3 },
  menuSectionNote: { fontSize: 10, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  menuItem: { paddingHorizontal: SPACING.md, paddingVertical: 12, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  menuItemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  menuItemName: { flex: 1, fontSize: 18, fontFamily: fonts.playfair },
  menuItemPrice: { fontSize: 12, fontFamily: fonts.dmMono },
  menuItemDesc: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 18 },
  menuItemTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  menuTag: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 0.5, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  addOns: { marginTop: 4, gap: 2 },
  addOnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  addOnItem: { fontSize: 11, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  addOnPrice: { fontSize: 11, fontFamily: fonts.dmMono },
});
