import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import {
  usePrivacySettings,
  PrivacySettings,
} from '@/hooks/usePrivacySettings';
import {
  SettingsSection,
  SettingsToggle,
  SettingsDivider,
  SettingsPicker,
  SettingsButton,
} from '@/components/settings';
import { friendsApi } from '@/lib/edge-functions';
import { useAuthStore } from '@/lib/auth-store';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Heart,
  Trash2,
  Download,
  Ban,
} from 'lucide-react-native';

const PROFILE_VISIBILITY_OPTIONS = [
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone can view your profile',
  },
  {
    value: 'friends_only',
    label: 'Friends Only',
    description: 'Only your friends can view your profile',
  },
  {
    value: 'private',
    label: 'Private',
    description: 'Only you can view your profile',
  },
];

const FRIEND_REQUEST_OPTIONS = [
  {
    value: 'everyone',
    label: 'Everyone',
    description: 'Anyone can send you friend requests',
  },
  {
    value: 'friends_of_friends',
    label: 'Friends of Friends',
    description: 'Only people with mutual friends can request',
  },
  {
    value: 'no_one',
    label: 'No One',
    description: 'Block all friend requests',
  },
];

const COMPETITION_INVITE_OPTIONS = [
  {
    value: 'everyone',
    label: 'Everyone',
    description: 'Anyone can invite you to competitions',
  },
  {
    value: 'friends_only',
    label: 'Friends Only',
    description: 'Only friends can invite you',
  },
  {
    value: 'no_one',
    label: 'No One',
    description: 'Block all competition invites',
  },
];

