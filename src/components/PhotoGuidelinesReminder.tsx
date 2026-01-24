// src/components/PhotoGuidelinesReminder.tsx
//
// Subtle inline reminder for photo upload guidelines
// Shows Community Guidelines link for profile photo uploads

import React from 'react';
import { View, TouchableOpacity, Linking } from 'react-native';
import { Text } from '@/components/Text';
import { useThemeColors } from '@/lib/useThemeColors';
import { Info } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface PhotoGuidelinesReminderProps {
  /** Custom style for the container */
  className?: string;
}

export function PhotoGuidelinesReminder({ className }: PhotoGuidelinesReminderProps) {
  const colors = useThemeColors();

  const handleOpenGuidelines = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('https://movetogetherfitness.com/community-guidelines');
  };

  return (
    <View
      className={`flex-row items-center px-4 py-3 rounded-xl ${className || ''}`}
      style={{
        backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      }}
    >
      <Info size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
      <Text
        style={{ color: colors.textSecondary }}
        className="text-xs flex-1 leading-4"
      >
        Photos must follow our{' '}
        <Text
          style={{ color: '#FA114F' }}
          className="text-xs font-medium"
          onPress={handleOpenGuidelines}
        >
          Community Guidelines
        </Text>
        {' '}- no inappropriate content
      </Text>
    </View>
  );
}
