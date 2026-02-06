import { useEffect, useState } from 'react';
import { TextStyle } from 'react-native';
import {
  useSharedValue,
  withTiming,
  Easing,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { DisplayText } from '@/components/Text';

interface AnimatedNumberProps {
  /** Target value to animate towards */
  value: number;
  /** Duration of the count-up in ms (default 800) */
  duration?: number;
  /** Format function — receives the current animated value, returns display string */
  format?: (n: number) => string;
  className?: string;
  style?: TextStyle;
}

/**
 * Smoothly counts up to the target value with an ease-out curve.
 * Uses the display font (Outfit) for visual punch.
 */
export function AnimatedNumber({
  value,
  duration = 800,
  format,
  className,
  style,
}: AnimatedNumberProps) {
  const animValue = useSharedValue(0);
  const [display, setDisplay] = useState(format ? format(0) : '0');

  // Update display on JS thread — format must not run on UI thread
  const updateDisplay = (current: number) => {
    setDisplay(format ? format(current) : current.toLocaleString());
  };

  useEffect(() => {
    animValue.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration]);

  useAnimatedReaction(
    () => Math.round(animValue.value),
    (current) => {
      runOnJS(updateDisplay)(current);
    },
  );

  return (
    <DisplayText className={className} style={style}>
      {display}
    </DisplayText>
  );
}

export default AnimatedNumber;
