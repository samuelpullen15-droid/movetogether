import { View, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import { useSubscriptionStore } from '@/lib/subscription-store';
import {
  useNotificationPreferences,
  NotificationPreferenceKey,
} from '@/hooks/useNotificationPreferences';
import { Bell, Mail } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface NotificationToggleProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  icon: React.ReactNode;
  colors: ReturnType<typeof useThemeColors>;
}

function NotificationToggle({
  label,
  value,
  onValueChange,
  disabled,
  icon,
  colors,
}: NotificationToggleProps) {
  const handleChange = (newValue: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(newValue);
  };

  return (
    <View className="flex-row items-center justify-between py-3.5 px-4">
      <View className="flex-row items-center flex-1">
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
        <Text
          style={{ color: disabled ? colors.textSecondary : colors.text }}
          className="text-base"
        >
          {label}
        </Text>
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

interface NotificationSectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useThemeColors>;
  delay?: number;
}

function NotificationSection({
  title,
  description,
  children,
  colors,
  delay = 0,
}: NotificationSectionProps) {
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
      <Text
        style={{ color: colors.textSecondary }}
        className="text-sm mb-3"
      >
        {description}
      </Text>
      <View
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: colors.card }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function Divider({ colors }: { colors: ReturnType<typeof useThemeColors> }) {
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

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const subscriptionTier = useSubscriptionStore((s) => s.tier);
  const isCrusher = subscriptionTier === 'crusher';
  const isPaid = subscriptionTier === 'mover' || subscriptionTier === 'crusher';

  const {
    preferences,
    isLoading,
    isSaving,
    error,
    updatePreference,
  } = useNotificationPreferences();

  const handleToggle = (key: NotificationPreferenceKey) => (value: boolean) => {
    updatePreference(key, value);
  };

  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.bg }}
      >
        <ActivityIndicator size="large" color="#FA114F" />
        <Text style={{ color: colors.textSecondary }} className="mt-4">
          Loading preferences...
        </Text>
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
              Notifications
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

        {/* Error Banner */}
        {error && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            className="mx-5 mt-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20"
          >
            <Text className="text-red-500 text-sm">{error}</Text>
          </Animated.View>
        )}

        {/* Competition Updates */}
        <NotificationSection
          title="Competition Updates"
          description="Stay updated on competition standings, results, and when competitions start or end"
          colors={colors}
          delay={50}
        >
          <NotificationToggle
            label="Push notifications"
            value={preferences.competition_push}
            onValueChange={handleToggle('competition_push')}
            icon={<Bell size={16} color={colors.textSecondary} />}
            colors={colors}
          />
          <Divider colors={colors} />
          <NotificationToggle
            label="Email"
            value={preferences.competition_email}
            onValueChange={handleToggle('competition_email')}
            icon={<Mail size={16} color={colors.textSecondary} />}
            colors={colors}
          />
        </NotificationSection>

        {/* Friend Activity - Only show for paid tiers (Mover, Crusher) */}
        {isPaid && (
          <NotificationSection
            title="Friend Activity"
            description="Get notified when friends join competitions, achieve milestones, or send you requests"
            colors={colors}
            delay={100}
          >
            <NotificationToggle
              label="Push notifications"
              value={preferences.friends_push}
              onValueChange={handleToggle('friends_push')}
              icon={<Bell size={16} color={colors.textSecondary} />}
              colors={colors}
            />
            <Divider colors={colors} />
            <NotificationToggle
              label="Email"
              value={preferences.friends_email}
              onValueChange={handleToggle('friends_email')}
              icon={<Mail size={16} color={colors.textSecondary} />}
              colors={colors}
            />
          </NotificationSection>
        )}

        {/* Direct Messages - Only show for paid tiers (Mover, Crusher) */}
        {isPaid && (
          <NotificationSection
            title="Direct Messages"
            description="Get notified when friends send you a direct message"
            colors={colors}
            delay={125}
          >
            <NotificationToggle
              label="Push notifications"
              value={preferences.direct_message_push}
              onValueChange={handleToggle('direct_message_push')}
              icon={<Bell size={16} color={colors.textSecondary} />}
              colors={colors}
            />
          </NotificationSection>
        )}

        {/* Achievements & Milestones - Only show for paid tiers (Mover, Crusher) */}
        {isPaid && (
          <NotificationSection
            title="Achievements & Milestones"
            description="Celebrate your progress with notifications for new badges and personal records"
            colors={colors}
            delay={150}
          >
            <NotificationToggle
              label="Push notifications"
              value={preferences.achievements_push}
              onValueChange={handleToggle('achievements_push')}
              icon={<Bell size={16} color={colors.textSecondary} />}
              colors={colors}
            />
          </NotificationSection>
        )}

        {/* Coach Spark - Only show for Crusher tier */}
        {isCrusher && (
          <NotificationSection
            title="Coach Spark"
            description="Receive motivational tips and personalized insights from your AI coach"
            colors={colors}
            delay={200}
          >
            <NotificationToggle
              label="Push notifications"
              value={preferences.coach_push}
              onValueChange={handleToggle('coach_push')}
              icon={<Bell size={16} color={colors.textSecondary} />}
              colors={colors}
            />
          </NotificationSection>
        )}

        {/* Account & Security */}
        <NotificationSection
          title="Account & Security"
          description="Important updates about your account, subscription, and security"
          colors={colors}
          delay={isCrusher ? 250 : isPaid ? 200 : 100}
        >
          <NotificationToggle
            label="Push notifications"
            value={preferences.account_push}
            onValueChange={handleToggle('account_push')}
            icon={<Bell size={16} color={colors.textSecondary} />}
            colors={colors}
          />
          <Divider colors={colors} />
          <NotificationToggle
            label="Email"
            value={preferences.account_email}
            onValueChange={handleToggle('account_email')}
            icon={<Mail size={16} color={colors.textSecondary} />}
            colors={colors}
          />
        </NotificationSection>

        {/* Info Text */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(isCrusher ? 300 : isPaid ? 250 : 150)}
          className="px-5 mt-6"
        >
          <Text
            style={{ color: colors.textSecondary }}
            className="text-sm text-center"
          >
            You can manage system notification permissions in your device
            settings.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
