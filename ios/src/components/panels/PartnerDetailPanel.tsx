import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Linking, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { PARTNER_MENUS, PartnerMenu, MenuSection, MenuItem } from '../../data/seed';

function formatContact(contact: string): { label: string; url: string } | null {
  const trimmed = contact.trim();
  if (trimmed.includes('@') && !trimmed.startsWith('@')) {
    return { label: trimmed, url: `mailto:${trimmed}` };
  }
  if (/^\+?[\d\s\-()]{7,}$/.test(trimmed)) {
    return { label: trimmed, url: `tel:${trimmed.replace(/\s/g, '')}` };
  }
  return null;
}

function MenuItemRow({ item, c }: { item: MenuItem; c: any }) {
  return (
    <View style={styles.menuItem}>
      <View style={styles.menuItemTop}>
        <Text style={[styles.menuItemName, { color: c.text }]}>{item.item}</Text>
        {!!item.price && (
          <Text style={[styles.menuItemPrice, { color: c.text }]}>{item.price}</Text>
        )}
      </View>
      {!!item.description && (
        <Text style={[styles.menuItemDesc, { color: c.muted }]}>{item.description}</Text>
      )}
      {item.tags && item.tags.length > 0 && (
        <View style={styles.menuItemTags}>
          {item.tags.map(tag => (
            <Text key={tag} style={[styles.menuTag, { color: c.muted, borderColor: c.border }]}>{tag}</Text>
          ))}
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
    </View>
  );
}

function MenuSectionBlock({ section, c }: { section: MenuSection; c: any }) {
  return (
    <View style={styles.menuSection}>
      <View style={styles.menuSectionHeader}>
        <Text style={[styles.menuSectionTitle, { color: c.text }]}>{section.section}</Text>
        {!!section.note && (
          <Text style={[styles.menuSectionNote, { color: c.muted }]}>{section.note}</Text>
        )}
      </View>
      {section.items.map((item, i) => (
        <MenuItemRow key={i} item={item} c={c} />
      ))}
    </View>
  );
}

export default function PartnerDetailPanel() {
  const { goBack, panelData, showPanel } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const biz = panelData?.partnerBusiness;
  if (!biz) return null;

  const menuKey = Object.keys(PARTNER_MENUS).find(k => k.toLowerCase() === biz.name?.toLowerCase()) ?? biz.name;
  const menus: PartnerMenu[] = PARTNER_MENUS[menuKey] ?? [];
  const hasMenu = menus.length > 0;
  const [activeTab, setActiveTab] = useState(0);

  const contactInfo = biz.contact ? formatContact(biz.contact) : null;
  const contactEmail: string | null = (biz.contact && biz.contact.includes('@') && !biz.contact.startsWith('@'))
    ? biz.contact.trim()
    : null;

  const handleOpenMaps = () => {
    if (!biz.lat || !biz.lng) return;
    const appleUrl = `maps://maps.apple.com/?daddr=${biz.lat},${biz.lng}&dirflg=d`;
    const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${biz.lat},${biz.lng}`;
    Linking.canOpenURL(appleUrl)
      .then(supported => Linking.openURL(supported ? appleUrl : fallbackUrl))
      .catch(() => Alert.alert('Could not open maps'));
  };

  const handleContactPress = () => {
    if (!contactInfo) return;
    Linking.openURL(contactInfo.url);
  };

  const handleSendSticker = () => {
    if (!contactEmail) return;
    showPanel('gift', { recipientEmail: contactEmail, businessName: biz.name, isOutreach: true });
  };

  const handleSupport = () => {
    showPanel('donate', { businessId: biz.id, businessName: biz.name });
  };

  const activeMenu = menus[activeTab];

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>

      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{biz.name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Menu tabs */}
      {hasMenu && menus.length > 1 && (
        <View style={[styles.tabBar, { borderBottomColor: c.border }]}>
          {menus.map((m, i) => (
            <TouchableOpacity
              key={m.label}
              style={styles.tab}
              onPress={() => setActiveTab(i)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, { color: activeTab === i ? c.text : c.muted }]}>
                {m.label}
              </Text>
              {activeTab === i && <View style={[styles.tabUnderline, { backgroundColor: c.accent }]} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>

        {/* Info block — only show if no menu */}
        {!hasMenu && (
          <View style={[styles.infoBlock, { borderBottomColor: c.border }]}>
            {!!biz.description && (
              <Text style={[styles.description, { color: c.text }]}>{biz.description}</Text>
            )}
            {!!biz.neighbourhood && (
              <Text style={[styles.chip, { color: c.muted, borderColor: c.border }]}>{biz.neighbourhood}</Text>
            )}
            {!!biz.hours && (
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: c.muted }]}>HOURS</Text>
                <Text style={[styles.fieldValue, { color: c.text }]}>{biz.hours}</Text>
              </View>
            )}
            {!!biz.address && (
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: c.muted }]}>ADDRESS</Text>
                <Text style={[styles.fieldValue, { color: c.text }]}>{biz.address}</Text>
              </View>
            )}
          </View>
        )}

        {/* Info strip when menu is present */}
        {hasMenu && (
          <View style={[styles.infoStrip, { borderBottomColor: c.border }]}>
            {!!biz.neighbourhood && (
              <Text style={[styles.stripText, { color: c.muted }]}>{biz.neighbourhood}</Text>
            )}
            {!!biz.hours && (
              <Text style={[styles.stripText, { color: c.muted }]}>{biz.hours}</Text>
            )}
            {!!biz.address && (
              <Text style={[styles.stripText, { color: c.muted }]}>{biz.address}</Text>
            )}
          </View>
        )}

        {/* Menu content */}
        {hasMenu && activeMenu && activeMenu.sections.map((section, i) => (
          <MenuSectionBlock key={i} section={section} c={c} />
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={[styles.actionBar, { borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: c.accent }]}
            onPress={handleOpenMaps}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionBtnText, { color: '#fff' }]}>Directions</Text>
          </TouchableOpacity>

          {contactInfo && (
            <TouchableOpacity
              style={[styles.actionBtn, { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}
              onPress={handleContactPress}
              activeOpacity={0.8}
            >
              <Text style={[styles.actionBtnText, { color: c.text }]}>
                {contactInfo.url.startsWith('mailto') ? 'Email' : 'Call'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  body: { flex: 1 },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md,
  },
  tab: {
    marginRight: SPACING.md,
    paddingVertical: 12,
    position: 'relative',
  },
  tabText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    borderRadius: 1,
  },

  infoBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  infoStrip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  stripText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },

  description: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22, fontStyle: 'italic' },
  chip: {
    alignSelf: 'flex-start',
    fontSize: 11, fontFamily: fonts.dmMono,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  fieldRow: { gap: 4 },
  fieldLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  fieldValue: { fontSize: 14, fontFamily: fonts.dmSans },

  menuSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: SPACING.sm,
  },
  menuSectionHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: 8,
    gap: 2,
  },
  menuSectionTitle: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  menuSectionNote: { fontSize: 10, fontFamily: fonts.dmSans, fontStyle: 'italic' },

  menuItem: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  menuItemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  menuItemName: { flex: 1, fontSize: 15, fontFamily: fonts.playfair },
  menuItemPrice: { fontSize: 12, fontFamily: fonts.dmMono },
  menuItemDesc: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 18 },
  menuItemTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  menuTag: {
    fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 0.5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  addOns: { marginTop: 4, gap: 2 },
  addOnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  addOnItem: { fontSize: 11, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  addOnPrice: { fontSize: 11, fontFamily: fonts.dmMono },

  actionRow: { flexDirection: 'row', gap: 10 },
  actionBar: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: 14, fontFamily: fonts.dmSans, fontWeight: '600' },
});
