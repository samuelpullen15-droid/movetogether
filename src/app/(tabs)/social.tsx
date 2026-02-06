import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Modal,
  Platform,
  ActivityIndicator,
  Dimensions,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from 'react-native';
import { Text, DisplayText } from '@/components/Text';
import { Card } from '@/components/Card';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  UserPlus,
  Users,
  ChevronRight,
  Search,
  X,
  Phone,
  Check,
  Lock,
  Bell,
  Trophy,
  MessageCircle,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { sectionEnter, cardEnter, listItemEnter, statEnter } from '@/lib/animations';
import { TripleActivityRings } from '@/components/ActivityRing';
import {
  fetchActivityFeed,
  addReaction,
  removeReaction,
  addComment,
  REACTION_TYPES,
  ActivityFeedItem,
} from '@/lib/activity-service';
import { activityApi, friendsApi, FriendLeaderboardEntry } from '@/lib/edge-functions';
import { loadConversations, subscribeToAllDMs } from '@/lib/dm-service';
import * as Haptics from 'expo-haptics';
import { useSubscription } from '@/lib/useSubscription';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { ThemeTransition } from '@/components/ThemeTransition';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { EmptyState } from '@/components/EmptyState';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { LiquidGlassIconButton } from '@/components/LiquidGlassIconButton';
import {
  getUserFriends,
  sendFriendRequest,
  getPendingFriendRequests,
  getSentFriendRequests,
  acceptFriendRequest,
  FriendWithProfile,
} from '@/lib/friends-service';
import {
  searchUsersByUsername,
  searchUsersByPhoneNumber,
  findUsersFromContacts,
  searchResultToFriend,
} from '@/lib/user-search-service';
import { Friend } from '@/lib/competition-types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { formatPresenceTime, isOnline } from '@/lib/presence-service';
import * as Contacts from 'expo-contacts';
import {
  Skeleton,
  SkeletonCircle,
  SkeletonListItem,
  SkeletonLeaderboardRow,
} from '@/components/SkeletonLoader';

const { width, height: screenHeight } = Dimensions.get('window');

// Module-level cache so data survives NativeTabs unmount/remount cycles
let _cache: {
  activityFeed: ActivityFeedItem[];
  leaderboard: FriendLeaderboardEntry[];
  pendingRequests: FriendWithProfile[];
  sentRequests: FriendWithProfile[];
  sentRequestIds: Set<string>;
  totalUnreadDMs: number;
  loaded: boolean;
} = {
  activityFeed: [],
  leaderboard: [],
  pendingRequests: [],
  sentRequests: [],
  sentRequestIds: new Set(),
  totalUnreadDMs: 0,
  loaded: false,
};

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

// Subscription tier colors for avatar borders
const TIER_COLORS: Record<string, string> = {
  starter: '#FA114F',  // Pink
  mover: '#3B82F6',    // Blue
  crusher: '#8B5CF6',  // Purple
};