export default function PrivacySettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);

  const {
    settings,
    isLoading,
    isSaving,
    error,
    updateSetting,
    updateMetricVisibility,
    refreshSettings,
  } = usePrivacySettings();

  const [blockedCount, setBlockedCount] = useState(0);

  // Fetch blocked users count
  useEffect(() => {
    const fetchBlockedCount = async () => {
      if (!user?.id) return;

      const { data, error } = await friendsApi.countBlocked();
      if (!error && data) {
        setBlockedCount(data.count);
      }
    };

    fetchBlockedCount();
  }, [user?.id]);

  const handleOpenHealthSettings = () => {
    Linking.openSettings();
  };

  const handleExportData = () => {
    router.push('/data-export');
  };

  const handleDeleteAccount = () => {
    router.push('/delete-account');
  };

  const handleBlockedUsers = () => {
    router.push('/blocked-users');
  };

  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.bg }}
      >
        <ActivityIndicator size="large" color="#FA114F" />
        <Text style={{ color: colors.textSecondary }} className="mt-4">
          Loading privacy settings...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: colors.bg }}
      >
        <Text style={{ color: colors.text }} className="text-lg font-bold mb-2">
          Failed to Load Settings
        </Text>
        <Text
          style={{ color: colors.textSecondary }}
          className="text-center mb-6"
        >
          {error}
        </Text>
        <Animated.View entering={FadeInDown.duration(400)}>
          <View
            className="py-3 px-6 rounded-xl"
            style={{ backgroundColor: '#FA114F' }}
          >
            <Text
              className="text-white font-semibold"
              onPress={refreshSettings}
            >
              Retry
            </Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Overscroll background for dark mode */}
      {colors.isDark && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 300,
            backgroundColor: '#1C1C1E',
            zIndex: -1,
          }}
        />
      )}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          <Animated.View
            entering={FadeInDown.duration(400)}
            className="flex-row items-center"
          >
            <LiquidGlassBackButton onPress={() => router.back()} />
            <Text
              style={{ color: colors.text }}
              className="text-2xl font-bold ml-4"
            >
              Privacy Settings
            </Text>
            {isSaving && (
              <ActivityIndicator
                size="small"
                color="#FA114F"
                style={{ marginLeft: 12 }}
              />
            )}
          </Animated.View>
        </View>

        {/* Profile Visibility */}
        <SettingsSection title="Profile Visibility" delay={50}>
          <SettingsPicker
            label="Profile visibility"
            value={settings.profile_visibility}
            options={PROFILE_VISIBILITY_OPTIONS}
            onValueChange={(value) =>
              updateSetting(
                'profile_visibility',
                value as PrivacySettings['profile_visibility']
              )
            }
          />
          <SettingsDivider />
          <SettingsToggle
            label="Show real name on leaderboards"
            description="When off, your display name is shown instead"
            value={settings.show_real_name_on_leaderboards}
            onValueChange={(value) =>
              updateSetting('show_real_name_on_leaderboards', value)
            }
          />
          <SettingsDivider />
          <SettingsToggle
            label="Allow others to find me by email"
            value={settings.allow_find_by_email}
            onValueChange={(value) => updateSetting('allow_find_by_email', value)}
          />
        </SettingsSection>

        {/* Activity Sharing */}
        <SettingsSection title="Activity Sharing" delay={100}>
          <SettingsToggle
            label="Show my activity in friends' feeds"
            value={settings.show_activity_in_feed}
            onValueChange={(value) =>
              updateSetting('show_activity_in_feed', value)
            }
          />
          <SettingsDivider />
          <SettingsToggle
            label="Display my rank on public leaderboards"
            value={settings.show_on_public_leaderboards}
            onValueChange={(value) =>
              updateSetting('show_on_public_leaderboards', value)
            }
          />
          <SettingsDivider />
          <SettingsToggle
            label="Show detailed stats to competitors"
            description="When off, others see your placement but not exact numbers"
            value={settings.show_detailed_stats}
            onValueChange={(value) => updateSetting('show_detailed_stats', value)}
          />
        </SettingsSection>

        {/* Health Data Visibility */}
        <SettingsSection
          title="Health Data Visibility"
          description="Choose which metrics competition participants can see"
          delay={150}
        >
          <SettingsToggle
            label="Steps"
            value={settings.visible_metrics.steps}
            onValueChange={(value) => updateMetricVisibility('steps', value)}
          />
          <SettingsDivider />
          <SettingsToggle
            label="Calories burned"
            value={settings.visible_metrics.calories}
            onValueChange={(value) => updateMetricVisibility('calories', value)}
          />
          <SettingsDivider />
          <SettingsToggle
            label="Active minutes"
            value={settings.visible_metrics.active_minutes}
            onValueChange={(value) =>
              updateMetricVisibility('active_minutes', value)
            }
          />
          <SettingsDivider />
          <SettingsToggle
            label="Distance"
            value={settings.visible_metrics.distance}
            onValueChange={(value) => updateMetricVisibility('distance', value)}
          />
          <SettingsDivider />
          <SettingsToggle
            label="Workouts"
            value={settings.visible_metrics.workouts}
            onValueChange={(value) => updateMetricVisibility('workouts', value)}
          />
        </SettingsSection>

        {/* Social Controls */}
        <SettingsSection title="Social Controls" delay={200}>
          <SettingsPicker
            label="Who can send friend requests"
            value={settings.friend_request_visibility}
            options={FRIEND_REQUEST_OPTIONS}
            onValueChange={(value) =>
              updateSetting(
                'friend_request_visibility',
                value as PrivacySettings['friend_request_visibility']
              )
            }
          />
          <SettingsDivider />
          <SettingsPicker
            label="Who can invite me to competitions"
            value={settings.competition_invite_visibility}
            options={COMPETITION_INVITE_OPTIONS}
            onValueChange={(value) =>
              updateSetting(
                'competition_invite_visibility',
                value as PrivacySettings['competition_invite_visibility']
              )
            }
          />
          <SettingsDivider />
          <SettingsButton
            label="Blocked users"
            onPress={handleBlockedUsers}
            badge={blockedCount}
            icon={<Ban size={16} color={colors.textSecondary} />}
          />
        </SettingsSection>

        {/* Connected Services */}
        <SettingsSection title="Connected Services" delay={250}>
          <SettingsButton
            label="Apple Health"
            description="Manage health data permissions"
            onPress={handleOpenHealthSettings}
            value="Connected"
            icon={<Heart size={16} color="#FA114F" />}
          />
        </SettingsSection>

        {/* Data & Analytics */}
        <SettingsSection title="Data & Analytics" delay={300}>
          <SettingsToggle
            label="Help improve MoveTogether"
            description="Share anonymous usage data to help us improve the app"
            value={settings.analytics_opt_in}
            onValueChange={(value) => updateSetting('analytics_opt_in', value)}
          />
          <SettingsDivider />
          <SettingsButton
            label="Download my data"
            description="Get a copy of all your MoveTogether data"
            onPress={handleExportData}
            icon={<Download size={16} color={colors.textSecondary} />}
          />
          <SettingsDivider />
          <SettingsButton
            label="Delete my account"
            description="Permanently delete your account and all data"
            onPress={handleDeleteAccount}
            destructive
            icon={<Trash2 size={16} color="#EF4444" />}
          />
        </SettingsSection>

        {/* Info Text */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(400)}
          className="px-5 mt-6"
        >
          <Text
            style={{ color: colors.textSecondary }}
            className="text-sm text-center"
          >
            Your privacy is important to us. These settings help you control how
            your information is shared within MoveTogether.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
