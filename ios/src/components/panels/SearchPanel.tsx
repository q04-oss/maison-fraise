import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { searchAll } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function SearchPanel() {
  const { goBack, showPanel, setPanelData, setActiveLocation } = usePanel();
  const c = useColors();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [popups, setPopups] = useState<any[]>([]);
  const [varieties, setVarieties] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setUsers([]); setPopups([]); setVarieties([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    searchAll(q.trim())
      .then(res => {
        setUsers(res.users ?? []);
        setPopups(res.popups ?? []);
        setVarieties(res.varieties ?? []);
      })
      .catch(() => { setUsers([]); setPopups([]); setVarieties([]); })
      .finally(() => setLoading(false));
  }, []);

  const handleSelectUser = (user: any) => {
    setPanelData({ userId: user.id });
    showPanel('user-profile');
  };

  const handleSelectPopup = (popup: any) => {
    setActiveLocation({ ...popup, type: 'popup' });
    showPanel('popup-detail');
  };

  const hasResults = users.length > 0 || popups.length > 0 || varieties.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Search</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.searchRow, { borderBottomColor: c.border }]}>
        <TextInput
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          placeholder="Search people, popups, varieties…"
          placeholderTextColor={c.muted}
          value={query}
          onChangeText={handleSearch}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : searched && !hasResults ? (
        <Text style={[styles.empty, { color: c.muted }]}>No results.</Text>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {users.length > 0 && (
            <View>
              <Text style={[styles.sectionHeader, { color: c.muted }]}>PEOPLE</Text>
              {users.map(item => (
                <TouchableOpacity
                  key={String(item.id)}
                  style={[styles.row, { borderBottomColor: c.border }]}
                  onPress={() => handleSelectUser(item)}
                  activeOpacity={0.75}
                >
                  <View style={styles.rowMain}>
                    <Text style={[styles.name, { color: c.text }]}>{item.display_name}</Text>
                    {item.is_dj && (
                      <Text style={[styles.tag, { color: c.muted }]}>DJ</Text>
                    )}
                  </View>
                  <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {popups.length > 0 && (
            <View>
              <Text style={[styles.sectionHeader, { color: c.muted }]}>POPUPS</Text>
              {popups.map(item => (
                <TouchableOpacity
                  key={String(item.id)}
                  style={[styles.row, { borderBottomColor: c.border }]}
                  onPress={() => handleSelectPopup(item)}
                  activeOpacity={0.75}
                >
                  <View style={styles.rowMain}>
                    <Text style={[styles.popupName, { color: c.text }]}>{item.name}</Text>
                    {!!item.neighbourhood && (
                      <Text style={[styles.popupNeighbourhood, { color: c.muted }]}>{item.neighbourhood}</Text>
                    )}
                  </View>
                  <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {varieties.length > 0 && (
            <View>
              <Text style={[styles.sectionHeader, { color: c.muted }]}>VARIETIES</Text>
              {varieties.map(item => (
                <View
                  key={String(item.id)}
                  style={[styles.row, { borderBottomColor: c.border }]}
                >
                  <View style={styles.rowMain}>
                    <Text style={[styles.name, { color: c.text }]}>{item.name}</Text>
                    {item.price_cents != null && (
                      <Text style={[styles.price, { color: c.muted }]}>
                        CA${(item.price_cents / 100).toFixed(2)}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  searchRow: { paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: fonts.dmSans },
  empty: { textAlign: 'center', marginTop: 60, fontFamily: fonts.dmSans, fontStyle: 'italic' },

  sectionHeader: {
    fontSize: 9,
    fontFamily: fonts.dmMono,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: SPACING.md,
    paddingTop: 18,
    paddingBottom: 6,
  },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontFamily: fonts.playfair },
  tag: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  chevron: { fontSize: 22 },

  popupName: { fontSize: 16, fontFamily: fonts.playfair },
  popupNeighbourhood: { fontSize: 11, fontFamily: fonts.dmMono },

  price: { fontSize: 12, fontFamily: fonts.dmMono },
});
