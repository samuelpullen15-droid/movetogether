/**
 * Responsive Scaling Utilities
 *
 * Provides screen-width based scaling for font sizes and other dimensions.
 * Uses iPhone 14/15 (390pt width) as the design baseline.
 *
 * On smaller screens (iPhone SE: 320pt), values scale down proportionally.
 * On larger screens (iPhone Pro Max: 428pt), values scale up proportionally.
 */

import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BASE_WIDTH = 390; // iPhone 14/15 design baseline

/**
 * Scale a value based on screen width
 * @param size - The base size to scale
 * @returns Scaled size proportional to screen width
 */
export function scale(size: number): number {
  return (SCREEN_WIDTH / BASE_WIDTH) * size;
}

/**
 * Scale font size with a minimum floor to prevent text from becoming too small
 * @param size - The base font size in pixels
 * @param minScale - Minimum scale factor (default 0.85 = 85% of original)
 * @returns Scaled and rounded font size
 */
export function scaledFontSize(size: number, minScale = 0.85): number {
  const scaleFactor = Math.max(SCREEN_WIDTH / BASE_WIDTH, minScale);
  return Math.round(PixelRatio.roundToNearestPixel(size * scaleFactor));
}

/**
 * Pre-scaled font sizes matching Tailwind config values
 * These are calculated once at app startup for performance
 */
export const fontSize = {
  xs: scaledFontSize(10),
  sm: scaledFontSize(12),
  base: scaledFontSize(14),
  lg: scaledFontSize(18),
  xl: scaledFontSize(20),
  '2xl': scaledFontSize(24),
  '3xl': scaledFontSize(32),
  '4xl': scaledFontSize(40),
  '5xl': scaledFontSize(48),
  '6xl': scaledFontSize(56),
  '7xl': scaledFontSize(64),
  '8xl': scaledFontSize(72),
  '9xl': scaledFontSize(80),
} as const;

export type FontSizeKey = keyof typeof fontSize;

/**
 * Get the current scale factor for debugging/display purposes
 */
export function getScaleFactor(): number {
  return SCREEN_WIDTH / BASE_WIDTH;
}

/**
 * Get screen dimensions for reference
 */
export function getScreenInfo() {
  return {
    width: SCREEN_WIDTH,
    baseWidth: BASE_WIDTH,
    scaleFactor: getScaleFactor(),
  };
}
