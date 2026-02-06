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
    cardGradient: isDark ? ['#1C1C1E', '#0D0D0D'] as const : ['#FEFEFE', '#F9F9F9'] as const,
    heroGradient: isDark ? ['#1C1C1E', '#000000'] as const : ['#F5F5F7', '#FFFFFF'] as const,

    // Elevated card (glassmorphism)
    cardElevatedBg: isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.3)',
    cardElevatedBorder: isDark ? 'transparent' : 'rgba(255, 255, 255, 0.8)',
    blurIntensity: isDark ? 30 : 80,
    blurTint: (isDark ? 'dark' : 'light') as 'dark' | 'light',

    // Ring colors (same in both modes)
    ringMove: '#FA114F',
    ringExercise: '#92E82A',
    ringStand: '#00D4FF',

    // Accent
    accent: '#FA114F',
  };
}
