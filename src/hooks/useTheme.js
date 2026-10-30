import { useThemeContext } from '../contexts/ThemeContext';

/**
 * Hook for consuming theme settings and controls
 */
export function useTheme() {
  return useThemeContext();
}

export default useTheme;
