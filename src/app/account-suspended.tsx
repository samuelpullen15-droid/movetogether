// src/app/account-suspended.tsx
//
// Shows when user logs in but their account is suspended
// User cannot access the app while suspended

import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ShieldX, ExternalLink, Mail, LogOut } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { moderationApi } from '@/lib/edge-functions';

interface SuspensionDetails {
  id: string;
  reason: string;
  details: string | null;
  starts_at: string;
  ends_at: string | null;
  appealed_at: string | null;
  appeal_status: string | null;
}

// Map reason types to user-friendly labels
const REASON_LABELS: Record<string, string> = {
  harassment: 'Harassment or Bullying',
  inappropriate_content: 'Inappropriate Content',
  spam: 'Spam or Misleading Content',
  hate_speech: 'Hate Speech',
  violence: 'Violence or Threats',
  impersonation: 'Impersonation',
  explicit_content: 'Explicit Content',
  repeated_violations: 'Repeated Violations',
  fake_profile: 'Fake Profile',
  other: 'Community Guidelines Violation',
};

export default function AccountSuspendedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const [suspension, setSuspension] = useState<SuspensionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Fetch suspension details on mount
  useEffect(() => {
    const fetchSuspension = async () => {
      if (!user?.id) return;

      try {
        // Per security rules: Use Edge Function instead of direct RPC
        const { data, error } = await moderationApi.getActiveSuspension();

        if (error) {
          console.error('[AccountSuspended] Error fetching suspension:', error);
        } else if (data && Array.isArray(data) && data.length > 0) {
          setSuspension((data as SuspensionDetails[])[0]);
        } else if (data && !Array.isArray(data)) {
          setSuspension(data as SuspensionDetails);
        }
      } catch (err) {
        console.error('[AccountSuspended] Exception:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuspension();
  }, [user?.id]);

  const handleOpenGuidelines = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('https://movetogetherfitness.com/community-guidelines');
  };

  const handleAppeal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Check if already appealed
    if (suspension?.appealed_at) {
      const statusMessage = suspension.appeal_status === 'pending'
        ? 'Your appeal is currently under review. We will notify you of the decision.'
        : suspension.appeal_status === 'denied'
        ? 'Your appeal was reviewed and denied. If you have new information, you may submit another appeal.'
        : 'Your appeal has been processed.';

      Alert.alert('Appeal Status', statusMessage);
      return;
    }

    const username = user?.username || 'User';
    const subject = encodeURIComponent(`Suspension Appeal - ${username}`);
    const body = encodeURIComponent(
      `Account: ${username}\n` +
      `User ID: ${user?.id || 'Unknown'}\n` +
      `Suspension Reason: ${suspension?.reason || 'Unknown'}\n\n` +
      `I would like to appeal my account suspension. Please explain below why you believe this suspension should be lifted:\n\n` +
      `[Please provide your explanation here]`
    );

    Linking.openURL(`mailto:support@movetogetherfitness.com?subject=${subject}&body=${body}`);
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsSigningOut(true);
            try {
              await signOut();
              router.replace('/sign-in');
            } catch (err) {
              console.error('[AccountSuspended] Sign out error:', err);
              setIsSigningOut(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getSuspensionDuration = () => {
    if (!suspension) return 'Unknown';
    if (!suspension.ends_at) return 'Permanent';

    const endsAt = new Date(suspension.ends_at);
    const startsAt = new Date(suspension.starts_at);
    const diffDays = Math.ceil((endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return '1 day';
    if (diffDays === 7) return '7 days';
    if (diffDays === 14) return '14 days';
    if (diffDays === 30) return '30 days';
    return `${diffDays} days`;
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#FA114F" />
      </View>
    );
  }

  const isPermanent = !suspension?.ends_at;
  const hasAppealed = !!suspension?.appealed_at;

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
              style={{ backgroundColor: '#EF444420' }}
            >
              <ShieldX size={48} color="#EF4444" strokeWidth={1.5} />
            </View>
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.duration(500).delay(50)}>
            <Text
              style={{ color: colors.text }}
              className="text-3xl font-bold text-center"
            >
              Account Suspended
            </Text>
          </Animated.View>

          {/* Body Text */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)}>
            <Text
              style={{ color: colors.textSecondary }}
              className="text-base text-center mt-4 leading-6"
            >
              Your account has been suspended for violating our Community Guidelines.
            </Text>
          </Animated.View>
        </View>

        {/* Suspension Details Card */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(150)}
          className="mx-5 mb-6"
        >
          <View
            className="rounded-2xl p-5"
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: '#EF444430',
            }}
          >
            {/* Reason */}
            <View className="mb-4">
              <Text
                style={{ color: colors.textSecondary }}
                className="text-sm font-medium mb-1"
              >
                Reason
              </Text>
              <Text
                style={{ color: '#EF4444' }}
                className="text-base font-semibold"
              >
                {suspension ? REASON_LABELS[suspension.reason] || suspension.reason : 'Community Guidelines Violation'}
              </Text>
            </View>

            {/* Duration */}
            <View className="mb-4">
              <Text
                style={{ color: colors.textSecondary }}
                className="text-sm font-medium mb-1"
              >
                Suspension Duration
              </Text>
              <Text
                style={{ color: isPermanent ? '#EF4444' : colors.text }}
                className={`text-base ${isPermanent ? 'font-semibold' : ''}`}
              >
                {getSuspensionDuration()}
              </Text>
            </View>

            {/* Ends At (if not permanent) */}
            {!isPermanent && suspension?.ends_at && (
              <View className="mb-4">
                <Text
                  style={{ color: colors.textSecondary }}
                  className="text-sm font-medium mb-1"
                >
                  Suspension Ends
                </Text>
                <Text style={{ color: colors.text }} className="text-base">
                  {formatDate(suspension.ends_at)}
                </Text>
              </View>
            )}

            {/* Details */}
            {suspension?.details && (
              <View>
                <Text
                  style={{ color: colors.textSecondary }}
                  className="text-sm font-medium mb-1"
                >
                  Details
                </Text>
                <Text style={{ color: colors.text }} className="text-base leading-6">
                  {suspension.details}
                </Text>
              </View>
            )}

            {/* Appeal Status (if appealed) */}
            {hasAppealed && (
              <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                <Text
                  style={{ color: colors.textSecondary }}
                  className="text-sm font-medium mb-1"
                >
                  Appeal Status
                </Text>
                <Text
                  style={{
                    color: suspension?.appeal_status === 'pending'
                      ? '#F59E0B'
                      : suspension?.appeal_status === 'approved'
                      ? '#10B981'
                      : '#EF4444'
                  }}
                  className="text-base font-semibold"
                >
                  {suspension?.appeal_status === 'pending'
                    ? 'Under Review'
                    : suspension?.appeal_status === 'approved'
                    ? 'Approved'
                    : suspension?.appeal_status === 'denied'
                    ? 'Denied'
                    : 'Submitted'}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Community Guidelines Link */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(200)}
          className="mx-5 mb-6"
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

        {/* Appeal Info */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(250)}
          className="mx-5 mb-6"
        >
          <View
            className="rounded-xl p-4"
            style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}
          >
            <Text
              style={{ color: colors.textSecondary }}
              className="text-sm text-center leading-5"
            >
              If you believe this was an error, you may appeal this decision.
            </Text>
          </View>
        </Animated.View>

        {/* Appeal Button */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(300)}
          className="mx-5 mb-4"
        >
          <TouchableOpacity
            onPress={handleAppeal}
            activeOpacity={0.8}
            className="py-4 rounded-xl items-center justify-center flex-row"
            style={{
              backgroundColor: hasAppealed && suspension?.appeal_status === 'pending'
                ? colors.card
                : '#3B82F6',
            }}
          >
            <Mail
              size={20}
              color={hasAppealed && suspension?.appeal_status === 'pending' ? colors.textSecondary : 'white'}
              strokeWidth={2}
            />
            <Text
              className="font-semibold text-base ml-2"
              style={{
                color: hasAppealed && suspension?.appeal_status === 'pending'
                  ? colors.textSecondary
                  : 'white',
              }}
            >
              {hasAppealed
                ? suspension?.appeal_status === 'pending'
                  ? 'Appeal Pending'
                  : 'Submit Another Appeal'
                : 'Appeal Suspension'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Sign Out Button */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(350)}
          className="mx-5"
        >
          <TouchableOpacity
            onPress={handleSignOut}
            disabled={isSigningOut}
            activeOpacity={0.7}
            className="py-4 rounded-xl items-center justify-center flex-row"
            style={{ backgroundColor: colors.card }}
          >
            {isSigningOut ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : (
              <>
                <LogOut size={20} color={colors.textSecondary} />
                <Text
                  style={{ color: colors.textSecondary }}
                  className="font-medium text-base ml-2"
                >
                  Log Out
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
