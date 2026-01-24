import React from 'react';
import { View, Switch } from 'react-native';
import { Text } from '@/components/Text';
import { useThemeColors } from '@/lib/useThemeColors';
import * as Haptics from 'expo-haptics';

interface SettingsToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SettingsToggle({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
}: SettingsToggleProps) {
  const colors = useThemeColors();

  const handleChange = (newValue: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(newValue);
  };

  return (
    <View className="flex-row items-center justify-between py-3.5 px-4">
      <View className="flex-1 mr-3">
        <Text
          style={{ color: disabled ? colors.textSecondary : colors.text }}
          className="text-base"
        >
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
      <Switch
        value={value}
        onValueChange={handleChange}
        disabled={disabled}
        trackColor={{
          false: colors.isDark ? '#3A3A3C' : '#E5E5EA',
          true: '#FA114F',
        }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.isDark ? '#3A3A3C' : '#E5E5EA'}
      />
    </View>
  );
}

export function SettingsDivider() {
  const colors = useThemeColors();

  return (
    <View
      className="h-px mx-4"
      style={{
        backgroundColor: colors.isDark
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(0,0,0,0.05)',
      }}
    />
  );
}
