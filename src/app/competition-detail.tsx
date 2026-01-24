import { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { Text } from '@/components/Text';

const { width } = Dimensions.get('window');
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
import {
  fetchCompetition,
  subscribeToCompetition,
  syncCompetitionHealthData,
  fetchHealthDataForDateRange,
  leaveCompetition as leaveCompetitionService,
  deleteCompetition as deleteCompetitionService,
} from '@/lib/competition-service';
import type { Competition } from '@/lib/fitness-store';
import { supabase } from '@/lib/supabase';
import { getAvatarUrl } from '@/lib/avatar-utils';
import { loadChatMessages, sendChatMessage, subscribeToChatMessages } from '@/lib/chat-service';
import type { ChatMessage, ReactionType } from '@/lib/chat-service';
import Constants from 'expo-constants';

// Get Supabase URL for chat moderation
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
import { SCORING_TYPES } from '@/lib/competition-types';
import { useThemeColors } from '@/lib/useThemeColors';
import {
  Crown,
  Medal,
  Calendar,
  Users,
  Clock,
  Trophy,
  TrendingUp,
  MoreHorizontal,
  MessageCircle,
  ArrowUp,
  X,
  Lock,
  DoorOpen,
  AlertTriangle,
  Trash2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  FadeIn,
  FadeInUp,
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


function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}

function getRankSuffix(rank: number): string {
  if (rank === 1) return 'st';
  if (rank === 2) return 'nd';
  if (rank === 3) return 'rd';
  return 'th';
}

function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate);
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

    // Subscribe to new messages while chat is open
    unsubscribe = subscribeToChatMessages(id, (newMsg) => {
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

    const unsubscribe = subscribeToChatMessages(id, (newMsg) => {
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
  }, [showChat, id, isPro, userId]);

  // Reaction picker state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [reactionPickerPosition, setReactionPickerPosition] = useState<{ top: number; left: number; isOwn: boolean } | null>(null);

  const handleLongPress = (messageId: string, pageY: number, pageX: number, isOwn: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMessageId(messageId);
    setReactionPickerPosition({ top: pageY - 60, left: isOwn ? pageX - 200 : pageX, isOwn });
  };

  const handleReaction = (reaction: ReactionType) => {
    if (!selectedMessageId || !userId) return;

    setMessages(prev => prev.map(msg => {
      if (msg.id === selectedMessageId) {
        const currentReactions = msg.reactions || {};
        const reactionUsers = currentReactions[reaction] || [];

        // Toggle reaction
        if (reactionUsers.includes(userId)) {
          // Remove reaction
          const newUsers = reactionUsers.filter(id => id !== userId);
          if (newUsers.length === 0) {
            const { [reaction]: _, ...rest } = currentReactions;
            return { ...msg, reactions: Object.keys(rest).length > 0 ? rest : undefined };
          }
          return { ...msg, reactions: { ...currentReactions, [reaction]: newUsers } };
        } else {
          // Add reaction
          return { ...msg, reactions: { ...currentReactions, [reaction]: [...reactionUsers, userId] } };
        }
      }
      return msg;
    }));

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMessageId(null);
    setReactionPickerPosition(null);
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
      const comp = await fetchCompetition(id, userId);
      
      if (comp) {
        const userParticipant = comp.participants.find((p) => p.id === userId);
        console.log('[CompetitionDetail] Competition loaded:', {
          competitionId: id,
          userId,
          participantCount: comp.participants.length,
          userIsParticipant: !!userParticipant,
          userParticipantPoints: userParticipant?.points || 0,
          userParticipantName: userParticipant?.name,
          allParticipantIds: comp.participants.map(p => p.id),
          creatorId: comp.creatorId,
          pendingInvitationsCount: comp.pendingInvitations?.length || 0,
        });
      } else {
        console.log('[CompetitionDetail] Competition not found:', { competitionId: id, userId });
      }
      
      setCompetition(comp);
      setIsLoading(false);

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
      console.log('[CompetitionDetail] Skipping sync check:', { hasCompetition: !!competition, userId, isSyncing, isLoading });
      return;
    }

    console.log('[CompetitionDetail] Checking user participation:', {
      competitionId: competition.id,
      userId,
      participantCount: competition.participants.length,
      participantIds: competition.participants.map(p => p.id),
    });

    // Check if user is a participant
    const userParticipant = competition.participants.find((p) => p.id === userId);
    
    console.log('[CompetitionDetail] User participant check:', {
      competitionId: competition.id,
      userId,
      found: !!userParticipant,
      userParticipantPoints: userParticipant?.points || 0,
      status: competition.status,
    });

    if (!userParticipant) {
      console.log('[CompetitionDetail] User not found as participant - exiting sync:', { competitionId: competition.id, userId });
      return;
    }

    // Only sync if competition is active or upcoming (not completed)
    if (competition.status === 'completed') {
      console.log('[CompetitionDetail] Competition is completed, skipping sync:', {
        competitionId: competition.id,
        userId,
        status: competition.status,
      });
      return;
    }

    console.log('[CompetitionDetail] Setting up sync function:', {
      competitionId: competition.id,
      userId,
      competitionStatus: competition.status,
    });

    let isMounted = true;

    const syncHealthData = async (forceSync = false) => {
      console.log('[CompetitionDetail] syncHealthData - STARTING (function called):', {
        competitionId: competition.id,
        userId,
        competitionStatus: competition.status,
        forceSync,
      });

      // Use a ref to track if we're already syncing to avoid race conditions
      setIsSyncing(true);
      try {
        // Check if we've synced recently (within 5 minutes) to avoid too frequent syncs
        // BUT: If user has 0 points, force a sync to ensure data is properly synced
        // ALSO: Skip cooldown check if forceSync is true (user manually triggered refresh)
        const lastSyncKey = `last_sync_${competition.id}`;
        const lastSyncTime = await AsyncStorage.getItem(lastSyncKey);
        // Check current participant points from the competition object (in case it was updated)
        const currentUserParticipant = competition.participants.find((p) => p.id === userId);
        const userParticipantPoints = currentUserParticipant?.points || 0;

        console.log('[CompetitionDetail] Checking sync cooldown:', {
          competitionId: competition.id,
          userId,
          lastSyncTime,
          hasLastSyncTime: !!lastSyncTime,
          userParticipantPoints,
          shouldForceSync: userParticipantPoints === 0 || forceSync,
          forceSync,
        });

        // Skip cooldown check if forceSync is true (user pulled to refresh)
        if (lastSyncTime && userParticipantPoints > 0 && !forceSync) {
          const timeSinceLastSync = Date.now() - parseInt(lastSyncTime, 10);
          const minutesAgo = Math.round(timeSinceLastSync / 60000);
          console.log('[CompetitionDetail] Time since last sync:', {
            competitionId: competition.id,
            userId,
            timeSinceLastSync,
            minutesAgo,
            shouldSkip: timeSinceLastSync < 5 * 60 * 1000,
          });
          if (timeSinceLastSync < 5 * 60 * 1000) {
            // Synced less than 5 minutes ago, skip (only if user has points and not forcing)
            console.log('[CompetitionDetail] Skipping sync - synced recently and user has points:', {
              competitionId: competition.id,
              userId,
              timeSinceLastSync,
              minutesAgo,
              userParticipantPoints,
            });
            setIsSyncing(false);
            return;
          }
        } else if (lastSyncTime && userParticipantPoints === 0) {
          // User has 0 points even though we synced recently - force a new sync
          console.log('[CompetitionDetail] Forcing sync - user has 0 points despite previous sync:', {
            competitionId: competition.id,
            userId,
            lastSyncTime,
            userParticipantPoints,
          });
          // Clear the last sync time to force a fresh sync
          await AsyncStorage.removeItem(lastSyncKey);
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

        console.log('[CompetitionDetail] Parsed competition dates:', {
          rawStartDate: competition.startDate,
          rawEndDate: competition.endDate,
          parsedStartDate: startDate.toISOString(),
          parsedEndDate: endDate.toISOString(),
          localStartDate: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`,
          localEndDate: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`,
        });
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        

        // Only fetch data up to today
        const effectiveEndDate = endDate > today ? today : endDate;

        console.log('[CompetitionDetail] Fetching health data for date range:', {
          competitionId: competition.id,
          userId,
          startDate: startDate.toISOString(),
          effectiveEndDate: effectiveEndDate.toISOString(),
          endDate: endDate.toISOString(),
        });

        // Fetch health data for the competition date range
        const healthMetrics = await fetchHealthDataForDateRange(startDate, effectiveEndDate);

        console.log('[CompetitionDetail] Fetched health metrics:', {
          competitionId: competition.id,
          userId,
          metricsCount: healthMetrics.length,
          metrics: healthMetrics.length > 0 ? healthMetrics.map(m => ({
            date: m.date,
            moveCalories: m.moveCalories,
            exerciseMinutes: m.exerciseMinutes,
            standHours: m.standHours,
          })) : 'NO METRICS RETURNED',
        });

        if (!isMounted) return;

        if (healthMetrics.length > 0) {
          // Sync the data to Supabase
          console.log('[CompetitionDetail] Syncing health data to Supabase...');
          const syncResult = await syncCompetitionHealthData(
            competition.id,
            userId,
            competition.startDate,
            competition.endDate,
            healthMetrics
          );

          console.log('[CompetitionDetail] Sync result:', {
            competitionId: competition.id,
            userId,
            success: syncResult,
          });

          if (!syncResult) {
            console.error('[CompetitionDetail] Sync failed - check competition-service logs');
          }

          // Store sync time
          await AsyncStorage.setItem(lastSyncKey, Date.now().toString());

          // Wait a bit for the trigger to update participant totals
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Refetch competition to get updated leaderboard
          const updatedComp = await fetchCompetition(competition.id, userId);

          console.log('[CompetitionDetail] Refetched competition after sync:', {
            competitionId: competition.id,
            userId,
            userParticipant: updatedComp?.participants.find(p => p.id === userId),
          });

          if (isMounted && updatedComp) {
            setCompetition(updatedComp);
          }
        } else {
          console.warn('[CompetitionDetail] No health metrics returned from Apple Health:', {
            competitionId: competition.id,
            userId,
            startDate: startDate.toISOString(),
            effectiveEndDate: effectiveEndDate.toISOString(),
          });
        }
      } catch (error) {
        console.error('[CompetitionDetail] Error syncing health data:', {
          competitionId: competition.id,
          userId,
          error: error?.message,
          stack: error?.stack,
        });
      } finally {
        if (isMounted) {
          setIsSyncing(false);
        }
      }
    };

    // Sync immediately when competition loads
    // Store the sync function in ref so it can be called from refresh handler
    syncFunctionRef.current = syncHealthData;

    console.log('[CompetitionDetail] About to call syncHealthData:', {
      competitionId: competition.id,
      userId,
      competitionStatus: competition.status,
    });
    syncHealthData().catch((error) => {
      console.error('[CompetitionDetail] syncHealthData promise rejected:', {
        competitionId: competition.id,
        userId,
        error: error?.message,
        stack: error?.stack,
      });
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
    try {
      // Force sync to bypass cooldown
      if (syncFunctionRef.current) {
        await syncFunctionRef.current(true);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

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
    console.log('[Chat] newMessage:', newMessage.trim());
    console.log('[Chat] authUser:', !!authUser);
    console.log('[Chat] id:', id);
    console.log('[Chat] isSendingMessage:', isSendingMessage);
    console.log('[Chat] SUPABASE_URL:', SUPABASE_URL);

    if (!newMessage.trim() || !authUser || !id || isSendingMessage) {
      console.log('[Chat] Early return - missing data');
      return;
    }

    // Check if muted
    if (chatMuted && chatMutedUntil) {
      console.log('[Chat] Checking mute status...');
      const muteEnd = new Date(chatMutedUntil).getTime();
      if (Date.now() < muteEnd) {
        const minutesLeft = Math.ceil((muteEnd - Date.now()) / (1000 * 60));
        Alert.alert('Chat Muted', `You are muted for ${minutesLeft} more minute${minutesLeft !== 1 ? 's' : ''}.`);
        return;
      } else {
        // Mute expired
        setChatMuted(false);
        setChatMutedUntil(null);
      }
    }

    const messageText = newMessage.trim();
    setIsSendingMessage(true);
    console.log('[Chat] Set isSendingMessage to true');

    try {
      // Get auth token
      console.log('[Chat] Getting session...');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[Chat] Got session, has token:', !!session?.access_token);

      if (!session?.access_token) {
        console.log('[Chat] No access token!');
        Alert.alert('Error', 'Not authenticated');
        setIsSendingMessage(false);
        return;
      }

      // Call moderation API
      const url = `${SUPABASE_URL}/functions/v1/moderate-chat-message`;
      console.log('[Chat] Calling moderation API:', url);

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

      console.log('[Chat] Response status:', response.status);
      const result = await response.json();
      console.log('[Chat] Response result:', JSON.stringify(result));

      // Handle muted response
      if (result.muted_until) {
        console.log('[Chat] User muted until:', result.muted_until);
        setChatMuted(true);
        setChatMutedUntil(result.muted_until);
      }

      // Handle blocked message
      if (result.blocked) {
        console.log('[Chat] Message blocked:', result.reason);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          'Message Blocked',
          result.reason || 'Your message was blocked for violating community guidelines.',
          [{ text: 'OK' }]
        );
        setIsSendingMessage(false);
        return;
      }

      // Message allowed - save to database
      console.log('[Chat] Message allowed, saving to database');
      const saveResult = await sendChatMessage(id, authUser.id, messageText);

      if (saveResult.success && saveResult.message) {
        console.log('[Chat] Message saved successfully:', saveResult.message.id);
        // Add to local state immediately (real-time will deduplicate)
        setMessages((prev) => {
          if (prev.some((m) => m.id === saveResult.message!.id)) {
            return prev;
          }
          return [...prev, saveResult.message!];
        });
      } else {
        console.error('[Chat] Failed to save message:', saveResult.error);
        // Fall back to local-only message if save fails
        const firstName = authUser.firstName || authUser.username || 'User';
        const avatar = getAvatarUrl(authUser.avatarUrl, firstName, authUser.username);

        const message: ChatMessage = {
          id: `m${Date.now()}`,
          oderId: authUser.id,
          senderName: firstName,
          senderAvatar: avatar,
          text: messageText,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, message]);
      }
      setNewMessage('');

    } catch (error) {
      console.error('[Chat] Moderation error:', error);
      // On error, try to save directly to database (skip moderation)
      const firstName = authUser.firstName || authUser.username || 'User';
      const saveResult = await sendChatMessage(id, authUser.id, messageText);

      if (saveResult.success && saveResult.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === saveResult.message!.id)) {
            return prev;
          }
          return [...prev, saveResult.message!];
        });
      } else {
        // Last resort: local-only message
        const avatar = getAvatarUrl(authUser.avatarUrl, firstName, authUser.username);
        const message: ChatMessage = {
          id: `m${Date.now()}`,
          oderId: authUser.id,
          senderName: firstName,
          senderAvatar: avatar,
          text: messageText,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, message]);
      }
      setNewMessage('');
    } finally {
      setIsSendingMessage(false);
      console.log('[Chat] Done, isSendingMessage set to false');
    }
  };

  const handleOpenChat = () => {
    if (!isPro) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    setShowChat(true);
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

    const success = await deleteCompetitionService(id, userId);

    if (success) {
      // Remove from local store
      const deleteCompetitionFromStore = useFitnessStore.getState().deleteCompetition;
      deleteCompetitionFromStore(id);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDeleteModal(false);
      router.back();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color="#FA114F" />
        <Text className="text-gray-400 dark:text-gray-400 mt-4">Loading competition...</Text>
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
  const daysRemaining = getDaysRemaining(competition.endDate);


  const statusConfig = {
    active: { color: '#fff', label: 'Active', bgColor: 'rgba(34, 197, 94, 0.9)' },
    upcoming: { color: '#fff', label: 'Starting Soon', bgColor: 'rgba(59, 130, 246, 0.9)' },
    completed: { color: '#fff', label: 'Completed', bgColor: 'rgba(107, 114, 128, 0.9)' },
  };

  const status = statusConfig[competition.status];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Background Layer - Positioned to fill screen with extra coverage */}
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
        pointerEvents="none"
      />

      {/* Content Layer - Scrollable */}
      <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        style={{ backgroundColor: 'transparent', zIndex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || isSyncing}
            onRefresh={handleRefresh}
            tintColor={colors.isDark ? '#ffffff' : '#000000'}
          />
        }
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32 }}>

          <Animated.View entering={FadeInDown.duration(600)}>
            {/* Nav Bar */}
            <View className="flex-row items-center justify-between mb-6">
              <View className="flex-row items-center">
                <LiquidGlassBackButton onPress={() => router.back()} />
              </View>
              <View className="flex-row" style={{ gap: 12 }}>
                {/* Chat Button */}
                <Pressable
                  onPress={handleOpenChat}
                  className="active:opacity-70"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.7)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MessageCircle size={20} color={colors.isDark ? '#ffffff' : '#000000'} />
                  {unreadCount > 0 && (
                    <View className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-fitness-accent items-center justify-center">
                      <Text className="text-white text-xs font-bold">{unreadCount}</Text>
                    </View>
                  )}
                  {!isPro && (
                    <View className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 items-center justify-center">
                      <Lock size={10} color="#000" />
                    </View>
                  )}
                </Pressable>

                {/* Settings Button */}
                <Pressable
                  onPress={() => {
                    if (isCreator) {
                      setShowDeleteModal(true);
                    } else {
                      handleLeavePress();
                    }
                  }}
                  className="active:opacity-70"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.7)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MoreHorizontal size={20} color={colors.isDark ? '#ffffff' : '#000000'} />
                </Pressable>
              </View>
            </View>

            {/* Competition Title */}
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <View
                  className="self-start px-4 py-2 rounded-full mb-3"
                  style={{ backgroundColor: status.bgColor }}
                >
                  <Text style={{ color: status.color }} className="text-sm font-bold">
                    {status.label}
                  </Text>
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


        {/* Your Position Card - Only show when competition is active */}
        {userParticipant && competition.status === 'active' && (
          <Animated.View
            entering={FadeInDown.duration(500).delay(100)}
            className="px-5 mb-6"
          >
            <LinearGradient
              colors={colors.isDark ? ['#FA114F20', '#1C1C1E'] : ['#FA114F10', '#F5F5F7']}
              style={{ borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.isDark ? '#FA114F30' : '#FA114F20' }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-16 h-16 rounded-full bg-fitness-accent/20 items-center justify-center">
                    <Text className="text-fitness-accent text-2xl font-bold">#{userRank}</Text>
                  </View>
                  <View className="ml-4">
                    <Text className="text-gray-600 dark:text-gray-400 text-sm">Your Position</Text>
                    <Text className="text-black dark:text-white text-xl font-bold">
                      {userRank}{getRankSuffix(userRank)} Place
                    </Text>
                    <Text className="text-fitness-accent font-semibold mt-1">
                      {userParticipant.points} points
                    </Text>
                  </View>
                </View>
                <TripleActivityRings
                  size={70}
                  moveProgress={currentMetrics?.activeCalories ? currentMetrics.activeCalories / (goals.moveCalories || 400) : 0}
                  exerciseProgress={currentMetrics?.exerciseMinutes ? currentMetrics.exerciseMinutes / (goals.exerciseMinutes || 30) : 0}
                  standProgress={currentMetrics?.standHours ? currentMetrics.standHours / (goals.standHours || 12) : 0}
                  moveGoal={goals.moveCalories || 400}
                  exerciseGoal={goals.exerciseMinutes || 30}
                  standGoal={goals.standHours || 12}
                />
              </View>

              {userRank > 1 && (
                <View className="mt-4 pt-4 flex-row items-center" style={{ borderTopWidth: 1, borderTopColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                  <TrendingUp size={16} color="#92E82A" />
                  <Text className="text-gray-600 dark:text-gray-400 ml-2">
                    <Text className="text-ring-exercise font-semibold">
                      {sortedParticipants[userRank - 2].points - userParticipant.points} points
                    </Text>
                    {' '}behind {sortedParticipants[userRank - 2].name}
                  </Text>
                </View>
              )}
            </LinearGradient>
          </Animated.View>
        )}

        {/* Top 3 Podium - Only show when competition is active */}
        {competition.status === 'active' && (
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
                  <Medal size={20} color={colors.isDark ? '#C0C0C0' : '#909090'} />
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
                  <Medal size={18} color={colors.isDark ? '#CD7F32' : '#A0642A'} />
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

              return (
                <Pressable
                  key={participant.id}
                  onPress={() => {
                    router.push(`/friend-profile?id=${participant.id}`);
                  }}
                  className="flex-row items-center px-4 py-5"
                  style={{
                    borderBottomWidth: index < sortedParticipants.length - 1 ? 1 : 0,
                    borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    backgroundColor: 'transparent',
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
                  <Image
                    source={{ uri: participant.avatar }}
                    className="w-14 h-14 rounded-full ml-1"
                  />

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
                    </View>
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
                  </View>

                  {/* Points */}
                  <View className="items-end mr-2">
                    <Text className="text-black dark:text-white font-bold text-xl">{participant.points.toLocaleString()}</Text>
                    <Text className="text-gray-500 dark:text-gray-500 text-xs font-medium">pts</Text>
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

        {/* Competition Details */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(250)}
          className="px-5"
        >
          <Text className="text-black dark:text-white text-xl font-semibold mb-4">Details</Text>
          <View className="rounded-2xl p-4" style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7' }}>
            <View className="flex-row items-center justify-between py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              <Text className="text-gray-600 dark:text-gray-400">Start Date</Text>
              <Text className="text-black dark:text-white font-medium">
                {new Date(competition.startDate).toLocaleDateString('en-US', {
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
                {new Date(competition.endDate).toLocaleDateString('en-US', {
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

                return (
                  <Animated.View
                    key={message.id}
                    entering={FadeInUp.duration(300).delay(index * 30)}
                    className={`flex-row mb-3 ${isOwn ? 'justify-end' : 'justify-start'}`}
                    style={{ opacity: isPro ? 1 : 0.3 }}
                  >
                    {!isOwn && showAvatar && (
                      <Image
                        source={{ uri: message.senderAvatar }}
                        className="w-8 h-8 rounded-full mr-2"
                      />
                    )}
                    {!isOwn && !showAvatar && <View className="w-8 mr-2" />}

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
                        {formatTimeAgo(message.timestamp)}
                      </Text>
                    </View>
                  </Animated.View>
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
    </View>
  );
}