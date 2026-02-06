import { View, ViewProps, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/lib/useThemeColors';

type CardVariant = 'elevated' | 'surface' | 'flat';

interface CardProps extends ViewProps {
  variant?: CardVariant;
  /** Horizontal gradient strip at the top of the card */
  accentGradient?: readonly [string, string];
  /** Override border radius (default: 20 for elevated/surface, 16 for flat) */
  radius?: number;
  /** Override padding (default: 24 for elevated, 16 for surface/flat) */
  padding?: number;
  /** Disable padding entirely (for cards that manage their own inner padding) */
  noPadding?: boolean;
}

/**
 * Unified card component with three visual tiers:
 *
 * - `elevated` — Glassmorphic BlurView + shadow + border (hero content)
 * - `surface`  — Subtle gradient background + thin border (default, list cards)
 * - `flat`     — Simple background color (inline elements within other cards)
 */
export function Card({
  variant = 'surface',
  accentGradient,
  radius,
  padding,
  noPadding = false,
  style,
  children,
  ...props
}: CardProps) {
  const colors = useThemeColors();

  if (variant === 'elevated') {
    return (
      <ElevatedCard
        colors={colors}
        accentGradient={accentGradient}
        radius={radius}
        padding={padding}
        noPadding={noPadding}
        style={style}
        {...props}
      >
        {children}
      </ElevatedCard>
    );
  }

  if (variant === 'flat') {
    const r = radius ?? 16;
    const p = noPadding ? 0 : (padding ?? 16);

    return (
      <View
        style={[
          {
            borderRadius: r,
            padding: p,
            backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          },
          style as ViewStyle,
        ]}
        {...props}
      >
        {children}
      </View>
    );
  }

  // Surface (default)
  const r = radius ?? 20;
  const p = noPadding ? 0 : (padding ?? 16);

  return (
    <LinearGradient
      colors={colors.cardGradient}
      style={[
        {
          borderRadius: r,
          padding: p,
          borderWidth: 1,
          borderColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        },
        style as ViewStyle,
      ]}
      {...props}
    >
      {accentGradient && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', borderTopLeftRadius: r, borderTopRightRadius: r }}>
          <LinearGradient
            colors={[accentGradient[0], accentGradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 3 }}
          />
        </View>
      )}
      {children}
    </LinearGradient>
  );
}

function ElevatedCard({
  colors,
  accentGradient,
  radius,
  padding,
  noPadding,
  style,
  children,
  ...props
}: CardProps & { colors: ReturnType<typeof useThemeColors> }) {
  const r = radius ?? 20;
  const p = noPadding ? 0 : (padding ?? 24);

  return (
    <BlurView
      intensity={colors.blurIntensity}
      tint={colors.blurTint}
      style={[
        {
          borderRadius: r,
          overflow: 'hidden',
          backgroundColor: colors.cardElevatedBg,
          borderWidth: colors.isDark ? 0 : 1,
          borderColor: colors.cardElevatedBorder,
          padding: p,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 3,
        },
        style as ViewStyle,
      ]}
      {...props}
    >
      {accentGradient && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <LinearGradient
            colors={[accentGradient[0], accentGradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 4 }}
          />
        </View>
      )}
      {children}
    </BlurView>
  );
}

export default Card;
