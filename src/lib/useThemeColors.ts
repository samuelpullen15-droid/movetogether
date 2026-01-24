import { useColorScheme } from 'react-native';

/**
 * Hook to get theme-aware colors for components
 * Returns appropriate colors based on current color scheme
 */
export function useThemeColors() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return {
    isDark,
    // Backgrounds
    bg: isDark ? '#000000' : '#EBEBF0',
    bgSecondary: isDark ? '#0D0D0D' : '#F5F5F7',

    // Cards
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    cardSecondary: isDark ? '#1A1A1C' : '#F5F5F7',

    // Text
    text: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#9CA3AF' : '#6B7280',

    // Borders
    border: isDark ? '#374151' : '#E5E7EB',

    // Gradients for cards
    cardGradient: isDark ? ['#1C1C1E', '#0D0D0D'] : ['#FEFEFE', '#F9F9F9'],
    heroGradient: isDark ? ['#1C1C1E', '#000000'] : ['#F5F5F7', '#FFFFFF'],

    // Ring colors (same in both modes)
    ringMove: '#FA114F',
    ringExercise: '#92E82A',
    ringStand: '#00D4FF',

    // Accent
    accent: '#FA114F',
  };
}
