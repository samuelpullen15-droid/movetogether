import React, { useState } from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AlertTriangle,
  Trash2,
  Trophy,
  Activity,
  Users,
  MessageSquare,
  Medal,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const DELETED_DATA = [
  { icon: Activity, label: 'All activity and health data' },
  { icon: Trophy, label: 'Competition history and scores' },
  { icon: Medal, label: 'Achievements and badges' },
  { icon: Users, label: 'Friends and connections' },
  { icon: MessageSquare, label: 'Chat messages and reactions' },
];

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmed = confirmText === 'DELETE';

  const handleDelete = async () => {
    if (!isConfirmed || !user?.id || !supabase) return;

    Alert.alert(
      'Final Confirmation',
      'This action is PERMANENT and cannot be undone. Are you absolutely sure you want to delete your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete Everything',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setIsDeleting(true);

            try {
              const { data: sessionData } = await supabase.auth.getSession();
              const accessToken = sessionData?.session?.access_token;

              if (!accessToken) {
                throw new Error('Not authenticated');
              }

              const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user-account`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({ confirmation: 'DELETE' }),
                }
              );

              const result = await response.json();

              if (!response.ok) {
                throw new Error(result.error || 'Deletion failed');
              }

              // Sign out and redirect
              await signOut();

              Alert.alert(
                'Account Deleted',
                'Your account and all associated data have been permanently deleted. We\'re sorry to see you go.',
                [
                  {
                    text: 'OK',
                    onPress: () => router.replace('/sign-in'),
                  },
                ]
              );
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert(
                'Deletion Failed',
                'We couldn\'t delete your account. Please try again later or contact support.'
              );
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

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
        keyboardShouldPersistTaps="handled"
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
              style={{ color: '#EF4444' }}
              className="text-2xl font-bold ml-4"
            >
              Delete Account
            </Text>
          </Animated.View>
        </View>

        {/* Warning Banner */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(50)}
          className="mx-5 mt-2 p-4 rounded-xl"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 1,
            borderColor: 'rgba(239, 68, 68, 0.2)',
          }}
        >
          <View className="flex-row items-center mb-2">
            <AlertTriangle size={20} color="#EF4444" />
            <Text className="text-red-500 font-bold ml-2">
              This action is permanent
            </Text>
          </View>
          <Text className="text-red-400 text-sm">
            Deleting your account will permanently remove all your data from
            MoveTogether. This cannot be undone.
          </Text>
        </Animated.View>

        {/* What Will Be Deleted */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          className="px-5 mt-6"
        >
          <Text
            style={{ color: colors.text }}
            className="text-lg font-bold mb-3"
          >
            What Will Be Deleted
          </Text>
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.card }}
          >
            {DELETED_DATA.map((item, index) => (
              <View
                key={item.label}
                className="flex-row items-center py-3.5 px-4"
                style={{
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: colors.isDark
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(0,0,0,0.05)',
                }}
              >
                <View
                  className="w-8 h-8 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                >
                  <item.icon size={16} color="#EF4444" />
                </View>
                <Text style={{ color: colors.text }} className="text-base">
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Confirmation Input */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(150)}
          className="px-5 mt-8"
        >
          <Text
            style={{ color: colors.text }}
            className="text-lg font-bold mb-2"
          >
            Confirm Deletion
          </Text>
          <Text
            style={{ color: colors.textSecondary }}
            className="text-sm mb-4"
          >
            Type <Text className="font-bold text-red-500">DELETE</Text> to
            confirm you want to permanently delete your account.
          </Text>
          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="Type DELETE to confirm"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            className="py-4 px-4 rounded-xl text-base"
            style={{
              backgroundColor: colors.card,
              color: colors.text,
              borderWidth: 1,
              borderColor: confirmText.length > 0
                ? isConfirmed
                  ? 'rgba(239, 68, 68, 0.5)'
                  : 'rgba(239, 68, 68, 0.2)'
                : 'transparent',
            }}
          />
        </Animated.View>

        {/* Delete Button */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(200)}
          className="px-5 mt-8"
        >
          <TouchableOpacity
            onPress={handleDelete}
            disabled={!isConfirmed || isDeleting}
            className="py-4 rounded-xl items-center flex-row justify-center"
            style={{
              backgroundColor: isConfirmed && !isDeleting
                ? '#EF4444'
                : colors.card,
              opacity: isConfirmed ? 1 : 0.5,
            }}
            activeOpacity={0.8}
          >
            {isDeleting ? (
              <>
                <ActivityIndicator size="small" color="#EF4444" />
                <Text
                  style={{ color: colors.text }}
                  className="font-semibold text-base ml-2"
                >
                  Deleting Account...
                </Text>
              </>
            ) : (
              <>
                <Trash2 size={20} color={isConfirmed ? 'white' : colors.textSecondary} />
                <Text
                  style={{ color: isConfirmed ? 'white' : colors.textSecondary }}
                  className="font-semibold text-base ml-2"
                >
                  Delete My Account
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Alternative */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(250)}
          className="px-5 mt-6"
        >
          <Text
            style={{ color: colors.textSecondary }}
            className="text-sm text-center"
          >
            Want to take a break instead? You can simply sign out and come back
            anytime.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
