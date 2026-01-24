import { Text as RNText, TextProps, StyleSheet } from 'react-native';

export function Text({ style, className, ...props }: TextProps & { className?: string }) {
  // Extract font weight from className to use correct font variant
  // Google Sans has: Regular (400), Medium (500), SemiBold (600), Bold (700)
  const isBold = className?.includes('font-bold');
  const isSemiBold = className?.includes('font-semibold');
  const isMedium = className?.includes('font-medium');

  const fontFamily = isBold
    ? 'StackSansText_700Bold'
    : isSemiBold
      ? 'StackSansText_600SemiBold'
      : isMedium
        ? 'StackSansText_500Medium'
        : 'StackSansText_400Regular';

  return (
    <RNText
      {...props}
      className={className}
      style={[{ fontFamily }, style]}
    />
  );
}

export default Text;
