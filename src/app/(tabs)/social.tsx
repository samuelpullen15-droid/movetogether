import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Heart,
  MessageCircle,
  Send,
  Flame,
  Trophy,
  Award,
  Target,
  X,
  ChevronRight,
  Users,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { TripleActivityRings } from '@/components/ActivityRing';
import {
  ActivityPost,
  ReactionType,
  REACTION_CONFIG,
  MOCK_ACTIVITY_FEED,
} from '@/lib/social-types';
import { cn } from '@/lib/cn';
import { useSubscription } from '@/lib/useSubscription';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { ProPaywall } from '@/components/ProPaywall';

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

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${meters} m`;
}

function ActivityCard({
  post,
  index,
  onReact,
  onComment,
  onViewProfile,
}: {
  post: ActivityPost;
  index: number;
  onReact: (postId: string, reaction: ReactionType) => void;
  onComment: (postId: string) => void;
  onViewProfile: (userId: string) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);

  const getActivityContent = () => {
    switch (post.type) {
      case 'workout_completed':
        return (
          <View>
            <Text className="text-white text-base">
              Completed a <Text className="font-bold text-ring-exercise">{post.workoutType}</Text> workout
            </Text>
            <View className="flex-row mt-3 bg-black/30 rounded-xl p-3">
              <View className="flex-1 items-center">
                <Text className="text-ring-move text-xl font-bold">{post.workoutCalories}</Text>
                <Text className="text-gray-500 text-xs">CAL</Text>
              </View>
              <View className="w-px bg-white/10" />
              <View className="flex-1 items-center">
                <Text className="text-ring-exercise text-xl font-bold">{post.workoutDuration}</Text>
                <Text className="text-gray-500 text-xs">MIN</Text>
              </View>
              {post.workoutDistance && (
                <>
                  <View className="w-px bg-white/10" />
                  <View className="flex-1 items-center">
                    <Text className="text-ring-stand text-xl font-bold">
                      {formatDistance(post.workoutDistance)}
                    </Text>
                    <Text className="text-gray-500 text-xs">DIST</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        );

      case 'rings_closed':
        return (
          <View className="flex-row items-center">
            <View className="flex-1">
              <Text className="text-white text-base">
                Closed all rings today! <Text className="text-2xl">🎯</Text>
              </Text>
              <Text className="text-gray-400 text-sm mt-1">Move, Exercise, and Stand goals complete</Text>
            </View>
            <TripleActivityRings
              size={70}
              moveProgress={post.ringsProgress?.move || 0}
              exerciseProgress={post.ringsProgress?.exercise || 0}
              standProgress={post.ringsProgress?.stand || 0}
            />
          </View>
        );

      case 'streak_milestone':
        return (
          <View className="flex-row items-center">
            <View className="w-16 h-16 rounded-full bg-orange-500/20 items-center justify-center">
              <Flame size={32} color="#FF6B35" />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-white text-base">
                Reached a <Text className="font-bold text-orange-400">{post.streakDays} day</Text> streak!
              </Text>
              <Text className="text-gray-400 text-sm mt-1">Consistency is key 🔥</Text>
            </View>
          </View>
        );

      case 'medal_earned':
        const medalColor = post.medalType === 'gold' ? '#FFD700' : post.medalType === 'silver' ? '#C0C0C0' : '#CD7F32';
        return (
          <View className="flex-row items-center">
            <View
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ backgroundColor: medalColor + '20' }}
            >
              <Award size={32} color={medalColor} />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-white text-base">
                Earned the <Text className="font-bold" style={{ color: medalColor }}>{post.medalName}</Text> medal
              </Text>
              <Text className="text-gray-400 text-sm mt-1 capitalize">{post.medalType} achievement unlocked</Text>
            </View>
          </View>
        );

      case 'competition_won':
        return (
          <View className="flex-row items-center">
            <View className="w-16 h-16 rounded-full bg-yellow-500/20 items-center justify-center">
              <Trophy size={32} color="#FFD700" />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-white text-base">
                Won <Text className="font-bold text-yellow-400">{post.competitionName}</Text>!
              </Text>
              <Text className="text-gray-400 text-sm mt-1">Competition champion 🏆</Text>
            </View>
          </View>
        );

      case 'competition_joined':
        return (
          <View className="flex-row items-center">
            <View className="w-16 h-16 rounded-full bg-fitness-accent/20 items-center justify-center">
              <Target size={32} color="#FA114F" />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-white text-base">
                Joined <Text className="font-bold text-fitness-accent">{post.competitionName}</Text>
              </Text>
              <Text className="text-gray-400 text-sm mt-1">Let the competition begin!</Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const reactionCounts = post.reactions.reduce(
    (acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    },
    {} as Record<ReactionType, number>
  );

  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(index * 80)}
      className="mx-5 mb-4"
    >
      <View className="bg-fitness-card rounded-2xl p-4">
        {/* Header */}
        <Pressable
          onPress={() => onViewProfile(post.userId)}
          className="flex-row items-center mb-4"
        >
          <Image source={{ uri: post.userAvatar }} className="w-12 h-12 rounded-full" />
          <View className="ml-3 flex-1">
            <Text className="text-white font-semibold">{post.userName}</Text>
            <Text className="text-gray-500 text-sm">{formatTimeAgo(post.timestamp)}</Text>
          </View>
          <ChevronRight size={20} color="#6b7280" />
        </Pressable>

        {/* Content */}
        {getActivityContent()}

        {/* Reactions Display */}
        {post.reactions.length > 0 && (
          <View className="flex-row items-center mt-4 pt-3 border-t border-white/5">
            <View className="flex-row">
              {Object.entries(reactionCounts).map(([type, count]) => (
                <View
                  key={type}
                  className="flex-row items-center bg-white/5 rounded-full px-2 py-1 mr-2"
                >
                  <Text>{REACTION_CONFIG[type as ReactionType].emoji}</Text>
                  <Text className="text-gray-400 text-sm ml-1">{count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Actions */}
        <View className="flex-row items-center mt-3 pt-3 border-t border-white/5">
          {/* React Button */}
          <Pressable
            onPress={() => setShowReactions(!showReactions)}
            className="flex-row items-center mr-6"
          >
            <Heart size={22} color="#6b7280" />
            <Text className="text-gray-500 ml-2">React</Text>
          </Pressable>

          {/* Comment Button */}
          <Pressable
            onPress={() => onComment(post.id)}
            className="flex-row items-center"
          >
            <MessageCircle size={22} color="#6b7280" />
            <Text className="text-gray-500 ml-2">
              {post.comments.length > 0 ? `${post.comments.length}` : 'Comment'}
            </Text>
          </Pressable>
        </View>

        {/* Reaction Picker */}
        {showReactions && (
          <Animated.View
            entering={FadeIn.duration(200)}
            className="flex-row justify-around mt-3 pt-3 border-t border-white/5"
          >
            {(Object.keys(REACTION_CONFIG) as ReactionType[]).map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  onReact(post.id, type);
                  setShowReactions(false);
                }}
                className="items-center p-2 active:scale-125"
              >
                <Text className="text-2xl">{REACTION_CONFIG[type].emoji}</Text>
                <Text className="text-gray-500 text-xs mt-1">{REACTION_CONFIG[type].label}</Text>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* Comments Preview */}
        {post.comments.length > 0 && (
          <View className="mt-3 pt-3 border-t border-white/5">
            {post.comments.slice(0, 2).map((comment) => (
              <View key={comment.id} className="flex-row mb-2">
                <Image source={{ uri: comment.userAvatar }} className="w-8 h-8 rounded-full" />
                <View className="ml-2 flex-1 bg-white/5 rounded-xl px-3 py-2">
                  <Text className="text-white font-medium text-sm">{comment.userName}</Text>
                  <Text className="text-gray-300 text-sm">{comment.text}</Text>
                </View>
              </View>
            ))}
            {post.comments.length > 2 && (
              <Pressable onPress={() => onComment(post.id)}>
                <Text className="text-gray-500 text-sm ml-10">
                  View all {post.comments.length} comments
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export default function SocialFeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [feed, setFeed] = useState<ActivityPost[]>(MOCK_ACTIVITY_FEED);
  const [commentModalPost, setCommentModalPost] = useState<ActivityPost | null>(null);
  const [newComment, setNewComment] = useState('');

  const { tier, canAccessGroupChat } = useSubscription();
  const { isLoading, checkTier } = useSubscriptionStore();
  const isPro = canAccessGroupChat(); // Social feed is part of group chat feature (Mover or Crusher tier)

  const handleReact = useCallback((postId: string, reaction: ReactionType) => {
    setFeed((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          // Check if user already reacted
          const existingReaction = post.reactions.find((r) => r.userId === '1');
          if (existingReaction) {
            // Remove or change reaction
            return {
              ...post,
              reactions: post.reactions.map((r) =>
                r.userId === '1' ? { ...r, type: reaction } : r
              ),
            };
          }
          // Add new reaction
          return {
            ...post,
            reactions: [...post.reactions, { type: reaction, userId: '1', userName: 'Alex' }],
          };
        }
        return post;
      })
    );
  }, []);

  const handleComment = useCallback((postId: string) => {
    const post = feed.find((p) => p.id === postId);
    if (post) {
      setCommentModalPost(post);
    }
  }, [feed]);

  const handleSendComment = useCallback(() => {
    if (!commentModalPost || !newComment.trim()) return;

    const comment = {
      id: `c${Date.now()}`,
      userId: '1',
      userName: 'Alex',
      userAvatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop',
      text: newComment.trim(),
      timestamp: new Date().toISOString(),
    };

    setFeed((prev) =>
      prev.map((post) => {
        if (post.id === commentModalPost.id) {
          return { ...post, comments: [...post.comments, comment] };
        }
        return post;
      })
    );

    setNewComment('');
    setCommentModalPost(null);
  }, [commentModalPost, newComment]);

  const handleViewProfile = useCallback((userId: string) => {
    router.push(`/friend-profile?id=${userId}`);
  }, [router]);

  useEffect(() => {
    checkTier();
  }, [checkTier]);

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#FA114F" />
      </View>
    );
  }

  // Show ProPaywall if user doesn't have a paid subscription (not Mover or Crusher)
  if (!isLoading && !isPro) {
    return <ProPaywall feature="social" />;
  }

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#1a1a2e', '#000000']}
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            <Text className="text-white text-3xl font-bold">Activity</Text>
            <Text className="text-gray-400 text-base mt-1">See what your friends are up to</Text>
          </Animated.View>
        </LinearGradient>

        {/* Feed */}
        {feed.map((post, index) => (
          <ActivityCard
            key={post.id}
            post={post}
            index={index}
            onReact={handleReact}
            onComment={handleComment}
            onViewProfile={handleViewProfile}
          />
        ))}
      </ScrollView>

      {/* Comment Modal */}
      {commentModalPost && (
        <Modal transparent animationType="slide">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1"
          >
            <Pressable
              className="flex-1 bg-black/50"
              onPress={() => setCommentModalPost(null)}
            />
            <View
              className="bg-fitness-card rounded-t-3xl"
              style={{ maxHeight: '80%', paddingBottom: insets.bottom }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between px-5 py-4 border-b border-white/10">
                <Text className="text-white font-semibold text-lg">Comments</Text>
                <Pressable onPress={() => setCommentModalPost(null)}>
                  <X size={24} color="#6b7280" />
                </Pressable>
              </View>

              {/* Comments List */}
              <ScrollView className="flex-1 max-h-80">
                {commentModalPost.comments.length === 0 ? (
                  <View className="items-center py-8">
                    <MessageCircle size={40} color="#4a4a4a" />
                    <Text className="text-gray-500 mt-3">No comments yet</Text>
                    <Text className="text-gray-600 text-sm">Be the first to comment!</Text>
                  </View>
                ) : (
                  <View className="px-5 py-4">
                    {commentModalPost.comments.map((comment) => (
                      <View key={comment.id} className="flex-row mb-4">
                        <Image source={{ uri: comment.userAvatar }} className="w-10 h-10 rounded-full" />
                        <View className="ml-3 flex-1">
                          <View className="flex-row items-center">
                            <Text className="text-white font-medium">{comment.userName}</Text>
                            <Text className="text-gray-600 text-xs ml-2">
                              {formatTimeAgo(comment.timestamp)}
                            </Text>
                          </View>
                          <Text className="text-gray-300 mt-1">{comment.text}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>

              {/* Comment Input */}
              <View className="flex-row items-center px-5 py-4 border-t border-white/10">
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop' }}
                  className="w-10 h-10 rounded-full"
                />
                <View className="flex-1 ml-3 flex-row items-center bg-white/10 rounded-full px-4 py-2">
                  <TextInput
                    value={newComment}
                    onChangeText={setNewComment}
                    placeholder="Add a comment..."
                    placeholderTextColor="#6b7280"
                    className="flex-1 text-white"
                    multiline
                  />
                  <Pressable
                    onPress={handleSendComment}
                    disabled={!newComment.trim()}
                    className="ml-2"
                  >
                    <Send
                      size={22}
                      color={newComment.trim() ? '#FA114F' : '#4a4a4a'}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
}
