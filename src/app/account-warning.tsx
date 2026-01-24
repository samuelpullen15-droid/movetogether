// src/app/account-warning.tsx
//
// Shows when user logs in and has an unacknowledged warning
// User must acknowledge before continuing to use the app

import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AlertTriangle, ExternalLink, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';

interface WarningDetails {
  id: string;
  violation_type: string;
  details: string | null;
  created_at: string;
}

// Map violation types to user-friendly labels
const VIOLATION_LABELS: Record<string, string> = {
  harassment: 'Harassment or Bullying',
  inappropriate_content: 'Inappropriate Content',
  spam: 'Spam or Misleading Content',
  hate_speech: 'Hate Speech',
  violence: 'Violence or Threats',
  impersonation: 'Impersonation',
  explicit_content: 'Explicit Content',
  fake_profile: 'Fake Profile',
  other: 'Community Guidelines Violation',
};

export default function AccountWarningScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const checkAccountStatus = useAuthStore((s) => s.checkAccountStatus);

  const [warning, setWarning] = useState<WarningDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  // Fetch warning details on mount
  useEffect(() => {
    const fetchWarning = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase.rpc('get_unacknowledged_warning', {
          p_user_id: user.id,
        });

        if (error) {
          console.error('[AccountWarning] Error fetching warning:', error);
        } else if (data && data.length > 0) {
          setWarning(data[0]);
        }
      } catch (err) {
        console.error('[AccountWarning] Exception:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWarning();
  }, [user?.id]);

  const handleOpenGuidelines = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('https://movetogetherfitness.com/community-guidelines');
  };

  const handleAcknowledge = async () => {
    if (!warning?.id || isAcknowledging) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsAcknowledging(true);

    try {
      const { data, error } = await supabase.rpc('acknowledge_warning', {
        p_warning_id: warning.id,
      });

      if (error) {
        console.error('[AccountWarning] Error acknowledging:', error);
        setIsAcknowledging(false);
        return;
      }

      // Refresh account status in auth store
      if (checkAccountStatus) {
        await checkAccountStatus();
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (err) {
      console.error('[AccountWarning] Exception acknowledging:', err);
      setIsAcknowledging(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#FA114F" />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 60,
            paddingHorizontal: 24,
            paddingBottom: 24,
          }}
        >
          {/* Warning Icon */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="items-center mb-6"
          >
            <View
              className="w-24 h-24 rounded-full items-center justify-center"
              style={{ backgroundColor: '#F59E0B20' }}
            >
              <AlertTriangle size={48} color="#F59E0B" strokeWidth={1.5} />
            </View>
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.duration(500).delay(50)}>
            <Text
              style={{ color: colors.text }}
              className="text-3xl font-bold text-center"
            >
              Account Warning
            </Text>
          </Animated.View>

          {/* Body Text */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)}>
            <Text
              style={{ color: colors.textSecondary }}
              className="text-base text-center mt-4 leading-6"
            >
              Your account has received a warning for violating our Community Guidelines.
            </Text>
          </Animated.View>
        </View>

        {/* Warning Details Card */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(150)}
          className="mx-5 mb-6"
        >
          <View
            className="rounded-2xl p-5"
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: '#F59E0B30',
            }}
          >
            {/* Violation Type */}
            <View className="mb-4">
              <Text
                style={{ color: colors.textSecondary }}
                className="text-sm font-medium mb-1"
              >
                Violation Type
              </Text>
              <Text
                style={{ color: '#F59E0B' }}
                className="text-base font-semibold"
              >
                {warning ? VIOLATION_LABELS[warning.violation_type] || warning.violation_type : 'Community Guidelines Violation'}
              </Text>
            </View>

            {/* Date */}
            <View className="mb-4">
              <Text
                style={{ color: colors.textSecondary }}
                className="text-sm font-medium mb-1"
              >
                Date
              </Text>
              <Text style={{ color: colors.text }} className="text-base">
                {warning ? formatDate(warning.created_at) : '-'}
              </Text>
            </View>

            {/* Details */}
            {warning?.details && (
              <View>
                <Text
                  style={{ color: colors.textSecondary }}
                  className="text-sm font-medium mb-1"
                >
                  Details
                </Text>
                <Text style={{ color: colors.text }} className="text-base leading-6">
                  {warning.details}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Further Violations Warning */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(200)}
          className="mx-5 mb-6"
        >
          <View
            className="rounded-xl p-4"
            style={{ backgroundColor: '#EF444415' }}
          >
            <Text
              style={{ color: '#EF4444' }}
              className="text-sm text-center leading-5"
            >
              Further violations may result in account suspension or permanent termination.
            </Text>
          </View>
        </Animated.View>

        {/* Community Guidelines Link */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(250)}
          className="mx-5 mb-8"
        >
          <TouchableOpacity
            onPress={handleOpenGuidelines}
            className="flex-row items-center justify-center py-3"
            activeOpacity={0.7}
          >
            <ExternalLink size={18} color="#FA114F" />
            <Text style={{ color: '#FA114F' }} className="text-base font-medium ml-2">
              Review Community Guidelines
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Acknowledge Button */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(300)}
          className="mx-5"
        >
          <TouchableOpacity
            onPress={handleAcknowledge}
            disabled={isAcknowledging}
            activeOpacity={0.8}
            className="py-4 rounded-xl items-center justify-center flex-row"
            style={{ backgroundColor: '#FA114F' }}
          >
            {isAcknowledging ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Check size={20} color="white" strokeWidth={2.5} />
                <Text className="text-white font-semibold text-base ml-2">
                  I Understand
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
