import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  RefreshControl,
  Share,
} from 'react-native';
import { Text } from '@/components/Text';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFitnessStore } from '@/lib/fitness-store';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useAuthStore } from '@/lib/auth-store';
import { useHealthStore } from '@/lib/health-service';
import { getOfferings, purchasePackage } from '@/lib/revenuecatClient';
import { TripleActivityRings } from '@/components/ActivityRing';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { LiquidGlassMorphingMenu } from '@/components/LiquidGlassMorphingMenu';
import { Confetti } from '@/components/Confetti';
import {
  fetchCompetition,
  subscribeToCompetition,
  syncCompetitionHealthData,
  fetchHealthDataForDateRange,
  leaveCompetition as leaveCompetitionService,
  deleteCompetition as deleteCompetitionService,
  getUserCompetitionState,
} from '@/lib/competition-service';
import type { Competition } from '@/lib/fitness-store';
import { supabase } from '@/lib/supabase';
import { getAvatarUrl } from '@/lib/avatar-utils';
import { loadChatMessages, sendChatMessage, subscribeToChatMessages, addChatReaction, removeChatReaction } from '@/lib/chat-service';
import type { ChatMessage, ReactionType } from '@/lib/chat-service';
import { inviteApi, competitionApi } from '@/lib/edge-functions';
import type { TeamInfo } from '@/lib/fitness-store';
import TeamPickerSheet from '@/components/TeamPickerSheet';
import type BottomSheet from '@gorhom/bottom-sheet';
import { BuyInPaymentSheet } from '@/components/BuyInPaymentSheet';
import {
  Skeleton,
  SkeletonLeaderboardRow,
} from '@/components/SkeletonLoader';
import Constants from 'expo-constants';

// Get Supabase URL for chat moderation
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
import { SCORING_TYPES } from '@/lib/competition-types';

/**
 * Parse a date string (YYYY-MM-DD) as a local date, not UTC.
 * This prevents the date from shifting to the previous day in timezones west of UTC.
 */
