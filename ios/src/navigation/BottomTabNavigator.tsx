import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { RootTabParamList } from '../types';
import { COLORS } from '../theme';
import BoardScreen from '../screens/BoardScreen';
import WhereScreen from '../screens/WhereScreen';
import EventsScreen from '../screens/EventsScreen';
import OrderHistoryScreen from '../screens/OrderHistoryScreen';
import OrderNavigator from './OrderNavigator';

const Tab = createBottomTabNavigator<RootTabParamList>();

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const labels: Record<string, string> = {
    Board: 'BOARD',
    Where: 'WHERE',
    Events: 'EVENTS',
    Order: 'ORDER',
    Orders: 'ORDERS',
  };

  return (
    <View
      style={[
        styles.tabBar,
        { paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = labels[route.name] ?? route.name.toUpperCase();

        const onPress = () => {
          if (!focused) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tabItem}
            onPress={onPress}
            activeOpacity={0.7}
          >
            {focused && <View style={styles.activeDot} />}
            <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Board" component={BoardScreen} />
      <Tab.Screen name="Where" component={WhereScreen} />
      <Tab.Screen name="Events" component={EventsScreen} />
      <Tab.Screen name="Orders" component={OrderHistoryScreen} />
      <Tab.Screen name="Order" component={OrderNavigator} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.cream,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textDark,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabLabelActive: {
    color: COLORS.textDark,
  },
});
