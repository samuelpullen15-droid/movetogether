import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/Text';
import { useThemeColors } from '@/lib/useThemeColors';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  delay?: number;
}

export function SettingsSection({
  title,
  description,
  children,
  delay = 0,
}: SettingsSectionProps) {
  const colors = useThemeColors();

  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(delay)}
      className="px-5 mt-6"
    >
      <Text
        style={{ color: colors.text }}
        className="text-lg font-bold mb-1"
      >
        {title}
      </Text>
      {description && (
        <Text
          style={{ color: colors.textSecondary }}
          className="text-sm mb-3"
        >
          {description}
        </Text>
      )}
      <View
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: colors.card }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
