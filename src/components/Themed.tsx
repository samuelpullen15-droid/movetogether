/**
 * Learn more about Light and Dark modes:
 * https://docs.expo.io/guides/color-schemes/
 */

import { Text as DefaultText, View as DefaultView, TextStyle } from 'react-native';

export type TextProps = DefaultText['props'] & { className?: string };
export type ViewProps = DefaultView['props'] & { className?: string };

export function Text(props: TextProps) {
  const { className, style, ...otherProps } = props;

  // Extract font weight from className to use correct font variant
  // Inter has: Regular (400), Medium (500), SemiBold (600), Bold (700)
  const isBold = className?.includes('font-bold');
  const isSemiBold = className?.includes('font-semibold');
  const isMedium = className?.includes('font-medium');

  const fontFamily = isBold
    ? 'Inter_700Bold'
    : isSemiBold
      ? 'Inter_600SemiBold'
      : isMedium
        ? 'Inter_500Medium'
        : 'Inter_400Regular';

  return (
    <DefaultText
      className={`text-black dark:text-white ${className ?? ''}`}
      style={[{ fontFamily } as TextStyle, style]}
      {...otherProps}
    />
  );
}

export function View(props: ViewProps) {
  const { className, ...otherProps } = props;
  return (
    <DefaultView
      className={`bg-white dark:bg-black ${className ?? ''}`}
      {...otherProps}
    />
  );
}
