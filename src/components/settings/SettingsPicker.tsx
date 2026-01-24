import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { Text } from '@/components/Text';
import { useThemeColors } from '@/lib/useThemeColors';
import { ChevronRight, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

interface Option {
  value: string;
  label: string;
  description?: string;
}

interface SettingsPickerProps {
  label: string;
  description?: string;
  value: string;
  options: Option[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function SettingsPicker({
  label,
  description,
  value,
  options,
  onValueChange,
  disabled = false,
}: SettingsPickerProps) {
  const colors = useThemeColors();
  const [modalVisible, setModalVisible] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption?.label || value;

  const handleSelect = (optionValue: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(optionValue);
    setModalVisible(false);
  };

  const handlePress = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setModalVisible(true);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled}
        className="flex-row items-center justify-between py-3.5 px-4"
        activeOpacity={0.7}
      >
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
        <View className="flex-row items-center">
          <Text
            style={{ color: colors.textSecondary }}
            className="text-base mr-1"
          >
            {displayValue}
          </Text>
          <ChevronRight size={18} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          onPress={() => setModalVisible(false)}
        >
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="absolute inset-0 bg-black/50"
          />
          <Animated.View
            entering={SlideInDown.duration(300)}
            exiting={SlideOutDown.duration(200)}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View
                className="rounded-t-3xl pb-8 pt-2"
                style={{ backgroundColor: colors.card }}
              >
                {/* Handle */}
                <View className="items-center py-2">
                  <View
                    className="w-10 h-1 rounded-full"
                    style={{
                      backgroundColor: colors.isDark
                        ? 'rgba(255,255,255,0.2)'
                        : 'rgba(0,0,0,0.15)',
                    }}
                  />
                </View>

                {/* Title */}
                <Text
                  style={{ color: colors.text }}
                  className="text-lg font-bold text-center mb-4 px-4"
                >
                  {label}
                </Text>

                {/* Options */}
                {options.map((option, index) => (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => handleSelect(option.value)}
                    className="flex-row items-center justify-between py-4 px-5"
                    activeOpacity={0.7}
                    style={{
                      borderTopWidth: index > 0 ? 1 : 0,
                      borderTopColor: colors.isDark
                        ? 'rgba(255,255,255,0.05)'
                        : 'rgba(0,0,0,0.05)',
                    }}
                  >
                    <View className="flex-1 mr-3">
                      <Text
                        style={{ color: colors.text }}
                        className="text-base"
                      >
                        {option.label}
                      </Text>
                      {option.description && (
                        <Text
                          style={{ color: colors.textSecondary }}
                          className="text-xs mt-0.5"
                        >
                          {option.description}
                        </Text>
                      )}
                    </View>
                    {value === option.value && (
                      <Check size={20} color="#FA114F" />
                    )}
                  </TouchableOpacity>
                ))}

                {/* Cancel button */}
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  className="mx-4 mt-4 py-3.5 rounded-xl items-center"
                  style={{
                    backgroundColor: colors.isDark
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.04)',
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{ color: colors.text }}
                    className="text-base font-semibold"
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}
