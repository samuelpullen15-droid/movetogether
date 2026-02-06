import { Easing, FadeIn, FadeInDown, FadeInUp, FadeInRight } from 'react-native-reanimated';

/**
 * Centralized animation presets for consistent, varied entrance animations.
 * Replaces the uniform FadeInDown pattern used everywhere.
 *
 * Springs are reserved for hero elements only. Everything else uses
 * smooth easing to avoid visible bounce/jiggle on dense screens.
 */

const smoothEasing = Easing.out(Easing.cubic);

/** Hero content — scale-up with spring (activity rings, featured cards) */
export const heroEnter = FadeIn.duration(500).springify().damping(15);

/** Section headers — horizontal slide matching text direction */
export const sectionEnter = FadeInRight.duration(350).easing(smoothEasing);

/** Cards — subtle fade + slight vertical lift, staggered */
export function cardEnter(index: number) {
  return FadeInUp.duration(400).delay(index * 80).easing(smoothEasing);
}

/** List items — quick upward entrance, tighter stagger */
export function listItemEnter(index: number) {
  return FadeInUp.duration(300).delay(index * 50).easing(smoothEasing);
}

/** Stats / numbers — gentle fade for data reveals */
export function statEnter(delay = 200) {
  return FadeIn.duration(600).delay(delay);
}

/** Horizontal scroll items — enter from the direction they scroll */
export function horizontalEnter(index: number) {
  return FadeInRight.duration(350).delay(index * 80).easing(smoothEasing);
}

/** Generic staggered fade — fallback for anything else */
export function staggerFade(index: number, baseDelay = 0) {
  return FadeInDown.duration(400).delay(baseDelay + index * 100).easing(smoothEasing);
}
