import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFitnessStore } from '@/lib/fitness-store';
import { CoachMessage } from '@/lib/coach-service';
import { sendCoachMessage } from '@/lib/ai-coach';
import { Send, Sparkles, Bot, RefreshCw } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { ProPaywall } from '@/components/ProPaywall';

const COACH_AVATAR = 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&h=200&fit=crop';

const WELCOME_MESSAGE: CoachMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey there! 👋 I'm Coach Spark, your AI fitness buddy! I'm here to help you crush your competitions and build healthy habits. I can see your activity rings, competitions, and achievements - so ask me anything!\n\nWhat would you like to work on today?",
  timestamp: new Date().toISOString(),
};

const TAB_BAR_HEIGHT = 49;

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const tabBarBottom = TAB_BAR_HEIGHT + insets.bottom;
  const scrollRef = useRef<ScrollView>(null);

  const currentUser = useFitnessStore((s) => s.currentUser);
  const competitions = useFitnessStore((s) => s.competitions);
  const achievements = useFitnessStore((s) => s.achievements);

  const subscriptionTier = useSubscriptionStore((s) => s.tier);
  const isSubLoading = useSubscriptionStore((s) => s.isLoading);
  const checkTier = useSubscriptionStore((s) => s.checkTier);
  const isCrusher = subscriptionTier === 'crusher';

  const [messages, setMessages] = useState<CoachMessage[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check tier on mount
  useEffect(() => {
    checkTier();
  }, []);

  // Keyboard handling
  const keyboardHeight = useSharedValue(0);

  useKeyboardHandler(
    {
      onMove: (e) => {
        'worklet';
        keyboardHeight.value = e.height;
      },
      onEnd: (e) => {
        'worklet';
        keyboardHeight.value = e.height;
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

  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

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

    try {
      console.log('[Coach Screen] Sending message:', messageText);
      const response = await sendCoachMessage(
        messageText,
        messages.filter((m) => m.id !== 'welcome')
      );
      console.log('[Coach Screen] Got response:', response.message?.slice(0, 100));

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

  // Show loading state
  if (isSubLoading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#92E82A" />
      </View>
    );
  }

  // Show paywall if not Crusher
  if (!isCrusher) {
    return <ProPaywall feature="coach" />;
  }

  return (
    <View className="flex-1 bg-black">
      {/* Header */}
      <LinearGradient
        colors={['#1a2a1a', '#0a1a0a', '#000000']}
        style={{ paddingTop: insets.top + 16, paddingBottom: 20, paddingHorizontal: 20 }}
      >
        <Animated.View entering={FadeInDown.duration(500)} className="flex-row items-center">
          <View className="relative">
            <Image
              source={{ uri: COACH_AVATAR }}
              className="w-14 h-14 rounded-full border-2 border-ring-exercise"
            />
            <View className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-ring-exercise items-center justify-center">
              <Sparkles size={12} color="black" />
            </View>
          </View>
          <View className="ml-4 flex-1">
            <Text className="text-white text-xl font-bold">Coach Spark</Text>
            <Text className="text-ring-exercise text-sm">AI Fitness Coach</Text>
          </View>
          <View className="bg-ring-exercise/20 px-3 py-1.5 rounded-full">
            <Text className="text-ring-exercise text-xs font-medium">Online</Text>
          </View>
        </Animated.View>

        {/* Quick Stats Banner */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          className="mt-4 flex-row bg-white/5 rounded-2xl p-3"
        >
          <View className="flex-1 items-center">
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-ring-move mr-1.5" />
              <Text className="text-white font-semibold">
                {Math.round((currentUser.moveCalories / currentUser.moveGoal) * 100)}%
              </Text>
            </View>
            <Text className="text-gray-500 text-xs">Move</Text>
          </View>
          <View className="flex-1 items-center border-l border-r border-white/10">
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-ring-exercise mr-1.5" />
              <Text className="text-white font-semibold">
                {Math.round((currentUser.exerciseMinutes / currentUser.exerciseGoal) * 100)}%
              </Text>
            </View>
            <Text className="text-gray-500 text-xs">Exercise</Text>
          </View>
          <View className="flex-1 items-center">
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-ring-stand mr-1.5" />
              <Text className="text-white font-semibold">
                {Math.round((currentUser.standHours / currentUser.standGoal) * 100)}%
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
        style={{ backgroundColor: '#000000' }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={{ position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: '#1a1a2e', zIndex: -1 }} />
        {messages.map((message, index) => (
          <Animated.View
            key={message.id}
            entering={FadeInUp.duration(300).delay(index === messages.length - 1 ? 0 : 0)}
            className={`flex-row mb-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <View className="w-8 h-8 rounded-full bg-ring-exercise/20 items-center justify-center mr-2 mt-1">
                <Bot size={16} color="#92E82A" />
              </View>
            )}

            <View
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-fitness-accent rounded-br-sm'
                  : 'bg-fitness-card rounded-bl-sm'
              }`}
            >
              <Text className="text-white leading-5">{message.content}</Text>
            </View>
          </Animated.View>
        ))}

        {isLoading && (
          <Animated.View
            entering={FadeInUp.duration(300)}
            className="flex-row items-center mb-4"
          >
            <View className="w-8 h-8 rounded-full bg-ring-exercise/20 items-center justify-center mr-2">
              <Bot size={16} color="#92E82A" />
            </View>
            <View className="bg-fitness-card rounded-2xl rounded-bl-sm px-4 py-3">
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color="#92E82A" />
                <Text className="text-gray-400 ml-2">Coach is thinking...</Text>
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
            backgroundColor: '#1C1C1E',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 12,
            elevation: 8,
          },
          inputContainerStyle,
        ]}
      >
        <View 
          className="flex-1 flex-row items-center bg-black/40 rounded-full mr-3"
          style={{ minHeight: 48, paddingHorizontal: 16 }}
        >
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask Coach Spark..."
            placeholderTextColor="#6b7280"
            className="flex-1 text-white"
            style={{ 
              fontSize: 16,
              lineHeight: 20,
              paddingTop: 14,
              paddingBottom: 14,
              maxHeight: 100,
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
          style={{ backgroundColor: inputText.trim() && !isLoading ? '#FA114F' : '#2a2a2c' }}
        >
          <Send size={20} color={inputText.trim() && !isLoading ? 'white' : '#6b7280'} />
        </Pressable>
      </Animated.View>
    </View>
  );
}