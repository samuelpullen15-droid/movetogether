import { View, Modal, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSubscriptionStore } from '@/lib/subscription-store';
import {
  X,
  Check,
  Minus,
  Crown,
  Users,
  Trophy,
  Sparkles,
  MessageCircle,
  BarChart3,
  Zap,
  Star,
} from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useState, useEffect } from 'react';
import * as Haptics from 'expo-haptics';

interface FeatureComparisonModalProps {
  visible: boolean;
  onClose: () => void;
}

type TierKey = 'starter' | 'mover' | 'crusher';

interface Feature {
  name: string;
  icon: React.ElementType;
  starter: boolean | string;
  mover: boolean | string;
  crusher: boolean | string;
}

const FEATURES: Feature[] = [
  {
    name: 'Activity Tracking',
    icon: Zap,
    starter: true,
    mover: true,
    crusher: true,
  },
  {
    name: 'Competitions',
    icon: Trophy,
    starter: '1 active',
    mover: 'Unlimited',
    crusher: 'Unlimited',
  },
  {
    name: 'Friends',
    icon: Users,
    starter: '5 max',
    mover: 'Unlimited',
    crusher: 'Unlimited',
  },
  {
    name: 'Social Feed',
    icon: MessageCircle,
    starter: false,
    mover: true,
    crusher: true,
  },
  {
    name: 'Activity Analytics',
    icon: BarChart3,
    starter: false,
    mover: true,
    crusher: true,
  },
  {
    name: 'AI Coach',
    icon: Sparkles,
    starter: false,
    mover: false,
    crusher: '200 msgs/mo',
  },
  {
    name: 'Group Chat',
    icon: MessageCircle,
    starter: false,
    mover: false,
    crusher: true,
  },
  {
    name: 'Premium Support',
    icon: Star,
    starter: false,
    mover: false,
    crusher: true,
  },
];

const TIERS: {
  key: TierKey;
  name: string;
  color: string;
  bgColor: string;
  price: string;
  period: string;
  packageId: string;
  popular?: boolean;
}[] = [
  {
    key: 'starter',
    name: 'Starter',
    color: '#FA114F',
    bgColor: 'rgba(250, 17, 79, 0.1)',
    price: 'Free',
    period: '',
    packageId: '',
  },
  {
    key: 'mover',
    name: 'Mover',
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    price: '$4.99',
    period: '/mo',
    packageId: 'mover_monthly',
    popular: true,
  },
  {
    key: 'crusher',
    name: 'Crusher',
    color: '#8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.1)',
    price: '$9.99',
    period: '/mo',
    packageId: 'crusher_monthly',
  },
];

