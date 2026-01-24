// src/components/CoachSparkIntroModal.tsx
//
// One-time intro modal shown when user first accesses Coach Spark
// Explains AI limitations and requires acknowledgment before proceeding

import React, { useState } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Text } from '@/components/Text';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase';
import * as Haptics from 'expo-haptics';
import {
  Sparkles,
  Check,
  ExternalLink,
  AlertCircle,
  MessageCircle,
} from 'lucide-react-native';

interface CoachSparkIntroModalProps {
  visible: boolean;
  onComplete: () => void;
}

const DISCLAIMER_POINTS = [
  "I'm an AI assistant, not a certified personal trainer or medical professional",
  "My advice is general information only - not personalized medical advice",
  "Always consult a doctor before starting new fitness programs or if you have health concerns",
  "Don't share sensitive personal information like passwords or payment details with me",
];

export function CoachSparkIntroModal({
  visible,
  onComplete,
}: CoachSparkIntroModalProps) {
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const [isAgreed, setIsAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggleAgreement = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsAgreed(!isAgreed);
  };

  const handleOpenGuidelines = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('https://movetogetherfitness.com/community-guidelines');
  };

  const handleStartChatting = async () => {
    if (!isAgreed || isSubmitting || !user?.id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    try {
      // Save acknowledgment to database
      const { error } = await supabase
        .from('profiles')
        .update({
          coach_spark_intro_seen: true,
          coach_spark_intro_seen_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('[CoachSparkIntro] Error saving acknowledgment:', error);
        // Still proceed - don't block user
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    } catch (err) {
      console.error('[CoachSparkIntro] Exception:', err);
      // Still proceed on error
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {}}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Coach Spark Icon */}
          <View className="items-center pt-12 pb-4">
            <View
              className="w-24 h-24 rounded-full items-center justify-center"
              style={{ backgroundColor: '#8B5CF620' }}
            >
              <Sparkles size={48} color="#8B5CF6" strokeWidth={1.5} />
            </View>
          </View>

          {/* Title */}
          <Text
            style={{ color: colors.text }}
            className="text-2xl font-bold text-center px-6 mb-2"
          >
            Meet Coach Spark
          </Text>

          {/* Welcome Text */}
          <Text
            style={{ color: colors.textSecondary }}
            className="text-base text-center px-8 mb-6 leading-6"
          >
            Coach Spark is your AI fitness companion! I'm here to provide
            motivation, answer fitness questions, and help you reach your goals.
          </Text>

          {/* Disclaimer Section */}
          <View className="mx-5 mb-6">
            <View
              className="rounded-2xl p-5"
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
              }}
            >
              {/* Disclaimer Header */}
              <View className="flex-row items-center mb-4">
                <AlertCircle size={20} color="#F59E0B" />
                <Text
                  style={{ color: colors.text }}
                  className="text-base font-semibold ml-2"
                >
                  Please keep in mind:
                </Text>
              </View>

              {/* Disclaimer Points */}
              {DISCLAIMER_POINTS.map((point, index) => (
                <View key={index} className="flex-row mb-3 last:mb-0">
                  <Text
                    style={{ color: '#F59E0B' }}
                    className="text-sm mr-2"
                  >
                    •
                  </Text>
                  <Text
                    style={{ color: colors.textSecondary }}
                    className="text-sm flex-1 leading-5"
                  >
                    {point}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Community Guidelines Link */}
          <TouchableOpacity
            onPress={handleOpenGuidelines}
            className="flex-row items-center justify-center mx-6 mb-6 py-3"
            activeOpacity={0.7}
          >
            <ExternalLink size={16} color="#8B5CF6" />
            <Text style={{ color: '#8B5CF6' }} className="text-sm font-medium ml-2">
              Coach Spark follows our Community Guidelines
            </Text>
          </TouchableOpacity>

          {/* Checkbox Agreement */}
          <TouchableOpacity
            onPress={handleToggleAgreement}
            activeOpacity={0.7}
            className="flex-row items-center mx-5 p-4 rounded-xl mb-6"
            style={{ backgroundColor: colors.card }}
          >
            <View
              className="w-6 h-6 rounded-md items-center justify-center mr-3"
              style={{
                backgroundColor: isAgreed ? '#8B5CF6' : 'transparent',
                borderWidth: isAgreed ? 0 : 2,
                borderColor: colors.textSecondary,
              }}
            >
              {isAgreed && <Check size={16} color="white" strokeWidth={3} />}
            </View>
            <Text style={{ color: colors.text }} className="text-sm flex-1 leading-5">
              I understand Coach Spark provides general fitness information only
            </Text>
          </TouchableOpacity>

          {/* Start Chatting Button */}
          <View className="px-5">
            <TouchableOpacity
              onPress={handleStartChatting}
              disabled={!isAgreed || isSubmitting}
              activeOpacity={0.8}
              className="py-4 rounded-xl items-center justify-center flex-row"
              style={{
                backgroundColor: isAgreed ? '#8B5CF6' : colors.card,
                opacity: isAgreed ? 1 : 0.6,
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <MessageCircle
                    size={20}
                    color={isAgreed ? 'white' : colors.textSecondary}
                    strokeWidth={2}
                  />
                  <Text
                    className="text-base font-semibold ml-2"
                    style={{ color: isAgreed ? 'white' : colors.textSecondary }}
                  >
                    Start Chatting
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