// Friend Chip Component for horizontal strip
function FriendChip({
  friend,
  onPress,
  colors,
}: {
  friend: FriendWithProfile;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const presence = formatPresenceTime((friend as any).lastActiveDate);
  const tierColor = TIER_COLORS[friend.subscriptionTier || 'starter'] || TIER_COLORS.starter;

  // Calculate progress ratios for rings
  const rings = (friend as any).currentRings || {};
  const moveProgress = rings.moveGoal > 0 ? Math.min(1.5, (rings.move || 0) / rings.moveGoal) : 0;
  const exerciseProgress = rings.exerciseGoal > 0 ? Math.min(1.5, (rings.exercise || 0) / rings.exerciseGoal) : 0;
  const standProgress = rings.standGoal > 0 ? Math.min(1.5, (rings.stand || 0) / rings.standGoal) : 0;

  return (
    <Pressable
      onPress={onPress}
      className="items-center mr-2 active:opacity-70"
      style={{ width: 68 }}
    >
      {/* Avatar with subscription tier border */}
      <View className="relative">
        <Image
          source={{ uri: friend.avatar }}
          className="w-16 h-16 rounded-full"
          style={{ borderWidth: 2, borderColor: tierColor }}
        />
        {/* Online/Offline dot */}
        <View
          className="absolute bottom-0 right-0 w-4 h-4 rounded-full"
          style={{
            backgroundColor: presence.dotColor,
            borderWidth: 2,
            borderColor: colors.card,
          }}
        />
      </View>

      {/* Name (first name only) */}
      <Text
        numberOfLines={1}
        className="text-xs mt-2 text-center"
        style={{ color: colors.text }}
      >
        {friend.name?.split(' ')[0] || 'Friend'}
      </Text>

      {/* Presence status text */}
      <Text
        className="text-[10px] mt-0.5"
        style={{ color: presence.dotColor }}
      >
        {presence.text}
      </Text>

      {/* Mini Rings */}
      <View className="mt-1">
        <TripleActivityRings
          size={32}
          moveProgress={moveProgress}
          exerciseProgress={exerciseProgress}
          standProgress={standProgress}
        />
      </View>
    </Pressable>
  );
}

// Compact Activity Card Component with reactions
function ActivityCard({
  activity,
  onPress,
  colors,
  onReact,
  onOpenComments,
  showReactionPicker,
  onToggleReactionPicker,
}: {
  activity: ActivityFeedItem;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
  onReact: (activityId: string, emoji: string) => void;
  onOpenComments: (activityId: string) => void;
  showReactionPicker: boolean;
  onToggleReactionPicker: (activityId: string | null) => void;
}) {
  const hasReactions = activity.reaction_counts && Object.keys(activity.reaction_counts).length > 0;
  const commentCount = (activity as any).comment_count || 0;

  return (
    <View className="mx-5 mb-2">
      <Pressable
        onPress={onPress}
        className="active:opacity-80"
      >
        <Card variant="flat" radius={12} padding={12}>
          <View className="flex-row items-center">
            <Image
              source={{ uri: activity.user?.avatar_url || '' }}
              className="w-9 h-9 rounded-full"
            />
            <View className="flex-1 ml-2.5">
              <Text style={{ color: colors.text }} className="text-sm font-medium" numberOfLines={1}>
                {activity.title}
              </Text>
              <Text style={{ color: colors.textSecondary }} className="text-xs">
                {activity.subtitle ? `${activity.subtitle} · ` : ''}{formatTimeAgo(activity.created_at)}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textSecondary} />
          </View>

          {/* Reaction row */}
          {(hasReactions || commentCount > 0) && (
            <View className="flex-row items-center mt-1.5 ml-11">
              {hasReactions && Object.entries(activity.reaction_counts || {}).map(([emoji, count]) => (
                <Pressable
                  key={emoji}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    onReact(activity.id, emoji);
                  }}
                  className="flex-row items-center mr-2 px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: activity.user_reaction === emoji
                      ? (colors.isDark ? 'rgba(250,17,79,0.2)' : 'rgba(250,17,79,0.1)')
                      : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                  }}
                >
                  <Text className="text-xs">{emoji}</Text>
                  <Text style={{ color: colors.textSecondary }} className="text-xs ml-0.5">{count as number}</Text>
                </Pressable>
              ))}
              {commentCount > 0 && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    onOpenComments(activity.id);
                  }}
                  className="flex-row items-center mr-2 px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
                >
                  <Text className="text-xs">💬</Text>
                  <Text style={{ color: colors.textSecondary }} className="text-xs ml-0.5">{commentCount}</Text>
                </Pressable>
              )}
              <View className="flex-1" />
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onToggleReactionPicker(showReactionPicker ? null : activity.id);
                }}
                className="px-1.5 py-0.5"
              >
                <Text className="text-xs" style={{ color: colors.textSecondary }}>+</Text>
              </Pressable>
            </View>
          )}

          {/* Quick-react button when no reactions exist */}
          {!hasReactions && commentCount === 0 && (
            <View className="flex-row items-center mt-1 ml-11">
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onToggleReactionPicker(showReactionPicker ? null : activity.id);
                }}
                className="px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
              >
                <Text className="text-xs" style={{ color: colors.textSecondary }}>React</Text>
              </Pressable>
            </View>
          )}
        </Card>
      </Pressable>

      {/* Emoji Reaction Picker */}
      {showReactionPicker && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          className="flex-row items-center justify-center mt-1 mx-4 py-2 px-3 rounded-xl"
          style={{ backgroundColor: colors.card }}
        >
          {REACTION_TYPES.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => onReact(activity.id, emoji)}
              className="mx-2 p-1.5 rounded-full active:opacity-60"
              style={{
                backgroundColor: activity.user_reaction === emoji
                  ? (colors.isDark ? 'rgba(250,17,79,0.25)' : 'rgba(250,17,79,0.12)')
                  : 'transparent',
                transform: [{ scale: activity.user_reaction === emoji ? 1.15 : 1 }],
              }}
            >
              <Text className="text-xl">{emoji}</Text>
            </Pressable>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const friendsFromStore = useAuthStore((s) => s.friends);
  const setFriendsInStore = useAuthStore((s) => s.setFriends);

  // Only animate on first-ever visit; skip on NativeTabs remount
  const [shouldAnimate] = useState(!_cache.loaded);

  // State — initialized from module-level cache to avoid flash on NativeTabs remount
  const [friends, setFriendsLocal] = useState<FriendWithProfile[]>(friendsFromStore);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>(_cache.activityFeed);
  const [pendingRequests, setPendingRequests] = useState<FriendWithProfile[]>(_cache.pendingRequests);
  const [sentRequests, setSentRequests] = useState<FriendWithProfile[]>(_cache.sentRequests);
  const [sentRequestIds, setSentRequestIds] = useState<Set<string>>(_cache.sentRequestIds);
  const [isLoading, setIsLoading] = useState(!_cache.loaded);
  const [loadingFeed, setLoadingFeed] = useState(!_cache.loaded);

  // Add friend modal state
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Reaction & comment state
  const [activeReactionPicker, setActiveReactionPicker] = useState<string | null>(null);
  const [commentActivityId, setCommentActivityId] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSendingComment, setIsSendingComment] = useState(false);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<FriendLeaderboardEntry[]>(_cache.leaderboard);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [showAllLeaderboard, setShowAllLeaderboard] = useState(false);

  // DM unread badge state
  const [totalUnreadDMs, setTotalUnreadDMs] = useState(_cache.totalUnreadDMs);

  // Subscription check
  const { canAccessGroupChat } = useSubscription();
  const { isLoading: isSubLoading, checkTier } = useSubscriptionStore();
  const isPro = canAccessGroupChat();

  // Animation values for modal
  const modalTranslateY = useSharedValue(screenHeight);
  const overlayOpacity = useSharedValue(0);

  // Wrapper to update both local state and auth store
  const setFriends = (newFriends: FriendWithProfile[]) => {
    setFriendsLocal(newFriends);
    setFriendsInStore(newFriends);
  };

  // Sync local state when auth store friends change
  useEffect(() => {
    setFriendsLocal(friendsFromStore);
  }, [friendsFromStore]);

  // Count friends currently online (active within last 2 minutes)
  const onlineCount = useMemo(() => {
    return friends.filter((f) => isOnline((f as any).lastActiveDate)).length;
  }, [friends]);

  // Sort friends: online first, then by recency, then alphabetically
  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const aOnline = isOnline((a as any).lastActiveDate);
      const bOnline = isOnline((b as any).lastActiveDate);
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      // If both have last active dates, sort by most recent
      const aDate = (a as any).lastActiveDate ? new Date((a as any).lastActiveDate).getTime() : 0;
      const bDate = (b as any).lastActiveDate ? new Date((b as any).lastActiveDate).getTime() : 0;
      if (aDate !== bDate) return bDate - aDate; // Most recent first
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [friends]);

  // Modal close handler
  const handleCloseModal = useCallback(() => {
    if (!isModalVisible || !showAddFriend) return;

    setIsModalVisible(false);
    overlayOpacity.value = withTiming(0, { duration: 300 });
    modalTranslateY.value = withTiming(screenHeight, { duration: 300 }, (finished) => {
      'worklet';
      if (finished) {
        runOnJS(setShowAddFriend)(false);
        runOnJS(setSearchQuery)('');
        runOnJS(setSearchResults)([]);
      }
    });
  }, [overlayOpacity, modalTranslateY, showAddFriend, isModalVisible]);

  // Modal open animation
  useEffect(() => {
    if (showAddFriend) {
      setIsModalVisible(true);
      modalTranslateY.value = screenHeight;
      overlayOpacity.value = 0;
      setTimeout(() => {
        modalTranslateY.value = withTiming(0, { duration: 300 });
        overlayOpacity.value = withTiming(0.7, { duration: 300 });
      }, 50);
    }
  }, [showAddFriend, modalTranslateY, overlayOpacity]);

  useEffect(() => {
    if (!showAddFriend && !isModalVisible) {
      modalTranslateY.value = screenHeight;
      overlayOpacity.value = 0;
    }
  }, [showAddFriend, isModalVisible, modalTranslateY, overlayOpacity]);

  const modalAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: modalTranslateY.value }],
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  // Load data
  const loadFriends = async () => {
    if (!user?.id) return;
    try {
      const userFriends = await getUserFriends(user.id);
      setFriends(userFriends);
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const loadPendingRequests = async () => {
    if (!user?.id) return;
    try {
      const requests = await getPendingFriendRequests(user.id);
      setPendingRequests(requests);
    } catch (error) {
      console.error('Error loading pending requests:', error);
    }
  };

  const loadSentRequests = async () => {
    if (!user?.id) return;
    try {
      const requests = await getSentFriendRequests(user.id);
      setSentRequests(requests);
      setSentRequestIds(new Set(requests.map((r) => r.id)));
    } catch (error) {
      console.error('Error loading sent requests:', error);
    }
  };

  const loadActivityFeed = async () => {
    try {
      if (activityFeed.length === 0) setLoadingFeed(true);
      const data = await fetchActivityFeed();
      setActivityFeed(data);
    } catch (error) {
      console.error('Error loading activity feed:', error);
    } finally {
      setLoadingFeed(false);
    }
  };

  const loadLeaderboard = async () => {
    try {
      setLoadingLeaderboard(true);
      const { data } = await friendsApi.getFriendsDailyLeaderboard();
      setLeaderboard(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const loadUnreadDMs = async () => {
    if (!user?.id || !isPro) return;
    try {
      const convos = await loadConversations();
      setTotalUnreadDMs(convos.reduce((sum, c) => sum + c.unreadCount, 0));
    } catch (error) {
      console.error('Error loading unread DMs:', error);
    }
  };

  // Handle reaction (optimistic update + server call)
  const handleReaction = useCallback(async (activityId: string, emoji: string) => {
    setActiveReactionPicker(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const currentItem = activityFeed.find((a) => a.id === activityId);
    const currentUserReaction = currentItem?.user_reaction;
    const isToggleOff = currentUserReaction === emoji;

    // Optimistic update
    setActivityFeed((prev) =>
      prev.map((item) => {
        if (item.id !== activityId) return item;
        const counts = { ...(item.reaction_counts || {}) };

        // Remove old reaction count
        if (item.user_reaction && counts[item.user_reaction]) {
          (counts[item.user_reaction] as number)--;
          if ((counts[item.user_reaction] as number) <= 0) delete counts[item.user_reaction];
        }

        if (isToggleOff) {
          return { ...item, user_reaction: null, reaction_counts: counts };
        }

        // Add new reaction count
        counts[emoji] = ((counts[emoji] as number) || 0) + 1;
        return { ...item, user_reaction: emoji, reaction_counts: counts };
      })
    );

    // Server call
    try {
      if (isToggleOff) {
        await removeReaction(activityId, emoji);
      } else {
        await addReaction(activityId, emoji);
      }
    } catch (e) {
      console.error('Failed to update reaction:', e);
      // Revert by reloading feed
      loadActivityFeed();
    }
  }, [activityFeed]);

  // Open comments sheet
  const handleOpenComments = useCallback(async (activityId: string) => {
    setCommentActivityId(activityId);
    setCommentText('');
    setIsLoadingComments(true);
    try {
      const { data } = await activityApi.getActivityComments(activityId);
      setComments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load comments:', e);
      setComments([]);
    } finally {
      setIsLoadingComments(false);
    }
  }, []);

  // Send a comment
  const handleSendComment = useCallback(async () => {
    if (!commentActivityId || !commentText.trim()) return;
    setIsSendingComment(true);
    try {
      await addComment(commentActivityId, commentText.trim());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCommentText('');
      // Reload comments
      const { data } = await activityApi.getActivityComments(commentActivityId);
      setComments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to send comment:', e);
      Alert.alert('Error', 'Failed to send comment. Please try again.');
    } finally {
      setIsSendingComment(false);
    }
  }, [commentActivityId, commentText]);

  // Write through to module-level cache whenever data changes
  useEffect(() => { _cache.activityFeed = activityFeed; }, [activityFeed]);
  useEffect(() => { _cache.leaderboard = leaderboard; }, [leaderboard]);
  useEffect(() => { _cache.pendingRequests = pendingRequests; }, [pendingRequests]);
  useEffect(() => { _cache.sentRequests = sentRequests; }, [sentRequests]);
  useEffect(() => { _cache.sentRequestIds = sentRequestIds; }, [sentRequestIds]);
  useEffect(() => { _cache.totalUnreadDMs = totalUnreadDMs; }, [totalUnreadDMs]);

  // Initial load
  useEffect(() => {
    async function loadAll() {
      if (!user?.id || !isPro) return;
      if (!_cache.loaded) setIsLoading(true);
      await Promise.all([
        loadFriends(),
        loadPendingRequests(),
        loadSentRequests(),
        loadActivityFeed(),
        loadLeaderboard(),
        loadUnreadDMs(),
      ]);
      setIsLoading(false);
      _cache.loaded = true;
    }
    loadAll();
  }, [user?.id, isPro]);

  // Real-time subscription for friend requests
  useEffect(() => {
    if (!user?.id) return;
    if (!isSupabaseConfigured() || !supabase) return; // Safety check

    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel(`friendships-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friendships',
            filter: `friend_id=eq.${user.id}`,
          },
          () => {
            loadPendingRequests();
            loadFriends();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friendships',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadSentRequests();
            loadFriends();
          }
        )
        .subscribe();
    } catch (error) {
      console.error('Error setting up realtime subscription:', error);
    }

    return () => {
      if (channel && supabase) {
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          console.error('Error removing channel:', error);
        }
      }
    };
  }, [user?.id]);

  // Real-time subscription for DM unread badge
  useEffect(() => {
    if (!user?.id || !isPro) return;
    const unsub = subscribeToAllDMs(user.id, () => {
      loadUnreadDMs();
    });
    return unsub;
  }, [user?.id, isPro]);

  // Auto-refresh friend list every 60 seconds to update presence status
  useEffect(() => {
    if (!isPro || !user?.id) return;

    const refreshInterval = setInterval(() => {
      loadFriends();
      loadLeaderboard();
    }, 60000); // 60 seconds

    return () => clearInterval(refreshInterval);
  }, [isPro, user?.id]);

  // Check tier on mount and focus
  useEffect(() => {
    checkTier();
  }, [checkTier]);

  useFocusEffect(
    useCallback(() => {
      checkTier();
      if (isPro && user?.id) {
        loadFriends();
        loadActivityFeed();
        loadLeaderboard();
        loadUnreadDMs();
      }
    }, [checkTier, isPro, user?.id])
  );

  // Debounced search
  useEffect(() => {
    if (!showAddFriend || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, showAddFriend]);

  const performSearch = async () => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const [usernameResults, phoneResults] = await Promise.all([
        searchUsersByUsername(searchQuery).catch(() => []),
        searchUsersByPhoneNumber(searchQuery).catch(() => []),
      ]);

      const allResults = [...usernameResults, ...phoneResults];
      const uniqueResults = Array.from(
        new Map(allResults.map((r) => [r.id, r])).values()
      );

      const friendIds = new Set(friends.map((f) => f.id));
      const filteredResults = uniqueResults
        .filter((r) => r.id !== user?.id && !friendIds.has(r.id) && !sentRequestIds.has(r.id))
        .map(searchResultToFriend);

      setSearchResults(filteredResults);
    } catch (error) {
      console.error('Error searching:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddFriend = async (friendId: string) => {
    if (!user?.id) return;

    try {
      const result = await sendFriendRequest(user.id, friendId);
      if (result.success) {
        setSentRequestIds((prev) => new Set([...prev, friendId]));
        await loadSentRequests();
      } else {
        Alert.alert('Error', result.error || 'Failed to send friend request');
      }
    } catch (error) {
      console.error('Error adding friend:', error);
      Alert.alert('Error', 'Failed to add friend');
    }
  };

  const handleFindFromContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'We need access to your contacts to find friends who are using the app.',
          [{ text: 'OK' }]
        );
        return;
      }

      const { data: contacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });

      if (!contacts || contacts.length === 0) {
        Alert.alert('No Contacts', 'No contacts found on your device.');
        return;
      }

      const emails: string[] = [];
      const phoneNumbers: string[] = [];

      contacts.forEach((contact) => {
        if (contact.emails && contact.emails.length > 0) {
          contact.emails.forEach((email) => {
            if (email.email) emails.push(email.email.toLowerCase().trim());
          });
        }
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          contact.phoneNumbers.forEach((phone) => {
            if (phone.number) phoneNumbers.push(phone.number);
          });
        }
      });

      if (emails.length === 0 && phoneNumbers.length === 0) {
        Alert.alert('No Contact Info', 'No emails or phone numbers found in your contacts.');
        return;
      }

      console.log(`[Contacts] Extracted ${emails.length} emails and ${phoneNumbers.length} phone numbers from ${contacts.length} contacts`);

      setIsSearching(true);
      try {
        const foundUsers = await findUsersFromContacts(emails, phoneNumbers);
        console.log(`[Contacts] Found ${foundUsers.length} matching users from contacts`);

        const friendIds = new Set(friends.map((f) => f.id));
        const filteredResults = foundUsers
          .filter((u) => u.id !== user?.id && !friendIds.has(u.id) && !sentRequestIds.has(u.id))
          .map(searchResultToFriend);

        if (filteredResults.length === 0) {
          // Check if we found users but they're all already friends
          const alreadyFriendCount = foundUsers.filter(
            (u) => u.id !== user?.id && friendIds.has(u.id)
          ).length;

          if (alreadyFriendCount > 0) {
            Alert.alert(
              'All Connected!',
              `All ${alreadyFriendCount} contact${alreadyFriendCount !== 1 ? 's' : ''} who use MoveTogether are already your friends!`
            );
          } else {
            Alert.alert(
              'No Friends Found',
              'No friends from your contacts are using MoveTogether yet. Invite them to join!'
            );
          }
        } else {
          setSearchResults(filteredResults);
        }
      } catch (error) {
        console.error('Error finding friends from contacts:', error);
        Alert.alert('Error', 'Failed to find friends from contacts');
      } finally {
        setIsSearching(false);
      }
    } catch (error) {
      console.error('Error accessing contacts:', error);
      Alert.alert('Error', 'Failed to access contacts');
    }
  };

  const handleViewProfile = useCallback(
    (userId: string) => {
      router.push(`/friend-profile?id=${userId}`);
    },
    [router]
  );

  // Show loading state only on first-ever tier check (not on re-focus)
  if (isSubLoading && !_cache.loaded) {
    return (
      <ThemeTransition>
        <View style={{ backgroundColor: colors.bg }} className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FA114F" />
        </View>
      </ThemeTransition>
    );
  }

  return (
    <PaywallOverlay requiredTier="mover" feature="Friends">
      <ThemeTransition>
        <View style={{ backgroundColor: colors.bg }} className="flex-1">
          <ScreenBackground accent="#3B82F6" />
          {/* Background Image */}
          <Image
            source={require('../../../assets/AppFriendsScreen.png')}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: width,
              height: width,
            }}
            resizeMode="cover"
          />
          {/* Fill color below image */}
          <View
            style={{
              position: 'absolute',
              top: width,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.bg,
            }}
            pointerEvents="none"
          />

          <ScrollView
            className="flex-1"
            style={{ backgroundColor: 'transparent' }}
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16 }}>
              <Animated.View entering={shouldAnimate ? sectionEnter : undefined}>
                <View className="flex-row items-center justify-between">
                  <View>
                    <DisplayText style={{ color: colors.text }} className="text-3xl font-bold">
                      Friends
                    </DisplayText>
                    <Text style={{ color: colors.textSecondary }} className="text-base mt-1">
                      {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
                      {onlineCount > 0 && (
                        <Text style={{ color: '#22C55E' }}> · {onlineCount} online</Text>
                      )}
                    </Text>
                  </View>
                  <View className="flex-row items-center" style={{ gap: 25, marginRight: 8 }}>
                    {isPro && (
                      <View style={{ position: 'relative' }}>
                        <LiquidGlassIconButton
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push('/messages');
                          }}
                          iconName="bubble.right"
                          size={35}
                          iconSize={25}
                        />
                        {totalUnreadDMs > 0 && (
                          <View
                            style={{
                              position: 'absolute',
                              top: -2,
                              right: -2,
                              backgroundColor: '#FA114F',
                              borderRadius: 9,
                              minWidth: 18,
                              height: 18,
                              alignItems: 'center',
                              justifyContent: 'center',
                              paddingHorizontal: 4,
                            }}
                            pointerEvents="none"
                          >
                            <Text className="text-white text-xs font-bold" style={{ fontSize: 10 }}>
                              {totalUnreadDMs > 99 ? '99+' : totalUnreadDMs}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                    <LiquidGlassIconButton
                      onPress={() => setShowAddFriend(true)}
                      iconName="person.badge.plus"
                      size={35}
                      iconSize={25}
                    />
                  </View>
                </View>
              </Animated.View>
            </View>

            {/* Friend Request Banner */}
            {pendingRequests.length > 0 && (
              <Animated.View entering={shouldAnimate ? cardEnter(1) : undefined} className="mx-5 mb-4">
                <Pressable
                  onPress={() => setShowAddFriend(true)}
                  style={{ backgroundColor: colors.isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)' }}
                  className="rounded-2xl p-4 flex-row items-center active:opacity-80"
                >
                  <View className="w-10 h-10 rounded-full bg-blue-500 items-center justify-center">
                    <Bell size={20} color="white" />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text style={{ color: colors.text }} className="font-semibold">
                      {pendingRequests.length} friend {pendingRequests.length === 1 ? 'request' : 'requests'}
                    </Text>
                    <Text style={{ color: colors.textSecondary }} className="text-sm">
                      Tap to view and accept
                    </Text>
                  </View>
                  <ChevronRight size={20} color={colors.textSecondary} />
                </Pressable>
              </Animated.View>
            )}

            {/* Horizontal Friends Strip */}
            {isLoading ? (
              <View className="mb-6">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
                >
                  {[0, 1, 2, 3, 4].map((i) => (
                    <View key={i} className="items-center" style={{ width: 68 }}>
                      <SkeletonCircle size={64} />
                      <Skeleton width={50} height={10} style={{ marginTop: 8 }} />
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : friends.length === 0 ? (
              <View className="mx-5 mb-6">
                <Card variant="surface" noPadding>
                  <EmptyState
                    icon={Users}
                    atmosphereWord="FRIENDS"
                    title="No Friends Yet"
                    description="Add friends to see their activity and ring progress"
                    actionLabel="Add Your First Friend"
                    onAction={() => setShowAddFriend(true)}
                    compact
                  />
                </Card>
              </View>
            ) : (
              <Animated.View entering={shouldAnimate ? cardEnter(0) : undefined} className="mb-6">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20 }}
                >
                  {/* Add Friend Button */}
                  <Pressable
                    onPress={() => setShowAddFriend(true)}
                    className="items-center mr-2 active:opacity-70"
                    style={{ width: 68 }}
                  >
                    <View
                      className="w-16 h-16 rounded-full items-center justify-center"
                      style={{
                        borderWidth: 2,
                        borderStyle: 'dashed',
                        borderColor: colors.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
                      }}
                    >
                      <UserPlus size={24} color={colors.textSecondary} />
                    </View>
                    <Text
                      className="text-xs mt-2 text-center"
                      style={{ color: colors.textSecondary }}
                    >
                      Add
                    </Text>
                    {/* Spacer to match mini rings height */}
                    <View className="mt-1" style={{ height: 32 }} />
                  </Pressable>

                  {/* Friend Chips */}
                  {sortedFriends.map((friend) => (
                    <FriendChip
                      key={friend.id}
                      friend={friend}
                      onPress={() => handleViewProfile(friend.id)}
                      colors={colors}
                    />
                  ))}
                </ScrollView>

                {/* See all friends */}
                <Pressable
                  onPress={() => router.push('/friends')}
                  className="mx-5 -mt-1 active:opacity-70"
                >
                  <Text style={{ color: '#FA114F' }} className="text-base font-semibold">
                    {`See all ${friends.length} friends`}
                  </Text>
                </Pressable>
              </Animated.View>
            )}

            {/* Today's Leaderboard */}
            {friends.length > 0 && (
              <Animated.View entering={shouldAnimate ? cardEnter(0) : undefined} className="mx-5 mb-6">
                <Card variant="surface" noPadding>
                  {/* Header */}
                  <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
                    <View className="flex-row items-center gap-2">
                      <Trophy size={18} color="#FA114F" />
                      <DisplayText style={{ color: colors.text }} className="text-lg font-semibold">
                        Today's Leaderboard
                      </DisplayText>
                    </View>
                    {leaderboard.length > 5 && (
                      <Pressable
                        onPress={() => setShowAllLeaderboard(!showAllLeaderboard)}
                        className="active:opacity-70"
                      >
                        <Text style={{ color: '#FA114F' }} className="text-sm font-semibold">
                          {showAllLeaderboard ? 'Show less' : 'See all'}
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {loadingLeaderboard && leaderboard.length === 0 ? (
                    <View className="px-4 pb-3 pt-1" style={{ gap: 8 }}>
                      <SkeletonLeaderboardRow />
                      <SkeletonLeaderboardRow />
                      <SkeletonLeaderboardRow />
                    </View>
                  ) : leaderboard.length === 0 ? (
                    <View className="px-4 pb-4 pt-2">
                      <Text style={{ color: colors.textSecondary }} className="text-sm text-center">
                        Close your rings to appear here!
                      </Text>
                    </View>
                  ) : (
                    <View className="px-4 pb-3 pt-1">
                      {(showAllLeaderboard ? leaderboard : leaderboard.slice(0, 5)).map((entry) => {
                        const rankColor =
                          entry.rank === 1 ? '#FFD700' :
                          entry.rank === 2 ? '#C0C0C0' :
                          entry.rank === 3 ? '#CD7F32' :
                          colors.textSecondary;

                        return (
                          <Pressable
                            key={entry.user_id}
                            onPress={() => {
                              if (!entry.is_self) handleViewProfile(entry.user_id);
                            }}
                            className="flex-row items-center py-2.5"
                            style={entry.is_self ? {
                              backgroundColor: colors.isDark ? 'rgba(250,17,79,0.1)' : 'rgba(250,17,79,0.06)',
                              marginHorizontal: -16,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                            } : undefined}
                          >
                            {/* Rank */}
                            <Text
                              className="font-bold text-base"
                              style={{ color: rankColor, width: 28, textAlign: 'center' }}
                            >
                              {entry.rank}
                            </Text>

                            {/* Avatar */}
                            {entry.avatar_url ? (
                              <Image
                                source={{ uri: entry.avatar_url }}
                                className="w-9 h-9 rounded-full"
                              />
                            ) : (
                              <View
                                className="w-9 h-9 rounded-full items-center justify-center"
                                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
                              >
                                <Users size={16} color={colors.textSecondary} />
                              </View>
                            )}

                            {/* Name */}
                            <View className="flex-1 ml-3">
                              <View className="flex-row items-center gap-1.5">
                                <Text
                                  numberOfLines={1}
                                  className="font-semibold text-sm"
                                  style={{ color: colors.text }}
                                >
                                  {entry.full_name || entry.username || 'User'}
                                </Text>
                                {entry.is_self && (
                                  <View
                                    className="px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: 'rgba(250,17,79,0.15)' }}
                                  >
                                    <Text className="text-xs font-semibold" style={{ color: '#FA114F' }}>You</Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            {/* Score + Rings */}
                            <View className="items-end">
                              <Text className="font-bold text-sm" style={{ color: colors.text }}>
                                {Math.round(entry.daily_score)}
                              </Text>
                              <Text className="text-xs" style={{ color: colors.textSecondary }}>
                                {entry.rings_closed}/3 rings
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </Card>
              </Animated.View>
            )}

            {/* Recent Activity Section */}
            <Animated.View entering={shouldAnimate ? sectionEnter : undefined} className="px-5 mb-3">
              <DisplayText style={{ color: colors.text }} className="text-xl font-semibold">
                Recent Activity
              </DisplayText>
            </Animated.View>

            {loadingFeed && activityFeed.length === 0 ? (
              <View className="px-5" style={{ gap: 12 }}>
                <SkeletonListItem hasAvatar avatarSize={48} lines={2} />
                <SkeletonListItem hasAvatar avatarSize={48} lines={2} />
                <SkeletonListItem hasAvatar avatarSize={48} lines={2} />
              </View>
            ) : activityFeed.length === 0 ? (
              <View className="mx-5">
                <Card variant="surface" noPadding>
                  <EmptyState
                    icon={Users}
                    atmosphereWord="ACTIVITY"
                    title="No Activity Yet"
                    description="Your friends' achievements and workouts will appear here!"
                    compact
                  />
                </Card>
              </View>
            ) : (
              activityFeed.map((activity, index) => (
                <Animated.View
                  key={activity.id}
                  entering={shouldAnimate ? listItemEnter(index) : undefined}
                >
                  <ActivityCard
                    activity={activity}
                    onPress={() => handleViewProfile(activity.user_id)}
                    colors={colors}
                    onReact={handleReaction}
                    onOpenComments={handleOpenComments}
                    showReactionPicker={activeReactionPicker === activity.id}
                    onToggleReactionPicker={setActiveReactionPicker}
                  />
                </Animated.View>
              ))
            )}
          </ScrollView>

          {/* Add Friend Modal */}
          {showAddFriend && (
            <Modal transparent animationType="none" onRequestClose={handleCloseModal}>
              <View className="flex-1" pointerEvents={isModalVisible ? 'auto' : 'box-none'}>
                <Animated.View
                  className="absolute inset-0"
                  style={[
                    { backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)' },
                    overlayAnimatedStyle,
                  ]}
                  pointerEvents={isModalVisible ? 'auto' : 'none'}
                >
                  {isModalVisible && (
                    <Pressable className="flex-1" onPress={handleCloseModal} />
                  )}
                </Animated.View>
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      top: screenHeight * 0.15,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      justifyContent: 'flex-start',
                    },
                    modalAnimatedStyle,
                  ]}
                  pointerEvents={isModalVisible ? 'auto' : 'none'}
                >
                  <View style={{ flex: 1 }}>
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={!isModalVisible}>
                      <View
                        className="rounded-t-3xl"
                        style={{
                          flex: 1,
                          borderTopLeftRadius: 24,
                          borderTopRightRadius: 24,
                          overflow: 'hidden',
                          backgroundColor: colors.bg,
                        }}
                      >
                        <ScrollView
                          className="flex-1"
                          contentContainerStyle={{ paddingBottom: 120 }}
                          showsVerticalScrollIndicator={false}
                          keyboardShouldPersistTaps="handled"
                          style={{ backgroundColor: 'transparent' }}
                        >
                          {/* Header */}
                          <View
                            style={{ paddingTop: 28, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: colors.bg }}
                          >
                            <View className="mb-5">
                              <LiquidGlassBackButton onPress={handleCloseModal} />
                            </View>
                            <DisplayText style={{ color: colors.text }} className="text-3xl font-bold">
                              Add Friends
                            </DisplayText>
                            <Text style={{ color: colors.textSecondary }} className="text-base mt-1">
                              Find and connect with friends
                            </Text>
                          </View>

                          {/* Search Section */}
                          <View className="px-5 mb-6">
                            <View
                              style={{ backgroundColor: colors.card }}
                              className="rounded-full px-5 py-4 flex-row items-center"
                            >
                              <Search size={20} color={colors.textSecondary} />
                              <TextInput
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search by username or phone..."
                                placeholderTextColor={colors.textSecondary}
                                style={{ color: colors.text }}
                                className="text-lg ml-3 flex-1"
                                autoCapitalize="none"
                                autoCorrect={false}
                                spellCheck={false}
                                keyboardType="default"
                                selectionColor="#FA114F"
                                onFocus={() => setIsSearchFocused(true)}
                                onBlur={() => setIsSearchFocused(false)}
                                returnKeyType="search"
                                onSubmitEditing={() => Keyboard.dismiss()}
                              />
                              {searchQuery.length > 0 && (
                                <Pressable
                                  onPress={() => {
                                    setSearchQuery('');
                                    setSearchResults([]);
                                    Keyboard.dismiss();
                                  }}
                                  className="ml-2 p-1 active:opacity-70"
                                >
                                  <X size={18} color={colors.textSecondary} />
                                </Pressable>
                              )}
                            </View>
                          </View>

                          {/* Find from Contacts */}
                          {!isSearchFocused && searchQuery.length === 0 && (
                            <Animated.View
                              entering={cardEnter(0)}
                              exiting={FadeOut.duration(200)}
                              className="px-5 mb-6"
                            >
                              <Text
                                style={{ color: colors.text }}
                                className="text-lg font-semibold mb-3"
                              >
                                Find Friends Elsewhere
                              </Text>
                              <Card variant="surface" noPadding>
                                <Pressable
                                  onPress={handleFindFromContacts}
                                  disabled={isSearching}
                                  className="flex-row items-center justify-between px-5 py-5 active:opacity-70"
                                >
                                  <View className="flex-row items-center">
                                    <Phone size={22} color="#FA114F" />
                                    <Text style={{ color: colors.text }} className="text-lg ml-3">
                                      Find Friends from Contacts
                                    </Text>
                                  </View>
                                  <ChevronRight size={20} color={colors.textSecondary} />
                                </Pressable>
                              </Card>
                            </Animated.View>
                          )}

                          {/* Friend Requests in Modal */}
                          {!isSearchFocused && searchQuery.length === 0 && pendingRequests.length > 0 && (
                            <Animated.View
                              entering={cardEnter(1)}
                              exiting={FadeOut.duration(200)}
                              className="px-5 mb-6"
                            >
                              <Text
                                style={{ color: colors.text }}
                                className="text-lg font-semibold mb-3"
                              >
                                Friend Requests
                              </Text>
                              <Card variant="surface" noPadding>
                                {pendingRequests.map((request, index) => (
                                  <View
                                    key={request.id}
                                    className="px-5 py-4"
                                    style={
                                      index < pendingRequests.length - 1
                                        ? {
                                            borderBottomWidth: 1,
                                            borderBottomColor: colors.isDark
                                              ? 'rgba(255,255,255,0.05)'
                                              : 'rgba(0,0,0,0.05)',
                                          }
                                        : undefined
                                    }
                                  >
                                    <View className="flex-row items-start mb-4">
                                      <Image
                                        source={{ uri: request.avatar }}
                                        className="w-14 h-14 rounded-full"
                                      />
                                      <View className="flex-1 ml-4">
                                        <Text
                                          style={{ color: colors.text }}
                                          className="font-bold text-base"
                                        >
                                          {request.name || 'User'}
                                        </Text>
                                        {request.username && (
                                          <Text
                                            style={{ color: colors.textSecondary }}
                                            className="text-sm mt-0.5"
                                          >
                                            {request.username}
                                          </Text>
                                        )}
                                        <Text className="text-blue-400 text-sm mt-1">Added you</Text>
                                      </View>
                                    </View>
                                    <View className="flex-row" style={{ gap: 12 }}>
                                      <Pressable
                                        onPress={() => {
                                          setPendingRequests((prev) =>
                                            prev.filter((r) => r.id !== request.id)
                                          );
                                        }}
                                        style={{
                                          backgroundColor: colors.isDark
                                            ? 'rgba(255,255,255,0.1)'
                                            : 'rgba(0,0,0,0.05)',
                                        }}
                                        className="flex-1 rounded-xl py-3 items-center active:opacity-80"
                                      >
                                        <Text
                                          style={{ color: colors.text }}
                                          className="font-semibold text-sm"
                                        >
                                          Maybe later
                                        </Text>
                                      </Pressable>
                                      <Pressable
                                        onPress={async () => {
                                          if (!user?.id || !request.id) return;
                                          try {
                                            const result = await acceptFriendRequest(
                                              user.id,
                                              request.id
                                            );
                                            if (result.success) {
                                              await loadPendingRequests();
                                              await loadFriends();
                                            } else {
                                              Alert.alert(
                                                'Error',
                                                result.error || 'Failed to accept request'
                                              );
                                            }
                                          } catch (error) {
                                            console.error('Error accepting request:', error);
                                            Alert.alert('Error', 'Failed to accept request');
                                          }
                                        }}
                                        className="flex-1 bg-green-600 rounded-xl py-3 items-center flex-row justify-center active:opacity-80"
                                        style={{ gap: 6 }}
                                      >
                                        <Check size={16} color="white" />
                                        <Text className="text-white font-semibold text-sm">
                                          Accept
                                        </Text>
                                      </Pressable>
                                    </View>
                                  </View>
                                ))}
                              </Card>
                            </Animated.View>
                          )}

                          {/* Search Results */}
                          {searchQuery.length >= 2 && searchResults.length > 0 && (
                            <Animated.View
                              entering={cardEnter(0)}
                              className="px-5 mb-6"
                            >
                              <Text
                                style={{ color: colors.text }}
                                className="text-lg font-semibold mb-3"
                              >
                                Search Results
                              </Text>
                              <View className="gap-3">
                                {searchResults.map((result) => {
                                  const hasSubscription =
                                    result.subscriptionTier && result.subscriptionTier !== 'starter';
                                  return (
                                    <Pressable
                                      key={result.id}
                                      onPress={() => hasSubscription && handleAddFriend(result.id)}
                                      className="active:opacity-80"
                                    >
                                      <Card variant="surface" noPadding>
                                      <View className="flex-row items-center px-5 py-4">
                                        <Image
                                          source={{ uri: result.avatar }}
                                          className="w-16 h-16 rounded-full"
                                        />
                                        <View className="flex-1 ml-4">
                                          <Text
                                            style={{ color: colors.text }}
                                            className="font-bold text-lg"
                                          >
                                            {result.name || 'User'}
                                          </Text>
                                          {result.username && (
                                            <Text
                                              style={{ color: colors.textSecondary }}
                                              className="text-base mt-0.5"
                                            >
                                              {result.username}
                                            </Text>
                                          )}
                                        </View>
                                        {sentRequestIds.has(result.id) ? (
                                          <View
                                            className="px-6 py-3 rounded-full flex-row items-center"
                                            style={{
                                              gap: 6,
                                              backgroundColor: colors.isDark
                                                ? 'rgba(255,255,255,0.1)'
                                                : 'rgba(0,0,0,0.05)',
                                            }}
                                          >
                                            <Check size={18} color="#10b981" />
                                            <Text
                                              style={{ color: colors.textSecondary }}
                                              className="font-semibold text-base"
                                            >
                                              Sent
                                            </Text>
                                          </View>
                                        ) : !result.subscriptionTier ||
                                          result.subscriptionTier === 'starter' ? (
                                          <View
                                            className="px-6 py-3 rounded-full flex-row items-center opacity-50"
                                            style={{
                                              gap: 6,
                                              backgroundColor: colors.isDark
                                                ? 'rgba(255,255,255,0.1)'
                                                : 'rgba(0,0,0,0.1)',
                                            }}
                                          >
                                            <Lock size={16} color={colors.textSecondary} />
                                            <Text
                                              style={{ color: colors.textSecondary }}
                                              className="font-semibold text-base"
                                            >
                                              No sub
                                            </Text>
                                          </View>
                                        ) : (
                                          <Pressable
                                            onPress={(e) => {
                                              e.stopPropagation();
                                              handleAddFriend(result.id);
                                            }}
                                            className="px-6 py-3 rounded-full bg-fitness-accent active:opacity-80 flex-row items-center"
                                            style={{ gap: 6 }}
                                          >
                                            <UserPlus size={18} color="white" />
                                            <Text className="text-white font-semibold text-base">
                                              Add
                                            </Text>
                                          </Pressable>
                                        )}
                                      </View>
                                      </Card>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </Animated.View>
                          )}

                          {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
                            <View className="items-center py-12 px-5">
                              <Text style={{ color: colors.textSecondary }} className="text-base">
                                No users found
                              </Text>
                            </View>
                          )}

                          {isSearching && (
                            <View className="items-center py-12">
                              <ActivityIndicator size="small" color="#FA114F" />
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    </TouchableWithoutFeedback>
                  </View>
                </Animated.View>
              </View>
            </Modal>
          )}
          {/* Comments Bottom Sheet Modal */}
          {commentActivityId && (
            <Modal
              transparent
              animationType="slide"
              onRequestClose={() => setCommentActivityId(null)}
            >
              <TouchableWithoutFeedback onPress={() => setCommentActivityId(null)}>
                <View className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />
              </TouchableWithoutFeedback>
              <View className="justify-end">
                <View
                  className="rounded-t-3xl"
                  style={{
                    backgroundColor: colors.card,
                    maxHeight: screenHeight * 0.6,
                    paddingBottom: insets.bottom + 8,
                  }}
                >
                  {/* Header */}
                  <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
                    <Text style={{ color: colors.text }} className="text-lg font-bold">Comments</Text>
                    <Pressable onPress={() => setCommentActivityId(null)} className="p-1">
                      <X size={20} color={colors.textSecondary} />
                    </Pressable>
                  </View>

                  {/* Comments list */}
                  <ScrollView className="px-5" style={{ maxHeight: screenHeight * 0.35 }}>
                    {isLoadingComments ? (
                      <View className="py-8 items-center">
                        <ActivityIndicator size="small" color="#FA114F" />
                      </View>
                    ) : comments.length === 0 ? (
                      <View className="py-8 items-center">
                        <Text style={{ color: colors.textSecondary }} className="text-sm">
                          No comments yet. Be the first!
                        </Text>
                      </View>
                    ) : (
                      comments.map((comment: any) => (
                        <View key={comment.id} className="flex-row py-3">
                          <Image
                            source={{ uri: comment.user?.avatar_url || '' }}
                            className="w-8 h-8 rounded-full"
                          />
                          <View className="flex-1 ml-2.5">
                            <View className="flex-row items-center">
                              <Text style={{ color: colors.text }} className="text-sm font-semibold">
                                {comment.user?.full_name || comment.user?.username || 'User'}
                              </Text>
                              <Text style={{ color: colors.textSecondary }} className="text-xs ml-2">
                                {formatTimeAgo(comment.created_at)}
                              </Text>
                            </View>
                            <Text style={{ color: colors.text }} className="text-sm mt-0.5">
                              {comment.content}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </ScrollView>

                  {/* Comment input */}
                  <View
                    className="flex-row items-center px-4 pt-3 border-t"
                    style={{ borderTopColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
                  >
                    <TextInput
                      value={commentText}
                      onChangeText={setCommentText}
                      placeholder="Add a comment..."
                      placeholderTextColor={colors.textSecondary}
                      style={{
                        color: colors.text,
                        backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                      }}
                      className="flex-1 rounded-full px-4 py-2.5 text-sm mr-2"
                      multiline={false}
                      returnKeyType="send"
                      onSubmitEditing={handleSendComment}
                    />
                    <Pressable
                      onPress={handleSendComment}
                      disabled={isSendingComment || !commentText.trim()}
                      className="px-4 py-2.5 rounded-full active:opacity-70"
                      style={{
                        backgroundColor: commentText.trim() ? '#FA114F' : (colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                      }}
                    >
                      {isSendingComment ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text className="text-sm font-semibold" style={{ color: commentText.trim() ? '#fff' : colors.textSecondary }}>
                          Send
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          )}
        </View>
      </ThemeTransition>
    </PaywallOverlay>
  );
}