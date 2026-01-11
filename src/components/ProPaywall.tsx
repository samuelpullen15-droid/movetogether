import { View, Text, Pressable, ActivityIndicator, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { Crown, Sparkles, Zap, Users, X, Check, Heart, MessageCircle, Flame, Trophy, Bot, Dumbbell, Target } from 'lucide-react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { TripleActivityRings } from '@/components/ActivityRing';

interface ProPaywallProps {
  feature: 'social' | 'coach';
  onClose?: () => void;
}

const FEATURES = [
  { icon: Users, label: 'Social Activity Feed', description: 'See friends\' workouts & achievements' },
  { icon: Sparkles, label: 'AI Fitness Coach', description: 'Personalized coaching powered by AI' },
  { icon: Zap, label: 'Competition Insights', description: 'Advanced strategies to win' },
];

// Mock preview data for Social feed
const PREVIEW_POSTS = [
  {
    id: '1',
    userName: 'Jordan',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
    type: 'workout' as const,
    workoutType: 'Running',
    workoutDuration: 32,
    workoutCalories: 320,
    reactions: 3,
    comments: 1,
    timeAgo: '15m ago',
  },
  {
    id: '2',
    userName: 'Taylor',
    userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
    type: 'rings' as const,
    ringsProgress: { move: 1.0, exercise: 1.0, stand: 1.0 },
    reactions: 2,
    comments: 0,
    timeAgo: '2h ago',
  },
  {
    id: '3',
    userName: 'Casey',
    userAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop',
    type: 'streak' as const,
    streakDays: 30,
    reactions: 4,
    comments: 2,
    timeAgo: '4h ago',
  },
  {
    id: '4',
    userName: 'Morgan',
    userAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop',
    type: 'competition' as const,
    competitionName: 'Weekend Warriors',
    reactions: 5,
    comments: 1,
    timeAgo: '1d ago',
  },
];

function PreviewActivityCard({ post, index }: { post: typeof PREVIEW_POSTS[0]; index: number }) {
  const getActivityContent = () => {
    switch (post.type) {
      case 'workout':
        return (
          <View>
            <Text className="text-white text-sm">
              Completed a <Text className="font-bold text-ring-exercise">{post.workoutType}</Text> workout
            </Text>
            <View className="flex-row mt-2 bg-black/30 rounded-xl p-2">
              <View className="flex-1 items-center">
                <Text className="text-ring-move text-base font-bold">{post.workoutCalories}</Text>
                <Text className="text-gray-500 text-[10px]">CAL</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="flex-1 items-center">
                <Text className="text-ring-exercise text-base font-bold">{post.workoutDuration}</Text>
                <Text className="text-gray-500 text-[10px]">MIN</Text>
              </View>
            </View>
          </View>
        );
      case 'rings':
        return (
          <View className="flex-row items-center">
            <View className="flex-1">
              <Text className="text-white text-sm">Closed all rings today!</Text>
            </View>
            <TripleActivityRings
              size={50}
              moveProgress={post.ringsProgress?.move || 0}
              exerciseProgress={post.ringsProgress?.exercise || 0}
              standProgress={post.ringsProgress?.stand || 0}
            />
          </View>
        );
      case 'streak':
        return (
          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-full bg-orange-500/20 items-center justify-center">
              <Flame size={20} color="#FF6B35" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-white text-sm">
                Reached a <Text className="font-bold text-orange-400">{post.streakDays} day</Text> streak!
              </Text>
            </View>
          </View>
        );
      case 'competition':
        return (
          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-full bg-yellow-500/20 items-center justify-center">
              <Trophy size={20} color="#FFD700" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-white text-sm">
                Won <Text className="font-bold text-yellow-400">{post.competitionName}</Text>!
              </Text>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 100)}
      className="mx-4 mb-3"
    >
      <View className="bg-fitness-card/80 rounded-xl p-3">
        {/* Header */}
        <View className="flex-row items-center mb-3">
          <Image source={{ uri: post.userAvatar }} className="w-9 h-9 rounded-full" />
          <View className="ml-2 flex-1">
            <Text className="text-white font-medium text-sm">{post.userName}</Text>
            <Text className="text-gray-500 text-xs">{post.timeAgo}</Text>
          </View>
        </View>

        {/* Content */}
        {getActivityContent()}

        {/* Actions */}
        <View className="flex-row items-center mt-2 pt-2 border-t border-white/5">
          <View className="flex-row items-center mr-4">
            <Heart size={16} color="#6b7280" />
            <Text className="text-gray-500 text-xs ml-1">{post.reactions}</Text>
          </View>
          <View className="flex-row items-center">
            <MessageCircle size={16} color="#6b7280" />
            <Text className="text-gray-500 text-xs ml-1">{post.comments}</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// Extended posts for continuous scrolling
const EXTENDED_PREVIEW_POSTS = [
  ...PREVIEW_POSTS,
  {
    id: '5',
    userName: 'Riley',
    userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop',
    type: 'workout' as const,
    workoutType: 'Cycling',
    workoutDuration: 45,
    workoutCalories: 450,
    reactions: 2,
    comments: 0,
    timeAgo: '5h ago',
  },
  {
    id: '6',
    userName: 'Sam',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
    type: 'rings' as const,
    ringsProgress: { move: 0.95, exercise: 1.0, stand: 0.85 },
    reactions: 3,
    comments: 1,
    timeAgo: '6h ago',
  },
  {
    id: '7',
    userName: 'Alex',
    userAvatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop',
    type: 'streak' as const,
    streakDays: 14,
    reactions: 6,
    comments: 3,
    timeAgo: '8h ago',
  },
  {
    id: '8',
    userName: 'Jordan',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
    type: 'competition' as const,
    competitionName: 'January Challenge',
    reactions: 8,
    comments: 2,
    timeAgo: '12h ago',
  },
];

function SocialFeedPreview() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const ITEM_HEIGHT = 140; // Approximate height of each card
  const TOTAL_HEIGHT = EXTENDED_PREVIEW_POSTS.length * ITEM_HEIGHT;

  useEffect(() => {
    // Start from a middle position for immediate content visibility
    scrollY.value = -ITEM_HEIGHT * 2;
    // Continuous scrolling animation - scrolls one set then resets seamlessly
    scrollY.value = withRepeat(
      withTiming(-TOTAL_HEIGHT, { duration: 25000 }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value % TOTAL_HEIGHT }],
  }));

  // Triple the posts for seamless looping
  const tripledPosts = [...EXTENDED_PREVIEW_POSTS, ...EXTENDED_PREVIEW_POSTS, ...EXTENDED_PREVIEW_POSTS];

  return (
    <View className="absolute inset-0 overflow-hidden">
      {/* Header */}
      <LinearGradient
        colors={['#1a1a2e', '#000000']}
        style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16 }}
      >
        <Text className="text-white text-2xl font-bold">Activity</Text>
        <Text className="text-gray-400 text-sm mt-1">See what your friends are up to</Text>
      </LinearGradient>

      {/* Animated scrolling feed */}
      <View className="flex-1 overflow-hidden">
        <Animated.View style={animatedStyle}>
          {tripledPosts.map((post, index) => (
            <PreviewActivityCard key={`${post.id}-${index}`} post={post} index={0} />
          ))}
        </Animated.View>
      </View>

      {/* Top fade gradient */}
      <LinearGradient
        colors={['#000000', 'transparent']}
        style={{
          position: 'absolute',
          top: insets.top + 70,
          left: 0,
          right: 0,
          height: 60,
        }}
        pointerEvents="none"
      />

      {/* Bottom fade gradient - starts above the PRO FEATURE badge */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)', '#000000']}
        locations={[0, 0.3, 0.6]}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 420,
        }}
        pointerEvents="none"
      />
    </View>
  );
}

