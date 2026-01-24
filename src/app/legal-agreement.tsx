import React, { useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  FileText,
  Shield,
  Users,
  Check,
  ExternalLink,
  LogOut,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const LEGAL_VERSION = '2026.01.23';

interface PolicyCard {
  icon: typeof FileText;
  title: string;
  description: string;
  url: string;
  color: string;
}

const POLICY_CARDS: PolicyCard[] = [
  {
    icon: FileText,
    title: 'Terms of Service',
    description: 'Rules for using MoveTogether, your rights and responsibilities',
    url: 'https://movetogetherfitness.com/terms-and-conditions',
    color: '#3B82F6',
  },
  {
    icon: Shield,
    title: 'Privacy Policy',
    description: 'How we collect, use, and protect your personal data',
    url: 'https://movetogetherfitness.com/privacy',
    color: '#10B981',
  },
  {
    icon: Users,
    title: 'Community Guidelines',
    description: 'Standards for respectful and safe interactions',
    url: 'https://movetogetherfitness.com/community-guidelines',
    color: '#F59E0B',
  },
];

export default function LegalAgreementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const acceptLegalAgreements = useAuthStore((s) => s.acceptLegalAgreements);
  const signOut = useAuthStore((s) => s.signOut);

  const [isAgreed, setIsAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenPolicy = (url: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(url);
  };

  const handleToggleAgreement = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsAgreed(!isAgreed);
  };

  const handleContinue = async () => {
    if (!isAgreed || !user?.id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    try {
      await acceptLegalAgreements(LEGAL_VERSION);
      // Navigation will be handled automatically by _layout.tsx
      router.replace('/(onboarding)');
    } catch (error) {
      console.error('Error accepting legal agreements:', error);
      Alert.alert(
        'Error',
        'Failed to save your agreement. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? You can sign in again later to accept the agreements.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await signOut();
            router.replace('/sign-in');
          },
        },
      ]
    );
  };

  const renderPolicyCard = (policy: PolicyCard, index: number) => (
    <Animated.View
      key={policy.title}
      entering={FadeInDown.duration(400).delay(100 + index * 50)}
    >
      <TouchableOpacity
        onPress={() => handleOpenPolicy(policy.url)}
        activeOpacity={0.7}
        className="flex-row items-center p-4 rounded-2xl mb-3"
        style={{ backgroundColor: colors.card }}
      >
        <View
          className="w-12 h-12 rounded-full items-center justify-center mr-4"
          style={{ backgroundColor: `${policy.color}20` }}
        >
          <policy.icon size={24} color={policy.color} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.text }} className="text-base font-semibold">
            {policy.title}
          </Text>
          <Text
            style={{ color: colors.textSecondary }}
            className="text-sm mt-0.5"
          >
            {policy.description}
          </Text>
        </View>
        <ExternalLink size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );

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
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 40,
            paddingHorizontal: 24,
            paddingBottom: 24,
          }}
        >
          <Animated.View entering={FadeInDown.duration(500)}>
            <Text
              style={{ color: colors.text }}
              className="text-3xl font-bold text-center"
            >
              Before We Begin
            </Text>
            <Text
              style={{ color: colors.textSecondary }}
              className="text-base text-center mt-3"
            >
              Please review and accept our policies to continue using MoveTogether
            </Text>
          </Animated.View>
        </View>

        {/* Policy Cards */}
        <View className="px-5 mt-2">
          {POLICY_CARDS.map((policy, index) => renderPolicyCard(policy, index))}
        </View>

        {/* Agreement Checkbox */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(250)}
          className="px-5 mt-6"
        >
          <TouchableOpacity
            onPress={handleToggleAgreement}
            activeOpacity={0.7}
            className="flex-row items-start p-4 rounded-2xl"
            style={{ backgroundColor: colors.card }}
          >
            <View
              className="w-6 h-6 rounded-md items-center justify-center mr-3 mt-0.5"
              style={{
                backgroundColor: isAgreed ? '#FA114F' : 'transparent',
                borderWidth: isAgreed ? 0 : 2,
                borderColor: colors.textSecondary,
              }}
            >
              {isAgreed && <Check size={16} color="white" strokeWidth={3} />}
            </View>
            <View className="flex-1">
              <Text style={{ color: colors.text }} className="text-base leading-6">
                I have read and agree to the{' '}
                <Text
                  style={{ color: '#FA114F' }}
                  className="font-semibold"
                  onPress={() =>
                    handleOpenPolicy(
                      'https://movetogetherfitness.com/terms-and-conditions'
                    )
                  }
                >
                  Terms of Service
                </Text>
                ,{' '}
                <Text
                  style={{ color: '#FA114F' }}
                  className="font-semibold"
                  onPress={() =>
                    handleOpenPolicy('https://movetogetherfitness.com/privacy')
                  }
                >
                  Privacy Policy
                </Text>
                , and{' '}
                <Text
                  style={{ color: '#FA114F' }}
                  className="font-semibold"
                  onPress={() =>
                    handleOpenPolicy(
                      'https://movetogetherfitness.com/community-guidelines'
                    )
                  }
                >
                  Community Guidelines
                </Text>
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Continue Button */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(300)}
          className="px-5 mt-8"
        >
          <TouchableOpacity
            onPress={handleContinue}
            disabled={!isAgreed || isSubmitting}
            activeOpacity={0.8}
            className="py-4 rounded-xl items-center flex-row justify-center"
            style={{
              backgroundColor: isAgreed ? '#FA114F' : colors.card,
              opacity: isAgreed ? 1 : 0.6,
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text
                className="font-semibold text-base"
                style={{ color: isAgreed ? 'white' : colors.textSecondary }}
              >
                Continue
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Sign Out Option */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(350)}
          className="px-5 mt-6"
        >
          <TouchableOpacity
            onPress={handleSignOut}
            activeOpacity={0.7}
            className="flex-row items-center justify-center py-3"
          >
            <LogOut size={18} color={colors.textSecondary} />
            <Text
              style={{ color: colors.textSecondary }}
              className="text-base ml-2"
            >
              Sign out instead
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Version Info */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(400)}
          className="px-5 mt-8"
        >
          <Text
            style={{ color: colors.textSecondary }}
            className="text-xs text-center opacity-60"
          >
            Agreement version {LEGAL_VERSION}
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
