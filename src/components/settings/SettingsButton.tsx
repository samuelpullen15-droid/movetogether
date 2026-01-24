import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from '@/components/Text';
import { useThemeColors } from '@/lib/useThemeColors';
import { ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface SettingsButtonProps {
  label: string;
  description?: string;
  onPress: () => void;
  badge?: number | string;
  destructive?: boolean;
  disabled?: boolean;
  value?: string;
  icon?: React.ReactNode;
}

export function SettingsButton({
  label,
  description,
  onPress,
  badge,
  destructive = false,
  disabled = false,
  value,
  icon,
}: SettingsButtonProps) {
  const colors = useThemeColors();

  const handlePress = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const textColor = destructive
    ? '#EF4444'
    : disabled
    ? colors.textSecondary
    : colors.text;

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      className="flex-row items-center justify-between py-3.5 px-4"
      activeOpacity={0.7}
    >
      <View className="flex-row items-center flex-1 mr-3">
        {icon && (
          <View
            className="w-8 h-8 rounded-full items-center justify-center mr-3"
            style={{
              backgroundColor: colors.isDark
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(0,0,0,0.04)',
            }}
          >
            {icon}
          </View>
        )}
        <View className="flex-1">
          <Text style={{ color: textColor }} className="text-base">
            {label}
          </Text>
          {description && (
            <Text
              style={{ color: colors.textSecondary }}
              className="text-xs mt-0.5"
            >
              {description}
            </Text>
          )}
        </View>
      </View>
      <View className="flex-row items-center">
        {value && (
          <Text
            style={{ color: colors.textSecondary }}
            className="text-base mr-1"
          >
            {value}
          </Text>
        )}
        {badge !== undefined && badge !== 0 && (
          <View
            className="min-w-5 h-5 rounded-full items-center justify-center mr-2 px-1.5"
            style={{ backgroundColor: '#FA114F' }}
          >
            <Text className="text-white text-xs font-semibold">
              {badge}
            </Text>
          </View>
        )}
        <ChevronRight
          size={18}
          color={destructive ? '#EF4444' : colors.textSecondary}
        />
      </View>
    </TouchableOpacity>
  );
}
