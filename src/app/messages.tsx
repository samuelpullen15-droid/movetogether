/**
 * Messages Screen
 *
 * Conversations list for direct messages. Shows all DM conversations
 * sorted by most recent activity.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  FlatList,
  Pressable,
  Image,
  RefreshControl,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MessageCircle, PenSquare } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import { useSubscription } from '@/lib/useSubscription';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonConversationRow } from '@/components/SkeletonLoader';
import {
  loadConversations,
  subscribeToAllDMs,
  getOrCreateConversation,
  type DMConversation,
} from '@/lib/dm-service';
import { getUserFriends } from '@/lib/friends-service';
import type { FriendWithProfile } from '@/lib/friends-service';

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ConversationRow({
  conversation,
  userId,
  onPress,
  colors,
}: {
  conversation: DMConversation;
  userId: string;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const lastMsg = conversation.lastMessage;
  const isOwnLastMessage = lastMsg?.senderId === userId;
  const preview = lastMsg
    ? (isOwnLastMessage ? 'You: ' : '') + lastMsg.content.substring(0, 50) + (lastMsg.content.length > 50 ? '...' : '')
    : 'No messages yet';

  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-80"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
      }}
    >
      {/* Avatar */}
      <Image
        source={{ uri: conversation.partnerAvatar }}
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
        }}
      />

      {/* Content */}
      <View style={{ flex: 1, marginLeft: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text
            style={{ color: colors.text }}
            className={`text-base ${conversation.unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}
            numberOfLines={1}
          >
            {conversation.partnerName}
          </Text>
          {lastMsg && (
            <Text style={{ color: colors.textSecondary }} className="text-xs">
              {formatTimeAgo(lastMsg.createdAt)}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          <Text
            style={{ color: conversation.unreadCount > 0 ? colors.text : colors.textSecondary, flex: 1 }}
            className={`text-sm ${conversation.unreadCount > 0 ? 'font-medium' : ''}`}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {conversation.unreadCount > 0 && (
            <View
              style={{
                backgroundColor: '#FA114F',
                borderRadius: 10,
                minWidth: 20,
                height: 20,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 6,
                marginLeft: 8,
              }}
            >
              <Text className="text-white text-xs font-bold">
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { canAccessGroupChat } = useSubscription();
  const isPro = canAccessGroupChat();

  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // New message sheet state
  const newMessageSheetRef = useRef<BottomSheet>(null);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id || !isPro) {
      setIsLoading(false);
      return;
    }
    const data = await loadConversations();
    setConversations(data);
    setIsLoading(false);
  }, [user?.id, isPro]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id && isPro) {
        load();
      }
    }, [user?.id, isPro, load])
  );

  // Subscribe for live updates
  useEffect(() => {
    if (!user?.id || !isPro) return;
    const unsub = subscribeToAllDMs(user.id, () => {
      load();
    });
    return unsub;
  }, [user?.id, isPro, load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const handleConversationPress = (conv: DMConversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/conversation?id=${conv.id}&partnerId=${conv.partnerId}`);
  };

  // New message handlers
  const openNewMessageSheet = async () => {
    if (!user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    newMessageSheetRef.current?.expand();
    setIsLoadingFriends(true);
    const data = await getUserFriends(user.id);
    setFriends(data);
    setIsLoadingFriends(false);
  };

  const handleFriendSelect = async (friend: FriendWithProfile) => {
    if (isStartingChat) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsStartingChat(true);
    try {
      const result = await getOrCreateConversation(friend.id);
      if (result.conversationId) {
        newMessageSheetRef.current?.close();
        setFriendSearch('');
        router.push(`/conversation?id=${result.conversationId}&partnerId=${friend.id}`);
      } else {
        Alert.alert('Error', result.error || 'Could not start conversation.');
      }
    } catch {
      Alert.alert('Error', 'Could not start conversation. Please try again.');
    } finally {
      setIsStartingChat(false);
    }
  };

  const filteredFriends = useMemo(() => {
    if (!friendSearch.trim()) return friends;
    const q = friendSearch.toLowerCase();
    return friends.filter(
      (f) =>
        f.name?.toLowerCase().includes(q) ||
        f.username?.toLowerCase().includes(q)
    );
  }, [friends, friendSearch]);

  return (
    <PaywallOverlay requiredTier="mover" feature="Messages">
      <View className="flex-1" style={{ backgroundColor: colors.bg }}>
        {/* Header */}
        <LinearGradient
          colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#F3E8FF', colors.bg]}
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            paddingBottom: 20,
          }}
        >
          <View className="mb-6">
            <LiquidGlassBackButton onPress={() => router.back()} />
          </View>
          <Animated.View entering={FadeInDown.duration(600)}>
            <View className="flex-row items-center justify-between">
              <View>
                <Text style={{ color: colors.text, lineHeight: 34 }} className="text-3xl font-bold">
                  Messages
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-base mt-1">
                  Direct messages with friends
                </Text>
              </View>
              <Pressable
                onPress={openNewMessageSheet}
                className="active:opacity-80"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: '#FA114F',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PenSquare size={18} color="#fff" />
              </Pressable>
            </View>
          </Animated.View>
        </LinearGradient>

        {/* Conversations List */}
        {isLoading ? (
          <View>
            <SkeletonConversationRow />
            <View
              style={{
                height: 1,
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                marginLeft: 86,
              }}
            />
            <SkeletonConversationRow />
            <View
              style={{
                height: 1,
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                marginLeft: 86,
              }}
            />
            <SkeletonConversationRow />
          </View>
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No Messages Yet"
            description="Start a conversation with a friend to chat about competitions and fitness goals!"
            actionLabel="Start a Conversation"
            onAction={() => newMessageSheetRef.current?.expand()}
          />
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.duration(400).delay(index * 50)}>
                <ConversationRow
                  conversation={item}
                  userId={user?.id || ''}
                  onPress={() => handleConversationPress(item)}
                  colors={colors}
                />
              </Animated.View>
            )}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.text}
              />
            }
            contentContainerStyle={{ paddingBottom: 40 }}
            ItemSeparatorComponent={() => (
              <View
                style={{
                  height: 1,
                  backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                  marginLeft: 86,
                }}
              />
            )}
          />
        )}

        {/* New Message Bottom Sheet */}
        <BottomSheet
          ref={newMessageSheetRef}
          index={-1}
          snapPoints={['60%', '85%']}
          enablePanDownToClose
          backgroundStyle={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#fff' }}
          handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
          backdropComponent={(props) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
          )}
          onChange={(index) => {
            if (index === -1) {
              setFriendSearch('');
            }
          }}
        >
          <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
            <Text style={{ color: colors.text }} className="text-xl font-bold mb-4">
              New Message
            </Text>

            {/* Search input */}
            <TextInput
              placeholder="Search friends..."
              placeholderTextColor={colors.textSecondary}
              value={friendSearch}
              onChangeText={setFriendSearch}
              style={{
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                borderRadius: 12,
                padding: 12,
                color: colors.text,
                marginBottom: 16,
                fontSize: 15,
              }}
            />

            {/* Friends list */}
            {isLoadingFriends ? (
              <ActivityIndicator color="#FA114F" style={{ marginTop: 20 }} />
            ) : filteredFriends.length === 0 ? (
              <Text
                style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}
                className="text-sm"
              >
                {friendSearch ? 'No friends match your search' : 'No friends yet'}
              </Text>
            ) : (
              filteredFriends.map((friend) => (
                <Pressable
                  key={friend.id}
                  onPress={() => handleFriendSelect(friend)}
                  className="active:opacity-70"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                  }}
                >
                  <Image
                    source={{ uri: friend.avatar }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    }}
                  />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ color: colors.text }} className="font-semibold text-base">
                      {friend.name}
                    </Text>
                    {friend.username ? (
                      <Text style={{ color: colors.textSecondary }} className="text-sm">
                        {friend.username}
                      </Text>
                    ) : null}
                  </View>
                  {isStartingChat && (
                    <ActivityIndicator size="small" color="#FA114F" />
                  )}
                </Pressable>
              ))
            )}
          </BottomSheetScrollView>
        </BottomSheet>
      </View>
    </PaywallOverlay>
  );
}
