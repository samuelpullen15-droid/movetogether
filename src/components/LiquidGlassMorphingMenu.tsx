import React from 'react';
import {
  requireNativeComponent,
  ViewStyle,
  Platform,
  View,
  Pressable,
} from 'react-native';

interface NativeProps {
  style?: ViewStyle;
  isCreator?: boolean;
  buttonSize?: number;
  iconSize?: number;
  onMenuAction?: (event: { nativeEvent: { action: string } }) => void;
}

const NativeMorphingMenu = Platform.OS === 'ios'
  ? requireNativeComponent<NativeProps>('LiquidGlassMorphingMenu')
  : null;

interface LiquidGlassMorphingMenuProps {
  isCreator: boolean;
  buttonSize?: number;
  iconSize?: number;
  onChat: () => void;
  onShare: () => void;
  onInfo: () => void;
  onLeave: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  style?: ViewStyle;
  children?: React.ReactNode; // For badge overlays
}

export const LiquidGlassMorphingMenu: React.FC<LiquidGlassMorphingMenuProps> = ({
  isCreator,
  buttonSize = 44,
  iconSize = 16,
  onChat,
  onShare,
  onInfo,
  onLeave,
  onDelete,
  onEdit,
  style,
  children,
}) => {
  if (Platform.OS !== 'ios' || !NativeMorphingMenu) {
    // Android fallback — render nothing or a simple button group
    return null;
  }

  const handleMenuAction = (event: { nativeEvent: { action: string } }) => {
    const action = event.nativeEvent.action;
    switch (action) {
      case 'chat':
        onChat();
        break;
      case 'share':
        onShare();
        break;
      case 'info':
        onInfo();
        break;
      case 'leave':
        onLeave();
        break;
      case 'delete':
        onDelete();
        break;
      case 'edit':
        onEdit?.();
        break;
    }
  };

  return (
    <View style={[{ position: 'relative' }, style]}>
      <NativeMorphingMenu
        isCreator={isCreator}
        buttonSize={buttonSize}
        iconSize={iconSize}
        onMenuAction={handleMenuAction}
        style={{
          height: buttonSize,
          // Two buttons (44pt each) + divider (1pt) + padding
          width: buttonSize * 2 + 12,
        }}
      />
      {/* Badge overlays (unread count, lock icon, etc.) */}
      {children}
    </View>
  );
};