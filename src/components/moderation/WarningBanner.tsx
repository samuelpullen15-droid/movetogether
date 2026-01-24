// src/components/moderation/WarningBanner.tsx
//
// Popup shown to users who have received warnings
// Dismissible modal that appears in the center of the screen
// Reminds users about community guidelines

import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useModeration } from '@/lib/moderation-context';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

export function WarningBanner() {
  const { moderationStatus, hasSeenWarning, dismissWarning } = useModeration();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const shouldShow = moderationStatus?.status === 'warned' && !hasSeenWarning;
    setIsVisible(shouldShow);
  }, [moderationStatus?.status, hasSeenWarning]);

  if (!isVisible) {
    return null;
  }

  const warningCount = moderationStatus?.warning_count || 1;

  const handleDismiss = () => {
    setIsVisible(false);
    dismissWarning();
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.overlay}
      >
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

        {/* Absorb outside touches without dismissing */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} />

        <Animated.View
          entering={ZoomIn.duration(300).springify()}
          style={styles.popup}
        >
          {/* Warning Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name="warning" size={40} color="#F59E0B" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Account Warning</Text>

          {/* Message */}
          <Text style={styles.message}>
            Your account has received {warningCount} warning{warningCount > 1 ? 's' : ''}.
            Please review our community guidelines to avoid further action.
          </Text>

          {/* Warning level indicator */}
          <View style={styles.warningLevel}>
            {[1, 2, 3].map((level) => (
              <View
                key={level}
                style={[
                  styles.warningDot,
                  level <= warningCount ? styles.warningDotActive : styles.warningDotInactive,
                ]}
              />
            ))}
          </View>
          <Text style={styles.warningLevelText}>
            {warningCount >= 3 ? 'Final warning - next violation may result in suspension' : `${3 - warningCount} warning${3 - warningCount !== 1 ? 's' : ''} until suspension`}
          </Text>

          {/* Dismiss Button */}
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
            activeOpacity={0.8}
          >
            <Text style={styles.dismissButtonText}>I Understand</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  popup: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 24,
    marginHorizontal: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#D1D5DB',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  warningLevel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 8,
  },
  warningDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  warningDotActive: {
    backgroundColor: '#F59E0B',
  },
  warningDotInactive: {
    backgroundColor: '#374151',
  },
  warningLevelText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  dismissButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
  },
  dismissButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
