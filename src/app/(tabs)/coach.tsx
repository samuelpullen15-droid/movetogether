import { useState, useRef, useEffect } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { Text } from '@/components/Text';

const { width } = Dimensions.get('window');
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFitnessStore } from '@/lib/fitness-store';
import { useHealthStore } from '@/lib/health-service';
import { CoachMessage } from '@/lib/coach-service';
import { sendCoachMessage } from '@/lib/ai-coach';
import { ArrowUp, Sparkles, RefreshCw, Copy, ThumbsUp, ThumbsDown } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useAuthStore } from '@/lib/auth-store';
import { trackCoachFeedback, FeedbackType, trackLaunchAI, trackAIPromptSent, trackAIResponseSent } from '@/lib/coach-feedback-service';
import { ProPaywall } from '@/components/ProPaywall';
import { useThemeColors } from '@/lib/useThemeColors';
import { CoachSparkIntroModal } from '@/components/CoachSparkIntroModal';
import { supabase } from '@/lib/supabase';

const WELCOME_MESSAGE: CoachMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey there! 👋 I'm Coach Spark, your AI fitness buddy! I'm here to help you crush your competitions and build healthy habits. I can see your activity rings, competitions, and achievements - so ask me anything!\n\nWhat would you like to work on today?",
  timestamp: new Date().toISOString(),
};

const TAB_BAR_HEIGHT = 49;
const INPUT_BOX_HEIGHT = 80; // Approximate height of the floating input

