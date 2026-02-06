import React, { useCallback } from 'react';
import {
  Platform,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  requireNativeComponent,
  ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp } from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';

interface MessageInputAccessoryProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder?: string;
  isSending?: boolean;
  maxLength?: number;
  style?: ViewStyle;
}

// Native iOS component interface
interface NativeMessageInputProps {
  text: string;
  placeholder: string;
  sendEnabled: boolean;
  isDarkMode: boolean;
  accentColor: string;
  onTextChange: (event: { nativeEvent: { text: string } }) => void;
  onSend: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: ViewStyle;
}

// Load native component on iOS
let NativeMessageInput: React.ComponentType<NativeMessageInputProps> | null = null;
if (Platform.OS === 'ios') {
  try {
    NativeMessageInput = requireNativeComponent<NativeMessageInputProps>('MessageInputAccessory');
  } catch (e) {
    console.log('MessageInputAccessory: Native component not available, using fallback');
  }
}

/**
 * Message Input with Native Keyboard Animation
 *
 * iOS: Uses native InputAccessoryView for true Apple-native keyboard animation
 * Android: Uses react-native-keyboard-controller for animated positioning
 */
export function MessageInputAccessory({
  value,
  onChangeText,
  onSend,
  placeholder = 'Message...',
  isSending = false,
  maxLength = 500,
  style,
}: MessageInputAccessoryProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  // iOS Native Implementation
  if (Platform.OS === 'ios' && NativeMessageInput) {
    return (
      <View style={[{ height: 60 + insets.bottom }, style]}>
        <NativeMessageInput
          text={value}
          placeholder={placeholder}
          sendEnabled={!!value.trim() && !isSending}
          isDarkMode={colors.isDark}
          accentColor="#FA114F"
          onTextChange={(e) => {
            const newText = e.nativeEvent?.text ?? '';
            if (newText.length <= maxLength) {
              onChangeText(newText);
            }
          }}
          onSend={onSend}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  // Android Fallback with Keyboard Controller
  return (
    <AndroidAnimatedInput
      value={value}
      onChangeText={onChangeText}
      onSend={onSend}
      placeholder={placeholder}
      isSending={isSending}
      maxLength={maxLength}
      style={style}
    />
  );
}

/**
 * Android Animated Input using react-native-keyboard-controller
 * Mirrors the pattern from coach.tsx
 */
function AndroidAnimatedInput({
  value,
  onChangeText,
  onSend,
  placeholder,
  isSending,
  maxLength,
  style,
}: MessageInputAccessoryProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useSharedValue(0);

  useKeyboardHandler(
    {
      onMove: (e) => {
        'worklet';
        keyboardHeight.value = e.height;
      },
      onEnd: (e) => {
        'worklet';
        keyboardHeight.value = e.height;
      },
    },
    []
  );

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      paddingBottom: Math.max(keyboardHeight.value, insets.bottom) + 10,
    };
  });

  const hasText = !!value.trim();
  const sendDisabled = !hasText || isSending;

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-end',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderTopWidth: 1,
          borderTopColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          backgroundColor: colors.bg,
        },
        animatedStyle,
        style,
      ]}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'flex-end',
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
          borderRadius: 24,
          paddingHorizontal: 16,
          paddingVertical: 10,
          marginRight: 10,
        }}
      >
        <TextInput
          value={value}
          onChangeText={(text) => {
            if (text.length <= maxLength) {
              onChangeText(text);
            }
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 16,
            maxHeight: 100,
          }}
          multiline
          maxLength={maxLength}
        />
      </View>
      <Pressable
        onPress={onSend}
        disabled={sendDisabled}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: hasText ? '#FA114F' : colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isSending ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <ArrowUp size={20} color={hasText ? 'white' : colors.textSecondary} />
        )}
      </Pressable>
    </Animated.View>
  );
}
