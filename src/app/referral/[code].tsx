import { useState, useEffect } from 'react';
import {
  View,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { useThemeColors } from '@/lib/useThemeColors';
import { referralApi } from '@/lib/edge-functions';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import {
  Gift,
  Users,
  CheckCircle,
  XCircle,
  Star,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';

// Storage key for pending referral
const PENDING_REFERRAL_KEY = 'pending_referral_code';

interface ReferrerPreview {
  referrer_name: string;
  referrer_avatar: string | null;
  reward_description: string;
}

export default function ReferralScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [referrer, setReferrer] = useState<ReferrerPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load referrer preview
  useEffect(() => {
    if (!code) {
      setError('Invalid referral link');
      setIsLoading(false);
      return;
    }

    loadReferrerPreview();
  }, [code]);

  const loadReferrerPreview = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: apiError } = await referralApi.getUserByReferralCode(code!);

      if (apiError || !data) {
        setError('This referral link is invalid or has expired.');
        return;
      }

      setReferrer(data);
    } catch (err) {
      console.error('[Referral] Error loading preview:', err);
      setError('Unable to load referral details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptReferral = async () => {
    if (!code) return;

    // If not logged in, save the referral code and redirect to sign-in
    if (!user) {
      await AsyncStorage.setItem(PENDING_REFERRAL_KEY, code);
      router.push('/sign-in');
      return;
    }

    try {
      setIsProcessing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { data, error: apiError } = await referralApi.registerReferral(code);

      if (apiError) {
        Alert.alert('Error', apiError.message || 'Unable to accept referral');
        return;
      }

      if (!data?.success) {
        Alert.alert('Error', 'Unable to accept referral. Please try again.');
        return;
      }

      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to home after a brief delay
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 2000);
    } catch (err) {
      console.error('[Referral] Error accepting:', err);
      Alert.alert('Error', 'Unable to accept referral. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg }}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FA114F" />
          <Text className="text-gray-500 mt-4">Loading referral...</Text>
        </View>
      </View>
    );
  }

  // Render error state
  if (error) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg }}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20 }}>
          <LiquidGlassBackButton onPress={() => router.back()} />
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <XCircle size={64} color="#EF4444" />
          <Text className="text-xl font-bold mt-4 text-center" style={{ color: colors.text }}>
            Invalid Referral
          </Text>
          <Text className="text-gray-500 mt-2 text-center">{error}</Text>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            className="mt-8 px-8 py-4 rounded-full"
            style={{ backgroundColor: '#FA114F' }}
          >
            <Text className="text-white font-semibold">Go to Home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Render success state
  if (success) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg }}>
        <View className="flex-1 items-center justify-center px-8">
          <Animated.View entering={FadeInDown.duration(400)}>
            <CheckCircle size={80} color="#10B981" />
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <Text className="text-2xl font-bold mt-6 text-center" style={{ color: colors.text }}>
              Referral Accepted!
            </Text>
            <Text className="text-gray-500 mt-2 text-center">
              Complete onboarding to claim your 7-day Mover trial
            </Text>
          </Animated.View>
          <ActivityIndicator size="small" color="#FA114F" className="mt-8" />
          <Text className="text-gray-400 text-sm mt-2">Taking you to the app...</Text>
        </View>
      </View>
    );
  }

  // Render referral preview
  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Background Gradient */}
      <LinearGradient
        colors={colors.isDark
          ? ['rgba(250, 17, 79, 0.15)', 'transparent']
          : ['rgba(250, 17, 79, 0.08)', 'transparent']
        }
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 300 }}
      />

      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, flex: 1 }}>
        {/* Header */}
        <LiquidGlassBackButton onPress={() => router.back()} />

        {/* Content */}
        <Animated.View entering={FadeInDown.duration(600)} className="mt-8">
          {/* Gift Icon */}
          <View className="items-center mb-6">
            <View
              className="w-20 h-20 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(250, 17, 79, 0.15)' }}
            >
              <Gift size={40} color="#FA114F" />
            </View>
          </View>

          {/* Title */}
          <Text className="text-3xl font-bold text-center mb-2" style={{ color: colors.text }}>
            You've Been Invited!
          </Text>

          <View className="flex-row items-center justify-center gap-2 mb-8">
            {referrer?.referrer_avatar ? (
              <ExpoImage
                source={{ uri: referrer.referrer_avatar }}
                style={{ width: 24, height: 24, borderRadius: 12 }}
              />
            ) : (
              <Users size={18} color={colors.isDark ? '#9CA3AF' : '#6B7280'} />
            )}
            <Text className="text-gray-500">
              {referrer?.referrer_name} invited you to MoveTogether
            </Text>
          </View>

          {/* Reward Card */}
          <View
            className="rounded-3xl p-6 mb-6"
            style={{
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              borderWidth: 1,
              borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            }}
          >
            <View className="flex-row items-center gap-2 mb-3">
              <Star size={20} color="#F59E0B" />
              <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                Your Reward
              </Text>
            </View>
            <Text className="text-2xl font-bold mb-3" style={{ color: '#FA114F' }}>
              {referrer?.reward_description}
            </Text>
            <Text style={{ color: colors.isDark ? '#9CA3AF' : '#6B7280' }}>
              Join MoveTogether and get unlimited competitions, advanced analytics, and more for 7 days — completely free!
            </Text>
          </View>

          {/* Accept Button */}
          <Pressable
            onPress={handleAcceptReferral}
            disabled={isProcessing}
            className="py-4 rounded-2xl items-center"
            style={{
              backgroundColor: isProcessing ? 'rgba(250, 17, 79, 0.5)' : '#FA114F',
            }}
          >
            {isProcessing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white text-lg font-bold">
                {user ? 'Accept Invitation' : 'Sign Up to Accept'}
              </Text>
            )}
          </Pressable>

          {/* Sign In Note */}
          {!user && (
            <Text className="text-gray-500 text-center mt-4 text-sm">
              You'll need to sign in or create an account to accept this referral
            </Text>
          )}
        </Animated.View>
      </View>
    </View>
  );
}