function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}
import { useThemeColors } from '@/lib/useThemeColors';
import { SymbolView } from 'expo-symbols';
import {
  Crown,
  Calendar,
  Users,
  Clock,
  Trophy,
  TrendingUp,
  MessageCircle,
  ArrowUp,
  X,
  Lock,
  Globe,
  DoorOpen,
  AlertTriangle,
  Trash2,
  Share2,
  Pencil,
  Gift,
  ChevronLeft,
  Medal,
  PartyPopper,
  Circle,
  CheckCircle2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  FadeIn,
  FadeInUp,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from 'react-native-reanimated';

// Reaction types imported from '@/lib/chat-service'
const REACTION_EMOJIS: Record<ReactionType, string> = {
  love: '❤️',
  thumbsUp: '👍',
  thumbsDown: '👎',
  laugh: '😂',
  exclamation: '❗',
  question: '❓',
};

// Chat types are imported from '@/lib/chat-service'


// Prize pool type for display
interface PrizePool {
  id: string;
  totalAmount: number;
  payoutStructure: {
    first?: number;
    second?: number;
    third?: number;
  };
  status: 'pending' | 'active' | 'distributing' | 'distributed' | 'refunded';
  poolType?: 'creator_funded' | 'buy_in';
  buyInAmount?: number;
  participantCount?: number;
}

function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes}${ampm}`;
}

function formatMessageDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthDay = `${months[date.getMonth()]} ${date.getDate()}`;

  if (messageDate.getTime() === today.getTime()) {
    return `Today, ${monthDay}`;
  } else if (messageDate.getTime() === yesterday.getTime()) {
    return `Yesterday, ${monthDay}`;
  } else {
    return `${days[date.getDay()]}, ${monthDay}`;
  }
}

function shouldShowDateSeparator(currentTimestamp: string, previousTimestamp: string | null): boolean {
  if (!previousTimestamp) return true;
  const current = new Date(currentTimestamp);
  const previous = new Date(previousTimestamp);
  return current.toDateString() !== previous.toDateString();
}

function getRankSuffix(rank: number): string {
  if (rank === 1) return 'st';
  if (rank === 2) return 'nd';
  if (rank === 3) return 'rd';
  return 'th';
}

function getSyncAgoLabel(lastSyncAt: string | null | undefined): string {
  if (!lastSyncAt) return 'Never synced';
  const syncDate = new Date(lastSyncAt);
  const now = new Date();
  const diffMs = now.getTime() - syncDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Always show sync time so users know when data was last updated
  if (diffMins < 1) return 'Synced just now';
  if (diffMins < 60) return `Synced ${diffMins} min ago`;
  if (diffHours < 24) return `Synced ${diffHours}h ago`;
  if (diffDays === 1) return 'Synced 1 day ago';
  return `Synced ${diffDays} days ago`;
}

function getDaysRemaining(endDate: string): number {
  const end = parseLocalDate(endDate);
  end.setHours(23, 59, 59, 999);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getTotalDuration(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
}

function getCompetitionTypeLabel(type: string, startDate: string, endDate: string): string {
  if (type === 'custom') {
    const days = getTotalDuration(startDate, endDate);
    return `${days} Day`;
  }
  // Capitalize first letter for weekend, weekly, monthly
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function CompetitionDetailScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const scrollViewRef = useRef<ScrollView>(null);

  // Cache sync times in memory to avoid AsyncStorage reads
  const lastSyncTimeRef = useRef<Map<string, number>>(new Map());

  const authUser = useAuthStore((s) => s.user);
  const subscriptionTier = useSubscriptionStore((s) => s.tier);
  const isPro = subscriptionTier === 'mover' || subscriptionTier === 'crusher';
  // Get user's goals and current metrics from health store to display rings correctly
  const goals = useHealthStore((s) => s.goals);
  const currentMetrics = useHealthStore((s) => s.currentMetrics);

  // Real competition data state
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [prizePool, setPrizePool] = useState<PrizePool | null>(null);
  const optInSheetRef = useRef<BottomSheet>(null);
  const [rewardDaysCompleted, setRewardDaysCompleted] = useState(0);
  const syncFunctionRef = useRef<((forceSync?: boolean) => Promise<void>) | null>(null);
  const userId = authUser?.id;

  // Check if current user is the creator (use creator_id from competition, not first participant)
  const isCreator = userId && competition?.creatorId === userId;

  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatScrollRef = useRef<ScrollView>(null);

  // Chat moderation state
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatMuted, setChatMuted] = useState(false);
  const [chatMutedUntil, setChatMutedUntil] = useState<string | null>(null);

  // Animated values for the lock overlay (must be called unconditionally)
  const lockScale = useSharedValue(0);
  const lockRotation = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  const lockAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: lockScale.value },
      { rotate: `${lockRotation.value}deg` }
    ],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  // Trigger lock animation when score is locked
  // Calculate locked state here since competition might be null
  const isScoreLockedForAnimation = competition
    ? getUserCompetitionState(competition.startDate, competition.endDate, competition.status) === 'locked'
    : false;

  useEffect(() => {
    if (isScoreLockedForAnimation) {
      // Delay the lock icon appearance so blur shows first
      lockScale.value = withDelay(500, withTiming(1, { duration: 400 }));
      lockRotation.value = 0;
      glowOpacity.value = 0;
    }
  }, [isScoreLockedForAnimation]);

  // Load chat messages and subscribe to real-time updates when chat opens
  useEffect(() => {
    if (!showChat || !id || !isPro) return;

    // Clear unread count when chat opens
    setUnreadCount(0);

    let unsubscribe: (() => void) | null = null;

    const loadMessages = async () => {
      setIsLoadingMessages(true);
      console.log('[Chat] Loading messages for competition:', id);
      const loadedMessages = await loadChatMessages(id);
      console.log('[Chat] Loaded messages:', loadedMessages.length);
      setMessages(loadedMessages);
      setIsLoadingMessages(false);
    };

    loadMessages();

    // Build set of blocked user IDs from competition participants for real-time filtering
    const blockedParticipantIds = new Set(
      competition?.participants
        ?.filter((p) => p.isBlocked)
        .map((p) => p.id) || []
    );

    // Subscribe to new messages while chat is open
    unsubscribe = subscribeToChatMessages(id, (newMsg) => {
      // Filter out real-time messages from blocked users
      if (blockedParticipantIds.has(newMsg.oderId)) {
        console.log('[Chat] Filtered real-time message from blocked user:', newMsg.oderId);
        return;
      }
      console.log('[Chat] Received new message via real-time:', newMsg.id);
      setMessages((prev) => {
        // Check if message already exists (to avoid duplicates from own messages)
        if (prev.some((m) => m.id === newMsg.id)) {
          return prev;
        }
        return [...prev, newMsg];
      });
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [showChat, id, isPro]);

  // Subscribe to new messages when chat is CLOSED to track unread count
  useEffect(() => {
    if (showChat || !id || !isPro || !userId) return;

    // Build set of blocked user IDs for real-time filtering
    const blockedParticipantIds = new Set(
      competition?.participants
        ?.filter((p) => p.isBlocked)
        .map((p) => p.id) || []
    );

    const unsubscribe = subscribeToChatMessages(id, (newMsg) => {
      // Filter out messages from blocked users
      if (blockedParticipantIds.has(newMsg.oderId)) return;

      // Only count messages from OTHER users as unread
      if (newMsg.oderId !== userId) {
        console.log('[Chat] New unread message from:', newMsg.senderName);
        setUnreadCount((prev) => prev + 1);
        // Also add to messages array so it's there when chat opens
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) {
            return prev;
          }
          return [...prev, newMsg];
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [showChat, id, isPro, userId, competition?.participants]);

  // Reaction picker state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [reactionPickerPosition, setReactionPickerPosition] = useState<{ top: number; left: number; isOwn: boolean } | null>(null);

  const handleLongPress = (messageId: string, pageY: number, pageX: number, isOwn: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMessageId(messageId);
    setReactionPickerPosition({ top: pageY - 60, left: isOwn ? pageX - 200 : pageX, isOwn });
  };

  const handleReaction = async (reaction: ReactionType) => {
    if (!selectedMessageId || !userId) return;

    const messageId = selectedMessageId;
    const message = messages.find(m => m.id === messageId);
    const currentReactions = message?.reactions || {};
    const reactionUsers = currentReactions[reaction] || [];
    const isRemoving = reactionUsers.includes(userId);

    // Optimistic update
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const msgReactions = msg.reactions || {};
        const users = msgReactions[reaction] || [];

        if (isRemoving) {
          // Remove reaction
          const newUsers = users.filter(id => id !== userId);
          if (newUsers.length === 0) {
            const { [reaction]: _, ...rest } = msgReactions;
            return { ...msg, reactions: Object.keys(rest).length > 0 ? rest : undefined };
          }
          return { ...msg, reactions: { ...msgReactions, [reaction]: newUsers } };
        } else {
          // Add reaction
          return { ...msg, reactions: { ...msgReactions, [reaction]: [...users, userId] } };
        }
      }
      return msg;
    }));

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMessageId(null);
    setReactionPickerPosition(null);

    // Persist to database
    try {
      if (isRemoving) {
        await removeChatReaction(messageId, reaction);
      } else {
        await addChatReaction(messageId, reaction);
      }
    } catch (error) {
      console.error('[Chat] Error persisting reaction:', error);
      // Revert optimistic update on error
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return { ...msg, reactions: currentReactions };
        }
        return msg;
      }));
    }
  };

  const closeReactionPicker = () => {
    setSelectedMessageId(null);
    setReactionPickerPosition(null);
  };

  // Leave competition state
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isProcessingLeave, setIsProcessingLeave] = useState(false);

  // Menu and delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Team picker state
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [isJoiningTeam, setIsJoiningTeam] = useState(false);
  const teamPickerRef = useRef<BottomSheet>(null);

  // Results overlay state (for completed competitions)
  const [resultsOverlayDismissed, setResultsOverlayDismissed] = useState(false);
  const resultsOverlayOpacity = useSharedValue(1);

  const resultsOverlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: resultsOverlayOpacity.value,
  }));

  const dismissResultsOverlay = () => {
    resultsOverlayOpacity.value = withTiming(0, { duration: 400 });
    // Wait for fade out animation to complete before unmounting
    setTimeout(() => {
      setResultsOverlayDismissed(true);
    }, 400);
  };

  // Fetch competition data and subscribe to updates
  useEffect(() => {
    if (!id || !userId) {
      setIsLoading(false);
      return;
    }

    let unsubscribe: (() => void) | null = null;

    const loadCompetition = async () => {
      setIsLoading(true);
      console.log('[CompetitionDetail] Loading competition:', { competitionId: id, userId });

      // OPTIMIZATION: Fetch competition data and prize pool in parallel
      const [comp, prizePoolResult] = await Promise.all([
        fetchCompetition(id, userId),
        supabase
          .from('prize_pools')
          .select('id, total_amount, payout_structure, status, pool_type, buy_in_amount, participant_count')
          .eq('competition_id', id)
          .in('status', ['active', 'distributing', 'distributed'])
          .maybeSingle(),
      ]);

      // Set prize pool if exists
      if (prizePoolResult.data) {
        setPrizePool({
          id: prizePoolResult.data.id,
          totalAmount: prizePoolResult.data.total_amount,
          payoutStructure: prizePoolResult.data.payout_structure || {},
          status: prizePoolResult.data.status,
          poolType: prizePoolResult.data.pool_type || 'creator_funded',
          buyInAmount: prizePoolResult.data.buy_in_amount ? parseFloat(prizePoolResult.data.buy_in_amount) : undefined,
          participantCount: prizePoolResult.data.participant_count || 0,
        });
      } else {
        setPrizePool(null);
      }

      if (comp) {
        const userParticipant = comp.participants.find((p) => p.id === userId);
        console.log('[CompetitionDetail] Competition loaded:', {
          competitionId: id,
          userId,
          participantCount: comp.participants.length,
          userIsParticipant: !!userParticipant,
          userParticipantPoints: userParticipant?.points || 0,
          userParticipantName: userParticipant?.name,
          creatorId: comp.creatorId,
          pendingInvitationsCount: comp.pendingInvitations?.length || 0,
        });
      } else {
        console.log('[CompetitionDetail] Competition not found:', { competitionId: id, userId });
      }

      // OPTIMIZATION: Set state immediately so UI can render while subscription sets up
      setCompetition(comp);
      setIsLoading(false);

      // Fetch reward progress for seasonal events
      if (comp?.isSeasonalEvent && comp.eventReward && userId) {
        try {
          const { data: dailyData } = await competitionApi.getMyCompetitionDailyData(comp.id);
          if (dailyData && Array.isArray(dailyData)) {
            const activeDays = dailyData.filter((d: any) => (d.points || 0) > 0).length;
            setRewardDaysCompleted(activeDays);
          }
        } catch (e) {
          console.error('[CompetitionDetail] Error fetching reward progress:', e);
        }
      }

      // Subscribe to real-time updates
      if (comp) {
        unsubscribe = subscribeToCompetition(id, async (updatedComp) => {
          if (updatedComp) {
            // Re-fetch to get updated pending invitations
            const refreshed = await fetchCompetition(id, userId);
            if (refreshed) {
              setCompetition(refreshed);
            } else {
              setCompetition(updatedComp);
            }
          }
        });
      }
    };

    loadCompetition();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [id, userId]);

  // Sync Apple Health data when competition is loaded and user is a participant
  useEffect(() => {
    if (!competition || !userId || isSyncing || isLoading) {
      return;
    }

    // Check if user is a participant
    const userParticipant = competition.participants.find((p) => p.id === userId);

    if (!userParticipant) {
      return;
    }

    // Only sync if competition is active or upcoming (not completed)
    if (competition.status === 'completed') {
      return;
    }

    let isMounted = true;

    const syncHealthData = async (forceSync = false) => {
      // Use a ref to track if we're already syncing to avoid race conditions
      setIsSyncing(true);
      try {
        // OPTIMIZATION: Use in-memory cache first, fall back to AsyncStorage only if needed
        // This avoids async reads on every sync check
        const lastSyncKey = `last_sync_${competition.id}`;
        let lastSyncTime = lastSyncTimeRef.current.get(lastSyncKey);

        // Only read from AsyncStorage if not in memory cache
        if (lastSyncTime === undefined) {
          const storedTime = await AsyncStorage.getItem(lastSyncKey);
          lastSyncTime = storedTime ? parseInt(storedTime, 10) : undefined;
          if (lastSyncTime) {
            lastSyncTimeRef.current.set(lastSyncKey, lastSyncTime);
          }
        }

        // Check current participant points from the competition object (in case it was updated)
        const currentUserParticipant = competition.participants.find((p) => p.id === userId);
        const userParticipantPoints = currentUserParticipant?.points || 0;

        // Skip cooldown check if forceSync is true (user pulled to refresh)
        if (lastSyncTime && userParticipantPoints > 0 && !forceSync) {
          const timeSinceLastSync = Date.now() - lastSyncTime;
          if (timeSinceLastSync < 5 * 60 * 1000) {
            // Synced less than 5 minutes ago, skip (only if user has points and not forcing)
            setIsSyncing(false);
            return;
          }
        } else if (lastSyncTime && userParticipantPoints === 0) {
          // User has 0 points even though we synced recently - force a new sync
          // Clear the last sync time to force a fresh sync
          lastSyncTimeRef.current.delete(lastSyncKey);
          AsyncStorage.removeItem(lastSyncKey); // Fire and forget - don't await
        }

        // Parse competition dates explicitly to ensure correct timezone handling
        // Competition dates may come as YYYY-MM-DD strings or ISO strings (e.g., "2026-01-15T05:00:00.000Z")
        // IMPORTANT: We extract just the date portion "YYYY-MM-DD" to avoid timezone conversion issues
        // The database stores dates as YYYY-MM-DD, and we want to preserve that exact date regardless of timezone
        const parseLocalDate = (dateStr: string): Date => {
          // If it's already a Date object, return it
          if (dateStr instanceof Date) return dateStr;

          // If the string contains 'T', extract just the date portion
          // e.g., "2026-01-15T05:00:00.000Z" -> "2026-01-15"
          // This avoids timezone conversion issues where the date could shift
          const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;

          // Parse YYYY-MM-DD format as local date (midnight local time)
          const [year, month, day] = datePart.split('-').map(Number);
          return new Date(year, month - 1, day);
        };

        const startDate = parseLocalDate(competition.startDate);
        const endDate = parseLocalDate(competition.endDate);
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        // Only fetch data up to today
        const effectiveEndDate = endDate > today ? today : endDate;

        // Fetch health data for the competition date range
        const healthMetrics = await fetchHealthDataForDateRange(startDate, effectiveEndDate);

        if (!isMounted) return;

        if (healthMetrics.length > 0) {
          // Sync the data to Supabase
          const syncResult = await syncCompetitionHealthData(
            competition.id,
            userId,
            competition.startDate,
            competition.endDate,
            healthMetrics
          );

          if (!syncResult) {
            console.error('[CompetitionDetail] Sync failed');
          }

          // OPTIMIZATION: Store sync time in memory immediately, persist to AsyncStorage async
          const now = Date.now();
          lastSyncTimeRef.current.set(lastSyncKey, now);
          AsyncStorage.setItem(lastSyncKey, now.toString()); // Fire and forget

          // OPTIMIZATION: Removed 300ms delay - refetch immediately since the sync is complete
          // The database triggers will have already updated the participant totals
          if (isMounted) {
            const updatedComp = await fetchCompetition(competition.id, userId);
            if (updatedComp) {
              setCompetition(updatedComp);
            }
          }
        }
        // If no health metrics, no need to log warning - user may just not have data yet
      } catch (error) {
        console.error('[CompetitionDetail] Error syncing health data:', error);
      } finally {
        if (isMounted) {
          setIsSyncing(false);
        }
      }
    };

    // Sync immediately when competition loads
    // Store the sync function in ref so it can be called from refresh handler
    syncFunctionRef.current = syncHealthData;

    syncHealthData().catch((error) => {
      console.error('[CompetitionDetail] syncHealthData error:', error);
    });

    return () => {
      isMounted = false;
      syncFunctionRef.current = null;
    };
  }, [competition?.id, userId]); // Only run when competition ID or userId changes

  // Handle pull-to-refresh
  const handleRefresh = async () => {
    if (isSyncing || isRefreshing) return;
    setIsRefreshing(true);
    const startTime = Date.now();

    try {
      // Force sync health data
      if (syncFunctionRef.current) {
        await syncFunctionRef.current(true);
      }

      // Also refresh competition data
      if (id) {
        const updated = await fetchCompetition(id as string);
        if (updated) {
          setCompetition(updated);
        }
      }
    } finally {
      // Ensure spinner shows for at least 500ms so users can see it
      const elapsed = Date.now() - startTime;
      const minDelay = 500;
      if (elapsed < minDelay) {
        await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
      }
      setIsRefreshing(false);
    }
  };

  // Handle opt-in-later payment success
  const handleOptInSuccess = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Success', 'You are now eligible for prizes!');
    // Refresh competition data to update prize_eligible status
    if (id) {
      const updated = await fetchCompetition(id as string);
      if (updated) {
        setCompetition(updated);
      }
    }
  }, [id]);

  // Scroll to bottom when messages change or keyboard opens
  useEffect(() => {
    if (showChat) {
      setTimeout(() => {
        chatScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, showChat]);

  const handleSendMessage = async () => {
    console.log('[Chat] handleSendMessage called');

    if (!newMessage.trim() || !authUser || !id || isSendingMessage) {
      console.log('[Chat] Early return - missing data');
      return;
    }

    // Check if muted
    if (chatMuted && chatMutedUntil) {
      const muteEnd = new Date(chatMutedUntil).getTime();
      if (Date.now() < muteEnd) {
        const minutesLeft = Math.ceil((muteEnd - Date.now()) / (1000 * 60));
        Alert.alert('Chat Muted', `You are muted for ${minutesLeft} more minute${minutesLeft !== 1 ? 's' : ''}.`);
        return;
      } else {
        setChatMuted(false);
        setChatMutedUntil(null);
      }
    }

    const messageText = newMessage.trim();
    const firstName = authUser.firstName || authUser.username || 'User';
    const avatar = getAvatarUrl(authUser.avatarUrl, firstName, authUser.username);
    const tempId = `temp_${Date.now()}`;

    // Brief lock to prevent double-taps
    setIsSendingMessage(true);

    // Optimistic UI: Add message immediately
    const optimisticMessage: ChatMessage = {
      id: tempId,
      oderId: authUser.id,
      senderName: firstName,
      senderAvatar: avatar,
      text: messageText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage('');
    setIsSendingMessage(false); // Release lock immediately after capturing message
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Process in background (no spinner needed)
    (async () => {
      try {
        if (!supabase) return;

        // Get auth token
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          console.log('[Chat] No access token, keeping optimistic message');
          return;
        }

        // Call moderation API
        const url = `${SUPABASE_URL}/functions/v1/moderate-chat-message`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            competition_id: id,
            message_content: messageText,
          }),
        });

        const result = await response.json();

        // Handle muted response
        if (result.muted_until) {
          setChatMuted(true);
          setChatMutedUntil(result.muted_until);
        }

        // Handle blocked message - remove optimistic message
        if (result.blocked) {
          console.log('[Chat] Message blocked:', result.reason);
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
        const saveResult = await sendChatMessage(id, authUser.id, messageText);

        if (saveResult.success && saveResult.message) {
          // Replace optimistic message with real one
          setMessages((prev) =>
            prev.map((m) => m.id === tempId ? saveResult.message! : m)
          );
        }
        // If save fails, keep optimistic message displayed

      } catch (error) {
        console.error('[Chat] Background processing error:', error);
        // Try direct save on error
        try {
          const saveResult = await sendChatMessage(id, authUser.id, messageText);
          if (saveResult.success && saveResult.message) {
            setMessages((prev) =>
              prev.map((m) => m.id === tempId ? saveResult.message! : m)
            );
          }
        } catch {
          // Keep optimistic message on complete failure
        }
      }
    })();
  };

  const handleOpenChat = () => {
    if (!isPro) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    setShowChat(true);
  };

  const handleShareCompetition = async () => {
    if (!id || !competition) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Get or create invite code
      const { data, error } = await inviteApi.getInviteCode(id);

      if (error || !data?.invite_code) {
        Alert.alert('Error', 'Unable to generate invite link. Please try again.');
        return;
      }

      const inviteCode = data.invite_code;
      const inviteLink = `https://movetogetherfitness.com/join/${inviteCode}`;

      const result = await Share.share({
        message: `Join me in "${competition.name}" on MoveTogether! Use code ${inviteCode} or tap the link: ${inviteLink}`,
        url: inviteLink,
      });

      if (result.action === Share.sharedAction) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[Share] Error sharing competition:', error);
      Alert.alert('Error', 'Unable to share competition. Please try again.');
    }
  };

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowChat(false);
    router.push('/upgrade');
  };

  const handleLeavePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowLeaveModal(true);
  };

  const handleLeaveCompetition = async () => {
    if (!id || !userId) return;

    setIsProcessingLeave(true);
    try {
      // Call Edge Function for server-side validation
      const result = await leaveCompetitionService(id, userId);

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowLeaveModal(false);
        router.back();
        return;
      }

      // Check if payment is required (starter tier)
      if (result.requiresPayment) {
        // Free users need to pay $2.99 to leave
        try {
          const offeringsResult = await getOfferings();
          if (!offeringsResult.ok) {
            Alert.alert('Error', 'Unable to process payment. Please try again.');
            setIsProcessingLeave(false);
            return;
          }

          // Look for leave competition package
          const leaveOffering = offeringsResult.data.all?.['leavecompetition'];
          const leavePackage = leaveOffering?.availablePackages?.[0];

          if (!leavePackage) {
            Alert.alert(
              'Payment Required',
              result.error || 'Free users must pay $2.99 to leave a competition. Upgrade to Mover or Crusher for free withdrawals.'
            );
            setIsProcessingLeave(false);
            return;
          }

          // Purchase the leave package
          const purchaseResult = await purchasePackage(leavePackage);
          if (purchaseResult.ok && purchaseResult.data) {
            // Get transaction ID from non-subscription transactions
            // The most recent transaction for the leave competition product
            const nonSubTransactions = purchaseResult.data.nonSubscriptionTransactions || [];
            const leaveTransaction = nonSubTransactions
              .filter((t: any) => t.productIdentifier === 'movetogether_leave_competition')
              .sort((a: any, b: any) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];

            const transactionId = leaveTransaction?.transactionIdentifier ||
                                  `purchase_${Date.now()}`;

            // Call Edge Function again with payment confirmation
            const leaveResult = await leaveCompetitionService(id, userId, transactionId);
            if (leaveResult.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setShowLeaveModal(false);
              router.back();
            } else {
              Alert.alert('Error', leaveResult.error || 'Failed to leave competition after payment');
            }
          } else {
            if (purchaseResult.reason === 'user_cancelled') {
              // User cancelled, don't show error
            } else {
              Alert.alert('Payment Failed', 'Payment was not completed. Please try again.');
            }
          }
        } catch (paymentError) {
          console.error('[CompetitionDetail] Payment error:', paymentError);
          Alert.alert('Payment Error', 'Failed to process payment. Please try again.');
        }
      } else {
        // Other error (not payment related)
        Alert.alert('Error', result.error || 'Failed to leave competition');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error) {
      console.error('[CompetitionDetail] Leave competition error:', error);
      Alert.alert('Error', 'Failed to leave competition. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessingLeave(false);
    }
  };

  const handleDeleteCompetition = async () => {
    if (!id || !userId) return;

    const result = await deleteCompetitionService(id, userId);

    if (result.success) {
      // Remove from local store
      const deleteCompetitionFromStore = useFitnessStore.getState().deleteCompetition;
      deleteCompetitionFromStore(id);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDeleteModal(false);
      router.back();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Cannot Delete Competition',
        result.error || 'Failed to delete competition. Please try again.'
      );
    }
  };

  // Auto-show team picker when user needs to pick a team
  // (must be before early returns to satisfy Rules of Hooks)
  const _isTeamComp = competition?.isTeamCompetition || false;
  const _teams = competition?.teams || [];
  const _userParticipantForTeam = competition?.participants.find((p) => p.id === userId);
  const _userTeamId = _userParticipantForTeam?.teamId || null;
  const _needsTeamPick = _isTeamComp && !!_userParticipantForTeam && !_userTeamId && competition?.status !== 'completed';

  useEffect(() => {
    if (_needsTeamPick && !showTeamPicker && _teams.length > 0) {
      setShowTeamPicker(true);
    }
  }, [_needsTeamPick, _teams.length]);

  if (isLoading) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg }}>
        {/* Background */}
        <Image
          source={require('../../assets/AppCompetitionViewScreen.png')}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: width,
            height: width,
          }}
          resizeMode="cover"
        />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Skeleton */}
          <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20 }}>
            <View className="flex-row items-center justify-between mb-4">
              <LiquidGlassBackButton onPress={() => router.back()} />
              <View className="flex-row" style={{ gap: 8 }}>
                <Skeleton width={40} height={40} borderRadius={20} />
              </View>
            </View>

            {/* Title & Info Skeleton */}
            <View className="mb-6">
              <View className="flex-row items-center mb-2" style={{ gap: 8 }}>
                <Skeleton width={80} height={24} borderRadius={12} />
                <Skeleton width={60} height={24} borderRadius={12} />
              </View>
              <Skeleton width="80%" height={28} style={{ marginBottom: 8 }} />
              <Skeleton width="60%" height={16} />
            </View>

            {/* Stats Row Skeleton */}
            <View className="flex-row mb-6" style={{ gap: 12 }}>
              <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 16 }}>
                <Skeleton width={60} height={12} style={{ marginBottom: 8 }} />
                <Skeleton width={40} height={24} />
              </View>
              <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 16 }}>
                <Skeleton width={60} height={12} style={{ marginBottom: 8 }} />
                <Skeleton width={40} height={24} />
              </View>
              <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 16 }}>
                <Skeleton width={60} height={12} style={{ marginBottom: 8 }} />
                <Skeleton width={40} height={24} />
              </View>
            </View>
          </View>

          {/* Leaderboard Skeleton */}
          <View className="px-5">
            <Skeleton width={120} height={20} style={{ marginBottom: 16 }} />
            <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 8 }}>
              <SkeletonLeaderboardRow />
              <SkeletonLeaderboardRow />
              <SkeletonLeaderboardRow />
              <SkeletonLeaderboardRow />
              <SkeletonLeaderboardRow />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!competition || !userId) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <Text className="text-gray-400 dark:text-gray-400">Competition not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-fitness-accent">Go back</Text>
        </Pressable>
      </View>
    );
  }

  const sortedParticipants = [...competition.participants].sort((a, b) => b.points - a.points);
  const userRank = sortedParticipants.findIndex((p) => p.id === userId) + 1;
  const userParticipant = sortedParticipants.find((p) => p.id === userId);
  const isUserOptedOut = prizePool?.poolType === 'buy_in' && userParticipant && userParticipant.prizeEligible === false;
  const daysRemaining = getDaysRemaining(competition.endDate);

  // Team competition data
  const isTeamComp = competition.isTeamCompetition || false;
  const teams = competition.teams || [];
  const sortedTeams = [...teams].sort((a, b) => b.avgPoints - a.avgPoints);
  const userTeamId = userParticipant?.teamId || null;
  const userTeam = teams.find((t) => t.id === userTeamId);
  const userTeamRank = userTeamId ? sortedTeams.findIndex((t) => t.id === userTeamId) + 1 : 0;

  const handleTeamSelected = async (teamId: string) => {
    if (!competition?.id) return;
    setIsJoiningTeam(true);
    try {
      const { error } = await competitionApi.joinTeam(competition.id, teamId);
      if (error) {
        Alert.alert('Error', error.message || 'Failed to join team');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowTeamPicker(false);
      // Reload competition to get updated team data
      const updated = await fetchCompetition(competition.id, userId);
      if (updated) setCompetition(updated as Competition);
    } catch (err) {
      Alert.alert('Error', 'Failed to join team. Please try again.');
    } finally {
      setIsJoiningTeam(false);
    }
  };

  // Get the user's local competition state (accounts for local midnight and score locking)
  const userLocalState = getUserCompetitionState(competition.startDate, competition.endDate, competition.status);
  const isScoreLocked = userLocalState === 'locked';

  // DEBUG: Log locked state
  console.log('[CompetitionDetail] Lock state:', {
    startDate: competition.startDate,
    endDate: competition.endDate,
    dbStatus: competition.status,
    userLocalState,
    isScoreLocked,
  });

  const statusConfig: Record<string, { color: string; label: string; bgColor: string }> = {
    active: { color: '#fff', label: 'Active', bgColor: 'rgba(34, 197, 94, 0.9)' },
    upcoming: { color: '#fff', label: 'Starting Soon', bgColor: 'rgba(59, 130, 246, 0.9)' },
    completed: { color: '#fff', label: 'Completed', bgColor: 'rgba(107, 114, 128, 0.9)' },
    locked: { color: '#fff', label: 'Score Locked', bgColor: 'rgba(234, 179, 8, 0.9)' },
  };

  // Use locked status badge if user's local midnight has passed
  const displayStatus = isScoreLocked ? 'locked' : competition.status;
  const status = statusConfig[displayStatus];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Background Layer - Positioned to fill screen with extra coverage */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }} pointerEvents="none">
        <Image
          source={require('../../assets/AppCompetitionViewScreen.png')}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: width,
            height: width,
          }}
          resizeMode="cover"
        />
        {/* Fill color below image to handle scroll bounce */}
        <View
          style={{
            position: 'absolute',
            top: width,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.bg,
          }}
        />
      </View>

      {/* Content Layer - Scrollable */}
      <View style={{ flex: 1, zIndex: 1 }}>
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        bounces={true}
        alwaysBounceVertical={true}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.isDark ? '#FFFFFF' : '#000000'}
            colors={['#FA114F']}
          />
        }
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32 }}>
          <Animated.View entering={FadeInDown.duration(600)}>
            {/* Nav Bar */}
            <View className="flex-row items-center justify-between mb-6">
              <LiquidGlassBackButton onPress={() => router.back()} />
              <View className="flex-row items-center">
                <LiquidGlassMorphingMenu
                  isCreator={isCreator}
                  buttonSize={44}
                  iconSize={16}
                  onChat={handleOpenChat}
                  onShare={handleShareCompetition}
                  onInfo={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowInfoModal(true);
                  }}
                  onLeave={handleLeavePress}
                  onDelete={handleDeleteCompetition}
                  onEdit={() => router.push(`/edit-competition?id=${id}`)}
                >
                  {/* Unread chat badge - positioned over the chat (left) side of the pill */}
                  {unreadCount > 0 && (
                    <View 
                      className="absolute -top-1 left-0 w-5 h-5 rounded-full bg-fitness-accent items-center justify-center z-10"
                      pointerEvents="none"
                    >
                      <Text className="text-white text-xs font-bold">{unreadCount}</Text>
                    </View>
                  )}
                  {/* Pro lock badge on chat side */}
                  {!isPro && (
                    <View 
                      className="absolute -bottom-1 left-0 w-4 h-4 rounded-full bg-amber-500 items-center justify-center z-10"
                      pointerEvents="none"
                    >
                      <Lock size={10} color="#000" />
                    </View>
                  )}
                </LiquidGlassMorphingMenu>
              </View>
            </View>

            {/* Competition Title */}
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-3">
                  <View
                    className="px-4 py-2 rounded-full"
                    style={{ backgroundColor: status.bgColor }}
                  >
                    <Text style={{ color: status.color }} className="text-sm font-bold">
                      {status.label}
                    </Text>
                  </View>
                  <View
                    className="flex-row items-center px-3 py-2 rounded-full"
                    style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
                  >
                    {competition.isPublic ? (
                      <Globe size={14} color={colors.isDark ? '#9ca3af' : '#6b7280'} />
                    ) : (
                      <Lock size={14} color={colors.isDark ? '#9ca3af' : '#6b7280'} />
                    )}
                    <Text className="text-gray-500 dark:text-gray-400 text-sm font-medium ml-1.5">
                      {competition.isPublic ? 'Public' : 'Private'}
                    </Text>
                  </View>
                  {competition.status === 'active' && daysRemaining >= 1 && daysRemaining <= 2 && (
                    <View
                      className="flex-row items-center px-3 py-2 rounded-full"
                      style={{ backgroundColor: 'rgba(249, 115, 22, 0.15)' }}
                    >
                      <Clock size={14} color="#F97316" />
                      <Text className="text-sm font-bold ml-1.5" style={{ color: '#F97316' }}>
                        Ending Soon
                      </Text>
                    </View>
                  )}
                  {competition.isSeasonalEvent && competition.eventTheme && (
                    <View
                      className="flex-row items-center px-3 py-2 rounded-full"
                      style={{ backgroundColor: competition.eventTheme.color + '20' }}
                    >
                      <Text style={{ fontSize: 14, marginRight: 4 }}>{competition.eventTheme.emoji}</Text>
                      <Text style={{ color: competition.eventTheme.color }} className="text-sm font-medium">
                        Seasonal Event
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-black dark:text-white text-3xl font-bold">{competition.name}</Text>
                <Text className="text-gray-600 dark:text-gray-400 text-base mt-2">{competition.description}</Text>
              </View>
            </View>

            {/* Quick Stats */}
            <View className="flex-row mt-6 rounded-2xl p-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              <View className="flex-1 items-center" style={{ borderRightWidth: 1, borderRightColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                <Users size={20} color="#6b7280" />
                <Text className="text-black dark:text-white text-xl font-bold mt-2">{competition.participants.length}</Text>
                <Text className="text-gray-500 dark:text-gray-500 text-xs">Participants</Text>
              </View>
              <View className="flex-1 items-center" style={{ borderRightWidth: 1, borderRightColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                <Clock size={20} color="#6b7280" />
                <Text className="text-black dark:text-white text-xl font-bold mt-2">
                  {competition.status === 'completed' ? 'Ended' : daysRemaining}
                </Text>
                <Text className="text-gray-500 dark:text-gray-500 text-xs">
                  {competition.status === 'completed' ? '' : 'Days Left'}
                </Text>
              </View>
              <View className="flex-1 items-center">
                <Calendar size={20} color="#6b7280" />
                <View className="flex-row items-center mt-2">
                  <Text className="text-black dark:text-white text-xl font-bold">
                    {getTotalDuration(competition.startDate, competition.endDate)}
                  </Text>
                  <Text className="text-black dark:text-white text-xl font-bold ml-1">Days</Text>
                </View>
                <Text className="text-gray-500 dark:text-gray-500 text-xs">Duration</Text>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Score Locked Banner - Show when user's local midnight has passed */}
        {isScoreLocked && (
          <Animated.View
            entering={FadeInDown.duration(500).delay(50)}
            className="px-5 mb-6"
          >
            <LinearGradient
              colors={colors.isDark ? ['#EAB30820', '#1C1C1E'] : ['#EAB30815', '#FFFBEB']}
              style={{
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.isDark ? '#EAB30840' : '#EAB30830',
              }}
            >
              <View className="flex-row items-center mb-2">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: colors.isDark ? '#EAB30830' : '#EAB30820' }}
                >
                  <Lock size={20} color="#EAB308" />
                </View>
                <Text className="text-lg font-bold" style={{ color: colors.isDark ? '#FBBF24' : '#B45309' }}>
                  Score Locked
                </Text>
              </View>
              <Text className="text-sm leading-5" style={{ color: colors.isDark ? '#D1D5DB' : '#78716C' }}>
                Your final score has been recorded. Some participants may still be competing in their timezone.
              </Text>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Your Position Card - Only show when competition is active or score locked */}
        {userParticipant && (competition.status === 'active' || isScoreLocked) && (
          <Animated.View
            entering={FadeInDown.duration(500).delay(100)}
            className="px-5 mb-6"
          >
            <LinearGradient
              colors={isTeamComp && userTeam
                ? [userTeam.color + '20', colors.isDark ? '#1C1C1E' : '#F5F5F7']
                : colors.isDark ? ['#FA114F20', '#1C1C1E'] : ['#FA114F10', '#F5F5F7']}
              style={{
                borderRadius: 20, padding: 20, borderWidth: 1,
                borderColor: isTeamComp && userTeam
                  ? userTeam.color + '30'
                  : colors.isDark ? '#FA114F30' : '#FA114F20',
              }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  {isTeamComp && userTeam ? (
                    <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: userTeam.color + '20' }}>
                      <Text style={{ fontSize: 28 }}>{userTeam.emoji}</Text>
                    </View>
                  ) : (
                    <View className="w-16 h-16 rounded-full bg-fitness-accent/20 items-center justify-center">
                      <Text className="text-fitness-accent text-2xl font-bold">#{userRank}</Text>
                    </View>
                  )}
                  <View className="ml-4">
                    <Text className="text-gray-600 dark:text-gray-400 text-sm">
                      {isTeamComp && userTeam ? 'Your Team' : 'Your Position'}
                    </Text>
                    <Text className="text-black dark:text-white text-xl font-bold">
                      {isTeamComp && userTeam
                        ? `${userTeam.name} — #${userTeamRank}`
                        : `${userRank}${getRankSuffix(userRank)} Place`}
                    </Text>
                    <Text className="text-fitness-accent font-semibold mt-1">
                      {isTeamComp && userTeam
                        ? `${userTeam.avgPoints.toLocaleString()} avg pts`
                        : `${userParticipant.points.toLocaleString()} points`}
                    </Text>
                  </View>
                </View>
                <TripleActivityRings
                  size={70}
                  moveProgress={(currentMetrics?.activeCalories ?? 0) / (goals.moveCalories || 400)}
                  exerciseProgress={(currentMetrics?.exerciseMinutes ?? 0) / (goals.exerciseMinutes || 30)}
                  standProgress={(currentMetrics?.standHours ?? 0) / (goals.standHours || 12)}
                  moveGoal={goals.moveCalories || 400}
                  exerciseGoal={goals.exerciseMinutes || 30}
                  standGoal={goals.standHours || 12}
                />
              </View>

              {!isTeamComp && userRank > 1 && (
                <View className="mt-4 pt-4 flex-row items-center" style={{ borderTopWidth: 1, borderTopColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                  <TrendingUp size={16} color={colors.isDark ? '#92E82A' : '#16a34a'} />
                  <Text className="text-gray-600 dark:text-gray-400 ml-2">
                    <Text className="font-semibold" style={{ color: colors.isDark ? '#92E82A' : '#16a34a' }}>
                      {sortedParticipants[userRank - 2].points - userParticipant.points} points
                    </Text>
                    {' '}behind {sortedParticipants[userRank - 2].name}
                  </Text>
                </View>
              )}
            </LinearGradient>
          </Animated.View>
        )}

        {/* Top 3 Podium / Team Rankings - Only show when competition is active or score locked */}
        {(competition.status === 'active' || isScoreLocked) && isTeamComp && sortedTeams.length > 0 ? (
          <Animated.View
            entering={FadeInDown.duration(500).delay(150)}
            className="px-5 mb-6"
          >
            <Text className="text-black dark:text-white text-xl font-semibold mb-4">Team Rankings</Text>
            <View style={{ gap: 10 }}>
              {sortedTeams.map((team, index) => {
                const rankColors = [
                  { bg: 'rgba(255, 215, 0, 0.15)', border: '#FFD700' },
                  { bg: 'rgba(192, 192, 192, 0.15)', border: '#C0C0C0' },
                  { bg: 'rgba(205, 127, 50, 0.15)', border: '#CD7F32' },
                  { bg: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', border: 'transparent' },
                ];
                const rc = rankColors[Math.min(index, 3)];
                const isUserTeam = team.id === userTeamId;

                return (
                  <View
                    key={team.id}
                    style={{
                      backgroundColor: rc.bg,
                      borderWidth: isUserTeam ? 2 : index < 3 ? 1 : 0,
                      borderColor: isUserTeam ? team.color : rc.border,
                      borderRadius: 16,
                      padding: 16,
                    }}
                  >
                    <View className="flex-row items-center">
                      <Text className="text-black dark:text-white font-bold text-lg w-8">#{index + 1}</Text>
                      <Text style={{ fontSize: 28 }}>{team.emoji}</Text>
                      <View className="ml-3 flex-1">
                        <View className="flex-row items-center">
                          <Text className="text-black dark:text-white font-semibold text-base">{team.name}</Text>
                          {isUserTeam && (
                            <View style={{ backgroundColor: team.color + '30', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 }}>
                              <Text style={{ color: team.color, fontSize: 11, fontWeight: '700' }}>Your Team</Text>
                            </View>
                          )}
                        </View>
                        <View className="flex-row items-center mt-1">
                          <Users size={13} color={colors.isDark ? '#9ca3af' : '#6b7280'} />
                          <Text className="text-gray-500 dark:text-gray-400 text-sm ml-1">
                            {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-black dark:text-white font-bold text-lg">
                        {team.avgPoints.toLocaleString()}
                      </Text>
                      <Text className="text-gray-500 dark:text-gray-400 text-xs ml-1">avg</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        ) : (competition.status === 'active' || isScoreLocked) && !isTeamComp ? (
          <Animated.View
            entering={FadeInDown.duration(500).delay(150)}
            className="px-5 mb-6"
          >
            <Text className="text-black dark:text-white text-xl font-semibold mb-4">Top Performers</Text>
            <View className="flex-row items-end justify-center">
              {/* 2nd Place */}
              <View className="flex-1 items-center">
                {sortedParticipants[1] ? (
                  <>
                    <Image
                      source={{ uri: sortedParticipants[1].avatar }}
                      className="w-16 h-16 rounded-full border-2 border-medal-silver"
                    />
                    <Text className="text-black dark:text-white font-medium mt-2 text-center" numberOfLines={1}>
                      {sortedParticipants[1].name}
                    </Text>
                    <Text className="text-gray-600 dark:text-gray-500 text-sm">{sortedParticipants[1].points.toLocaleString()} pts</Text>
                  </>
                ) : (
                  <>
                    <View className="w-16 h-16 rounded-full border-2 border-dashed" style={{ borderColor: colors.isDark ? '#4B5563' : '#D1D5DB' }} />
                    <Text className="text-gray-400 dark:text-gray-600 font-medium mt-2 text-center text-sm">
                      Awaiting
                    </Text>
                    <Text className="text-gray-400 dark:text-gray-600 text-sm">-</Text>
                  </>
                )}
                <View
                  className="mt-2 rounded-t-xl w-full items-center justify-center py-3"
                  style={{
                    height: 85,
                    backgroundColor: colors.isDark ? 'rgba(192, 192, 192, 0.2)' : 'rgba(192, 192, 192, 0.3)',
                    borderWidth: 2,
                    borderColor: colors.isDark ? '#C0C0C0' : '#909090'
                  }}
                >
                  <SymbolView name="medal.fill" size={20} tintColor={colors.isDark ? '#C0C0C0' : '#909090'} />
                  <Text
                    className="text-lg font-bold mt-1"
                    style={{ color: colors.isDark ? '#C0C0C0' : '#909090' }}
                  >
                    2nd
                  </Text>
                </View>
              </View>

              {/* 1st Place */}
              <View className="flex-1 items-center mx-2">
                {sortedParticipants[0] ? (
                  <>
                    <View className="relative">
                      <Image
                        source={{ uri: sortedParticipants[0].avatar }}
                        className="w-20 h-20 rounded-full border-3 border-medal-gold"
                      />
                      <View
                        className="absolute -top-2 -right-2 w-8 h-8 rounded-full items-center justify-center"
                        style={{ backgroundColor: '#FFD700' }}
                      >
                        <Crown size={16} color="#000" />
                      </View>
                    </View>
                    <Text className="text-black dark:text-white font-bold mt-2 text-center" numberOfLines={1}>
                      {sortedParticipants[0].name}
                    </Text>
                    <Text className="text-sm font-semibold" style={{ color: colors.isDark ? '#FFD700' : '#B8860B' }}>{sortedParticipants[0].points.toLocaleString()} pts</Text>
                  </>
                ) : (
                  <>
                    <View className="w-20 h-20 rounded-full border-3 border-dashed" style={{ borderColor: colors.isDark ? '#4B5563' : '#D1D5DB' }} />
                    <Text className="text-gray-400 dark:text-gray-600 font-bold mt-2 text-center text-sm">
                      Awaiting
                    </Text>
                    <Text className="text-gray-400 dark:text-gray-600 text-sm">-</Text>
                  </>
                )}
                <View
                  className="mt-2 rounded-t-xl w-full items-center justify-center py-3"
                  style={{
                    height: 100,
                    backgroundColor: colors.isDark ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 215, 0, 0.3)',
                    borderWidth: 2,
                    borderColor: colors.isDark ? '#FFD700' : '#B8860B'
                  }}
                >
                  <Trophy size={24} color={colors.isDark ? '#FFD700' : '#B8860B'} />
                  <Text
                    className="text-xl font-bold mt-1"
                    style={{ color: colors.isDark ? '#FFD700' : '#B8860B' }}
                  >
                    1st
                  </Text>
                </View>
              </View>

              {/* 3rd Place */}
              <View className="flex-1 items-center">
                {sortedParticipants[2] ? (
                  <>
                    <Image
                      source={{ uri: sortedParticipants[2].avatar }}
                      className="w-16 h-16 rounded-full border-2 border-medal-bronze"
                    />
                    <Text className="text-black dark:text-white font-medium mt-2 text-center" numberOfLines={1}>
                      {sortedParticipants[2].name}
                    </Text>
                    <Text className="text-gray-600 dark:text-gray-500 text-sm">{sortedParticipants[2].points.toLocaleString()} pts</Text>
                  </>
                ) : (
                  <>
                    <View className="w-16 h-16 rounded-full border-2 border-dashed" style={{ borderColor: colors.isDark ? '#4B5563' : '#D1D5DB' }} />
                    <Text className="text-gray-400 dark:text-gray-600 font-medium mt-2 text-center text-sm">
                      Awaiting
                    </Text>
                    <Text className="text-gray-400 dark:text-gray-600 text-sm">-</Text>
                  </>
                )}
                <View
                  className="mt-2 rounded-t-xl w-full items-center justify-center py-3"
                  style={{
                    height: 70,
                    backgroundColor: colors.isDark ? 'rgba(205, 127, 50, 0.2)' : 'rgba(205, 127, 50, 0.3)',
                    borderWidth: 2,
                    borderColor: colors.isDark ? '#CD7F32' : '#A0642A'
                  }}
                >
                  <SymbolView name="medal.fill" size={18} tintColor={colors.isDark ? '#CD7F32' : '#A0642A'} />
                  <Text
                    className="text-base font-bold mt-1"
                    style={{ color: colors.isDark ? '#CD7F32' : '#A0642A' }}
                  >
                    3rd
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* Opt-in-later banner for users who joined without buy-in */}
        {isUserOptedOut && ['upcoming', 'active'].includes(competition.status) && prizePool?.buyInAmount && (
          <Animated.View
            entering={FadeInDown.duration(500).delay(150)}
            className="px-5 mb-4"
          >
            <Pressable
              onPress={() => optInSheetRef.current?.snapToIndex(0)}
              style={{
                backgroundColor: '#F59E0B15',
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: '#F59E0B40',
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Trophy size={20} color="#F59E0B" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                  You're not in the prize pool
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  Pay the ${prizePool.buyInAmount.toFixed(0)} buy-in to become eligible for prizes.
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#F59E0B' }}>
                Opt In
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Full Leaderboard */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(200)}
          className="px-5 mb-6"
        >
          <Text className="text-black dark:text-white text-xl font-semibold mb-4">
            {competition.status === 'active' ? 'Full Leaderboard' : 'Participants'}
          </Text>
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
            {sortedParticipants.map((participant, index) => {
              const isCurrentUser = participant.id === userId;
              const rank = index + 1;
              const isBlockedParticipant = participant.isBlocked && !isCurrentUser;

              return (
                <Pressable
                  key={participant.id}
                  onPress={() => {
                    if (!isBlockedParticipant) {
                      router.push(`/friend-profile?id=${participant.id}`);
                    }
                  }}
                  className="flex-row items-center px-4 py-5"
                  style={{
                    borderBottomWidth: index < sortedParticipants.length - 1 ? 1 : 0,
                    borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    backgroundColor: 'transparent',
                    opacity: isBlockedParticipant ? 0.5 : 1,
                  }}
                >
                  {/* Syncing indicator for current user */}
                  {isCurrentUser && isSyncing && (
                    <View className="absolute top-2 right-2">
                      <ActivityIndicator size="small" color="#FA114F" />
                    </View>
                  )}

                  {/* Rank */}
                  <View className="w-6 items-start ml-2">
                    <Text className="text-gray-700 dark:text-gray-400 font-bold text-base">{rank}</Text>
                  </View>

                  {/* Avatar */}
                  {isBlockedParticipant ? (
                    <View
                      className="w-11 h-11 rounded-full ml-1 items-center justify-center"
                      style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: 18 }}>?</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: participant.avatar }}
                      className="w-11 h-11 rounded-full ml-1"
                    />
                  )}

                  {/* Name & Points */}
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center">
                      <Text
                        className={`font-semibold text-base ${isCurrentUser ? 'text-fitness-accent' : 'text-black dark:text-white'}`}
                      >
                        {participant.name}
                      </Text>
                      {isCurrentUser && (
                        <View className="ml-2 px-2 py-0.5 bg-fitness-accent/20 rounded-full">
                          <Text className="text-fitness-accent text-xs font-medium">You</Text>
                        </View>
                      )}
                      {isTeamComp && participant.teamId && (() => {
                        const pTeam = teams.find(t => t.id === participant.teamId);
                        return pTeam ? (
                          <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: pTeam.color + '20' }}>
                            <Text style={{ color: pTeam.color, fontSize: 11, fontWeight: '600' }}>{pTeam.emoji} {pTeam.name}</Text>
                          </View>
                        ) : null;
                      })()}
                      {prizePool?.poolType === 'buy_in' && participant.prizeEligible === false && (
                        <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.05)' }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 10 }}>No Prize</Text>
                        </View>
                      )}
                      {isBlockedParticipant && (
                        <View className="ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
                          <Text style={{ color: colors.textSecondary }} className="text-xs font-medium">Blocked</Text>
                        </View>
                      )}
                    </View>
                    {/* Sync label under name */}
                    {!isBlockedParticipant && competition.status === 'active' && (
                      <Text className="text-gray-400 dark:text-gray-500 text-xs mt-0.5 mb-1">
                        {getSyncAgoLabel(participant.lastSyncAt)}
                      </Text>
                    )}
                    {isBlockedParticipant ? (
                      <Text style={{ color: colors.textSecondary }} className="text-xs mt-1">Stats hidden</Text>
                    ) : (
                    <View className="flex-row items-center mt-1">
                      {(() => {
                        const scoringType = competition.scoringType || 'ring_close';

                        if (scoringType === 'raw_numbers') {
                          // Show raw values: calories, minutes, hours
                          return (
                            <>
                              <View className="flex-row items-center">
                                <View className="w-2 h-2 rounded-full bg-ring-move mr-1" />
                                <Text className="text-gray-600 dark:text-gray-400 text-xs font-medium">{(participant.moveCalories || 0).toLocaleString()} cal</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className="w-2 h-2 rounded-full bg-ring-exercise mr-1" />
                                <Text className="text-gray-600 dark:text-gray-400 text-xs font-medium">{participant.exerciseMinutes || 0} min</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className="w-2 h-2 rounded-full bg-ring-stand mr-1" />
                                <Text className="text-gray-600 dark:text-gray-400 text-xs font-medium">{participant.standHours || 0} hrs</Text>
                              </View>
                            </>
                          );
                        } else if (scoringType === 'ring_close') {
                          // Show ring close status (how many rings are closed based on progress >= 1.0)
                          const moveClosed = participant.moveProgress >= 1.0;
                          const exerciseClosed = participant.exerciseProgress >= 1.0;
                          const standClosed = participant.standProgress >= 1.0;
                          const closedCount = [moveClosed, exerciseClosed, standClosed].filter(Boolean).length;

                          return (
                            <>
                              <View className="flex-row items-center">
                                <View className={`w-2 h-2 rounded-full mr-1 ${moveClosed ? 'bg-ring-move' : 'bg-gray-600'}`} />
                                <Text className="text-gray-600 dark:text-gray-400 text-xs font-medium">{moveClosed ? 'Closed' : 'Open'}</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className={`w-2 h-2 rounded-full mr-1 ${exerciseClosed ? 'bg-ring-exercise' : 'bg-gray-600'}`} />
                                <Text className="text-gray-600 dark:text-gray-400 text-xs font-medium">{exerciseClosed ? 'Closed' : 'Open'}</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className={`w-2 h-2 rounded-full mr-1 ${standClosed ? 'bg-ring-stand' : 'bg-gray-600'}`} />
                                <Text className="text-gray-600 dark:text-gray-400 text-xs font-medium">{standClosed ? 'Closed' : 'Open'}</Text>
                              </View>
                            </>
                          );
                        } else if (scoringType === 'step_count') {
                          // Show step count only
                          return (
                            <View className="flex-row items-center">
                              <View className="w-2 h-2 rounded-full bg-ring-move mr-1" />
                              <Text className="text-gray-500 text-xs">{participant.stepCount || 0} steps</Text>
                            </View>
                          );
                        } else {
                          // Default: percentage (for 'percentage' and 'workout' scoring types)
                          return (
                            <>
                              <View className="flex-row items-center">
                                <View className="w-2 h-2 rounded-full bg-ring-move mr-1" />
                                <Text className="text-gray-600 dark:text-gray-400 text-xs font-medium">{Math.round(participant.moveProgress * 100)}%</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className="w-2 h-2 rounded-full bg-ring-exercise mr-1" />
                                <Text className="text-gray-600 dark:text-gray-400 text-xs font-medium">{Math.round(participant.exerciseProgress * 100)}%</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className="w-2 h-2 rounded-full bg-ring-stand mr-1" />
                                <Text className="text-gray-600 dark:text-gray-400 text-xs font-medium">{Math.round(participant.standProgress * 100)}%</Text>
                              </View>
                            </>
                          );
                        }
                      })()}
                    </View>
                    )}
                  </View>

                  {/* Points */}
                  <View className="items-end mr-2">
                    {isBlockedParticipant ? (
                      <Text style={{ color: colors.textSecondary }} className="font-bold text-xl">--</Text>
                    ) : (
                      <>
                        <Text className="text-black dark:text-white font-bold text-xl">{participant.points.toLocaleString()}</Text>
                        <Text className="text-gray-500 dark:text-gray-500 text-xs font-medium">pts</Text>
                      </>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Pending Invitations - Only visible to creator */}
        {isCreator && competition.pendingInvitations && competition.pendingInvitations.length > 0 && (
          <Animated.View
            entering={FadeInDown.duration(500).delay(250)}
            className="px-5 mb-6"
          >
            <Text className="text-black dark:text-white text-xl font-semibold mb-4">Pending Invitations</Text>
            <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
              {competition.pendingInvitations.map((invitation, index) => (
                <View
                  key={invitation.id}
                  className="flex-row items-center px-4 py-5"
                  style={{
                    borderBottomWidth: index < competition.pendingInvitations!.length - 1 ? 1 : 0,
                    borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  }}
                >
                  <Image
                    source={{ uri: invitation.inviteeAvatar }}
                    className="w-14 h-14 rounded-full"
                  />
                  <View className="flex-1 ml-3">
                    <Text className="text-black dark:text-white font-semibold text-base">{invitation.inviteeName}</Text>
                    <Text className="text-gray-600 dark:text-gray-400 text-sm font-medium">Waiting for response...</Text>
                  </View>
                  <View className="px-3 py-1.5 bg-yellow-500/20 rounded-full">
                    <Text className="text-yellow-500 text-xs font-medium">Pending</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Prize Pool Section */}
        {prizePool && (
          <Animated.View
            entering={FadeInDown.duration(500).delay(250)}
            className="px-5 mb-6"
          >
            <Text className="text-black dark:text-white text-xl font-semibold mb-4">
              {prizePool.poolType === 'buy_in' ? 'Buy-In Prize Pool' : 'Prize Pool'}
            </Text>
            <View
              className="rounded-2xl p-4"
              style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7' }}
            >
              {/* Buy-in info row */}
              {prizePool.poolType === 'buy_in' && prizePool.buyInAmount && (
                <View className="flex-row justify-between mb-3 pb-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                  <Text className="text-sm text-gray-500 dark:text-gray-400">${prizePool.buyInAmount.toFixed(0)} per person</Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400">{prizePool.participantCount || 0} players</Text>
                </View>
              )}

              <View className="flex-row items-start">
                {/* Left side - Total Prize Pool */}
                <View className="flex-1 items-center">
                  <Text className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Prize Pool</Text>
                  <Text className="text-2xl font-bold" style={{ color: '#FFD700' }}>
                    ${prizePool.totalAmount.toFixed(0)}
                  </Text>
                </View>

                {/* Vertical separator */}
                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />

                {/* Right side - Prize Distribution */}
                <View className="flex-1 items-center">
                  <Text className="text-sm text-gray-500 dark:text-gray-400 mb-1">Prize Distribution</Text>
                  <View className="flex-row justify-around w-full items-center">
                    {prizePool.payoutStructure.first && prizePool.payoutStructure.first > 0 && (
                      <View className="flex-row items-center">
                        <Text className="text-lg text-gray-500 dark:text-gray-400">1st</Text>
                        <Text className="text-lg text-gray-400 dark:text-gray-500 mx-1">|</Text>
                        <Text className="text-2xl font-bold" style={{ color: colors.isDark ? '#FFD700' : '#B8860B' }}>
                          ${(prizePool.totalAmount * prizePool.payoutStructure.first / 100).toFixed(0)}
                        </Text>
                      </View>
                    )}
                    {prizePool.payoutStructure.second && prizePool.payoutStructure.second > 0 && (
                      <View className="flex-row items-center">
                        <Text className="text-lg text-gray-500 dark:text-gray-400">2nd</Text>
                        <Text className="text-lg text-gray-400 dark:text-gray-500 mx-1">|</Text>
                        <Text className="text-2xl font-bold" style={{ color: '#C0C0C0' }}>
                          ${(prizePool.totalAmount * prizePool.payoutStructure.second / 100).toFixed(0)}
                        </Text>
                      </View>
                    )}
                    {prizePool.payoutStructure.third && prizePool.payoutStructure.third > 0 && (
                      <View className="flex-row items-center">
                        <Text className="text-lg text-gray-500 dark:text-gray-400">3rd</Text>
                        <Text className="text-lg text-gray-400 dark:text-gray-500 mx-1">|</Text>
                        <Text className="text-2xl font-bold" style={{ color: '#CD7F32' }}>
                          ${(prizePool.totalAmount * prizePool.payoutStructure.third / 100).toFixed(0)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {/* Status indicator for completed competitions */}
              {competition.status === 'completed' && prizePool.status === 'distributed' && (
                <View className="mt-3 pt-3 flex-row items-center justify-center" style={{ borderTopWidth: 1, borderTopColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                  <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                  <Text className="text-green-500 text-sm font-medium">Prizes distributed</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Event Reward Progress (seasonal events only) */}
        {competition.isSeasonalEvent && competition.eventReward && (
          <Animated.View
            entering={FadeInDown.duration(500).delay(275)}
            className="px-5 mb-6"
          >
            <Text className="text-black dark:text-white text-xl font-semibold mb-4">
              Event Reward
            </Text>
            <View
              className="rounded-2xl p-4"
              style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7' }}
            >
              <Text className="text-base font-medium text-black dark:text-white mb-3">
                {competition.eventTheme?.rewardDescription || 'Complete the challenge to earn a reward!'}
              </Text>
              {/* Progress bar */}
              <View className="mb-2">
                <View
                  className="h-3 rounded-full overflow-hidden"
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
                >
                  <LinearGradient
                    colors={[
                      competition.eventTheme?.color || '#FA114F',
                      competition.eventTheme?.secondaryColor || '#FF6B9D',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      height: '100%',
                      width: `${Math.min(100, (rewardDaysCompleted / competition.eventReward.min_days_completed) * 100)}%`,
                      borderRadius: 999,
                    }}
                  />
                </View>
              </View>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {rewardDaysCompleted} of {competition.eventReward.min_days_completed} active days completed
              </Text>
              {rewardDaysCompleted >= competition.eventReward.min_days_completed && (
                <View className="flex-row items-center mt-3">
                  <Text className="text-green-500 text-sm font-medium">
                    Reward earned! It will be granted when the event ends.
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Competition Details */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(prizePool ? 300 : 250)}
          className="px-5"
        >
          <Text className="text-black dark:text-white text-xl font-semibold mb-4">Details</Text>
          <View className="rounded-2xl p-4" style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7' }}>
            <View className="flex-row items-center justify-between py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              <Text className="text-gray-600 dark:text-gray-400">Start Date</Text>
              <Text className="text-black dark:text-white font-medium">
                {parseLocalDate(competition.startDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <View className="flex-row items-center justify-between py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              <Text className="text-gray-600 dark:text-gray-400">End Date</Text>
              <Text className="text-black dark:text-white font-medium">
                {parseLocalDate(competition.endDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <View className="flex-row items-center justify-between py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              <Text className="text-gray-600 dark:text-gray-400">Type</Text>
              <Text className="text-black dark:text-white font-medium">
                {getCompetitionTypeLabel(competition.type, competition.startDate, competition.endDate)} Challenge
              </Text>
            </View>
            <View className="flex-row items-center justify-between py-3">
              <Text className="text-gray-600 dark:text-gray-400">Scoring</Text>
              <Text className="text-black dark:text-white font-medium">
                {(() => {
                  const scoringType = competition.scoringType || 'ring_close';
                  const scoringInfo = SCORING_TYPES.find(s => s.id === scoringType);
                  return scoringInfo?.name || 'Ring Close Count';
                })()}
              </Text>
            </View>
          </View>
        </Animated.View>

      </ScrollView>
      </View>

      {/* Chat Modal */}
      <Modal visible={showChat} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          className="flex-1"
          style={{ backgroundColor: colors.bg }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}
        >
          {/* Chat Header */}
          <View
            className="flex-row items-center justify-between px-6"
            style={{ paddingTop: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
          >
            <View>
              <Text className="text-black dark:text-white text-xl font-semibold">{competition.name}</Text>
              <Text className="text-gray-500 dark:text-gray-500 text-base">{competition.participants.length} participants</Text>
            </View>
            <Pressable
              onPress={() => setShowChat(false)}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
            >
              <X size={20} color={colors.text} />
            </Pressable>
          </View>

          {/* Messages - Show blurred preview for non-Pro */}
          <ScrollView
            ref={chatScrollRef}
            className="flex-1 px-4 py-4"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingBottom: 20 }}
            scrollEnabled={isPro}
          >
            {isLoadingMessages ? (
              <View className="flex-1 items-center justify-center py-20">
                <ActivityIndicator size="large" color="#FA114F" />
                <Text className="text-gray-600 dark:text-gray-400 mt-4">Loading messages...</Text>
              </View>
            ) : messages.length === 0 ? (
              <View className="flex-1 items-center justify-center py-20">
                <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                  <MessageCircle size={40} color={colors.isDark ? '#4a4a4a' : '#9ca3af'} />
                </View>
                <Text className="text-gray-600 dark:text-gray-400 text-lg font-medium">No messages yet</Text>
                <Text className="text-gray-700 dark:text-gray-600 text-sm mt-1 text-center">
                  Be the first to send a message{'\n'}and motivate your competitors!
                </Text>
              </View>
            ) : (
              messages.map((message, index) => {
                const isOwn = message.oderId === userId;
                const showAvatar = index === 0 || messages[index - 1].oderId !== message.oderId;
                const previousTimestamp = index > 0 ? messages[index - 1].timestamp : null;
                const showDateSeparator = shouldShowDateSeparator(message.timestamp, previousTimestamp);

                return (
                  <View key={message.id}>
                    {showDateSeparator && (
                      <View className="items-center my-4">
                        <Text className="text-gray-500 dark:text-gray-400 text-xs font-medium">
                          {formatMessageDate(message.timestamp)}
                        </Text>
                      </View>
                    )}
                    <Animated.View
                      entering={FadeInUp.duration(300).delay(index * 30)}
                      className={`flex-row mb-3 ${isOwn ? 'justify-end' : 'justify-start'}`}
                      style={{ opacity: isPro ? 1 : 0.3 }}
                    >
                      <View className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                        {showAvatar && !isOwn && (
                          <Text className="text-gray-600 dark:text-gray-500 text-xs mb-1 ml-1">{message.senderName}</Text>
                        )}
                      <Pressable
                        onLongPress={(e) => {
                          const { pageY, pageX } = e.nativeEvent;
                          handleLongPress(message.id, pageY, pageX, isOwn);
                        }}
                        delayLongPress={300}
                      >
                        <View
                          className={`rounded-2xl px-4 py-3 ${
                            isOwn ? 'rounded-br-sm' : ''
                          }`}
                          style={{
                            backgroundColor: isOwn ? 'rgba(250, 17, 79, 0.85)' : (colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')
                          }}
                        >
                          <Text style={{ fontSize: 16, color: isOwn ? '#FFFFFF' : colors.text }}>{message.text}</Text>
                        </View>
                        {/* Reactions display */}
                        {message.reactions && Object.keys(message.reactions).length > 0 && (
                          <View
                            className={`flex-row flex-wrap mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}
                            style={{ gap: 4 }}
                          >
                            {Object.entries(message.reactions)
                              .filter(([_, users]) => users && users.length > 0)
                              .map(([reaction, users]) => (
                              <View
                                key={reaction}
                                className="flex-row items-center px-2 py-1 rounded-full"
                                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
                              >
                                <Text style={{ fontSize: 12 }}>{REACTION_EMOJIS[reaction as ReactionType]}</Text>
                                {users!.length > 1 && (
                                  <Text className="text-gray-500 text-xs ml-1">{users!.length}</Text>
                                )}
                              </View>
                            ))}
                          </View>
                        )}
                      </Pressable>
                      <Text className="text-gray-700 dark:text-gray-600 text-xs mt-1 mx-1">
                        {formatMessageTime(message.timestamp)}
                      </Text>
                    </View>
                  </Animated.View>
                </View>
                );
              })
            )}
          </ScrollView>

          {/* Reaction Picker Overlay */}
          {reactionPickerPosition && (
            <Pressable
              className="absolute inset-0"
              style={{ backgroundColor: 'transparent' }}
              onPress={closeReactionPicker}
            >
              <Animated.View
                entering={FadeIn.duration(150)}
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
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  elevation: 10,
                  gap: 4,
                }}
              >
                {(Object.keys(REACTION_EMOJIS) as ReactionType[]).map((reaction) => {
                  const selectedMessage = messages.find(m => m.id === selectedMessageId);
                  const hasUserReacted = selectedMessage?.reactions?.[reaction]?.includes(userId || '') ?? false;

                  return (
                    <Pressable
                      key={reaction}
                      onPress={() => handleReaction(reaction)}
                      className="w-12 h-12 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: hasUserReacted
                          ? (colors.isDark ? 'rgba(250, 17, 79, 0.3)' : 'rgba(250, 17, 79, 0.15)')
                          : 'transparent',
                        borderWidth: hasUserReacted ? 2 : 0,
                        borderColor: hasUserReacted ? '#FA114F' : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 24 }}>{REACTION_EMOJIS[reaction]}</Text>
                    </Pressable>
                  );
                })}
              </Animated.View>
            </Pressable>
          )}

          {/* Pro Paywall Overlay */}
          {!isPro && (
            <View className="absolute inset-0 justify-end" style={{ top: insets.top + 70 }}>
              {/* Gradient overlay */}
              <LinearGradient
                colors={colors.isDark
                  ? ['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)', '#000']
                  : ['transparent', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.95)', '#FFF']
                }
                style={{ position: 'absolute', inset: 0 }}
              />

              {/* Paywall card */}
              <Animated.View
                entering={FadeInUp.duration(500).delay(200)}
                className="px-6 pb-8"
                style={{ paddingBottom: insets.bottom + 24 }}
              >
                <View className="rounded-3xl p-6" style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7', borderWidth: 1, borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                  {/* Icon */}
                  <View className="items-center mb-4">
                    <LinearGradient
                      colors={['#FFD700', '#FFA500', '#FF8C00']}
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 36,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <MessageCircle size={32} color="#000" strokeWidth={2.5} />
                    </LinearGradient>
                  </View>

                  {/* Title and description */}
                  <Text className="text-black dark:text-white text-xl font-bold text-center">
                    Join the Conversation
                  </Text>
                  <Text className="text-gray-600 dark:text-gray-400 text-center mt-2 mb-6 leading-5">
                    Chat with your competitors, share your progress, and stay motivated together with Pro
                  </Text>

                  {/* Features list */}
                  <View className="mb-6">
                    <View className="flex-row items-center mb-3">
                      <View className="w-6 h-6 rounded-full bg-green-500/20 items-center justify-center mr-3">
                        <MessageCircle size={12} color="#22c55e" />
                      </View>
                      <Text className="text-gray-700 dark:text-gray-300 text-sm">Real-time group messaging</Text>
                    </View>
                    <View className="flex-row items-center mb-3">
                      <View className="w-6 h-6 rounded-full bg-blue-500/20 items-center justify-center mr-3">
                        <Users size={12} color="#3b82f6" />
                      </View>
                      <Text className="text-gray-700 dark:text-gray-300 text-sm">Connect with all competitors</Text>
                    </View>
                    <View className="flex-row items-center">
                      <View className="w-6 h-6 rounded-full bg-purple-500/20 items-center justify-center mr-3">
                        <TrendingUp size={12} color="#8b5cf6" />
                      </View>
                      <Text className="text-gray-700 dark:text-gray-300 text-sm">Share tips and motivation</Text>
                    </View>
                  </View>

                  {/* Upgrade button */}
                  <Pressable
                    onPress={handleUpgrade}
                    className="overflow-hidden rounded-2xl active:opacity-90"
                  >
                    <LinearGradient
                      colors={['#FFD700', '#FFA500', '#FF8C00']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                      }}
                    >
                      <Crown size={20} color="#000" strokeWidth={2.5} />
                      <Text className="text-black text-base font-bold ml-2">
                        Upgrade to Pro
                      </Text>
                    </LinearGradient>
                  </Pressable>

                  {/* Dismiss option */}
                  <Pressable
                    onPress={() => setShowChat(false)}
                    className="mt-4 py-2 active:opacity-70"
                  >
                    <Text className="text-gray-600 dark:text-gray-500 text-center text-sm">Maybe later</Text>
                  </Pressable>
                </View>
              </Animated.View>
            </View>
          )}

          {/* Message Input - Only for Pro users */}
          {isPro && (
            <View
              style={{
                paddingBottom: insets.bottom > 0 ? insets.bottom : 16,
                paddingTop: 12,
                paddingHorizontal: 16,
                backgroundColor: colors.bg,
              }}
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
                  className="flex-1 flex-row items-center rounded-full mr-3"
                  style={{ minHeight: 48, paddingHorizontal: 16, backgroundColor: colors.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)' }}
                >
                  <TextInput
                    value={newMessage}
                    onChangeText={setNewMessage}
                    placeholder="Send a message..."
                    placeholderTextColor="#6b7280"
                    className="flex-1"
                    style={{
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
                  onPress={handleSendMessage}
                  disabled={!newMessage.trim() || isSendingMessage}
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{ backgroundColor: newMessage.trim() && !isSendingMessage ? '#FA114F' : (colors.isDark ? '#2a2a2c' : '#e5e5e5') }}
                >
                  {isSendingMessage ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <ArrowUp size={24} color={newMessage.trim() ? 'white' : '#6b7280'} strokeWidth={2.5} />
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* Leave Competition Modal */}
      <Modal visible={showLeaveModal} animationType="fade" transparent>
        <View className="flex-1 justify-center items-center" style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' }}>
          <Animated.View
            entering={FadeIn.duration(300)}
            className="mx-6 w-full max-w-sm"
          >
            <View className="rounded-3xl overflow-hidden" style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF', borderWidth: 1, borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
              {/* Header */}
              <LinearGradient
                colors={colors.isDark ? ['#dc262620', '#1C1C1E'] : ['#dc262610', '#F5F5F7']}
                style={{ padding: 24, alignItems: 'center' }}
              >
                <View className="w-16 h-16 rounded-full bg-red-500/20 items-center justify-center mb-4">
                  <AlertTriangle size={32} color="#f87171" />
                </View>
                <Text className="text-black dark:text-white text-xl font-bold text-center">
                  Leave Competition?
                </Text>
                <Text className="text-gray-600 dark:text-gray-400 text-center mt-2 leading-5">
                  {isPro
                    ? "Are you sure you want to leave? You'll lose all your progress in this competition."
                    : "Leaving costs $2.99 to discourage giving up. Mover & Crusher members leave for free!"}
                </Text>
              </LinearGradient>

              {/* Content */}
              <View className="p-6">
                {!isPro && (
                  <View className="bg-amber-500/10 rounded-2xl p-4 mb-4 border border-amber-500/20">
                    <View className="flex-row items-center">
                      <Crown size={20} color="#F59E0B" />
                      <Text className="text-amber-400 font-semibold ml-2 flex-1">
                        Mover & Crusher members leave free
                      </Text>
                    </View>
                    <Text className="text-gray-600 dark:text-gray-400 text-sm mt-2">
                      Upgrade to Mover for unlimited free exits plus group chat, AI coach, and more.
                    </Text>
                    <Pressable
                      onPress={() => {
                        setShowLeaveModal(false);
                        router.push('/upgrade');
                      }}
                      className="mt-3 py-2"
                    >
                      <Text className="text-amber-400 font-semibold text-sm">
                        View Benefits →
                      </Text>
                    </Pressable>
                  </View>
                )}

                {/* Action Buttons */}
                <Pressable
                  onPress={handleLeaveCompetition}
                  disabled={isProcessingLeave}
                  className="rounded-2xl py-4 items-center justify-center mb-3 active:opacity-80"
                  style={{ backgroundColor: '#dc2626' }}
                >
                  {isProcessingLeave ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <View className="flex-row items-center">
                      <DoorOpen size={18} color="white" />
                      <Text className="text-white font-bold ml-2">
                        {isPro ? 'Leave Competition' : 'Pay $2.99 & Leave'}
                      </Text>
                    </View>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => setShowLeaveModal(false)}
                  disabled={isProcessingLeave}
                  className="rounded-2xl py-4 items-center"
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
                >
                  <Text className="text-black dark:text-white font-semibold">Stay in Competition</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' }}>
          <Animated.View entering={FadeIn.duration(200)} className="w-full">
            <View className="rounded-3xl p-6" style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF' }}>
              <View className="w-16 h-16 rounded-full bg-red-500/20 items-center justify-center self-center mb-4">
                <Trash2 size={32} color="#ef4444" />
              </View>

              <Text className="text-black dark:text-white text-xl font-bold text-center mb-2">
                Delete Competition?
              </Text>
              <Text className="text-gray-600 dark:text-gray-400 text-center mb-6">
                This will permanently delete "{competition.name}" and remove all participants. This action cannot be undone.
              </Text>

              <Pressable
                onPress={handleDeleteCompetition}
                className="bg-red-500 rounded-2xl py-4 items-center mb-3 active:opacity-80"
              >
                <Text className="text-white font-bold">Delete Competition</Text>
              </Pressable>

              <Pressable
                onPress={() => setShowDeleteModal(false)}
                className="rounded-2xl py-4 items-center"
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
              >
                <Text className="text-black dark:text-white font-semibold">Cancel</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Competition Info Modal */}
      <Modal
        visible={showInfoModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <View className="flex-1" style={{ backgroundColor: colors.isDark ? '#000000' : '#F2F2F7' }}>
          {/* Drag indicator */}
          <View className="items-center pt-2 pb-1">
            <View style={{ width: 36, height: 5, borderRadius: 2.5, backgroundColor: colors.isDark ? '#48484A' : '#D1D1D6' }} />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pb-4 pt-2">
            <View style={{ width: 60 }} />
            <Text className="text-base font-bold" style={{ color: colors.text }}>Competition Info</Text>
            <Pressable
              onPress={() => setShowInfoModal(false)}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}
            >
              <X size={16} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero Card */}
            <View
              className="rounded-3xl overflow-hidden mb-5"
              style={{ borderWidth: 1, borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
            >
              <LinearGradient
                colors={colors.isDark
                  ? ['#1C1C1E', '#0D0D0D']
                  : ['#FFFFFF', '#F8F8FA']
                }
                style={{ padding: 20 }}
              >
                <Text className="text-2xl font-bold mb-3" style={{ color: colors.text }}>
                  {competition.name}
                </Text>

                {/* Status pills row */}
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  <View
                    className="flex-row items-center px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        competition.status === 'active' ? '#92E82A15' :
                        competition.status === 'upcoming' ? '#3B82F615' : '#9CA3AF15',
                      borderWidth: 1,
                      borderColor:
                        competition.status === 'active' ? '#92E82A30' :
                        competition.status === 'upcoming' ? '#3B82F630' : '#9CA3AF30',
                    }}
                  >
                    <View
                      className="w-2 h-2 rounded-full mr-2"
                      style={{
                        backgroundColor:
                          competition.status === 'active' ? '#92E82A' :
                          competition.status === 'upcoming' ? '#3B82F6' : '#9CA3AF',
                      }}
                    />
                    <Text
                      className="text-xs font-semibold"
                      style={{
                        color:
                          competition.status === 'active' ? '#92E82A' :
                          competition.status === 'upcoming' ? '#3B82F6' : '#9CA3AF',
                      }}
                    >
                      {competition.status === 'active' ? 'Active' :
                       competition.status === 'upcoming' ? 'Upcoming' : 'Completed'}
                    </Text>
                  </View>

                  <View
                    className="flex-row items-center px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    }}
                  >
                    {competition.isPublic
                      ? <Globe size={12} color={colors.textSecondary} />
                      : <Lock size={12} color={colors.textSecondary} />
                    }
                    <Text className="text-xs font-medium ml-1.5" style={{ color: colors.textSecondary }}>
                      {competition.isPublic ? 'Public' : 'Private'}
                    </Text>
                  </View>

                  <View
                    className="flex-row items-center px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    }}
                  >
                    <Calendar size={12} color={colors.textSecondary} />
                    <Text className="text-xs font-medium ml-1.5" style={{ color: colors.textSecondary }}>
                      {getCompetitionTypeLabel(competition.type, competition.startDate, competition.endDate)}
                    </Text>
                  </View>
                </View>

                {/* Description */}
                {competition.description ? (
                  <Text className="text-sm leading-5 mt-4" style={{ color: colors.textSecondary }}>
                    {competition.description}
                  </Text>
                ) : null}

                {/* Creator */}
                {(() => {
                  const creator = competition.participants.find(p => p.id === competition.creatorId);
                  return creator ? (
                    <View className="flex-row items-center mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
                      {creator.avatar ? (
                        <Image source={{ uri: creator.avatar }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                      ) : (
                        <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: colors.isDark ? '#2C2C2E' : '#E5E5EA' }}>
                          <Crown size={12} color={colors.textSecondary} />
                        </View>
                      )}
                      <Text className="text-xs ml-2" style={{ color: colors.textSecondary }}>
                        Created by{' '}
                        <Text className="font-semibold" style={{ color: colors.text }}>
                          {competition.creatorId === userId ? 'You' : creator.name}
                        </Text>
                      </Text>
                    </View>
                  ) : null;
                })()}
              </LinearGradient>
            </View>

            {/* Stats Grid */}
            <View className="flex-row mb-5" style={{ gap: 10 }}>
              {/* Participants */}
              <View
                className="flex-1 rounded-2xl p-4"
                style={{
                  backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                }}
              >
                <View className="w-10 h-10 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#3B82F615' }}>
                  <Users size={20} color="#3B82F6" />
                </View>
                <Text className="text-2xl font-bold" style={{ color: colors.text }}>
                  {competition.participants.length}
                </Text>
                <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                  Participants
                </Text>
              </View>

              {/* Duration */}
              <View
                className="flex-1 rounded-2xl p-4"
                style={{
                  backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                }}
              >
                <View className="w-10 h-10 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#FF950015' }}>
                  <Clock size={20} color="#FF9500" />
                </View>
                <Text className="text-2xl font-bold" style={{ color: colors.text }}>
                  {getTotalDuration(competition.startDate, competition.endDate)}
                </Text>
                <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                  Days
                </Text>
              </View>

              {/* Days Remaining / Points */}
              {competition.status === 'active' ? (
                <View
                  className="flex-1 rounded-2xl p-4"
                  style={{
                    backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
                    borderWidth: 1,
                    borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  }}
                >
                  <View className="w-10 h-10 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#92E82A15' }}>
                    <TrendingUp size={20} color="#92E82A" />
                  </View>
                  <Text className="text-2xl font-bold" style={{ color: colors.text }}>
                    {getDaysRemaining(competition.endDate)}
                  </Text>
                  <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                    Days Left
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Dates Section */}
            <View
              className="rounded-2xl mb-5 overflow-hidden"
              style={{
                backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
                borderWidth: 1,
                borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              }}
            >
              <View className="flex-row items-center px-4 pt-4 pb-3">
                <Calendar size={16} color="#FA114F" />
                <Text className="text-sm font-semibold ml-2" style={{ color: colors.text }}>Schedule</Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }} />
              <View className="px-4 py-3 flex-row justify-between items-center">
                <Text className="text-sm" style={{ color: colors.textSecondary }}>Starts</Text>
                <Text className="text-sm font-medium" style={{ color: colors.text }}>
                  {parseLocalDate(competition.startDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <View style={{ height: 1, marginLeft: 16, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
              <View className="px-4 py-3 flex-row justify-between items-center">
                <Text className="text-sm" style={{ color: colors.textSecondary }}>Ends</Text>
                <Text className="text-sm font-medium" style={{ color: colors.text }}>
                  {parseLocalDate(competition.endDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </View>
            </View>

            {/* Scoring Section */}
            <View
              className="rounded-2xl mb-5 overflow-hidden"
              style={{
                backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
                borderWidth: 1,
                borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              }}
            >
              {(() => {
                const scoringType = competition.scoringType || 'ring_close';
                const scoringInfo = SCORING_TYPES.find(s => s.id === scoringType);
                return (
                  <>
                    <View className="flex-row items-center px-4 pt-4 pb-3">
                      <Trophy size={16} color="#FA114F" />
                      <Text className="text-sm font-semibold ml-2" style={{ color: colors.text }}>
                        {scoringInfo?.name || 'Ring Close Count'}
                      </Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }} />
                    <View className="px-4 py-3">
                      <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
                        {scoringInfo?.learnMore || scoringInfo?.description || 'Points are awarded based on your activity ring progress.'}
                      </Text>
                    </View>
                  </>
                );
              })()}
            </View>

            {/* Teams Section */}
            {competition.isTeamCompetition && teams.length > 0 && (
              <View
                className="rounded-2xl mb-5 overflow-hidden"
                style={{
                  backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                }}
              >
                <View className="flex-row items-center px-4 pt-4 pb-3">
                  <Users size={16} color="#8B5CF6" />
                  <Text className="text-sm font-semibold ml-2" style={{ color: colors.text }}>Teams</Text>
                </View>
                <View style={{ height: 1, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }} />
                {teams.map((team, idx) => (
                  <View key={team.id}>
                    {idx > 0 && <View style={{ height: 1, marginLeft: 52, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />}
                    <View className="flex-row items-center px-4 py-3">
                      <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: team.color + '15' }}>
                        <Text style={{ fontSize: 16 }}>{team.emoji}</Text>
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className="text-sm font-medium" style={{ color: colors.text }}>{team.name}</Text>
                        <Text className="text-xs" style={{ color: colors.textSecondary }}>
                          {competition.participants.filter(p => p.teamId === team.id).length} members
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Prize Pool Section */}
            {prizePool && (
              <View
                className="rounded-2xl mb-5 overflow-hidden"
                style={{
                  borderWidth: 1.5,
                  borderColor: '#F59E0B30',
                  backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
                }}
              >
                <LinearGradient
                  colors={colors.isDark ? ['#F59E0B10', '#1C1C1E'] : ['#F59E0B08', '#FFFFFF']}
                  style={{ padding: 16 }}
                >
                  <View className="flex-row items-center">
                    <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: '#F59E0B15' }}>
                      <Gift size={20} color="#F59E0B" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-xs font-medium" style={{ color: '#F59E0B' }}>PRIZE POOL</Text>
                      <Text className="text-xl font-bold" style={{ color: colors.text }}>
                        ${prizePool.totalAmount?.toFixed(2) || '0.00'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                    {prizePool.poolType === 'buy_in'
                      ? `Buy-in: $${prizePool.buyInAmount?.toFixed(2) || '0.00'} per person`
                      : 'Creator funded prize pool'}
                  </Text>
                </LinearGradient>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Blurred Lock Overlay - Shows when user's score is locked */}
      {isScoreLocked && (
        <Animated.View
          entering={FadeIn.duration(800)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
          }}
        >
          {/* Tappable overlay to go back */}
          <Pressable
            onPress={() => router.back()}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            <BlurView
              intensity={40}
              tint={colors.isDark ? 'dark' : 'light'}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />

            {/* Dark overlay for better contrast */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: colors.isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.55)',
              }}
            />
          </Pressable>

          {/* Centered Lock Content */}
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 40,
            }}
            pointerEvents="box-none"
          >
            {/* Lock Icon Container - with built-in glow via shadow */}
            <Animated.View
              style={[
                {
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(234, 179, 8, 0.2)',
                  borderWidth: 3,
                  borderColor: '#EAB308',
                  shadowColor: '#EAB308',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 30,
                  elevation: 20,
                },
                lockAnimatedStyle,
              ]}
            >
              <Lock size={52} color="#EAB308" strokeWidth={2.5} />
            </Animated.View>

            {/* Text Content */}
            <Animated.View
              entering={FadeInUp.duration(500).delay(800)}
              style={{ marginTop: 32, alignItems: 'center' }}
            >
              <Text
                className="font-bold"
                style={{
                  fontSize: 32,
                  color: '#EAB308',
                  textAlign: 'center',
                  textShadowColor: 'rgba(0,0,0,0.5)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 8,
                }}
              >
                Score Locked
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  color: '#fff',
                  textAlign: 'center',
                  marginTop: 12,
                  lineHeight: 24,
                  textShadowColor: 'rgba(0,0,0,0.5)',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 4,
                }}
              >
                Your final score of{' '}
                <Text style={{ fontWeight: '700', color: '#EAB308' }}>
                  {(userParticipant?.points ?? 0).toLocaleString()} points
                </Text>
                {'\n'}has been recorded
              </Text>

              {/* Waiting for others — participant sync status */}
              {(() => {
                const otherParticipants = competition.participants.filter(
                  (p) => p.id !== userId && !p.isBlocked
                );
                if (otherParticipants.length === 0) return null;
                const allLocked = otherParticipants.every((p) => !!p.scoreLockedAt);
                return (
                  <View
                    style={{
                      marginTop: 24,
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderRadius: 20,
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.15)',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: 'rgba(255,255,255,0.7)',
                        marginBottom: 10,
                      }}
                    >
                      {allLocked ? 'All results received' : 'Waiting for final results from:'}
                    </Text>
                    {otherParticipants.map((p) => {
                      const isLocked = !!p.scoreLockedAt;
                      return (
                        <View
                          key={p.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 6,
                          }}
                        >
                          {isLocked ? (
                            <CheckCircle2 size={18} color="#22C55E" />
                          ) : (
                            <Circle size={18} color="rgba(255,255,255,0.3)" />
                          )}
                          <Image
                            source={{ uri: p.avatar }}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 12,
                              marginLeft: 10,
                            }}
                          />
                          <Text
                            style={{
                              fontSize: 14,
                              color: isLocked ? 'rgba(255,255,255,0.5)' : '#fff',
                              marginLeft: 8,
                              fontWeight: isLocked ? '400' : '500',
                            }}
                          >
                            {p.name}
                          </Text>
                          {isLocked && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: '#22C55E',
                                marginLeft: 'auto',
                              }}
                            >
                              Synced
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              {/* Position indicator */}
              <View
                style={{
                  marginTop: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 16,
                  backgroundColor: userRank === 1 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                  borderWidth: 1,
                  borderColor: userRank === 1 ? 'rgba(234, 179, 8, 0.4)' : 'rgba(107, 114, 128, 0.3)',
                }}
              >
                {userRank === 1 ? (
                  <Crown size={18} color="#EAB308" />
                ) : (
                  <Trophy size={18} color={colors.isDark ? '#9CA3AF' : '#6B7280'} />
                )}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: userRank === 1 ? '#EAB308' : (colors.isDark ? '#D1D5DB' : '#4B5563'),
                    marginLeft: 8,
                  }}
                >
                  Currently in {userRank}{getRankSuffix(userRank)} place
                </Text>
              </View>

              {/* Return Home link */}
              <Pressable
                onPress={() => router.back()}
                style={{ marginTop: 24 }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: '#fff',
                    textDecorationLine: 'underline',
                  }}
                >
                  Return Home
                </Text>
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>
      )}

      {/* Celebratory Results Overlay - Shows when competition is completed */}
      {competition.status === 'completed' && !resultsOverlayDismissed && (
        <Animated.View
          entering={FadeIn.duration(600)}
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
            },
            resultsOverlayAnimatedStyle,
          ]}
        >
          {/* Blurred dark overlay */}
          <BlurView
            intensity={10}
            tint="dark"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: colors.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.6)',
              }}
            />
          </BlurView>

          {/* Confetti Animation - above the overlay */}
          <Confetti count={80} />

          {/* Content */}
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 24,
            }}
          >
            {/* Trophy/Winner Section */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(300)}
              style={{ alignItems: 'center' }}
            >
              <View
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 50,
                  backgroundColor: userRank === 1 ? '#FFD700' : 'rgba(255,255,255,0.15)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 20,
                  shadowColor: userRank === 1 ? '#FFD700' : '#000',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: userRank === 1 ? 0.5 : 0.3,
                  shadowRadius: 20,
                }}
              >
                {userRank === 1 ? (
                  <Crown size={50} color="#000" />
                ) : userRank <= 3 ? (
                  <Medal size={50} color={userRank === 2 ? '#C0C0C0' : '#CD7F32'} />
                ) : (
                  <Trophy size={50} color="#9CA3AF" />
                )}
              </View>

              <Text
                className="font-bold"
                style={{
                  fontSize: 36,
                  color: userRank === 1 ? '#FFD700' : '#fff',
                  textAlign: 'center',
                  textShadowColor: 'rgba(0,0,0,0.5)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 8,
                }}
              >
                {userRank === 1 ? 'You Won!' : 'Competition Complete!'}
              </Text>

              <Text
                style={{
                  fontSize: 18,
                  color: '#D1D5DB',
                  textAlign: 'center',
                  marginTop: 8,
                }}
              >
                {competition.name}
              </Text>
            </Animated.View>

            {/* Final Standings - Top 3 */}
            <Animated.View
              entering={FadeInUp.duration(600).delay(600)}
              style={{
                marginTop: 40,
                width: '100%',
                maxWidth: 320,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: '#9CA3AF',
                  textAlign: 'center',
                  marginBottom: 16,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Final Standings
              </Text>

              {/* Podium */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' }}>
                {/* 2nd Place */}
                <View style={{ flex: 1, alignItems: 'center', marginRight: 8 }}>
                  {sortedParticipants[1] && (
                    <>
                      <Image
                        source={{ uri: sortedParticipants[1].avatar }}
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          borderWidth: 3,
                          borderColor: '#C0C0C0',
                        }}
                      />
                      <View
                        style={{
                          marginTop: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          backgroundColor: 'rgba(192, 192, 192, 0.2)',
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: '#C0C0C0', fontWeight: '700', fontSize: 16 }}>2nd</Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: '#fff',
                          fontSize: 13,
                          marginTop: 4,
                          maxWidth: 80,
                          textAlign: 'center',
                        }}
                      >
                        {sortedParticipants[1].name}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 12 }}>
                        {sortedParticipants[1].points.toLocaleString()} pts
                      </Text>
                    </>
                  )}
                </View>

                {/* 1st Place */}
                <View style={{ flex: 1, alignItems: 'center', marginHorizontal: 4 }}>
                  {sortedParticipants[0] && (
                    <>
                      <View style={{ position: 'relative' }}>
                        <Image
                          source={{ uri: sortedParticipants[0].avatar }}
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 36,
                            borderWidth: 4,
                            borderColor: '#FFD700',
                          }}
                        />
                        <View
                          style={{
                            position: 'absolute',
                            top: -8,
                            right: -8,
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: '#FFD700',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <Crown size={14} color="#000" />
                        </View>
                      </View>
                      <View
                        style={{
                          marginTop: 8,
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          backgroundColor: 'rgba(255, 215, 0, 0.25)',
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: '#FFD700', fontWeight: '700', fontSize: 18 }}>1st</Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: '#fff',
                          fontSize: 14,
                          fontWeight: '600',
                          marginTop: 4,
                          maxWidth: 100,
                          textAlign: 'center',
                        }}
                      >
                        {sortedParticipants[0].name}
                      </Text>
                      <Text style={{ color: '#FFD700', fontSize: 12, fontWeight: '600' }}>
                        {sortedParticipants[0].points.toLocaleString()} pts
                      </Text>
                    </>
                  )}
                </View>

                {/* 3rd Place */}
                <View style={{ flex: 1, alignItems: 'center', marginLeft: 8 }}>
                  {sortedParticipants[2] && (
                    <>
                      <Image
                        source={{ uri: sortedParticipants[2].avatar }}
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          borderWidth: 3,
                          borderColor: '#CD7F32',
                        }}
                      />
                      <View
                        style={{
                          marginTop: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          backgroundColor: 'rgba(205, 127, 50, 0.2)',
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: '#CD7F32', fontWeight: '700', fontSize: 16 }}>3rd</Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: '#fff',
                          fontSize: 13,
                          marginTop: 4,
                          maxWidth: 80,
                          textAlign: 'center',
                        }}
                      >
                        {sortedParticipants[2].name}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 12 }}>
                        {sortedParticipants[2].points.toLocaleString()} pts
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </Animated.View>

            {/* Your Result (if not in top 3) */}
            {userRank > 3 && userParticipant && (
              <Animated.View
                entering={FadeInUp.duration(600).delay(800)}
                style={{
                  marginTop: 24,
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.2)',
                }}
              >
                <Text style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', marginBottom: 4 }}>
                  Your Final Position
                </Text>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' }}>
                  {userRank}{getRankSuffix(userRank)} Place
                </Text>
                <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 2 }}>
                  {userParticipant.points.toLocaleString()} points
                </Text>
              </Animated.View>
            )}

            {/* View Results Button */}
            <Animated.View
              entering={FadeInUp.duration(600).delay(1000)}
              style={{ marginTop: 40, width: '100%', maxWidth: 280 }}
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  dismissResultsOverlay();
                }}
                style={{
                  paddingVertical: 16,
                  paddingHorizontal: 32,
                  backgroundColor: userRank === 1 ? '#FFD700' : '#FA114F',
                  borderRadius: 30,
                  alignItems: 'center',
                  shadowColor: userRank === 1 ? '#FFD700' : '#FA114F',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 12,
                }}
              >
                <Text
                  style={{
                    color: userRank === 1 ? '#000' : '#fff',
                    fontSize: 17,
                    fontWeight: '700',
                  }}
                >
                  View Full Results
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.back()}
                style={{ marginTop: 16, alignItems: 'center' }}
              >
                <Text
                  style={{
                    color: '#9CA3AF',
                    fontSize: 15,
                    textDecorationLine: 'underline',
                  }}
                >
                  Return Home
                </Text>
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>
      )}

      {/* Team Picker Bottom Sheet */}
      {showTeamPicker && isTeamComp && teams.length > 0 && (
        <TeamPickerSheet
          sheetRef={teamPickerRef}
          teams={teams}
          onTeamSelected={handleTeamSelected}
          onClose={() => setShowTeamPicker(false)}
          isJoining={isJoiningTeam}
        />
      )}

      {/* Opt-in-later Buy-In Payment Sheet */}
      {isUserOptedOut && prizePool?.buyInAmount && competition?.id && (
        <BuyInPaymentSheet
          sheetRef={optInSheetRef}
          competitionId={competition.id}
          competitionName={competition.name}
          buyInAmount={prizePool.buyInAmount}
          isOptInLater
          onSuccess={handleOptInSuccess}
        />
      )}
    </View>
  );
}