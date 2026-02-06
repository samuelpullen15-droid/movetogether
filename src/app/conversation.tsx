/**
 * Conversation Screen
 *
 * Individual DM conversation with message bubbles, reactions,
 * read receipts, and optimistic sending with moderation.
 * Follows the competition-detail.tsx chat UI pattern exactly.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ArrowUp } from 'lucide-react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase';
import { getAvatarUrl } from '@/lib/avatar-utils';
import {
  loadDMMessages,
  sendDM,
  markConversationRead,
  subscribeToDMMessages,
  addDMReaction,
  removeDMReaction,
  type DMMessage,
  type ReactionType,
} from '@/lib/dm-service';
import { dmApi, profileApi } from '@/lib/edge-functions';
import { SkeletonChatBubble, Skeleton } from '@/components/SkeletonLoader';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;

const REACTION_EMOJIS: Record<ReactionType, string> = {
  love: '\u2764\uFE0F',
  thumbsUp: '\uD83D\uDC4D',
  thumbsDown: '\uD83D\uDC4E',
  laugh: '\uD83D\uDE02',
  exclamation: '\u2757',
  question: '\u2753',
};

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function shouldShowDateSeparator(current: DMMessage, previous: DMMessage | null): boolean {
  if (!previous) return true;
  const currentDate = new Date(current.timestamp).toDateString();
  const previousDate = new Date(previous.timestamp).toDateString();
  return currentDate !== previousDate;
}

export default function ConversationScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { id: conversationId, partnerId } = useLocalSearchParams<{ id: string; partnerId: string }>();
  const user = useAuthStore((s) => s.user);
  const authUser = useMemo(() => ({
    id: user?.id || '',
    firstName: user?.firstName || user?.username || 'User',
    username: user?.username || '',
    avatarUrl: user?.avatarUrl || null,
  }), [user?.id, user?.firstName, user?.username, user?.avatarUrl]);

  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [partnerAvatar, setPartnerAvatar] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [reactionPickerPosition, setReactionPickerPosition] = useState<{
    top: number;
    isOwn: boolean;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Keyboard handling - animate input bar with keyboard
  const keyboardHeight = useSharedValue(0);

  const scrollToBottom = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  useKeyboardHandler(
    {
      onMove: (e) => {
        'worklet';
        keyboardHeight.value = e.height;
      },
      onEnd: (e) => {
        'worklet';
        keyboardHeight.value = e.height;
        // Scroll to bottom when keyboard finishes appearing
        if (e.height > 0) {
          runOnJS(scrollToBottom)();
        }
      },
    },
    []
  );

  const inputBarAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      paddingBottom: Math.max(keyboardHeight.value, insets.bottom) + 10,
    };
  });

  // Load partner profile
  useEffect(() => {
    if (!partnerId) return;
    (async () => {
      try {
        const { data: profile } = await profileApi.getUserProfile(partnerId);
        if (profile) {
          const name = profile.full_name?.split(' ')[0] || profile.username || 'User';
          setPartnerName(name);
          setPartnerAvatar(getAvatarUrl(profile.avatar_url, name, profile.username || ''));
        }
      } catch {}
    })();
  }, [partnerId]);

  // Load messages and mark as read
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      setIsLoading(true);
      const msgs = await loadDMMessages(conversationId);
      setMessages(msgs);
      setIsLoading(false);
      markConversationRead(conversationId);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    })();
  }, [conversationId]);

  // Subscribe to new messages
  useEffect(() => {
    if (!conversationId) return;
    const unsub = subscribeToDMMessages(conversationId, (newMsg) => {
      // Skip own messages (handled by optimistic UI)
      if (newMsg.senderId === authUser.id) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      // Mark as read since we're viewing the conversation
      markConversationRead(conversationId);

      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [conversationId, authUser.id]);

  // Send message (optimistic + moderation)
  const handleSend = useCallback(() => {
    if (!newMessage.trim() || isSendingMessage || !conversationId) return;

    const messageText = newMessage.trim();
    const tempId = `temp_${Date.now()}`;

    setIsSendingMessage(true);

    // Optimistic UI
    const optimisticMessage: DMMessage = {
      id: tempId,
      senderId: authUser.id,
      senderName: authUser.firstName,
      senderAvatar: getAvatarUrl(authUser.avatarUrl, authUser.firstName, authUser.username),
      text: messageText,
      timestamp: new Date().toISOString(),
      readAt: null,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage('');
    setIsSendingMessage(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    // Background: moderate then save
    (async () => {
      try {
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        // Call moderation API (reuses competition chat moderation)
        const url = `${SUPABASE_URL}/functions/v1/moderate-chat-message`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            competition_id: conversationId, // Participant check gracefully skips
            message_content: messageText,
          }),
        });

        const result = await response.json();

        if (result.blocked) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(
            'Message Blocked',
            result.reason || 'Your message was blocked for violating community guidelines.',
            [{ text: 'OK' }]
          );
          return;
        }

        // Message allowed - save to database
        const saveResult = await sendDM(conversationId, messageText);
        if (saveResult.success && saveResult.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? saveResult.message! : m))
          );
        }
      } catch (error) {
        console.error('[Conversation] Background processing error:', error);
        try {
          const saveResult = await sendDM(conversationId, messageText);
          if (saveResult.success && saveResult.message) {
            setMessages((prev) =>
              prev.map((m) => (m.id === tempId ? saveResult.message! : m))
            );
          }
        } catch {}
      }
    })();
  }, [newMessage, isSendingMessage, conversationId, authUser]);

  // Reaction handling
  const handleLongPress = (messageId: string, pageY: number, isOwn: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMessageId(messageId);
    setReactionPickerPosition({ top: pageY - 60, isOwn });
  };

  const closeReactionPicker = () => {
    setSelectedMessageId(null);
    setReactionPickerPosition(null);
  };

  const handleReaction = async (reactionType: ReactionType) => {
    if (!selectedMessageId) return;

    const msg = messages.find((m) => m.id === selectedMessageId);
    const hasReacted = msg?.reactions?.[reactionType]?.includes(authUser.id);

    if (hasReacted) {
      await removeDMReaction(selectedMessageId, reactionType);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== selectedMessageId) return m;
          const updated = { ...m.reactions };
          if (updated[reactionType]) {
            updated[reactionType] = updated[reactionType]!.filter((id) => id !== authUser.id);
            if (updated[reactionType]!.length === 0) delete updated[reactionType];
          }
          return { ...m, reactions: Object.keys(updated).length > 0 ? updated : undefined };
        })
      );
    } else {
      await addDMReaction(selectedMessageId, reactionType);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== selectedMessageId) return m;
          const updated = { ...m.reactions };
          // Remove any existing reaction from this user
          for (const key of Object.keys(updated)) {
            if (updated[key as ReactionType]) {
              updated[key as ReactionType] = updated[key as ReactionType]!.filter((id) => id !== authUser.id);
              if (updated[key as ReactionType]!.length === 0) delete updated[key as ReactionType];
            }
          }
          updated[reactionType] = [...(updated[reactionType] || []), authUser.id];
          return { ...m, reactions: updated };
        })
      );
    }

    closeReactionPicker();
  };

  // Find the last own message to show read status
  const lastOwnMessage = [...messages].reverse().find((m) => m.senderId === authUser.id);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          backgroundColor: colors.bg,
        }}
      >
        <Pressable onPress={() => router.back()} className="active:opacity-70 mr-3 p-1">
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        {partnerAvatar ? (
          <Image
            source={{ uri: partnerAvatar }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            }}
          />
        ) : null}
        <Text style={{ color: colors.text, marginLeft: 10 }} className="text-lg font-semibold">
          {partnerName || 'Loading...'}
        </Text>
      </View>

      {/* Messages */}
      {isLoading ? (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12 }}>
          {/* Date separator skeleton */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <Skeleton width={80} height={14} borderRadius={7} />
          </View>
          {/* Chat bubbles skeleton */}
          <View style={{ gap: 12 }}>
            <SkeletonChatBubble isOwn={false} />
            <SkeletonChatBubble isOwn={true} />
            <SkeletonChatBubble isOwn={false} />
            <SkeletonChatBubble isOwn={true} />
          </View>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((message, index) => {
            const isOwn = message.senderId === authUser.id;
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const showDate = shouldShowDateSeparator(message, prevMessage);
            const showSender = !isOwn && (index === 0 || messages[index - 1].senderId !== message.senderId);
            const isLastOwn = message.id === lastOwnMessage?.id;

            return (
              <View key={message.id}>
                {/* Date separator */}
                {showDate && (
                  <View style={{ alignItems: 'center', marginVertical: 12 }}>
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      {formatMessageDate(message.timestamp)}
                    </Text>
                  </View>
                )}

                {/* Message bubble */}
                <Animated.View
                  entering={message.id.startsWith('temp_') ? FadeInUp.duration(200) : undefined}
                  style={{
                    alignSelf: isOwn ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    marginBottom: 4,
                  }}
                >
                  {/* Sender name */}
                  {showSender && (
                    <Text className="text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
                      {message.senderName}
                    </Text>
                  )}

                  <Pressable
                    onLongPress={(e) => handleLongPress(message.id, e.nativeEvent.pageY, isOwn)}
                    delayLongPress={300}
                  >
                    <View
                      style={{
                        backgroundColor: isOwn
                          ? 'rgba(250, 17, 79, 0.85)'
                          : colors.isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(0, 0, 0, 0.06)',
                        borderRadius: 20,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                      }}
                    >
                      <Text
                        style={{ color: isOwn ? '#FFFFFF' : colors.text }}
                        className="text-base"
                      >
                        {message.text}
                      </Text>
                    </View>
                  </Pressable>

                  {/* Reactions */}
                  {message.reactions && Object.keys(message.reactions).length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2, marginHorizontal: 4 }}>
                      {Object.entries(message.reactions).map(([reaction, users]) => (
                        <View
                          key={reaction}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                            borderRadius: 12,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            marginRight: 4,
                            marginBottom: 2,
                          }}
                        >
                          <Text style={{ fontSize: 14 }}>
                            {REACTION_EMOJIS[reaction as ReactionType]}
                          </Text>
                          {(users as string[]).length > 1 && (
                            <Text className="text-xs ml-1" style={{ color: colors.textSecondary }}>
                              {(users as string[]).length}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Timestamp + read receipt */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, marginHorizontal: 4 }}>
                    <Text className="text-xs" style={{ color: colors.textSecondary, opacity: 0.7 }}>
                      {formatMessageTime(message.timestamp)}
                    </Text>
                    {isOwn && isLastOwn && message.readAt && (
                      <Text className="text-xs ml-2" style={{ color: '#22C55E' }}>
                        Read
                      </Text>
                    )}
                  </View>
                </Animated.View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Reaction Picker Overlay */}
      {reactionPickerPosition && (
        <Pressable
          onPress={closeReactionPicker}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: Math.max(100, reactionPickerPosition.top),
              left: reactionPickerPosition.isOwn ? undefined : 20,
              right: reactionPickerPosition.isOwn ? 20 : undefined,
              flexDirection: 'row',
              backgroundColor: colors.isDark ? '#2C2C2E' : '#FFFFFF',
              borderRadius: 24,
              paddingVertical: 8,
              paddingHorizontal: 12,
              gap: 4,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            {(Object.keys(REACTION_EMOJIS) as ReactionType[]).map((reaction) => {
              const selectedMsg = messages.find((m) => m.id === selectedMessageId);
              const hasReacted = selectedMsg?.reactions?.[reaction]?.includes(authUser.id) ?? false;

              return (
                <Pressable
                  key={reaction}
                  onPress={() => handleReaction(reaction)}
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 22,
                    backgroundColor: hasReacted
                      ? colors.isDark
                        ? 'rgba(250, 17, 79, 0.3)'
                        : 'rgba(250, 17, 79, 0.15)'
                      : 'transparent',
                    borderWidth: hasReacted ? 2 : 0,
                    borderColor: hasReacted ? '#FA114F' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 24 }}>{REACTION_EMOJIS[reaction]}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      )}

      {/* Input Bar - Animated with keyboard (matches competition chat style) */}
      <Animated.View
        style={[
          {
            paddingTop: 12,
            paddingHorizontal: 16,
            backgroundColor: colors.bg,
          },
          inputBarAnimatedStyle,
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 24,
            backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: colors.isDark ? 0.35 : 0.15,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 48,
              paddingHorizontal: 16,
              borderRadius: 24,
              marginRight: 12,
              backgroundColor: colors.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)',
            }}
          >
            <TextInput
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Send a message..."
              placeholderTextColor="#6b7280"
              style={{
                flex: 1,
                fontSize: 16,
                lineHeight: 20,
                paddingTop: 14,
                paddingBottom: 14,
                maxHeight: 100,
                color: colors.text,
              }}
              multiline
              maxLength={500}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!newMessage.trim() || isSendingMessage}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: newMessage.trim() && !isSendingMessage ? '#FA114F' : (colors.isDark ? '#2a2a2c' : '#e5e5e5'),
            }}
          >
            {isSendingMessage ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <ArrowUp size={24} color={newMessage.trim() ? 'white' : '#6b7280'} strokeWidth={2.5} />
            )}
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}
