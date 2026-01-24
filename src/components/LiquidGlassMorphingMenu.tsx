import { Platform, requireNativeComponent, ViewStyle } from 'react-native';

interface NativeLiquidGlassMorphingMenuProps {
  onMenuAction: (event: { nativeEvent: { action: string } }) => void;
  isCreator: boolean;
  buttonSize: number;
  iconSize: number;
  style?: ViewStyle;
}

interface LiquidGlassMorphingMenuProps {
  onMenuAction: (action: string) => void;
  isCreator: boolean;
  buttonSize?: number;
  iconSize?: number;
  style?: ViewStyle;
}

// Safely try to load the native component
// React Native strips "Manager" from the module name
let NativeLiquidGlassMorphingMenu: any = null;
if (Platform.OS === 'ios') {
  try {
    NativeLiquidGlassMorphingMenu = requireNativeComponent<NativeLiquidGlassMorphingMenuProps>('LiquidGlassMorphingMenu');
  } catch (e) {
    console.log('LiquidGlassMorphingMenu: Native component not available, iOS 26+ required');
  }
}

/**
 * Liquid Glass Morphing Menu
 * - iOS 26+: Uses native SwiftUI glass effect with morphing animation
 * - iOS 17-25: Falls back to bordered button that triggers action immediately
 * - iOS 15-16: Falls back to ultraThinMaterial button
 */
export function LiquidGlassMorphingMenu({
  onMenuAction,
  isCreator,
  buttonSize = 24,
  iconSize = 16,
  style,
}: LiquidGlassMorphingMenuProps) {
  // iOS native implementation
  if (Platform.OS === 'ios' && NativeLiquidGlassMorphingMenu) {
    return (
      <NativeLiquidGlassMorphingMenu
        onMenuAction={(event: { nativeEvent: { action: string } }) => {
          onMenuAction(event.nativeEvent.action);
        }}
        isCreator={isCreator}
        buttonSize={buttonSize}
        iconSize={iconSize}
        style={[{ width: buttonSize, height: buttonSize }, style]}
      />
    );
  }

  // Android/Web: Return null or a fallback component
  return null;
}
