import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
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
import { SCORING_TYPES } from '@/lib/competition-types';
import {
  ChevronLeft,
  Crown,
  Medal,
  Calendar,
  Users,
  Clock,
  Trophy,
  TrendingUp,
  Share2,
  MoreHorizontal,
  MessageCircle,
  Send,
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

// Chat types
interface ChatMessage {
  id: string;
  oderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: string;
}

// Mock chat messages per competition
const MOCK_CHAT_MESSAGES: Record<string, ChatMessage[]> = {
  '1': [
    {
      id: 'm1',
      oderId: '2',
      senderName: 'Jordan',
      senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
      text: "Let's crush this weekend! 💪",
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'm2',
      oderId: '3',
      senderName: 'Taylor',
      senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
      text: "I'm coming for that top spot!",
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'm3',
      oderId: '4',
      senderName: 'Casey',
      senderAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop',
      text: 'Just finished a morning run. 5K before breakfast!',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'm4',
      oderId: '2',
      senderName: 'Jordan',
      senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
      text: 'Nice Casey! I did a HIIT session this morning',
      timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'm5',
      oderId: '5',
      senderName: 'Morgan',
      senderAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop',
      text: "You all are motivating me to get moving! Who's up for a group workout later?",
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  ],
  '2': [
    {
      id: 'm1',
      oderId: '2',
      senderName: 'Jordan',
      senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
      text: 'January is our month! Stay consistent everyone 🎯',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'm2',
      oderId: '6',
      senderName: 'Riley',
      senderAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop',
      text: 'Day 6 complete! Keeping the streak alive 🔥',
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'm3',
      oderId: '7',
      senderName: 'Sam',
      senderAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
      text: 'Swimming laps every morning this month! 🏊‍♀️',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    },
  ],
  '3': [
    {
      id: 'm1',
      oderId: '8',
      senderName: 'Drew',
      senderAvatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=200&h=200&fit=crop',
      text: 'Ready for next week! May the best person win 🏆',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
  ],
};

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const scrollViewRef = useRef<ScrollView>(null);

  const authUser = useAuthStore((s) => s.user);
  const subscriptionTier = useSubscriptionStore((s) => s.tier);
  const isPro = subscriptionTier === 'mover' || subscriptionTier === 'crusher';
  // Get user's goals from health store to display rings correctly
  const goals = useHealthStore((s) => s.goals);

  // Real competition data state
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const userId = authUser?.id;

  // Check if current user is the creator (use creator_id from competition, not first participant)
  const isCreator = userId && competition?.creatorId === userId;

  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(
    id ? MOCK_CHAT_MESSAGES[id] || [] : []
  );
  const [newMessage, setNewMessage] = useState('');
  const chatScrollRef = useRef<ScrollView>(null);

  // Leave competition state
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isProcessingLeave, setIsProcessingLeave] = useState(false);

  // Menu and delete state
  const [showMenu, setShowMenu] = useState(false);
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

    const syncHealthData = async () => {
      console.log('[CompetitionDetail] syncHealthData - STARTING (function called):', {
        competitionId: competition.id,
        userId,
        competitionStatus: competition.status,
      });
      
      // Use a ref to track if we're already syncing to avoid race conditions
      setIsSyncing(true);
      try {
        // Check if we've synced recently (within 5 minutes) to avoid too frequent syncs
        // BUT: If user has 0 points, force a sync to ensure data is properly synced
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
          shouldForceSync: userParticipantPoints === 0,
        });
        
        if (lastSyncTime && userParticipantPoints > 0) {
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
            // Synced less than 5 minutes ago, skip (only if user has points)
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
        // Competition dates are stored as YYYY-MM-DD strings (timezone-agnostic)
        // Parse them as local dates to match how we'll store health data
        const parseLocalDate = (dateStr: string): Date => {
          // If it's already a Date object, return it
          if (dateStr instanceof Date) return dateStr;
          // Parse YYYY-MM-DD format as local date
          const [year, month, day] = dateStr.split('-').map(Number);
          return new Date(year, month - 1, day);
        };
        
        const startDate = parseLocalDate(competition.startDate);
        const endDate = parseLocalDate(competition.endDate);
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

        if (!isMounted) return;

        if (healthMetrics.length > 0) {
          // Sync the data to Supabase
          await syncCompetitionHealthData(
            competition.id,
            userId,
            competition.startDate,
            competition.endDate,
            healthMetrics
          );

          // Store sync time
          await AsyncStorage.setItem(lastSyncKey, Date.now().toString());

          // Wait a bit for the trigger to update participant totals
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Refetch competition to get updated leaderboard
          const updatedComp = await fetchCompetition(competition.id, userId);
          
          if (isMounted && updatedComp) {
            setCompetition(updatedComp);
          }
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
    };
  }, [competition?.id, userId]); // Only run when competition ID or userId changes

  // Scroll to bottom when messages change or keyboard opens
  useEffect(() => {
    if (showChat) {
      setTimeout(() => {
        chatScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, showChat]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !authUser) return;

    const firstName = authUser.firstName || authUser.username || 'User';
    const avatar = authUser.avatarUrl 
      ? `${supabase.supabaseUrl}/storage/v1/object/public/avatars/${authUser.avatarUrl}`
      : getAvatarUrl(null, firstName);

    const message: ChatMessage = {
      id: `m${Date.now()}`,
      oderId: authUser.id,
      senderName: firstName,
      senderAvatar: avatar,
      text: newMessage.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, message]);
    setNewMessage('');
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
          const leaveOffering = offeringsResult.data.all?.['leave_competition'];
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
            // Get transaction ID from purchase
            const transactionId = purchaseResult.data.latestExpirationDate || purchaseResult.data.firstSeen || Date.now().toString();
            
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
      setShowMenu(false);
      router.back();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#FA114F" />
        <Text className="text-gray-400 mt-4">Loading competition...</Text>
      </View>
    );
  }

  if (!competition || !userId) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Text className="text-gray-400">Competition not found</Text>
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
    active: { color: '#22c55e', label: 'Active', bgColor: 'rgba(34, 197, 94, 0.15)' },
    upcoming: { color: '#3b82f6', label: 'Starting Soon', bgColor: 'rgba(59, 130, 246, 0.15)' },
    completed: { color: '#6b7280', label: 'Completed', bgColor: 'rgba(107, 114, 128, 0.15)' },
  };

  const status = statusConfig[competition.status];

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        style={{ backgroundColor: '#000000' }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: '#2a1a2e', zIndex: -1 }} />
        {/* Header */}
        <LinearGradient
          colors={['#2a1a2e', '#1a1a2e', '#000000']}
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32 }}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            {/* Nav Bar */}
            <View className="flex-row items-center justify-between mb-6">
              <Pressable
                onPress={() => router.back()}
                className="flex-row items-center"
              >
                <ChevronLeft size={24} color="white" />
                <Text className="text-white text-base ml-1">Back</Text>
              </Pressable>
              <View className="flex-row">
                <Pressable
                  onPress={handleOpenChat}
                  className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-2"
                >
                  <MessageCircle size={18} color="white" />
                  {messages.length > 0 && (
                    <View className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-fitness-accent items-center justify-center">
                      <Text className="text-white text-xs font-bold">{messages.length}</Text>
                    </View>
                  )}
                  {!isPro && (
                    <View className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 items-center justify-center">
                      <Lock size={10} color="#000" />
                    </View>
                  )}
                </Pressable>
                <Pressable className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-2">
                  <Share2 size={18} color="white" />
                </Pressable>
                <Pressable 
                  onPress={() => setShowMenu(true)}
                  className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
                >
                  <MoreHorizontal size={18} color="white" />
                </Pressable>
              </View>
            </View>

            {/* Competition Title */}
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <View
                  className="self-start px-3 py-1 rounded-full mb-3"
                  style={{ backgroundColor: status.bgColor }}
                >
                  <Text style={{ color: status.color }} className="text-sm font-medium">
                    {status.label}
                  </Text>
                </View>
                <Text className="text-white text-3xl font-bold">{competition.name}</Text>
                <Text className="text-gray-400 text-base mt-2">{competition.description}</Text>
              </View>
            </View>

            {/* Quick Stats */}
            <View className="flex-row mt-6 bg-white/5 rounded-2xl p-4">
              <View className="flex-1 items-center border-r border-white/10">
                <Users size={20} color="#6b7280" />
                <Text className="text-white text-xl font-bold mt-2">{competition.participants.length}</Text>
                <Text className="text-gray-500 text-xs">Participants</Text>
              </View>
              <View className="flex-1 items-center border-r border-white/10">
                <Clock size={20} color="#6b7280" />
                <Text className="text-white text-xl font-bold mt-2">
                  {competition.status === 'completed' ? 'Ended' : daysRemaining}
                </Text>
                <Text className="text-gray-500 text-xs">
                  {competition.status === 'completed' ? '' : 'Days Left'}
                </Text>
              </View>
              <View className="flex-1 items-center">
                <Calendar size={20} color="#6b7280" />
                <View className="flex-row items-center mt-2">
                  <Text className="text-white text-xl font-bold">
                    {getTotalDuration(competition.startDate, competition.endDate)}
                  </Text>
                  <Text className="text-white text-xl font-bold ml-1">Days</Text>
                </View>
                <Text className="text-gray-500 text-xs">Duration</Text>
              </View>
            </View>
          </Animated.View>
        </LinearGradient>


        {/* Your Position Card - Only show when competition is active */}
        {userParticipant && competition.status === 'active' && (
          <Animated.View
            entering={FadeInDown.duration(500).delay(100)}
            className="px-5 mb-6"
          >
            <LinearGradient
              colors={['#FA114F20', '#1C1C1E']}
              style={{ borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#FA114F30' }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-16 h-16 rounded-full bg-fitness-accent/20 items-center justify-center">
                    <Text className="text-fitness-accent text-2xl font-bold">#{userRank}</Text>
                  </View>
                  <View className="ml-4">
                    <Text className="text-gray-400 text-sm">Your Position</Text>
                    <Text className="text-white text-xl font-bold">
                      {userRank}{getRankSuffix(userRank)} Place
                    </Text>
                    <Text className="text-fitness-accent font-semibold mt-1">
                      {userParticipant.points} points
                    </Text>
                  </View>
                </View>
                <TripleActivityRings
                  size={70}
                  moveProgress={userParticipant.moveProgress || 0}
                  exerciseProgress={userParticipant.exerciseProgress || 0}
                  standProgress={userParticipant.standProgress || 0}
                  moveGoal={goals.moveCalories || 400}
                  exerciseGoal={goals.exerciseMinutes || 30}
                  standGoal={goals.standHours || 12}
                />
              </View>

              {userRank > 1 && (
                <View className="mt-4 pt-4 border-t border-white/10 flex-row items-center">
                  <TrendingUp size={16} color="#92E82A" />
                  <Text className="text-gray-400 ml-2">
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
            <Text className="text-white text-xl font-semibold mb-4">Top Performers</Text>
          {sortedParticipants.some(p => p.points > 0) ? (
            <View className="flex-row items-end justify-center">
              {/* 2nd Place - Only show if participant has synced data (points > 0) */}
              {sortedParticipants[1] && sortedParticipants[1].points > 0 && (
              <View className="flex-1 items-center">
                <Image
                  source={{ uri: sortedParticipants[1].avatar }}
                  className="w-16 h-16 rounded-full border-2 border-medal-silver"
                />
                <Text className="text-white font-medium mt-2 text-center" numberOfLines={1}>
                  {sortedParticipants[1].name}
                </Text>
                <Text className="text-gray-500 text-sm">{sortedParticipants[1].points} pts</Text>
                <View className="mt-2 bg-medal-silver/20 rounded-t-xl w-full items-center justify-center py-4" style={{ height: 80 }}>
                  <Medal size={24} color="#C0C0C0" />
                  <Text className="text-medal-silver text-xl font-bold mt-1">2nd</Text>
                </View>
              </View>
            )}

            {/* 1st Place - Only show if participant has synced data (points > 0) */}
            {sortedParticipants[0] && sortedParticipants[0].points > 0 && (
              <View className="flex-1 items-center mx-2">
                <View className="relative">
                  <Image
                    source={{ uri: sortedParticipants[0].avatar }}
                    className="w-20 h-20 rounded-full border-3 border-medal-gold"
                  />
                  <View className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-medal-gold items-center justify-center">
                    <Crown size={16} color="#000" />
                  </View>
                </View>
                <Text className="text-white font-bold mt-2 text-center" numberOfLines={1}>
                  {sortedParticipants[0].name}
                </Text>
                <Text className="text-medal-gold text-sm font-semibold">{sortedParticipants[0].points} pts</Text>
                <View className="mt-2 bg-medal-gold/20 rounded-t-xl w-full items-center justify-center py-4" style={{ height: 100 }}>
                  <Trophy size={28} color="#FFD700" />
                  <Text className="text-medal-gold text-2xl font-bold mt-1">1st</Text>
                </View>
              </View>
            )}

            {/* 3rd Place - Only show if participant has synced data (points > 0) */}
            {sortedParticipants[2] && sortedParticipants[2].points > 0 && (
              <View className="flex-1 items-center">
                <Image
                  source={{ uri: sortedParticipants[2].avatar }}
                  className="w-16 h-16 rounded-full border-2 border-medal-bronze"
                />
                <Text className="text-white font-medium mt-2 text-center" numberOfLines={1}>
                  {sortedParticipants[2].name}
                </Text>
                <Text className="text-gray-500 text-sm">{sortedParticipants[2].points} pts</Text>
                <View className="mt-2 bg-medal-bronze/20 rounded-t-xl w-full items-center justify-center py-4" style={{ height: 60 }}>
                  <Medal size={20} color="#CD7F32" />
                  <Text className="text-medal-bronze text-lg font-bold mt-1">3rd</Text>
                </View>
              </View>
            )}
          </View>
          ) : (
            <View className="bg-fitness-card rounded-2xl p-8 items-center justify-center">
              <Text className="text-gray-400 text-base">No top performers yet!</Text>
            </View>
          )}
        </Animated.View>
        )}

        {/* Full Leaderboard */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(200)}
          className="px-5 mb-6"
        >
          <Text className="text-white text-xl font-semibold mb-4">
            {competition.status === 'active' ? 'Full Leaderboard' : 'Participants'}
          </Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            {sortedParticipants.map((participant, index) => {
              const isCurrentUser = participant.id === userId;
              const rank = index + 1;
              const isActive = competition.status === 'active';

              return (
                <Pressable
                  key={participant.id}
                  onPress={() => {
                    router.push(`/friend-profile?id=${participant.id}`);
                  }}
                  className="flex-row items-center p-4 active:bg-white/5"
                  style={{
                    borderBottomWidth: index < sortedParticipants.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(255,255,255,0.05)',
                    backgroundColor: isCurrentUser && isActive ? 'rgba(250, 17, 79, 0.08)' : 'transparent',
                  }}
                >
                  {/* Syncing indicator for current user */}
                  {isCurrentUser && isSyncing && (
                    <View className="absolute top-2 right-2">
                      <ActivityIndicator size="small" color="#FA114F" />
                    </View>
                  )}
                  
                  {/* Rank - Only show medals/crown when active */}
                  <View className="w-10 items-center">
                    {!isActive ? (
                      <View className="w-6 h-6 rounded-full bg-gray-600 items-center justify-center">
                        <Text className="text-gray-400 text-xs font-medium">{rank}</Text>
                      </View>
                    ) : rank === 1 ? (
                      <Crown size={20} color="#FFD700" />
                    ) : rank === 2 ? (
                      <Medal size={20} color="#C0C0C0" />
                    ) : rank === 3 ? (
                      <Medal size={20} color="#CD7F32" />
                    ) : (
                      <Text className="text-gray-500 font-medium">{rank}</Text>
                    )}
                  </View>

                  {/* Avatar */}
                  <Image
                    source={{ uri: participant.avatar }}
                    className="w-12 h-12 rounded-full ml-2"
                  />

                  {/* Name & Points */}
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center">
                      <Text
                        className={`font-medium ${isCurrentUser ? 'text-fitness-accent' : 'text-white'}`}
                      >
                        {participant.name}
                      </Text>
                      {isCurrentUser && (
                        <View className="ml-2 px-2 py-0.5 bg-fitness-accent/20 rounded-full">
                          <Text className="text-fitness-accent text-xs">You</Text>
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
                                <Text className="text-gray-500 text-xs">{participant.moveCalories || 0} cal</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className="w-2 h-2 rounded-full bg-ring-exercise mr-1" />
                                <Text className="text-gray-500 text-xs">{participant.exerciseMinutes || 0} min</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className="w-2 h-2 rounded-full bg-ring-stand mr-1" />
                                <Text className="text-gray-500 text-xs">{participant.standHours || 0} hrs</Text>
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
                                <Text className="text-gray-500 text-xs">{moveClosed ? 'Closed' : 'Open'}</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className={`w-2 h-2 rounded-full mr-1 ${exerciseClosed ? 'bg-ring-exercise' : 'bg-gray-600'}`} />
                                <Text className="text-gray-500 text-xs">{exerciseClosed ? 'Closed' : 'Open'}</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className={`w-2 h-2 rounded-full mr-1 ${standClosed ? 'bg-ring-stand' : 'bg-gray-600'}`} />
                                <Text className="text-gray-500 text-xs">{standClosed ? 'Closed' : 'Open'}</Text>
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
                                <Text className="text-gray-500 text-xs">{Math.round(participant.moveProgress * 100)}%</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className="w-2 h-2 rounded-full bg-ring-exercise mr-1" />
                                <Text className="text-gray-500 text-xs">{Math.round(participant.exerciseProgress * 100)}%</Text>
                              </View>
                              <View className="flex-row items-center ml-3">
                                <View className="w-2 h-2 rounded-full bg-ring-stand mr-1" />
                                <Text className="text-gray-500 text-xs">{Math.round(participant.standProgress * 100)}%</Text>
                              </View>
                            </>
                          );
                        }
                      })()}
                    </View>
                  </View>

                  {/* Points */}
                  <View className="items-end">
                    <Text className="text-white font-bold text-lg">{participant.points}</Text>
                    <Text className="text-gray-500 text-xs">points</Text>
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
            <Text className="text-white text-xl font-semibold mb-4">Pending Invitations</Text>
            <View className="bg-fitness-card rounded-2xl overflow-hidden">
              {competition.pendingInvitations.map((invitation, index) => (
                <View
                  key={invitation.id}
                  className="flex-row items-center p-4"
                  style={{
                    borderBottomWidth: index < competition.pendingInvitations!.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(255,255,255,0.05)',
                  }}
                >
                  <Image
                    source={{ uri: invitation.inviteeAvatar }}
                    className="w-12 h-12 rounded-full"
                  />
                  <View className="flex-1 ml-3">
                    <Text className="text-white font-medium">{invitation.inviteeName}</Text>
                    <Text className="text-gray-500 text-sm">Waiting for response...</Text>
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
          <Text className="text-white text-xl font-semibold mb-4">Details</Text>
          <View className="bg-fitness-card rounded-2xl p-4">
            <View className="flex-row items-center justify-between py-3 border-b border-white/5">
              <Text className="text-gray-400">Start Date</Text>
              <Text className="text-white font-medium">
                {new Date(competition.startDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <View className="flex-row items-center justify-between py-3 border-b border-white/5">
              <Text className="text-gray-400">End Date</Text>
              <Text className="text-white font-medium">
                {new Date(competition.endDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <View className="flex-row items-center justify-between py-3 border-b border-white/5">
              <Text className="text-gray-400">Type</Text>
              <Text className="text-white font-medium">
                {getCompetitionTypeLabel(competition.type, competition.startDate, competition.endDate)} Challenge
              </Text>
            </View>
            <View className="flex-row items-center justify-between py-3">
              <Text className="text-gray-400">Scoring</Text>
              <Text className="text-white font-medium">
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

      {/* Leave Competition Button (for active) */}
      {competition.status === 'active' && (
        <View
          className="absolute bottom-0 left-0 right-0 px-5 pt-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.9)', paddingBottom: insets.bottom + 16 }}
        >
          <Pressable
            onPress={handleLeavePress}
            className="bg-white/10 rounded-2xl py-4 items-center active:bg-white/5 flex-row justify-center"
          >
            <DoorOpen size={18} color="#f87171" />
            <Text className="text-red-400 font-semibold ml-2">Leave Competition</Text>
            {!isPro && (
              <View className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/20">
                <Text className="text-amber-400 text-xs font-medium">$2.99</Text>
              </View>
            )}
          </Pressable>
        </View>
      )}

      {/* Chat Modal */}
      <Modal visible={showChat} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView 
          className="flex-1 bg-black"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}
        >
          {/* Chat Header */}
          <View
            className="flex-row items-center justify-between px-5 py-4 border-b border-white/10"
            style={{ paddingTop: insets.top + 8 }}
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-blue-500/20 items-center justify-center">
                <MessageCircle size={20} color="#3b82f6" />
              </View>
              <View className="ml-3">
                <Text className="text-white font-semibold">{competition.name}</Text>
                <Text className="text-gray-500 text-sm">{competition.participants.length} participants</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setShowChat(false)}
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
            >
              <X size={20} color="white" />
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
            {messages.length === 0 ? (
              <View className="flex-1 items-center justify-center py-20">
                <View className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-4">
                  <MessageCircle size={40} color="#4a4a4a" />
                </View>
                <Text className="text-gray-400 text-lg font-medium">No messages yet</Text>
                <Text className="text-gray-600 text-sm mt-1 text-center">
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
                        <Text className="text-gray-500 text-xs mb-1 ml-1">{message.senderName}</Text>
                      )}
                      <View
                        className={`rounded-2xl px-4 py-3 ${
                          isOwn ? 'bg-fitness-accent rounded-br-sm' : 'bg-fitness-card rounded-bl-sm'
                        }`}
                      >
                        <Text className="text-white">{message.text}</Text>
                      </View>
                      <Text className="text-gray-600 text-xs mt-1 mx-1">
                        {formatTimeAgo(message.timestamp)}
                      </Text>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </ScrollView>

          {/* Pro Paywall Overlay */}
          {!isPro && (
            <View className="absolute inset-0 justify-end" style={{ top: insets.top + 70 }}>
              {/* Gradient overlay */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)', '#000']}
                style={{ position: 'absolute', inset: 0 }}
              />

              {/* Paywall card */}
              <Animated.View
                entering={FadeInUp.duration(500).delay(200)}
                className="px-6 pb-8"
                style={{ paddingBottom: insets.bottom + 24 }}
              >
                <View className="bg-fitness-card rounded-3xl p-6 border border-white/10">
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
                  <Text className="text-white text-xl font-bold text-center">
                    Join the Conversation
                  </Text>
                  <Text className="text-gray-400 text-center mt-2 mb-6 leading-5">
                    Chat with your competitors, share your progress, and stay motivated together with Pro
                  </Text>

                  {/* Features list */}
                  <View className="mb-6">
                    <View className="flex-row items-center mb-3">
                      <View className="w-6 h-6 rounded-full bg-green-500/20 items-center justify-center mr-3">
                        <MessageCircle size={12} color="#22c55e" />
                      </View>
                      <Text className="text-gray-300 text-sm">Real-time group messaging</Text>
                    </View>
                    <View className="flex-row items-center mb-3">
                      <View className="w-6 h-6 rounded-full bg-blue-500/20 items-center justify-center mr-3">
                        <Users size={12} color="#3b82f6" />
                      </View>
                      <Text className="text-gray-300 text-sm">Connect with all competitors</Text>
                    </View>
                    <View className="flex-row items-center">
                      <View className="w-6 h-6 rounded-full bg-purple-500/20 items-center justify-center mr-3">
                        <TrendingUp size={12} color="#8b5cf6" />
                      </View>
                      <Text className="text-gray-300 text-sm">Share tips and motivation</Text>
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
                    <Text className="text-gray-500 text-center text-sm">Maybe later</Text>
                  </Pressable>
                </View>
              </Animated.View>
            </View>
          )}

          {/* Message Input - Only for Pro users */}
          {isPro && (
            <View
              className="flex-row items-center px-4 py-3 border-t border-white/10 bg-black"
              style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }}
            >
              <View className="flex-1 flex-row items-center bg-fitness-card rounded-full px-4 py-3">
                <TextInput
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder="Send a message..."
                  placeholderTextColor="#6b7280"
                  className="flex-1 text-white"
                  multiline
                  maxLength={500}
                />
              </View>
              <Pressable
                onPress={handleSendMessage}
                disabled={!newMessage.trim()}
                className="ml-3 w-12 h-12 rounded-full items-center justify-center"
                style={{ backgroundColor: newMessage.trim() ? '#FA114F' : '#2a2a2c' }}
              >
                <Send size={20} color={newMessage.trim() ? 'white' : '#6b7280'} />
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* Leave Competition Modal */}
      <Modal visible={showLeaveModal} animationType="fade" transparent>
        <View className="flex-1 justify-center items-center" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <Animated.View
            entering={FadeIn.duration(300)}
            className="mx-6 w-full max-w-sm"
          >
            <View className="bg-fitness-card rounded-3xl overflow-hidden border border-white/10">
              {/* Header */}
              <LinearGradient
                colors={['#dc262620', '#1C1C1E']}
                style={{ padding: 24, alignItems: 'center' }}
              >
                <View className="w-16 h-16 rounded-full bg-red-500/20 items-center justify-center mb-4">
                  <AlertTriangle size={32} color="#f87171" />
                </View>
                <Text className="text-white text-xl font-bold text-center">
                  Leave Competition?
                </Text>
                <Text className="text-gray-400 text-center mt-2 leading-5">
                  {isPro
                    ? "Are you sure you want to leave? You'll lose all your progress in this competition."
                    : "Leaving costs $2.99 to discourage giving up. Pro members leave for free!"}
                </Text>
              </LinearGradient>

              {/* Content */}
              <View className="p-6">
                {!isPro && (
                  <View className="bg-amber-500/10 rounded-2xl p-4 mb-4 border border-amber-500/20">
                    <View className="flex-row items-center">
                      <Crown size={20} color="#F59E0B" />
                      <Text className="text-amber-400 font-semibold ml-2 flex-1">
                        Pro members leave free
                      </Text>
                    </View>
                    <Text className="text-gray-400 text-sm mt-2">
                      Upgrade to Pro for unlimited free exits plus group chat, AI coach, and more.
                    </Text>
                    <Pressable
                      onPress={() => {
                        setShowLeaveModal(false);
                        router.push('/upgrade');
                      }}
                      className="mt-3 py-2"
                    >
                      <Text className="text-amber-400 font-semibold text-sm">
                        View Pro Benefits →
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
                  className="bg-white/10 rounded-2xl py-4 items-center active:bg-white/5"
                >
                  <Text className="text-white font-semibold">Stay in Competition</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Options Menu Modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable 
          className="flex-1 bg-black/70 justify-end"
          onPress={() => setShowMenu(false)}
        >
          <Animated.View entering={FadeInUp.duration(300)}>
            <View 
              className="bg-fitness-card rounded-t-3xl"
              style={{ paddingBottom: insets.bottom + 16 }}
            >
              <View className="w-12 h-1 bg-gray-600 rounded-full self-center mt-3 mb-4" />
              
              <Text className="text-white text-lg font-semibold text-center mb-4">
                Competition Options
              </Text>

              {/* Leave Competition Option - Only show if NOT the creator */}
              {!isCreator && (
                <Pressable
                  onPress={() => {
                    setShowMenu(false);
                    handleLeavePress();
                  }}
                  className="flex-row items-center px-6 py-4 active:bg-white/5"
                >
                  <View className="w-10 h-10 rounded-full bg-orange-500/20 items-center justify-center">
                    <DoorOpen size={20} color="#f97316" />
                  </View>
                  <View className="ml-4 flex-1">
                    <Text className="text-white font-medium">Leave Competition</Text>
                    <Text className="text-gray-500 text-sm">Exit this competition</Text>
                  </View>
                </Pressable>
              )}

              {/* Delete Competition Option - Only show if user is creator */}
              {isCreator && (
                <Pressable
                  onPress={() => {
                    setShowMenu(false);
                    setShowDeleteModal(true);
                  }}
                  className="flex-row items-center px-6 py-4 active:bg-white/5"
                >
                  <View className="w-10 h-10 rounded-full bg-red-500/20 items-center justify-center">
                    <Trash2 size={20} color="#ef4444" />
                  </View>
                  <View className="ml-4 flex-1">
                    <Text className="text-red-400 font-medium">Delete Competition</Text>
                    <Text className="text-gray-500 text-sm">Permanently remove this competition</Text>
                  </View>
                </Pressable>
              )}

              <Pressable
                onPress={() => setShowMenu(false)}
                className="mx-6 mt-4 bg-white/10 rounded-2xl py-4 items-center active:bg-white/5"
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View className="flex-1 bg-black/80 items-center justify-center px-6">
          <Animated.View entering={FadeIn.duration(200)} className="w-full">
            <View className="bg-fitness-card rounded-3xl p-6">
              <View className="w-16 h-16 rounded-full bg-red-500/20 items-center justify-center self-center mb-4">
                <Trash2 size={32} color="#ef4444" />
              </View>
              
              <Text className="text-white text-xl font-bold text-center mb-2">
                Delete Competition?
              </Text>
              <Text className="text-gray-400 text-center mb-6">
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
                className="bg-white/10 rounded-2xl py-4 items-center active:bg-white/5"
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}