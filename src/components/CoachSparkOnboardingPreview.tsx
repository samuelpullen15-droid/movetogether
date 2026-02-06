/**
 * CoachSparkOnboardingPreview
 *
 * Interactive preview of Coach Spark for the onboarding flow.
 * Shows sample prompts users can tap to see AI-like responses,
 * demonstrating the value of the coaching feature.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  SlideInRight,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Sparkles,
  MessageCircle,
  Flame,
  Trophy,
  Target,
  Zap,
} from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';

const { width } = Dimensions.get('window');

// Sample prompts and responses to showcase Coach Spark
const SAMPLE_CONVERSATIONS = [
  {
    id: 'motivation',
    prompt: "I'm struggling to stay motivated today",
    icon: Flame,
    iconColor: '#FF6B6B',
    response:
      "I totally get it - we all have those days! 💪 Here's the thing: motivation often comes AFTER you start, not before. Try this: commit to just 5 minutes of movement. Tell yourself you can stop after that.\n\nUsually, once you start, the momentum kicks in. And remember - showing up on the hard days is what separates people who reach their goals from those who don't. You've got this!",
  },
  {
    id: 'rings',
    prompt: 'How can I close my rings faster?',
    icon: Target,
    iconColor: '#4ECDC4',
    response:
      "Great question! Here are my top tips for closing those rings:\n\n🔴 Move Ring: Take a 10-min walk after meals - this alone can add 100+ calories burned!\n\n🟢 Exercise Ring: High-intensity intervals are your friend. Even 15 mins of HIIT counts for more exercise minutes.\n\n🔵 Stand Ring: Set hourly reminders. A quick stretch or walk to refill your water counts!\n\nPro tip: Morning workouts help close rings early, giving you momentum for the rest of the day. 🌟",
  },
  {
    id: 'competition',
    prompt: 'Tips for winning my next competition?',
    icon: Trophy,
    iconColor: '#FFD93D',
    response:
      "Love the competitive spirit! 🏆 Here's my winning strategy:\n\n1. **Front-load your effort** - The first 2 days set the tone. Start strong!\n\n2. **Consistency beats intensity** - Closing all 3 rings daily scores better than one big workout.\n\n3. **Don't forget stand hours** - Easy points people overlook!\n\n4. **Morning workouts** - Get your exercise ring filled before life gets busy.\n\n5. **Stay hydrated** - Better performance = more activity.\n\nWhat type of competition are you in? I can give more specific tips!",
  },
];

interface CoachSparkOnboardingPreviewProps {
  onTryPrompt?: () => void;
}

export function CoachSparkOnboardingPreview({
  onTryPrompt,
}: CoachSparkOnboardingPreviewProps) {
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [shownResponses, setShownResponses] = useState<string[]>([]);

  const handlePromptTap = (promptId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (selectedPromptId === promptId) {
      return; // Already selected
    }

    setSelectedPromptId(promptId);

    // Add response after a brief delay for effect
    setTimeout(() => {
      setShownResponses((prev) => [...prev, promptId]);
      onTryPrompt?.();
    }, 300);
  };

  // Scroll to bottom when new response appears
  useEffect(() => {
    if (shownResponses.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [shownResponses]);

  const selectedConversation = SAMPLE_CONVERSATIONS.find(
    (c) => c.id === selectedPromptId
  );

  return (
    <View style={styles.container}>
      {/* Coach Spark Header */}
      <Animated.View
        entering={FadeInDown.duration(500)}
        style={styles.header}
      >
        <View
          style={[
            styles.coachIcon,
            { backgroundColor: 'rgba(139, 92, 246, 0.15)' },
          ]}
        >
          <Sparkles size={32} color="#8B5CF6" />
        </View>
        <View style={styles.headerText}>
          <Text
            className="text-lg font-bold"
            style={{ color: colors.text }}
          >
            Coach Spark
          </Text>
          <Text
            className="text-sm"
            style={{ color: '#8B5CF6' }}
          >
            Your AI Fitness Coach
          </Text>
        </View>
      </Animated.View>

      {/* Welcome Message */}
      <Animated.View
        entering={FadeIn.delay(200).duration(400)}
        style={styles.welcomeContainer}
      >
        <View
          style={[
            styles.messageBubble,
            { backgroundColor: colors.isDark ? '#2A2A2E' : '#F5F5F7' },
          ]}
        >
          <Text style={[styles.welcomeText, { color: colors.text }]}>
            Hey there! 👋 I'm Coach Spark, your AI fitness buddy! I can help with
            motivation, workout tips, competition strategies, and more.
          </Text>
          <Text
            style={[styles.welcomeSubtext, { color: colors.textSecondary }]}
          >
            Tap a prompt below to see how I can help!
          </Text>
        </View>
      </Animated.View>

      {/* Sample Prompts */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Prompt Chips */}
        <Animated.View
          entering={FadeInUp.delay(400).duration(400)}
          style={styles.promptsContainer}
        >
          <Text
            style={[styles.promptsLabel, { color: colors.textSecondary }]}
          >
            Try asking:
          </Text>
          <View style={styles.promptChips}>
            {SAMPLE_CONVERSATIONS.map((conv, index) => {
              const IconComponent = conv.icon;
              const isSelected = selectedPromptId === conv.id;
              const isAnswered = shownResponses.includes(conv.id);

              return (
                <Animated.View
                  key={conv.id}
                  entering={SlideInRight.delay(500 + index * 100).springify()}
                >
                  <Pressable
                    onPress={() => handlePromptTap(conv.id)}
                    disabled={isAnswered}
                    style={({ pressed }) => [
                      styles.promptChip,
                      {
                        backgroundColor: isAnswered
                          ? colors.isDark
                            ? 'rgba(139, 92, 246, 0.3)'
                            : 'rgba(139, 92, 246, 0.15)'
                          : colors.isDark
                          ? '#2A2A2E'
                          : '#F5F5F7',
                        borderColor: isAnswered
                          ? '#8B5CF6'
                          : colors.isDark
                          ? 'rgba(255, 255, 255, 0.1)'
                          : 'rgba(0, 0, 0, 0.05)',
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.promptIconContainer,
                        { backgroundColor: `${conv.iconColor}20` },
                      ]}
                    >
                      <IconComponent size={16} color={conv.iconColor} />
                    </View>
                    <Text
                      style={[
                        styles.promptText,
                        {
                          color: isAnswered ? '#8B5CF6' : colors.text,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {conv.prompt}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        {/* User Message & Response */}
        {selectedConversation && shownResponses.includes(selectedConversation.id) && (
          <>
            {/* User Message */}
            <Animated.View
              entering={FadeInDown.duration(300)}
              style={styles.userMessageContainer}
            >
              <View
                style={[
                  styles.userMessage,
                  { backgroundColor: 'rgba(139, 92, 246, 0.3)' },
                ]}
              >
                <Text style={[styles.userMessageText, { color: colors.text }]}>
                  {selectedConversation.prompt}
                </Text>
              </View>
            </Animated.View>

            {/* AI Response */}
            <Animated.View
              entering={FadeInUp.delay(200).duration(400)}
              style={styles.responseContainer}
            >
              <View
                style={[
                  styles.responseBubble,
                  { backgroundColor: colors.isDark ? '#2A2A2E' : '#F5F5F7' },
                ]}
              >
                <Text style={[styles.responseText, { color: colors.text }]}>
                  {selectedConversation.response}
                </Text>
              </View>
            </Animated.View>
          </>
        )}

        {/* Encouragement after first response */}
        {shownResponses.length === 1 && (
          <Animated.View
            entering={FadeIn.delay(800).duration(400)}
            style={styles.encouragement}
          >
            <View style={styles.encouragementContent}>
              <Zap size={16} color="#8B5CF6" />
              <Text
                style={[styles.encouragementText, { color: colors.textSecondary }]}
              >
                Try another prompt above!
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Unlock Message after multiple responses */}
        {shownResponses.length >= 2 && (
          <Animated.View
            entering={FadeIn.delay(400).duration(400)}
            style={styles.unlockContainer}
          >
            <LinearGradient
              colors={['rgba(139, 92, 246, 0.15)', 'rgba(139, 92, 246, 0.05)']}
              style={styles.unlockGradient}
            >
              <MessageCircle size={20} color="#8B5CF6" />
              <Text
                style={[styles.unlockText, { color: colors.text }]}
                className="font-semibold"
              >
                Get unlimited access to Coach Spark
              </Text>
              <Text
                style={[styles.unlockSubtext, { color: colors.textSecondary }]}
              >
                Continue to see subscription options →
              </Text>
            </LinearGradient>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  coachIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    marginLeft: 12,
  },
  welcomeContainer: {
    marginBottom: 16,
  },
  messageBubble: {
    borderRadius: 20,
    borderTopLeftRadius: 4,
    padding: 16,
  },
  welcomeText: {
    fontSize: 16,
    lineHeight: 24,
  },
  welcomeSubtext: {
    fontSize: 14,
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  promptsContainer: {
    marginBottom: 16,
  },
  promptsLabel: {
    fontSize: 13,
    marginBottom: 10,
    fontWeight: '500',
  },
  promptChips: {
    gap: 10,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  promptIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  promptText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageContainer: {
    alignItems: 'flex-end',
    marginVertical: 12,
  },
  userMessage: {
    maxWidth: '85%',
    borderRadius: 20,
    borderBottomRightRadius: 4,
    padding: 14,
  },
  userMessageText: {
    fontSize: 16,
  },
  responseContainer: {
    marginBottom: 12,
  },
  responseBubble: {
    borderRadius: 20,
    borderTopLeftRadius: 4,
    padding: 16,
  },
  responseText: {
    fontSize: 16,
    lineHeight: 24,
  },
  encouragement: {
    alignItems: 'center',
    marginTop: 8,
  },
  encouragementContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  encouragementText: {
    fontSize: 13,
  },
  unlockContainer: {
    marginTop: 16,
  },
  unlockGradient: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  unlockText: {
    fontSize: 16,
    textAlign: 'center',
  },
  unlockSubtext: {
    fontSize: 13,
    textAlign: 'center',
  },
});

export default CoachSparkOnboardingPreview;