// Animated component for line-by-line fade-in
function AnimatedLines({ content, textStyle, isNewMessage }: { content: string; textStyle: object; isNewMessage: boolean }) {
  const paragraphs = content.split('\n\n');

  if (!isNewMessage) {
    // For existing messages, render without animation
    return (
      <Text style={textStyle} className="leading-7">
        {content}
      </Text>
    );
  }

  return (
    <View>
      {paragraphs.map((paragraph, index) => (
        <Animated.Text
          key={index}
          entering={FadeIn.duration(400).delay(index * 150)}
          style={[textStyle, { marginBottom: index < paragraphs.length - 1 ? 12 : 0, fontFamily: 'DMSans_400Regular' }]}
          className="leading-7"
        >
          {paragraph}
        </Animated.Text>
      ))}
    </View>
  );
}

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const tabBarBottom = TAB_BAR_HEIGHT + insets.bottom;
  const scrollRef = useRef<ScrollView>(null);

  const currentUser = useFitnessStore((s) => s.currentUser);
  const competitions = useFitnessStore((s) => s.competitions);
  const achievements = useFitnessStore((s) => s.achievements);

  // Health store integration for real data
  const currentMetrics = useHealthStore((s) => s.currentMetrics);
  const goals = useHealthStore((s) => s.goals);
  const activeProvider = useHealthStore((s) => s.activeProvider);
  const hasConnectedProvider = activeProvider !== null;

  // Use health service data when provider is connected
  const moveCalories = hasConnectedProvider
    ? (currentMetrics?.activeCalories ?? 0)
    : (currentUser.moveCalories ?? 0);
  const exerciseMinutes = hasConnectedProvider
    ? (currentMetrics?.exerciseMinutes ?? 0)
    : (currentUser.exerciseMinutes ?? 0);
  const standHours = hasConnectedProvider
    ? (currentMetrics?.standHours ?? 0)
    : (currentUser.standHours ?? 0);

  // Goals from health store or defaults
  const moveGoal = (typeof goals.moveCalories === 'number' && goals.moveCalories > 0) ? goals.moveCalories : 500;
  const exerciseGoal = (typeof goals.exerciseMinutes === 'number' && goals.exerciseMinutes > 0) ? goals.exerciseMinutes : 30;
  const standGoal = (typeof goals.standHours === 'number' && goals.standHours > 0) ? goals.standHours : 12;

  // Calculate progress percentages
  const moveProgress = moveGoal > 0 ? Math.round((moveCalories / moveGoal) * 100) : 0;
  const exerciseProgress = exerciseGoal > 0 ? Math.round((exerciseMinutes / exerciseGoal) * 100) : 0;
  const standProgress = standGoal > 0 ? Math.round((standHours / standGoal) * 100) : 0;

  const subscriptionTier = useSubscriptionStore((s) => s.tier);
  const isSubLoading = useSubscriptionStore((s) => s.isLoading);
  const checkTier = useSubscriptionStore((s) => s.checkTier);
  const isCrusher = subscriptionTier === 'crusher';

  const [messages, setMessages] = useState<CoachMessage[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, FeedbackType>>({});
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [hasCheckedIntro, setHasCheckedIntro] = useState(false);

  const authUser = useAuthStore((s) => s.user);

  // Check if user has seen the Coach Spark intro modal
  useEffect(() => {
    const checkIntroSeen = async () => {
      if (!authUser?.id || hasCheckedIntro) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('coach_spark_intro_seen')
          .eq('id', authUser.id)
          .single();

        if (error) {
          console.error('[Coach] Error checking intro status:', error);
          setHasCheckedIntro(true);
          return;
        }

        if (!data?.coach_spark_intro_seen) {
          setShowIntroModal(true);
        }
        setHasCheckedIntro(true);
      } catch (err) {
        console.error('[Coach] Exception checking intro:', err);
        setHasCheckedIntro(true);
      }
    };

    checkIntroSeen();
  }, [authUser?.id, hasCheckedIntro]);

  const handleIntroComplete = () => {
    setShowIntroModal(false);
  };

  // Handle feedback submission
  const handleFeedback = async (messageId: string, feedbackType: FeedbackType) => {
    // Don't allow changing feedback once set
    if (feedback[messageId]) return;

    // Find the message and the preceding user query
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    const message = messages[messageIndex];
    const userQuery = messages
      .slice(0, messageIndex)
      .reverse()
      .find((m) => m.role === 'user')?.content || '';

    // Update UI immediately
    setFeedback((prev) => ({ ...prev, [messageId]: feedbackType }));

    // Track to Supabase
    if (authUser?.id && message) {
      await trackCoachFeedback({
        user_id: authUser.id,
        message_content: message.content,
        user_query: userQuery,
        feedback_type: feedbackType,
      });
    }
  };

  // Check tier on mount and track AI launch
  useEffect(() => {
    checkTier();
    trackLaunchAI();
  }, []);

  // Keyboard handling
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
        runOnJS(setKeyboardVisible)(e.height > 0);
        // Scroll to bottom when keyboard finishes appearing
        if (e.height > 0) {
          runOnJS(scrollToBottom)();
        }
      },
    },
    []
  );

  const inputContainerStyle = useAnimatedStyle(() => {
    'worklet';
    // Use Math.max to smoothly transition - never go below tab bar position
    return {
      bottom: Math.max(keyboardHeight.value, tabBarBottom) + 8,
    };
  });

  // Scroll to bottom on mount (no animation for initial load)
  useEffect(() => {
    // Wait for layout to complete then scroll to bottom
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Track previous loading state to detect when AI response finishes
  const prevLoadingRef = useRef(isLoading);

  // Scroll to bottom on new messages
  useEffect(() => {
    // Immediate scroll for quick feedback
    scrollRef.current?.scrollToEnd({ animated: true });
    // Multiple delayed scrolls to catch layout shifts as animated content renders
    const timer1 = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
    const timer2 = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 300);
    const timer3 = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 600);
    const timer4 = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 1000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [messages]);

  // Scroll when AI finishes responding (loading goes from true to false)
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      // AI just finished responding, scroll aggressively
      scrollRef.current?.scrollToEnd({ animated: true });
      const timer = setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 200);
      return () => clearTimeout(timer);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  const handleSend = async (text?: string) => {
    const messageText = text || inputText.trim();
    if (!messageText || isLoading) return;

    setInputText('');
    setError(null);

    const userMessage: CoachMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    trackAIPromptSent(messageText);

    const startTime = Date.now();
    try {
      console.log('[Coach Screen] Sending message:', messageText);
      const response = await sendCoachMessage(
        messageText,
        messages.filter((m) => m.id !== 'welcome')
      );
      console.log('[Coach Screen] Got response:', response.message?.slice(0, 100));
      trackAIResponseSent(Date.now() - startTime);

      const assistantMessage: CoachMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Coach Screen] Error:', errorMessage);
      
      // Handle specific error cases
      if (errorMessage === 'RATE_LIMIT_REACHED') {
        setError("You've reached your monthly message limit. Your limit will reset next month.");
      } else if (errorMessage === 'SUBSCRIPTION_REQUIRED') {
        setError('AI Coach requires a Crusher subscription.');
      } else {
        setError(`Coach Spark hit a snag: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (messages.length >= 2) {
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMessage) {
        // Remove the last user message and retry
        setMessages((prev) => prev.slice(0, -1));
        handleSend(lastUserMessage.content);
      }
    }
  };

  // Calculate dynamic bottom padding based on keyboard state
  // Note: We use a fixed large value when keyboard is visible since we can't
  // access shared values in render. The actual keyboard offset is handled by inputContainerStyle.
  const bottomPadding = keyboardVisible
    ? 300 + INPUT_BOX_HEIGHT // Large enough to account for keyboard
    : tabBarBottom + INPUT_BOX_HEIGHT + 40;

  // Show loading state
  if (isSubLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }} className="items-center justify-center">
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  // Show paywall if not Crusher
  if (!isCrusher) {
    return <ProPaywall feature="coach" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Background Layer - Positioned to fill screen with extra coverage */}
      <Image
        source={require('../../../assets/AppCoachScreen.png')}
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
      {/* Header */}
      <LinearGradient
        colors={['transparent', 'transparent', 'transparent']}
        style={{ paddingTop: insets.top + 16, paddingBottom: 20, paddingHorizontal: 20 }}
      >
        <Animated.View entering={FadeInDown.duration(500)} className="flex-row items-center">
          <View className="w-14 h-14 rounded-full items-center justify-center" style={{ backgroundColor: '#8b5cf6' }}>
            <Sparkles size={28} color="white" />
          </View>
          <View className="ml-4 flex-1">
            <Text className="text-black dark:text-white text-xl font-bold">Coach Spark</Text>
            <Text style={{ color: '#8b5cf6' }} className="text-sm">AI Fitness Coach</Text>
          </View>
        </Animated.View>

        {/* Quick Stats Banner */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          className="mt-4 flex-row rounded-2xl p-3"
          style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
        >
          <View className="flex-1 items-center">
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-ring-move mr-1.5" />
              <Text className="text-black dark:text-white font-semibold">
                {moveProgress}%
              </Text>
            </View>
            <Text className="text-gray-500 text-xs">Move</Text>
          </View>
          <View className="flex-1 items-center" style={{ borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-ring-exercise mr-1.5" />
              <Text className="text-black dark:text-white font-semibold">
                {exerciseProgress}%
              </Text>
            </View>
            <Text className="text-gray-500 text-xs">Exercise</Text>
          </View>
          <View className="flex-1 items-center">
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-ring-stand mr-1.5" />
              <Text className="text-black dark:text-white font-semibold">
                {standProgress}%
              </Text>
            </View>
            <Text className="text-gray-500 text-xs">Stand</Text>
          </View>
        </Animated.View>
      </LinearGradient>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        className="flex-1 px-4"
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: bottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        }}
        onLayout={() => {
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
        }}
      >
        {messages.map((message, index) => (
          <Animated.View
            key={message.id}
            entering={FadeInUp.duration(300).delay(index === messages.length - 1 ? 0 : 0)}
            className={`flex-row mb-6 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
{message.role === 'user' ? (
              <View
                className="max-w-[80%] rounded-2xl px-4 py-3 mr-2"
                style={{
                  backgroundColor: 'rgba(139, 92, 246, 0.3)',
                  borderBottomRightRadius: 4,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 18 }} className="leading-6">{message.content}</Text>
              </View>
            ) : (
              <View className="max-w-[90%] pl-2">
                <AnimatedLines
                  content={message.content}
                  textStyle={{ color: colors.isDark ? '#D1D5DB' : '#4B5563', fontSize: 18 }}
                  isNewMessage={index === messages.length - 1 && message.role === 'assistant'}
                />
                {message.id !== 'welcome' && (
                  <View className="flex-row mt-3 gap-2">
                    <Pressable
                      onPress={() => Clipboard.setStringAsync(message.content)}
                      className="p-1.5 rounded-full active:opacity-50"
                    >
                      <Copy size={16} color={colors.isDark ? '#6B7280' : '#9CA3AF'} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleFeedback(message.id, 'thumbs_up')}
                      disabled={!!feedback[message.id]}
                      className="p-1.5 rounded-full active:opacity-50"
                    >
                      <ThumbsUp
                        size={16}
                        color={feedback[message.id] === 'thumbs_up' ? '#22c55e' : (colors.isDark ? '#6B7280' : '#9CA3AF')}
                        fill={feedback[message.id] === 'thumbs_up' ? '#22c55e' : 'transparent'}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => handleFeedback(message.id, 'thumbs_down')}
                      disabled={!!feedback[message.id]}
                      className="p-1.5 rounded-full active:opacity-50"
                    >
                      <ThumbsDown
                        size={16}
                        color={feedback[message.id] === 'thumbs_down' ? '#ef4444' : (colors.isDark ? '#6B7280' : '#9CA3AF')}
                        fill={feedback[message.id] === 'thumbs_down' ? '#ef4444' : 'transparent'}
                      />
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </Animated.View>
        ))}

        {isLoading && (
          <Animated.View
            entering={FadeInUp.duration(300)}
            className="mb-4"
          >
            <View style={{ backgroundColor: colors.card, borderBottomLeftRadius: 4 }} className="rounded-2xl px-4 py-3 self-start">
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color="#8b5cf6" />
                <Text className="text-gray-500 dark:text-gray-400 ml-2">Coach is thinking...</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {error && (
          <Animated.View
            entering={FadeInUp.duration(300)}
            className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-4"
          >
            <Text className="text-red-400 mb-2">{error}</Text>
            <Pressable
              onPress={handleRetry}
              className="flex-row items-center self-start bg-red-500/20 px-3 py-2 rounded-full"
            >
              <RefreshCw size={14} color="#f87171" />
              <Text className="text-red-400 ml-2 text-sm font-medium">Try again</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Persistent AI Disclaimer */}
        <View className="items-center mt-4 mb-2">
          <Text
            style={{ color: colors.isDark ? '#6B7280' : '#9CA3AF' }}
            className="text-xs text-center px-4"
          >
            Coach Spark provides general fitness info only — not medical advice.
          </Text>
        </View>
      </ScrollView>

      {/* Floating input */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 16,
            right: 16,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 24,
            backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
            borderWidth: 1,
            borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: colors.isDark ? 0.35 : 0.15,
            shadowRadius: 12,
            elevation: 8,
          },
          inputContainerStyle,
        ]}
      >
        <View
          className="flex-1 flex-row items-center rounded-full mr-3"
          style={{ minHeight: 48, paddingHorizontal: 16, backgroundColor: colors.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)' }}
        >
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask Coach Spark..."
            placeholderTextColor="#6b7280"
            className="flex-1"
            style={{
              fontSize: 16,
              lineHeight: 20,
              paddingTop: 14,
              paddingBottom: 14,
              maxHeight: 100,
              color: colors.text,
              fontFamily: 'DMSans_400Regular',
            }}
            multiline
            maxLength={500}
            editable={!isLoading}
            blurOnSubmit={true}
            onSubmitEditing={() => handleSend()}
          />
        </View>
        <Pressable
          onPress={() => handleSend()}
          disabled={!inputText.trim() || isLoading}
          className="w-12 h-12 rounded-full items-center justify-center"
          style={{ backgroundColor: inputText.trim() && !isLoading ? '#8b5cf6' : (colors.isDark ? '#2a2a2c' : '#e5e5e5') }}
        >
          <ArrowUp size={24} color={inputText.trim() && !isLoading ? 'white' : '#6b7280'} strokeWidth={2.5} />
        </Pressable>
      </Animated.View>

      {/* Coach Spark Intro Modal */}
      <CoachSparkIntroModal
        visible={showIntroModal}
        onComplete={handleIntroComplete}
      />
    </View>
  );
}