// Mock conversation data for AI Coach preview
const COACH_CONVERSATION = [
  {
    id: '1',
    type: 'user' as const,
    message: "I've been stuck at the same weight for 2 weeks. What should I do?",
  },
  {
    id: '2',
    type: 'coach' as const,
    message: "Plateaus are completely normal! Looking at your data, I see you've been doing great with consistency. Let's try two things:\n\n1. Increase intensity - Try adding 10% more weight or reps\n2. Mix up cardio - Switch from steady-state to HIIT twice this week",
  },
  {
    id: '3',
    type: 'user' as const,
    message: "Should I change my diet too?",
  },
  {
    id: '4',
    type: 'coach' as const,
    message: "Great question! Based on your activity level:\n\n• Protein: Aim for 1g per pound of body weight\n• Timing: Eat protein within 2 hours after workouts\n• Hydration: You're at 6 glasses - try for 8!\n\nSmall tweaks beat dramatic changes.",
  },
  {
    id: '5',
    type: 'user' as const,
    message: "What's the best workout for tomorrow?",
  },
  {
    id: '6',
    type: 'coach' as const,
    message: "Based on your recovery metrics, I recommend:\n\nUpper Body Strength (45 min)\n• Bench Press: 4x8\n• Rows: 4x10\n• Shoulder Press: 3x12\n• Bicep/Tricep supersets\n\nYour legs need another recovery day. Ready to crush it? 💪",
  },
  {
    id: '7',
    type: 'user' as const,
    message: "How can I improve my running pace?",
  },
  {
    id: '8',
    type: 'coach' as const,
    message: "I've analyzed your recent runs. Here's my plan:\n\nWeek 1-2: Add one tempo run (20 min at 80% effort)\nWeek 3-4: Include intervals (8x400m with 90s rest)\n\nYour current avg is 9:30/mile. We can target 8:45/mile in 6 weeks!",
  },
];

