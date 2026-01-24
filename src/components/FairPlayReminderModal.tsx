// src/components/FairPlayReminderModal.tsx
//
// One-time fair play reminder modal shown when user joins their first competition
// Users must acknowledge fair play rules before proceeding

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
import * as Haptics from 'expo-haptics';
import {
  Handshake,
  Check,
  ExternalLink,
  Activity,
  Heart,
  Flag,
  Sparkles,
} from 'lucide-react-native';

interface FairPlayReminderModalProps {
  visible: boolean;
  onClose: () => void;
  onAccept: () => Promise<void>;
}

const GUIDELINES = [
  {
    icon: Activity,
    text: 'Log activity honestly - no fake data',
  },
  {
    icon: Heart,
    text: 'Respect other competitors',
  },
  {
    icon: Flag,
    text: 'Report suspected cheating instead of accusing publicly',
  },
  {
    icon: Sparkles,
    text: 'Have fun and support each other!',
  },
];

export function FairPlayReminderModal({
  visible,
  onClose,
  onAccept,
}: FairPlayReminderModalProps) {
  const colors = useThemeColors();
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

  const handleAccept = async () => {
    if (!isAgreed || isSubmitting) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    try {
      await onAccept();
      // Reset state for next time (though it shouldn't show again)
      setIsAgreed(false);
    } catch (error) {
      console.error('Error accepting fair play:', error);
      // Don't close modal on error - let user retry
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setIsAgreed(false);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Icon */}
          <View className="items-center pt-12 pb-6">
            <View
              className="w-24 h-24 rounded-full items-center justify-center"
              style={{ backgroundColor: '#FA114F20' }}
            >
              <Handshake size={48} color="#FA114F" strokeWidth={1.5} />
            </View>
          </View>

          {/* Title */}
          <Text
            style={{ color: colors.text }}
            className="text-2xl font-bold text-center px-6 mb-3"
          >
            Compete with Integrity
          </Text>

          {/* Intro text */}
          <Text
            style={{ color: colors.textSecondary }}
            className="text-base text-center px-8 mb-8 leading-6"
          >
            MoveTogether is built on fair competition. By joining, you agree to:
          </Text>

          {/* Guidelines */}
          <View className="px-6 mb-6">
            {GUIDELINES.map((guideline, index) => {
              const IconComponent = guideline.icon;
              return (
                <View
                  key={index}
                  className="flex-row items-center p-4 rounded-xl mb-3"
                  style={{ backgroundColor: colors.card }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-4"
                    style={{ backgroundColor: '#FA114F15' }}
                  >
                    <IconComponent size={20} color="#FA114F" />
                  </View>
                  <Text
                    style={{ color: colors.text }}
                    className="text-base flex-1 leading-6"
                  >
                    {guideline.text}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Community Guidelines Link */}
          <TouchableOpacity
            onPress={handleOpenGuidelines}
            className="flex-row items-center justify-center mx-6 mb-8 py-3"
            activeOpacity={0.7}
          >
            <ExternalLink size={16} color="#FA114F" />
            <Text style={{ color: '#FA114F' }} className="text-base font-medium ml-2">
              Read full Community Guidelines
            </Text>
          </TouchableOpacity>

          {/* Checkbox Agreement */}
          <TouchableOpacity
            onPress={handleToggleAgreement}
            activeOpacity={0.7}
            className="flex-row items-center mx-6 p-4 rounded-xl mb-6"
            style={{ backgroundColor: colors.card }}
          >
            <View
              className="w-6 h-6 rounded-md items-center justify-center mr-3"
              style={{
                backgroundColor: isAgreed ? '#FA114F' : 'transparent',
                borderWidth: isAgreed ? 0 : 2,
                borderColor: colors.textSecondary,
              }}
            >
              {isAgreed && <Check size={16} color="white" strokeWidth={3} />}
            </View>
            <Text style={{ color: colors.text }} className="text-base flex-1 leading-6">
              I understand and agree to compete fairly
            </Text>
          </TouchableOpacity>

          {/* Let's Go Button */}
          <View className="px-6">
            <TouchableOpacity
              onPress={handleAccept}
              disabled={!isAgreed || isSubmitting}
              activeOpacity={0.8}
              className="py-4 rounded-xl items-center justify-center"
              style={{
                backgroundColor: isAgreed ? '#FA114F' : colors.card,
                opacity: isAgreed ? 1 : 0.6,
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  className="text-base font-semibold"
                  style={{ color: isAgreed ? 'white' : colors.textSecondary }}
                >
                  Let's Go!
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
