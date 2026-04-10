import React, { createContext, useContext } from 'react';

interface ThemeContextType {
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({ isDark: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={{ isDark: false }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