function FeatureValue({
  value,
  tierColor,
  colors,
}: {
  value: boolean | string;
  tierColor: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  if (value === true) {
    return (
      <View
        className="w-6 h-6 rounded-full items-center justify-center"
        style={{ backgroundColor: `${tierColor}20` }}
      >
        <Check size={14} color={tierColor} strokeWidth={3} />
      </View>
    );
  }

  if (value === false) {
    return (
      <View
        className="w-6 h-6 rounded-full items-center justify-center"
        style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
      >
        <Minus size={14} color={colors.isDark ? '#4B5563' : '#9CA3AF'} />
      </View>
    );
  }

  return (
    <Text className="text-xs font-medium text-center" style={{ color: tierColor }}>
      {value}
    </Text>
  );
}

export function FeatureComparisonModal({ visible, onClose }: FeatureComparisonModalProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);

  const currentTier = useSubscriptionStore((s) => s.tier);
  const loadOfferings = useSubscriptionStore((s) => s.loadOfferings);
  const purchasePackage = useSubscriptionStore((s) => s.purchasePackage);
  const packages = useSubscriptionStore((s) => s.packages);

  useEffect(() => {
    if (visible) {
      loadOfferings();
    }
  }, [visible]);

  const handlePurchase = async (packageId: string, tierName: string) => {
    if (!packageId) return;

    const pkg = packages[packageId];
    if (!pkg) {
      Alert.alert('Not Available', `${tierName} package is not available right now.`);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(packageId);

    try {
      const result = await purchasePackage(packageId);
      if (result === true) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      } else if (result !== 'cancelled') {
        Alert.alert('Purchase Failed', 'Unable to complete purchase. Please try again.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      if (!errorMessage.includes('cancel')) {
        Alert.alert('Error', 'Something went wrong. Please try again.');
      }
    } finally {
      setIsPurchasing(null);
    }
  };

  const getPrice = (tier: (typeof TIERS)[0]) => {
    if (!tier.packageId) return tier.price;
    const pkg = packages[tier.packageId];
    return pkg?.product.priceString ?? tier.price;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Crown size={24} color="#FFD700" />
              <Text className="text-xl font-bold ml-2" style={{ color: colors.text }}>
                Choose Your Plan
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
            >
              <X size={18} color={colors.text} />
            </Pressable>
          </View>
          <Text className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
            Unlock more features to crush your fitness goals
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Tier Cards */}
          <View className="flex-row mt-4 gap-2">
            {TIERS.map((tier, index) => {
              const isCurrentTier = currentTier === tier.key;
              const price = getPrice(tier);

              return (
                <Animated.View
                  key={tier.key}
                  entering={FadeInUp.duration(400).delay(index * 100)}
                  className="flex-1"
                >
                  <View
                    className="rounded-2xl p-3 relative overflow-hidden"
                    style={{
                      backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
                      borderWidth: isCurrentTier ? 2 : 1,
                      borderColor: isCurrentTier
                        ? tier.color
                        : colors.isDark
                          ? 'rgba(255,255,255,0.1)'
                          : 'rgba(0,0,0,0.1)',
                    }}
                  >
                    {/* Popular Badge */}
                    {tier.popular && (
                      <View
                        className="absolute -top-0 -right-0 px-2 py-0.5 rounded-bl-lg"
                        style={{ backgroundColor: tier.color }}
                      >
                        <Text className="text-[10px] text-white font-bold">POPULAR</Text>
                      </View>
                    )}

                    {/* Current Badge */}
                    {isCurrentTier && (
                      <View
                        className="absolute top-2 left-2 px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${tier.color}20` }}
                      >
                        <Text className="text-[10px] font-bold" style={{ color: tier.color }}>
                          CURRENT
                        </Text>
                      </View>
                    )}

                    <View className={`items-center ${isCurrentTier ? 'mt-5' : 'mt-1'}`}>
                      {/* Tier Icon */}
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mb-2"
                        style={{ backgroundColor: tier.bgColor }}
                      >
                        {tier.key === 'starter' && <Zap size={20} color={tier.color} />}
                        {tier.key === 'mover' && <Trophy size={20} color={tier.color} />}
                        {tier.key === 'crusher' && <Crown size={20} color={tier.color} />}
                      </View>

                      {/* Tier Name */}
                      <Text className="font-bold text-base" style={{ color: tier.color }}>
                        {tier.name}
                      </Text>

                      {/* Price */}
                      <View className="flex-row items-baseline mt-1">
                        <Text className="text-lg font-bold" style={{ color: colors.text }}>
                          {price}
                        </Text>
                        {tier.period && (
                          <Text className="text-xs" style={{ color: colors.textSecondary }}>
                            {tier.period}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Action Button */}
                    {!isCurrentTier && tier.packageId && (
                      <Pressable
                        onPress={() => handlePurchase(tier.packageId, tier.name)}
                        disabled={!!isPurchasing}
                        className="mt-3 py-2 rounded-xl items-center"
                        style={{
                          backgroundColor: tier.color,
                          opacity: isPurchasing ? 0.6 : 1,
                        }}
                      >
                        {isPurchasing === tier.packageId ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <Text className="text-white text-xs font-bold">Upgrade</Text>
                        )}
                      </Pressable>
                    )}

                    {isCurrentTier && (
                      <View
                        className="mt-3 py-2 rounded-xl items-center"
                        style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                      >
                        <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                          Active
                        </Text>
                      </View>
                    )}

                    {tier.key === 'starter' && !isCurrentTier && (
                      <View
                        className="mt-3 py-2 rounded-xl items-center"
                        style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                      >
                        <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                          Free
                        </Text>
                      </View>
                    )}
                  </View>
                </Animated.View>
              );
            })}
          </View>

          {/* Feature Comparison Table */}
          <Animated.View entering={FadeInDown.duration(400).delay(300)} className="mt-6">
            <Text className="text-lg font-bold mb-4" style={{ color: colors.text }}>
              Feature Comparison
            </Text>

            <View
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
                borderWidth: 1,
                borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              }}
            >
              {/* Table Header */}
              <View
                className="flex-row py-3 px-4"
                style={{
                  backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                }}
              >
                <View className="flex-1">
                  <Text className="text-xs font-semibold" style={{ color: colors.textSecondary }}>
                    Feature
                  </Text>
                </View>
                {TIERS.map((tier) => (
                  <View key={tier.key} className="w-16 items-center">
                    <Text className="text-xs font-semibold" style={{ color: tier.color }}>
                      {tier.name}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Feature Rows */}
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <View
                    key={feature.name}
                    className="flex-row py-3 px-4 items-center"
                    style={{
                      borderBottomWidth: index < FEATURES.length - 1 ? 1 : 0,
                      borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                    }}
                  >
                    <View className="flex-1 flex-row items-center">
                      <Icon size={16} color={colors.textSecondary} />
                      <Text className="ml-2 text-sm" style={{ color: colors.text }}>
                        {feature.name}
                      </Text>
                    </View>
                    {TIERS.map((tier) => (
                      <View key={tier.key} className="w-16 items-center">
                        <FeatureValue
                          value={feature[tier.key]}
                          tierColor={tier.color}
                          colors={colors}
                        />
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          </Animated.View>

          {/* Legal Text */}
          <Text
            className="text-center text-[10px] mt-6 px-4 leading-4"
            style={{ color: colors.isDark ? '#4B5563' : '#9CA3AF' }}
          >
            Subscriptions are charged to your App Store account. They auto-renew unless cancelled at
            least 24 hours before the end of the current period. Manage subscriptions in Settings.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
