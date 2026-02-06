import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  RefreshControl,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import { friendsApi } from '@/lib/edge-functions';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { UserX } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface BlockedUser {
  id: string;
  friend_id: string;
  blocked_at: string;
  user: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const fetchBlockedUsers = useCallback(async (isRefresh = false) => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      if (!isRefresh) setIsLoading(true);

      // Per security rules: Use Edge Function instead of direct RPC
      const { data, error } = await friendsApi.getMyBlockedFriendships();

      if (error) {
        console.error('Error fetching blocked users:', error);
      } else {
        setBlockedUsers(
          ((data as any[]) || []).map((item: any) => ({
            id: item.id,
            friend_id: item.blocked_user_id,
            blocked_at: item.created_at,
            user: {
              id: item.blocked_user_id,
              username: item.username,
              full_name: item.full_name,
              avatar_url: item.avatar_url,
            },
          }))
        );
      }
    } catch (err) {
      console.error('Error in fetchBlockedUsers:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  // Refresh blocked users list every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchBlockedUsers();
    }, [fetchBlockedUsers])
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchBlockedUsers(true);
  }, [fetchBlockedUsers]);

  const handleUnblock = async (blockedUser: BlockedUser) => {
    Alert.alert(
      'Unblock User',
      `Are you sure you want to unblock ${
        blockedUser.user.full_name || blockedUser.user.username || 'this user'
      }? They will be able to send you friend requests and competition invites again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setUnblockingId(blockedUser.id);

            try {
              // Per security rules: Use Edge Function instead of direct table access
              const { error } = await friendsApi.removeFriendship({ friendshipId: blockedUser.id });

              if (error) {
                console.error('Error unblocking user:', error);
                Alert.alert('Error', 'Failed to unblock user. Please try again.');
              } else {
                setBlockedUsers((prev) =>
                  prev.filter((u) => u.id !== blockedUser.id)
                );
              }
            } catch (err) {
              console.error('Error in handleUnblock:', err);
              Alert.alert('Error', 'Failed to unblock user. Please try again.');
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  const renderBlockedUser = (blockedUser: BlockedUser, index: number) => (
    <Animated.View
      key={blockedUser.id}
      entering={FadeInDown.duration(400).delay(index * 50)}
    >
      <View
        className="flex-row items-center justify-between py-3.5 px-4"
        style={{
          borderTopWidth: index > 0 ? 1 : 0,
          borderTopColor: colors.isDark
            ? 'rgba(255,255,255,0.05)'
            : 'rgba(0,0,0,0.05)',
        }}
      >
        <View className="flex-row items-center flex-1">
          {blockedUser.user.avatar_url ? (
            <Image
              source={{ uri: blockedUser.user.avatar_url }}
              className="w-10 h-10 rounded-full mr-3"
            />
          ) : (
            <View
              className="w-10 h-10 rounded-full mr-3 items-center justify-center"
              style={{
                backgroundColor: colors.isDark
                  ? 'rgba(255,255,255,0.1)'
                  : 'rgba(0,0,0,0.05)',
              }}
            >
              <Text style={{ color: colors.textSecondary }} className="text-lg">
                {(blockedUser.user.full_name ||
                  blockedUser.user.username ||
                  '?')[0]?.toUpperCase()}
              </Text>
            </View>
          )}
          <View className="flex-1">
            <Text style={{ color: colors.text }} className="text-base font-medium">
              {blockedUser.user.full_name || blockedUser.user.username || 'Unknown'}
            </Text>
            {blockedUser.user.username && blockedUser.user.full_name && (
              <Text
                style={{ color: colors.textSecondary }}
                className="text-sm"
              >
                @{blockedUser.user.username}
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => handleUnblock(blockedUser)}
          disabled={unblockingId === blockedUser.id}
          className="py-2 px-4 rounded-lg"
          style={{
            backgroundColor: colors.isDark
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(0,0,0,0.04)',
          }}
          activeOpacity={0.7}
        >
          {unblockingId === blockedUser.id ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={{ color: colors.text }} className="text-sm font-medium">
              Unblock
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.bg }}
      >
        <ActivityIndicator size="large" color="#FA114F" />
        <Text style={{ color: colors.textSecondary }} className="mt-4">
          Loading blocked users...
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
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#FA114F"
          />
        }
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
              Blocked Users
            </Text>
          </Animated.View>
        </View>

        {blockedUsers.length === 0 ? (
          <Animated.View
            entering={FadeInDown.duration(500).delay(100)}
            className="flex-1 items-center justify-center px-8 py-16"
          >
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-4"
              style={{
                backgroundColor: colors.isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.04)',
              }}
            >
              <UserX size={32} color={colors.textSecondary} />
            </View>
            <Text
              style={{ color: colors.text }}
              className="text-lg font-bold mb-2 text-center"
            >
              No Blocked Users
            </Text>
            <Text
              style={{ color: colors.textSecondary }}
              className="text-center"
            >
              You haven't blocked anyone yet. Blocked users won't be able to
              send you friend requests or competition invites.
            </Text>
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeInDown.duration(500).delay(50)}
            className="px-5 mt-2"
          >
            <Text
              style={{ color: colors.textSecondary }}
              className="text-sm mb-3"
            >
              {blockedUsers.length} blocked user{blockedUsers.length !== 1 ? 's' : ''}
            </Text>
            <View
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.card }}
            >
              {blockedUsers.map((user, index) => renderBlockedUser(user, index))}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}
