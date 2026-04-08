import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchStaffOrders, staffMarkPrepare, staffMarkReady, staffFlagOrder } from '../../lib/api';

const STATUS_FILTERS = ['ALL', 'PAID', 'PREPARING', 'READY', 'COLLECTED'] as const;

function offsetDate(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function StaffOrdersPanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  // All hooks declared before any conditional render
  const [pin, setPin] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('ALL');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  // Restore saved pin on mount
  useEffect(() => {
    AsyncStorage.getItem('staff_pin').then(saved => {
      if (saved) { setPin(saved); setPinInput(saved); }
    });
  }, []);

  const loadOrders = useCallback(async (currentPin: string, currentDate: string) => {
    if (!currentPin) return;
    setLoading(true);
    try {
      const data = await fetchStaffOrders(currentPin, currentDate);
      setOrders(data);
      setAuthenticated(true);
    } catch (err: any) {
      if (err.message === 'staff_auth_failed') {
        setAuthenticated(false);
        Alert.alert('Incorrect PIN');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load when authenticated + date changes
  useEffect(() => {
    if (authenticated && pin) {
      loadOrders(pin, date);
    }
  }, [date, authenticated, pin, loadOrders]);

  const handlePinSubmit = async () => {
    const trimmed = pinInput.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const data = await fetchStaffOrders(trimmed, date);
      await AsyncStorage.setItem('staff_pin', trimmed);
      setPin(trimmed);
      setOrders(data);
      setAuthenticated(true);
    } catch (err: any) {
      if (err.message === 'staff_auth_failed') {
        Alert.alert('Incorrect PIN', 'Please check your staff PIN and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const markPrepare = async (id: number) => {
    const prev = orders.find(o => o.id === id)?.status;
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'preparing' } : o));
    try {
      await staffMarkPrepare(pin, id);
    } catch {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: prev } : o));
      Alert.alert('Failed to update order');
    }
  };

  const markReady = async (id: number) => {
    const prev = orders.find(o => o.id === id)?.status;
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'ready' } : o));
    try {
      await staffMarkReady(pin, id);
    } catch {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: prev } : o));
      Alert.alert('Failed to update order');
    }
  };

  const handleFlag = async (id: number) => {
    Alert.prompt(
      'Flag order',
      'Describe the issue:',
      async (note) => {
        if (!note) return;
        await staffFlagOrder(pin, id, note);
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelled' } : o));
      },
      'plain-text',
    );
  };

  const filteredOrders = filter === 'ALL'
    ? orders
    : orders.filter(o => o.status === filter.toLowerCase());

  // Group by time slot
  const grouped: Record<string, any[]> = {};
  for (const o of filteredOrders) {
    const key = o.slot_time ?? 'unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(o);
  }
  const slotKeys = Object.keys(grouped).sort();

  const totalOrders = orders.length;
  const readyCount = orders.filter(o => o.status === 'ready').length;
  const collectedCount = orders.filter(o => o.status === 'collected').length;

  const statusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#F59E0B';
      case 'preparing': return '#3B82F6';
      case 'ready': return '#10B981';
      case 'collected': return c.muted;
      case 'cancelled': return '#EF4444';
      default: return c.muted;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>STAFF</Text>
        {authenticated && (
          <View style={styles.datePicker}>
            <TouchableOpacity onPress={() => setDate(d => offsetDate(d, -1))} activeOpacity={0.7} style={styles.dateArrow}>
              <Text style={[styles.dateArrowText, { color: c.accent }]}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.dateLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>{date}</Text>
            <TouchableOpacity onPress={() => setDate(d => offsetDate(d, 1))} activeOpacity={0.7} style={styles.dateArrow}>
              <Text style={[styles.dateArrowText, { color: c.accent }]}>›</Text>
            </TouchableOpacity>
          </View>
        )}
        {!authenticated && <View style={styles.headerSpacer} />}
      </View>

      {!authenticated ? (
        /* ── PIN screen ── */
        <View style={styles.pinScreen}>
          <Text style={[styles.pinTitle, { color: c.text, fontFamily: fonts.playfair }]}>Staff PIN</Text>
          <TextInput
            style={[styles.pinInput, { color: c.text, borderColor: c.border, fontFamily: fonts.dmMono }]}
            value={pinInput}
            onChangeText={setPinInput}
            placeholder="Enter PIN"
            placeholderTextColor={c.muted}
            secureTextEntry
            keyboardType="number-pad"
            onSubmitEditing={handlePinSubmit}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.pinBtn, { backgroundColor: c.accent }]}
            onPress={handlePinSubmit}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.pinBtnText}>ENTER →</Text>
            }
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Filter pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterContent}
          >
            {STATUS_FILTERS.map(f => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterPill,
                  { borderColor: c.border },
                  filter === f && { backgroundColor: c.accent, borderColor: c.accent },
                ]}
                onPress={() => setFilter(f)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.filterPillText,
                  { color: filter === f ? '#fff' : c.muted, fontFamily: fonts.dmMono },
                ]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Orders list */}
          {loading ? (
            <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
          ) : (
            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
            >
              {slotKeys.length === 0 ? (
                <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>
                  No orders for this filter.
                </Text>
              ) : (
                slotKeys.map(slot => (
                  <View key={slot} style={styles.slotGroup}>
                    <Text style={[styles.slotHeader, { color: c.muted, borderBottomColor: c.border, fontFamily: fonts.dmMono }]}>
                      ── {slot} ──
                    </Text>
                    {grouped[slot].map(order => (
                      <View key={order.id} style={[styles.orderCard, { borderColor: c.border, backgroundColor: c.panelBg }]}>
                        <View style={styles.orderTop}>
                          <Text style={[styles.orderName, { color: c.text, fontFamily: fonts.playfair }]}>
                            {order.variety_name}
                          </Text>
                          <View style={[styles.statusPill, { backgroundColor: statusColor(order.status) + '22', borderColor: statusColor(order.status) }]}>
                            <Text style={[styles.statusText, { color: statusColor(order.status), fontFamily: fonts.dmMono }]}>
                              {order.status}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.orderMeta, { color: c.muted, fontFamily: fonts.dmMono }]}>
                          qty {order.quantity}  ·  {order.chocolate !== 'none' ? order.chocolate : 'no choc'}  ·  {order.finish}
                        </Text>
                        <Text style={[styles.orderEmail, { color: c.muted, fontFamily: fonts.dmSans }]} numberOfLines={1}>
                          {order.customer_email}
                        </Text>
                        {order.is_gift && (
                          <Text style={[styles.giftBadge, { color: c.accent, fontFamily: fonts.dmMono }]}>gift</Text>
                        )}
                        <View style={styles.orderActions}>
                          {order.status === 'paid' && (
                            <TouchableOpacity
                              style={[styles.actionBtn, { borderColor: '#3B82F6' }]}
                              onPress={() => markPrepare(order.id)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.actionBtnText, { color: '#3B82F6', fontFamily: fonts.dmMono }]}>PREPARE</Text>
                            </TouchableOpacity>
                          )}
                          {order.status === 'preparing' && (
                            <TouchableOpacity
                              style={[styles.actionBtn, { borderColor: '#10B981' }]}
                              onPress={() => markReady(order.id)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.actionBtnText, { color: '#10B981', fontFamily: fonts.dmMono }]}>MARK READY</Text>
                            </TouchableOpacity>
                          )}
                          {order.status === 'ready' && (
                            <Text style={[styles.waitingText, { color: c.muted, fontFamily: fonts.dmMono }]}>waiting for pickup</Text>
                          )}
                          {(order.status === 'paid' || order.status === 'preparing') && (
                            <TouchableOpacity
                              style={[styles.actionBtn, { borderColor: '#EF4444' }]}
                              onPress={() => handleFlag(order.id)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.actionBtnText, { color: '#EF4444', fontFamily: fonts.dmMono }]}>FLAG</Text>
                            </TouchableOpacity>
                          )}
                          {(order.status === 'paid' || order.status === 'preparing' || order.status === 'ready') && order.nfc_token && (
                            <TouchableOpacity
                              style={[styles.actionBtn, { borderColor: c.accent }]}
                              onPress={() => showPanel('nfc-write', {
                                nfc_token: order.nfc_token,
                                variety_name: order.variety_name,
                                customer_email: order.customer_email,
                              })}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.actionBtnText, { color: c.accent, fontFamily: fonts.dmMono }]}>TAG BOX</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {/* Footer summary */}
          <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom + 8 }]}>
            <Text style={[styles.footerText, { color: c.muted, fontFamily: fonts.dmMono }]}>
              {totalOrders} orders  ·  {readyCount} ready  ·  {collectedCount} collected
            </Text>
            <TouchableOpacity
              style={[styles.genericTagBtn, { borderColor: c.accent }]}
              onPress={() => showPanel('nfc-write', { nfc_token: 'fraise-thankyou' })}
              activeOpacity={0.7}
            >
              <Text style={[styles.genericTagBtnText, { color: c.accent, fontFamily: fonts.dmMono }]}>WRITE GENERIC TAG</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 15, letterSpacing: 2 },
  headerSpacer: { width: 28 },
  datePicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateArrow: { padding: 6 },
  dateArrowText: { fontSize: 22, lineHeight: 26 },
  dateLabel: { fontSize: 11, letterSpacing: 0.5 },

  // PIN screen
  pinScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg },
  pinTitle: { fontSize: 22, marginBottom: 24 },
  pinInput: {
    width: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 18,
    textAlign: 'center', letterSpacing: 4, marginBottom: 16,
  },
  pinBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8, minWidth: 160, alignItems: 'center' },
  pinBtnText: { color: '#fff', fontSize: 13, letterSpacing: 1.5, fontWeight: '600' },

  // Filters
  filterRow: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  filterContent: { flexDirection: 'row', paddingHorizontal: SPACING.md, paddingVertical: 10, gap: 8 },
  filterPill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  filterPillText: { fontSize: 10, letterSpacing: 1 },

  // Orders
  scroll: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 13, fontStyle: 'italic' },
  slotGroup: { marginTop: 8 },
  slotHeader: {
    fontSize: 11, letterSpacing: 1.5, paddingHorizontal: SPACING.md,
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  orderCard: {
    marginHorizontal: SPACING.md, marginTop: 10, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8, padding: 12, gap: 4,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderName: { fontSize: 16, flex: 1 },
  statusPill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 9, letterSpacing: 1 },
  orderMeta: { fontSize: 10, letterSpacing: 0.3 },
  orderEmail: { fontSize: 11, opacity: 0.7 },
  giftBadge: { fontSize: 9, letterSpacing: 1.5 },
  orderActions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  actionBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  actionBtnText: { fontSize: 10, letterSpacing: 1 },
  waitingText: { fontSize: 10, letterSpacing: 0.5, fontStyle: 'italic', paddingVertical: 6 },

  // Footer
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    gap: 10,
  },
  footerText: { fontSize: 11, letterSpacing: 0.5 },
  genericTagBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 8 },
  genericTagBtnText: { fontSize: 10, letterSpacing: 1.5 },
});
