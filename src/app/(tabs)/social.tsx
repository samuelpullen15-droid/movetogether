import { useState, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Text } from '@/components/Text';

const { width } = Dimensions.get('window');
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Heart,
  MessageCircle,
  ArrowUp,
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
  fetchActivityFeed,
  addReaction,
  removeReaction,
  addComment,
  ActivityFeedItem,
  REACTION_TYPES,
} from '@/lib/activity-service';
import { ReactionType, REACTION_CONFIG } from '@/lib/social-types';
import { cn } from '@/lib/cn';
import { useSubscription } from '@/lib/useSubscription';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { ProPaywall } from '@/components/ProPaywall';
import { AnimatedText } from '@/components/AnimatedText';
import { ThemeTransition } from '@/components/ThemeTransition';
import { useThemeColors } from '@/lib/useThemeColors';

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
  post: ActivityFeedItem;
  index: number;
  onReact: (postId: string, reaction: string) => void;
  onComment: (postId: string) => void;
  onViewProfile: (userId: string) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const colors = useThemeColors();

  const getActivityContent = () => {
    return (
      <View>
        <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-base">{post.title}</AnimatedText>
        {post.subtitle && (
          <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="text-sm mt-1">{post.subtitle}</AnimatedText>
        )}
      </View>
    );
  };

  const reactionCounts = post.reaction_counts || {};
  const comments = (post.reactions || []).filter(r => r.comment);

  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(index * 80)}
      className="mx-5 mb-4"
    >
      <View
        style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7' }}
        className="rounded-2xl p-4"
      >
        {/* Header */}
        <Pressable
          onPress={() => onViewProfile(post.user_id)}
          className="flex-row items-center mb-4"
        >
          <Image source={{ uri: post.user?.avatar_url || '' }} className="w-12 h-12 rounded-full" />
          <View className="ml-3 flex-1">
            <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="font-semibold">{post.user?.full_name || post.user?.username || 'Unknown'}</AnimatedText>
            <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="text-sm">{formatTimeAgo(post.created_at)}</AnimatedText>
          </View>
          <ChevronRight size={20} color={colors.textSecondary} />
        </Pressable>

        {/* Content */}
        {getActivityContent()}

        {/* Reactions Display */}
        {Object.keys(reactionCounts).length > 0 && (
          <View
            style={{ borderTopColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
            className="flex-row items-center mt-4 pt-3 border-t"
          >
            <View className="flex-row">
              {Object.entries(reactionCounts).map(([type, count]) => (
                <View
                  key={type}
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                  className="flex-row items-center rounded-full px-2 py-1 mr-2"
                >
                  <Text>{type}</Text>
                  <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="text-sm ml-1">{count}</AnimatedText>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Actions */}
        <View
          style={{ borderTopColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
          className="flex-row items-center mt-3 pt-3 border-t"
        >
          {/* React Button */}
          <Pressable
            onPress={() => setShowReactions(!showReactions)}
            className="flex-row items-center mr-6"
          >
            <Heart size={22} color={post.user_reaction ? "#FA114F" : colors.textSecondary} />
            <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="ml-2">React</AnimatedText>
          </Pressable>

          {/* Comment Button */}
          <Pressable
            onPress={() => onComment(post.id)}
            className="flex-row items-center"
          >
            <MessageCircle size={22} color={colors.textSecondary} />
            <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="ml-2">
              {comments.length > 0 ? `${comments.length}` : 'Comment'}
            </AnimatedText>
          </Pressable>
        </View>

        {/* Reaction Picker */}
        {showReactions && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{ borderTopColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
            className="flex-row justify-around mt-3 pt-3 border-t"
          >
            {REACTION_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  onReact(post.id, type);
                  setShowReactions(false);
                }}
                className="items-center p-2 active:scale-125"
              >
                <Text className="text-2xl">{type}</Text>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* Comments Preview */}
        {comments.length > 0 && (
          <View
            style={{ borderTopColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
            className="mt-3 pt-3 border-t"
          >
            {comments.slice(0, 2).map((comment) => (
              <View key={comment.id} className="flex-row mb-2">
                <Image source={{ uri: comment.user?.avatar_url || '' }} className="w-8 h-8 rounded-full" />
                <View
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                  className="ml-2 flex-1 rounded-xl px-3 py-2"
                >
                  <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="font-medium text-sm">{comment.user?.username || 'Unknown'}</AnimatedText>
                  <AnimatedText lightColor="#374151" darkColor="#D1D5DB" className="text-sm">{comment.comment}</AnimatedText>
                </View>
              </View>
            ))}
            {comments.length > 2 && (
              <Pressable onPress={() => onComment(post.id)}>
                <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="text-sm ml-10">
                  View all {comments.length} comments
                </AnimatedText>
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
  const colors = useThemeColors();
  const [feed, setFeed] = useState<ActivityFeedItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [commentModalPost, setCommentModalPost] = useState<ActivityFeedItem | null>(null);
  const [newComment, setNewComment] = useState('');

  const { tier, canAccessGroupChat } = useSubscription();
  const { isLoading, checkTier } = useSubscriptionStore();
  const isPro = canAccessGroupChat(); // Social feed is part of group chat feature (Mover or Crusher tier)

  useEffect(() => {
    async function loadFeed() {
      try {
        setLoadingFeed(true);
        const data = await fetchActivityFeed();
        setFeed(data);
      } catch (error) {
        console.error('Error loading activity feed:', error);
      } finally {
        setLoadingFeed(false);
      }
    }
    if (isPro) {
      loadFeed();
    }
  }, [isPro]);

  const handleReact = useCallback(async (postId: string, reaction: string) => {
    const post = feed.find(p => p.id === postId);
    if (!post) return;
    
    try {
      if (post.user_reaction === reaction) {
        await removeReaction(postId, reaction);
      } else {
        await addReaction(postId, reaction);
      }
      // Refresh feed
      const data = await fetchActivityFeed();
      setFeed(data);
    } catch (error) {
      console.error('Error reacting:', error);
    }
  }, [feed]);

  const handleComment = useCallback((postId: string) => {
    const post = feed.find((p) => p.id === postId);
    if (post) {
      setCommentModalPost(post);
    }
  }, [feed]);

  const handleSendComment = useCallback(async () => {
    if (!commentModalPost || !newComment.trim()) return;
    
    try {
      await addComment(commentModalPost.id, newComment.trim());
      setNewComment('');
      setCommentModalPost(null);
      // Refresh feed
      const data = await fetchActivityFeed();
      setFeed(data);
    } catch (error) {
      console.error('Error commenting:', error);
    }
  }, [commentModalPost, newComment]);

  const handleViewProfile = useCallback((userId: string) => {
    router.push(`/friend-profile?id=${userId}`);
  }, [router]);

  useEffect(() => {
    checkTier();
  }, [checkTier]);

  // Re-check tier when tab gains focus (in case RevenueCat identification finished after first load)
  useFocusEffect(
    useCallback(() => {
      checkTier();
    }, [checkTier])
  );

  // Show loading state
  if (isLoading) {
    return (
      <ThemeTransition>
        <View style={{ backgroundColor: colors.bg }} className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FA114F" />
        </View>
      </ThemeTransition>
    );
  }

  // Show ProPaywall if user doesn't have a paid subscription (not Mover or Crusher)
  if (!isLoading && !isPro) {
    return <ProPaywall feature="social" />;
  }

  return (
    <ThemeTransition>
      <View style={{ backgroundColor: colors.bg }} className="flex-1">
        {/* Background Layer - Positioned to fill screen with extra coverage */}
        <Image
          source={require('../../../assets/AppActivityScreen.png')}
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
        <ScrollView
          className="flex-1"
          style={{ backgroundColor: 'transparent' }}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}>
            <View>
              <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-3xl font-bold">Activity</AnimatedText>
              <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="text-base mt-1">See what your friends are up to</AnimatedText>
            </View>
          </View>

          {/* Feed */}
          {loadingFeed ? (
            <View className="flex-1 items-center justify-center py-20">
              <ActivityIndicator size="large" color="#FA114F" />
            </View>
          ) : feed.length === 0 ? (
            <View className="flex-1 items-center justify-center py-20 px-5">
              <Users size={48} color={colors.textSecondary} />
              <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="text-base mt-4 text-center">
                No activity yet. Add some friends to see their updates!
              </AnimatedText>
            </View>
          ) : (
            feed.map((post, index) => (
              <ActivityCard
                key={post.id}
                post={post}
                index={index}
                onReact={handleReact}
                onComment={handleComment}
                onViewProfile={handleViewProfile}
              />
            ))
          )}
        </ScrollView>

      {/* Comment Modal */}
      {commentModalPost && (
        <Modal transparent animationType="slide">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1"
          >
            <Pressable
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
              className="flex-1"
              onPress={() => setCommentModalPost(null)}
            />
            <View
              style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7', maxHeight: '80%', paddingBottom: insets.bottom }}
              className="rounded-t-3xl"
            >
              {/* Header */}
              <View
                style={{ borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                className="flex-row items-center justify-between px-5 py-4 border-b"
              >
                <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="font-semibold text-lg">Comments</AnimatedText>
                <Pressable onPress={() => setCommentModalPost(null)}>
                  <X size={24} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Comments List */}
              <ScrollView className="flex-1 max-h-80">
                {(() => {
                  const comments = (commentModalPost.reactions || []).filter(r => r.comment);
                  return comments.length === 0 ? (
                    <View className="items-center py-8">
                      <MessageCircle size={40} color={colors.textSecondary} />
                      <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="mt-3">No comments yet</AnimatedText>
                      <AnimatedText lightColor="#9CA3AF" darkColor="#6B7280" className="text-sm">Be the first to comment!</AnimatedText>
                    </View>
                  ) : (
                    <View className="px-5 py-4">
                      {comments.map((comment) => (
                        <View key={comment.id} className="flex-row mb-4">
                          <Image source={{ uri: comment.user?.avatar_url || '' }} className="w-10 h-10 rounded-full" />
                          <View className="ml-3 flex-1">
                            <View className="flex-row items-center">
                              <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="font-medium">{comment.user?.username || 'Unknown'}</AnimatedText>
                              <AnimatedText lightColor="#9CA3AF" darkColor="#6B7280" className="text-xs ml-2">
                                {formatTimeAgo(comment.created_at)}
                              </AnimatedText>
                            </View>
                            <AnimatedText lightColor="#374151" darkColor="#D1D5DB" className="mt-1">{comment.comment}</AnimatedText>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </ScrollView>

              {/* Comment Input */}
              <View
                style={{ borderTopColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                className="flex-row items-center px-5 py-4 border-t"
              >
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop' }}
                  className="w-10 h-10 rounded-full"
                />
                <View
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                  className="flex-1 ml-3 flex-row items-center rounded-full px-4 py-2"
                >
                  <TextInput
                    value={newComment}
                    onChangeText={setNewComment}
                    placeholder="Add a comment..."
                    placeholderTextColor={colors.textSecondary}
                    style={{ color: colors.text }}
                    className="flex-1"
                    multiline
                  />
                  <Pressable
                    onPress={handleSendComment}
                    disabled={!newComment.trim()}
                    className="ml-2"
                  >
                    <ArrowUp
                      size={26}
                      strokeWidth={2.5}
                      color={newComment.trim() ? '#FA114F' : colors.textSecondary}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
      </View>
    </ThemeTransition>
  );
}
