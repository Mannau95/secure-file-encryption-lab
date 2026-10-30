import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

export const ThemeContext = createContext({
  theme: 'system',
  effectiveTheme: 'light',
  setTheme: () => {},
  reduceMotion: false,
  setReduceMotion: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem('sfel_theme_preference');
      return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    } catch {
      return 'system';
    }
  });

  const [reduceMotion, setReduceMotionState] = useState(() => {
    try {
      const saved = localStorage.getItem('sfel_reduce_motion');
      if (saved !== null) return saved === 'true';
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });

  const [systemIsDark, setSystemIsDark] = useState(() => {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  // Listen to system color scheme changes
  useEffect(() => {
    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => setSystemIsDark(e.matches);

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(handler);
        return () => mediaQuery.removeListener(handler);
      }
    } catch (e) {
      console.warn('System color scheme listener not supported', e);
    }
  }, []);

  // Compute effective theme (light or dark)
  const effectiveTheme = useMemo(() => {
    if (theme === 'system') {
      return systemIsDark ? 'dark' : 'light';
    }
    return theme;
  }, [theme, systemIsDark]);

  // Apply data-theme to root element
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', effectiveTheme);
  }, [effectiveTheme]);

  // Apply reduce-motion attribute to root element
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-reduce-motion', reduceMotion ? 'true' : 'false');
  }, [reduceMotion]);

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('sfel_theme_preference', newTheme);
    } catch (e) {
      console.warn('Failed to persist theme preference', e);
    }
  };

  const setReduceMotion = (val) => {
    setReduceMotionState(val);
    try {
      localStorage.setItem('sfel_reduce_motion', String(val));
    } catch (e) {
      console.warn('Failed to persist motion preference', e);
    }
  };

  const value = useMemo(
    () => ({
      theme,
      effectiveTheme,
      setTheme,
      reduceMotion,
      setReduceMotion,
    }),
    [theme, effectiveTheme, reduceMotion]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}