function CoachMessageBubble({ message, index }: { message: typeof COACH_CONVERSATION[0]; index: number }) {
  const isCoach = message.type === 'coach';

  return (
    <View className={`mx-4 mb-3 ${isCoach ? 'pr-8' : 'pl-8'}`}>
      <View className={`flex-row ${isCoach ? '' : 'justify-end'}`}>
        {isCoach && (
          <View className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 items-center justify-center mr-2">
            <LinearGradient
              colors={['#8B5CF6', '#6366F1']}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={16} color="white" />
            </LinearGradient>
          </View>
        )}
        <View
          className={`rounded-2xl p-3 max-w-[85%] ${
            isCoach
              ? 'bg-fitness-card/90 rounded-tl-sm'
              : 'bg-indigo-600/80 rounded-tr-sm'
          }`}
        >
          <Text className="text-white text-sm leading-5">{message.message}</Text>
        </View>
      </View>
    </View>
  );
}

function CoachConversationPreview() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const MESSAGE_HEIGHT = 120; // Approximate height per message
  const TOTAL_HEIGHT = COACH_CONVERSATION.length * MESSAGE_HEIGHT;

  useEffect(() => {
    // Start from a middle position for immediate content visibility
    scrollY.value = -MESSAGE_HEIGHT * 2;
    // Continuous scrolling animation - scrolls one set then resets seamlessly
    scrollY.value = withRepeat(
      withTiming(-TOTAL_HEIGHT, { duration: 30000 }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value % TOTAL_HEIGHT }],
  }));

  // Triple the messages for seamless looping
  const tripledMessages = [...COACH_CONVERSATION, ...COACH_CONVERSATION, ...COACH_CONVERSATION];

  return (
    <View className="absolute inset-0 overflow-hidden">
      {/* Header */}
      <LinearGradient
        colors={['#1a1a2e', '#000000']}
        style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16 }}
      >
        <View className="flex-row items-center">
          <LinearGradient
            colors={['#8B5CF6', '#6366F1']}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Sparkles size={20} color="white" />
          </LinearGradient>
          <View>
            <Text className="text-white text-xl font-bold">AI Coach</Text>
            <Text className="text-green-400 text-xs">Online • Ready to help</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Animated scrolling conversation */}
      <View className="flex-1 overflow-hidden">
        <Animated.View style={animatedStyle}>
          {tripledMessages.map((msg, index) => (
            <CoachMessageBubble key={`${msg.id}-${index}`} message={msg} index={0} />
          ))}
        </Animated.View>
      </View>

      {/* Top fade gradient */}
      <LinearGradient
        colors={['#000000', 'transparent']}
        style={{
          position: 'absolute',
          top: insets.top + 70,
          left: 0,
          right: 0,
          height: 60,
        }}
        pointerEvents="none"
      />

      {/* Bottom fade gradient - starts above the PRO FEATURE badge */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)', '#000000']}
        locations={[0, 0.3, 0.6]}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 420,
        }}
        pointerEvents="none"
      />
    </View>
  );
}

