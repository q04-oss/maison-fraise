import React from 'react';
import { StatusBar } from 'expo-status-bar';
import MapScreen from '../screens/MapScreen';
import { PanelProvider } from '../context/PanelContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootNavigator() {
  return (
    <ThemeProvider>
      <PanelProvider>
        <AppStatusBar />
        <MapScreen />
      </PanelProvider>
    </ThemeProvider>
  );
}
