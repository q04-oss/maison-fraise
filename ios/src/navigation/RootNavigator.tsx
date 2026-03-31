import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from '../types';
import MapScreen from '../screens/MapScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { PanelProvider } from '../context/PanelContext';
import { ThemeProvider } from '../context/ThemeContext';
import { useTheme } from '../context/ThemeContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootNavigator() {
  return (
    <ThemeProvider>
      <PanelProvider>
        <AppStatusBar />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={MapScreen} />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ presentation: 'modal' }}
          />
        </Stack.Navigator>
      </PanelProvider>
    </ThemeProvider>
  );
}