export function ProPaywall({ feature, onClose }: ProPaywallProps) {
  const insets = useSafeAreaInsets();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const restore = useSubscriptionStore((s) => s.restore);
  const loadOfferings = useSubscriptionStore((s) => s.loadOfferings);
  const purchasePackage = useSubscriptionStore((s) => s.purchasePackage);
  const packages = useSubscriptionStore((s) => s.packages);
  
  // For social feature, user needs Mover or Crusher tier
  // For coach feature, user needs Crusher tier
  // Default to Mover tier package (monthly) for social, Crusher tier for coach
  const recommendedPackageId = feature === 'social' ? 'mover_monthly' : 'crusher_monthly';
  const recommendedPackage = packages[recommendedPackageId];
  
  // Debug log to check package availability
  useEffect(() => {
    console.log('ProPaywall package state:', {
      feature,
      recommendedPackageId,
      hasRecommendedPackage: !!recommendedPackage,
      allPackageIds: Object.keys(packages),
      packageValues: Object.entries(packages).map(([key, value]) => ({ key, hasValue: !!value, identifier: value?.identifier })),
    });
  }, [feature, recommendedPackageId, recommendedPackage, packages]);

  // Animation values
  const crownScale = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  useEffect(() => {
    loadOfferings();

    // Crown pulse animation
    crownScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1500 }),
        withTiming(1, { duration: 1500 })
      ),
      -1,
      true
    );

    // Glow animation
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 2000 }),
        withTiming(0.4, { duration: 2000 })
      ),
      -1,
      true
    );
  }, []);

  const crownStyle = useAnimatedStyle(() => ({
    transform: [{ scale: crownScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handlePurchase = async () => {
    console.log('🔥 handlePurchase CALLED!', { 
      recommendedPackageId, 
      hasRecommendedPackage: !!recommendedPackage,
      recommendedPackage,
      packages,
      isPurchasing 
    });
    
    if (!recommendedPackage) {
      const availablePackageInfo = Object.entries(packages)
        .filter(([_, pkg]) => pkg !== null)
        .map(([key, pkg]) => `${key}: ${pkg?.identifier || 'unknown'}`)
        .join('\n');
      
      console.error('❌ Package not found:', recommendedPackageId);
      console.error('Available packages:', packages);
      console.error('Package details:', Object.entries(packages).map(([k, v]) => ({ 
        key: k, 
        hasValue: !!v, 
        identifier: v?.identifier,
        productId: v?.product?.identifier 
      })));
      
      Alert.alert(
        'Package Not Available', 
        `The "${recommendedPackageId}" package is not available.\n\nPossible reasons:\n• RevenueCat not configured (EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY missing)\n• Package identifiers in RevenueCat don't match: mover_monthly, crusher_monthly, etc.\n• Packages still loading\n\nCheck console logs to see what packages are available from RevenueCat.`
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    buttonScale.value = withSpring(0.95, {}, () => {
      buttonScale.value = withSpring(1);
    });

    setIsPurchasing(true);
    try {
      console.log('Attempting to purchase package:', recommendedPackageId, recommendedPackage);
      const result = await purchasePackage(recommendedPackageId);
      setIsPurchasing(false);

      if (result === true) {
        console.log('✅ Purchase successful for package:', recommendedPackageId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // If user just purchased, they should now have access - component will re-render
      } else if (result === 'cancelled') {
        // User cancelled the purchase - don't show an error, just log it
        console.log('ℹ️ Purchase cancelled by user');
        // No alert needed - user intentionally cancelled
      } else {
        console.error('❌ Purchase failed for package:', recommendedPackageId);
        Alert.alert(
          'Purchase Failed', 
          'Failed to complete purchase. Please try again.\n\nIf this persists, check:\n• Your internet connection\n• Your payment method is valid\n• Contact support if the issue continues'
        );
      }
    } catch (error) {
      console.error('❌ Purchase error:', error);
      setIsPurchasing(false);
      // Check if it's a cancellation error
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (errorMessage.includes('cancel') || errorMessage.includes('cancelled')) {
        console.log('ℹ️ Purchase cancelled by user');
        // Don't show error for cancellation
      } else {
        Alert.alert('Error', `Purchase error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    await restore();
    setIsRestoring(false);
  };

  const featureTitle = feature === 'social' ? 'Social Feed' : 'AI Coach';
  const price = recommendedPackage?.product.priceString ?? (feature === 'social' ? '$4.99' : '$9.99');

  // Social preview version with animated scrolling feed in background
  if (feature === 'social') {
    return (
      <View className="flex-1 bg-black">
        {/* Social Feed Preview in Background - auto-scrolling */}
        <SocialFeedPreview />

        {/* Content overlay at bottom */}
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: insets.bottom + 20 }} pointerEvents="box-none">
          {/* "Unlock" badge floating above content */}
          <Animated.View
            entering={FadeInDown.duration(600)}
            className="items-center mb-4"
          >
            <View className="flex-row items-center bg-black/70 px-4 py-2 rounded-full border border-amber-500/30">
              <Crown size={18} color="#FFD700" />
              <Text className="text-amber-400 font-semibold ml-2">PAID FEATURE</Text>
            </View>
          </Animated.View>

          {/* Main content card */}
          <Animated.View
            entering={FadeInUp.duration(600).delay(100)}
            className="mx-5"
          >
            <BlurView
              intensity={80}
              tint="dark"
              style={{ borderRadius: 24, overflow: 'hidden' }}
            >
              <View className="p-6 border border-white/10 rounded-3xl">
                {/* Title */}
                <View className="items-center mb-2">
                  <Text className="text-white text-2xl font-bold text-center">
                    Unlock Social Feed
                  </Text>
                </View>

                <View className="items-center mb-5">
                  <Text className="text-gray-400 text-center text-sm">
                    See what your friends are achieving
                  </Text>
                </View>

                {/* Feature highlights */}
                <View className="flex-row justify-around mb-5">
                  <View className="items-center">
                    <View className="w-10 h-10 rounded-full bg-ring-move/20 items-center justify-center mb-2">
                      <Users size={18} color="#FA114F" />
                    </View>
                    <Text className="text-gray-300 text-xs">Friend Activity</Text>
                  </View>
                  <View className="items-center">
                    <View className="w-10 h-10 rounded-full bg-orange-500/20 items-center justify-center mb-2">
                      <Flame size={18} color="#FF6B35" />
                    </View>
                    <Text className="text-gray-300 text-xs">Streaks</Text>
                  </View>
                  <View className="items-center">
                    <View className="w-10 h-10 rounded-full bg-yellow-500/20 items-center justify-center mb-2">
                      <Trophy size={18} color="#FFD700" />
                    </View>
                    <Text className="text-gray-300 text-xs">Achievements</Text>
                  </View>
                </View>

                {/* Pricing */}
                <View className="items-center mb-4">
                  <View className="flex-row items-baseline">
                    <Text className="text-white text-3xl font-bold">{price}</Text>
                    <Text className="text-gray-400 text-base ml-1">/month</Text>
                  </View>
                </View>

                {/* Subscribe Button */}
                <Animated.View style={buttonAnimatedStyle}>
                  <Pressable
                    onPress={() => {
                      console.log('🚀 Upgrade button PRESSED (social)', { 
                        recommendedPackageId, 
                        hasRecommendedPackage: !!recommendedPackage,
                        isPurchasing, 
                        packages: Object.keys(packages),
                        recommendedPackage 
                      });
                      handlePurchase();
                    }}
                    disabled={isPurchasing}
                    className="overflow-hidden rounded-2xl active:opacity-80"
                    style={{ opacity: isPurchasing ? 0.6 : 1 }}
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
                      {isPurchasing ? (
                        <ActivityIndicator color="#000" />
                      ) : (
                        <>
                          <Check size={20} color="#000" strokeWidth={3} />
                          <Text className="text-black text-base font-bold ml-2">
                            {feature === 'social' ? 'Upgrade to Mover' : 'Upgrade to Crusher'}
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                </Animated.View>

                {/* Restore */}
                <Pressable onPress={handleRestore} disabled={isRestoring} className="py-3 mt-2">
                  {isRestoring ? (
                    <ActivityIndicator size="small" color="#9ca3af" />
                  ) : (
                    <Text className="text-gray-500 text-xs text-center">Restore Purchase</Text>
                  )}
                </Pressable>
              </View>
            </BlurView>
          </Animated.View>

          {/* Legal */}
          <Animated.View entering={FadeIn.delay(400)} className="mx-8 mt-4">
            <Text className="text-gray-600 text-[10px] text-center leading-4">
              Payment charged to App Store account. Subscription auto-renews unless cancelled 24 hours before period ends.
            </Text>
          </Animated.View>
        </View>
      </View>
    );
  }

  // Coach preview version with animated scrolling conversation in background
  return (
    <View className="flex-1 bg-black">
      {/* Coach Conversation Preview in Background - auto-scrolling */}
      <CoachConversationPreview />

      {/* Content overlay at bottom */}
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: insets.bottom + 20 }} pointerEvents="box-none">
        {/* "Unlock" badge floating above content */}
        <Animated.View
          entering={FadeInDown.duration(600)}
          className="items-center mb-4"
        >
          <View className="flex-row items-center bg-black/70 px-4 py-2 rounded-full border border-purple-500/30">
            <Crown size={18} color="#FFD700" />
            <Text className="text-amber-400 font-semibold ml-2">PRO FEATURE</Text>
          </View>
        </Animated.View>

        {/* Main content card */}
        <Animated.View
          entering={FadeInUp.duration(600).delay(100)}
          className="mx-5"
        >
          <BlurView
            intensity={80}
            tint="dark"
            style={{ borderRadius: 24, overflow: 'hidden' }}
          >
            <View className="p-6 border border-white/10 rounded-3xl">
              {/* Title */}
              <View className="items-center mb-2">
                <Text className="text-white text-2xl font-bold text-center">
                  Unlock AI Coach
                </Text>
              </View>

              <View className="items-center mb-5">
                <Text className="text-gray-400 text-center text-sm">
                  Your personal fitness expert, 24/7
                </Text>
              </View>

              {/* Feature highlights */}
              <View className="flex-row justify-around mb-5">
                <View className="items-center">
                  <View className="w-10 h-10 rounded-full bg-purple-500/20 items-center justify-center mb-2">
                    <Sparkles size={18} color="#8B5CF6" />
                  </View>
                  <Text className="text-gray-300 text-xs">AI Powered</Text>
                </View>
                <View className="items-center">
                  <View className="w-10 h-10 rounded-full bg-indigo-500/20 items-center justify-center mb-2">
                    <Dumbbell size={18} color="#6366F1" />
                  </View>
                  <Text className="text-gray-300 text-xs">Custom Plans</Text>
                </View>
                <View className="items-center">
                  <View className="w-10 h-10 rounded-full bg-blue-500/20 items-center justify-center mb-2">
                    <Target size={18} color="#3B82F6" />
                  </View>
                  <Text className="text-gray-300 text-xs">Goal Tracking</Text>
                </View>
              </View>

              {/* Pricing */}
              <View className="items-center mb-4">
                <View className="flex-row items-baseline">
                  <Text className="text-white text-3xl font-bold">{price}</Text>
                  <Text className="text-gray-400 text-base ml-1">/year</Text>
                </View>
              </View>

              {/* Subscribe Button */}
              <Animated.View style={buttonAnimatedStyle}>
                <Pressable
                  onPress={() => {
                    console.log('🚀 Upgrade button PRESSED (coach)', { 
                      recommendedPackageId, 
                      hasRecommendedPackage: !!recommendedPackage,
                      isPurchasing, 
                      packages: Object.keys(packages),
                      recommendedPackage 
                    });
                    handlePurchase();
                  }}
                  disabled={isPurchasing}
                  className="overflow-hidden rounded-2xl active:opacity-80"
                  style={{ opacity: isPurchasing ? 0.6 : 1 }}
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
                    {isPurchasing ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <>
                        <Check size={20} color="#000" strokeWidth={3} />
                        <Text className="text-black text-base font-bold ml-2">
                          {feature === 'social' ? 'Upgrade to Mover' : 'Upgrade to Crusher'}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </Animated.View>

              {/* Restore */}
              <Pressable onPress={handleRestore} disabled={isRestoring} className="py-3 mt-2">
                {isRestoring ? (
                  <ActivityIndicator size="small" color="#9ca3af" />
                ) : (
                  <Text className="text-gray-500 text-xs text-center">Restore Purchase</Text>
                )}
              </Pressable>
            </View>
          </BlurView>
        </Animated.View>

        {/* Legal */}
        <Animated.View entering={FadeIn.delay(400)} className="mx-8 mt-4">
          <Text className="text-gray-600 text-[10px] text-center leading-4">
            Payment charged to App Store account. Subscription auto-renews unless cancelled 24 hours before period ends.
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}
