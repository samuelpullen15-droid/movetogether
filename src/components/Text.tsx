import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { fontSize, FontSizeKey } from '@/lib/responsive';

// Map Tailwind text size classes to fontSize keys
const TEXT_SIZE_MAP: Record<string, FontSizeKey> = {
  'text-xs': 'xs',
  'text-sm': 'sm',
  'text-base': 'base',
  'text-lg': 'lg',
  'text-xl': 'xl',
  'text-2xl': '2xl',
  'text-3xl': '3xl',
  'text-4xl': '4xl',
  'text-5xl': '5xl',
  'text-6xl': '6xl',
  'text-7xl': '7xl',
  'text-8xl': '8xl',
  'text-9xl': '9xl',
};

type TextVariant = 'body' | 'display';

interface CustomTextProps extends TextProps {
  className?: string;
  variant?: TextVariant;
}

function getFontFamily(className: string | undefined, variant: TextVariant): string {
  const isBold = className?.includes('font-bold') || className?.includes('font-extrabold') || className?.includes('font-black');
  const isSemiBold = className?.includes('font-semibold');
  const isMedium = className?.includes('font-medium');

  if (variant === 'display') {
    // Outfit display font: Medium (500), SemiBold (600), Bold (700), ExtraBold (800)
    return isBold
      ? 'Outfit_700Bold'
      : isSemiBold
        ? 'Outfit_600SemiBold'
        : isMedium
          ? 'Outfit_500Medium'
          : 'Outfit_700Bold'; // Default display to bold for impact
  }

  // StackSansText body font: Regular (400), Medium (500), SemiBold (600), Bold (700)
  return isBold
    ? 'StackSansText_700Bold'
    : isSemiBold
      ? 'StackSansText_600SemiBold'
      : isMedium
        ? 'StackSansText_500Medium'
        : 'StackSansText_400Regular';
}

export function Text({ style, className, variant = 'body', ...props }: CustomTextProps) {
  const fontFamily = getFontFamily(className, variant);

  // Extract text size from className and apply responsive scaling
  let scaledFontSize: number | undefined;
  if (className) {
    for (const [textClass, sizeKey] of Object.entries(TEXT_SIZE_MAP)) {
      if (className.includes(textClass)) {
        scaledFontSize = fontSize[sizeKey];
        break;
      }
    }
  }

  // Build combined style with fontFamily and optional scaled fontSize
  const combinedStyle: TextStyle = { fontFamily };
  if (scaledFontSize !== undefined) {
    combinedStyle.fontSize = scaledFontSize;
  }

  return (
    <RNText
      {...props}
      className={className}
      style={[combinedStyle, style]}
    />
  );
}

/** Convenience wrapper — renders Text with variant="display" */
export function DisplayText({ ...props }: Omit<CustomTextProps, 'variant'>) {
  return <Text {...props} variant="display" />;
}

export default Text;
