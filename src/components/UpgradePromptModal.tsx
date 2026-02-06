/**
 * UpgradePromptModal
 *
 * Modal shown when a trial expires, prompting the user to upgrade.
 * Displays what features they'll lose and offers upgrade options.
 */

import React, { useState } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Zap,
  Sparkles,
  Crown,
  Check,
  ChevronRight,
  Clock,
  LayoutGrid,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { useThemeColors } from '@/lib/useThemeColors';
import { FeatureComparisonModal } from './FeatureComparisonModal';
import type { TrialRewardType } from '@/lib/trial-rewards';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// TYPES
// ============================================================================

interface UpgradePromptModalProps {
  visible: boolean;
  expiredTrialType: TrialRewardType;
  onUpgrade: () => void;
  onDismiss: () => void;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface TierConfig {
  icon: React.ComponentType<any>;
  name: string;
  tagline: string;
  gradient: [string, string];
  features: string[];
  price: string;
  tier: 'mover' | 'coach' | 'crusher';
}

const TIER_CONFIG: Record<TrialRewardType, TierConfig> = {
  trial_mover: {
    icon: Zap,
    name: 'Mover',
    tagline: 'Unlimited competitions',
    gradient: ['#FF6B35', '#FF8F5C'],
    features: [
      'Unlimited active competitions',
      'Extended competition history',
      'Priority support',
    ],
    price: '$4.99/mo',
    tier: 'mover',
  },
  trial_coach: {
    icon: Sparkles,
    name: 'Coach Spark',
    tagline: 'AI-powered coaching',
    gradient: ['#9B59B6', '#B07CC6'],
    features: [
      'Everything in Mover',
      'AI Coach conversations',
      'Personalized insights',
      'Advanced analytics',
    ],
    price: '$9.99/mo',
    tier: 'coach',
  },
  trial_crusher: {
    icon: Crown,
    name: 'Crusher',
    tagline: 'Ultimate fitness toolkit',
    gradient: ['#E74C3C', '#EC7063'],
    features: [
      'Everything in Coach Spark',
      'Unlimited AI messages',
      'Priority competition matching',
      'Exclusive achievements',
    ],
    price: '$14.99/mo',
    tier: 'crusher',
  },
};

// ============================================================================
// FEATURE ROW COMPONENT
// ============================================================================

interface FeatureRowProps {
  feature: string;
  colors: ReturnType<typeof useThemeColors>;
}

function FeatureRow({ feature, colors }: FeatureRowProps) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.checkContainer}>
        <Check size={14} color="#10B981" strokeWidth={3} />
      </View>
      <Text
        style={[
          styles.featureText,
          { color: colors.isDark ? '#E5E7EB' : '#374151' },
        ]}
      >
        {feature}
      </Text>
    </View>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function UpgradePromptModal({
  visible,
  expiredTrialType,
  onUpgrade,
  onDismiss,
}: UpgradePromptModalProps) {
  const colors = useThemeColors();
  const [showCompareModal, setShowCompareModal] = useState(false);
  const config = TIER_CONFIG[expiredTrialType];
  const IconComponent = config.icon;

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onUpgrade();
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.overlay}
      >
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />

        <Animated.View
          entering={SlideInDown.springify().damping(20)}
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.isDark
                ? 'rgba(28, 28, 30, 0.95)'
                : 'rgba(255, 255, 255, 0.98)',
            },
          ]}
        >
          {/* Close button */}
          <Pressable
            onPress={handleDismiss}
            style={[
              styles.closeButton,
              {
                backgroundColor: colors.isDark
                  ? 'rgba(255, 255, 255, 0.1)'
                  : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <X size={20} color={colors.isDark ? '#9CA3AF' : '#6B7280'} />
          </Pressable>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header with icon */}
            <View style={styles.header}>
              <View style={styles.expiredBadge}>
                <Clock size={14} color="#F59E0B" />
                <Text style={styles.expiredText} className="font-medium">
                  Trial Ended
                </Text>
              </View>

              <LinearGradient
                colors={config.gradient}
                style={styles.iconCircle}
              >
                <IconComponent size={32} color="#FFFFFF" />
              </LinearGradient>

              <Text
                style={[
                  styles.title,
                  { color: colors.isDark ? '#FFFFFF' : '#111827' },
                ]}
                className="font-bold"
              >
                Your {config.name} Trial Has Ended
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  { color: colors.isDark ? '#9CA3AF' : '#6B7280' },
                ]}
              >
                Upgrade now to keep {config.tagline.toLowerCase()} and all the
                features you've been enjoying.
              </Text>
            </View>

            {/* Features card */}
            <View
              style={[
                styles.featuresCard,
                {
                  backgroundColor: colors.isDark
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'rgba(0, 0, 0, 0.03)',
                  borderColor: colors.isDark
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.05)',
                },
              ]}
            >
              <View style={styles.featuresHeader}>
                <Text
                  style={[
                    styles.featuresTitle,
                    { color: colors.isDark ? '#FFFFFF' : '#111827' },
                  ]}
                  className="font-semibold"
                >
                  {config.name} includes:
                </Text>
                <View
                  style={[
                    styles.priceBadge,
                    { backgroundColor: config.gradient[0] + '20' },
                  ]}
                >
                  <Text
                    style={[styles.priceText, { color: config.gradient[0] }]}
                    className="font-semibold"
                  >
                    {config.price}
                  </Text>
                </View>
              </View>

              {config.features.map((feature, index) => (
                <FeatureRow key={index} feature={feature} colors={colors} />
              ))}
            </View>

            {/* Upgrade button */}
            <Pressable onPress={handleUpgrade}>
              <LinearGradient
                colors={config.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.upgradeButton}
              >
                <Text style={styles.upgradeButtonText} className="font-semibold">
                  Upgrade to {config.name}
                </Text>
                <ChevronRight size={20} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>

            {/* Maybe later link */}
            <Pressable onPress={handleDismiss} style={styles.maybeLaterButton}>
              <Text
                style={[
                  styles.maybeLaterText,
                  { color: colors.isDark ? '#9CA3AF' : '#6B7280' },
                ]}
              >
                Maybe later
              </Text>
            </Pressable>

            {/* Compare all plans link */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowCompareModal(true);
              }}
              style={styles.comparePlansButton}
            >
              <LayoutGrid size={14} color={colors.isDark ? '#818cf8' : '#6366f1'} />
              <Text
                style={[
                  styles.comparePlansText,
                  { color: colors.isDark ? '#818cf8' : '#6366f1' },
                ]}
              >
                Compare all plans
              </Text>
            </Pressable>
          </ScrollView>
        </Animated.View>

        {/* Feature Comparison Modal */}
        <FeatureComparisonModal
          visible={showCompareModal}
          onClose={() => setShowCompareModal(false)}
        />
      </Animated.View>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '85%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 16,
    paddingBottom: 40,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 24,
  },
  expiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 20,
  },
  expiredText: {
    fontSize: 13,
    color: '#F59E0B',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  featuresCard: {
    marginTop: 24,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  featuresHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  featuresTitle: {
    fontSize: 15,
  },
  priceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priceText: {
    fontSize: 13,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkContainer: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 24,
    gap: 8,
  },
  upgradeButtonText: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  maybeLaterButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  maybeLaterText: {
    fontSize: 15,
  },
  comparePlansButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  comparePlansText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

export default UpgradePromptModal;
