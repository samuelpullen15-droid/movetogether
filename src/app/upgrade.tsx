import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useSubscription } from '@/lib/useSubscription';
import {
  ChevronLeft,
  Check,
  X,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useState, useEffect } from 'react';
import * as Haptics from 'expo-haptics';

interface TierFeature {
  text: string;
}

interface Tier {
  id: 'starter' | 'mover' | 'crusher';
  name: string;
  price: {
    monthly: string;
    annual: string;
  };
  description: string;
  features: TierFeature[];
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: {
      monthly: 'Free',
      annual: 'Free',
    },
    description: 'Perfect for getting started',
    features: [
      { text: 'Join up to 2 competitions' },
      { text: 'Basic activity tracking' },
      { text: 'Connect Apple Health / devices' },
      { text: 'View leaderboards' },
    ],
  },
  {
    id: 'mover',
    name: 'Mover',
    price: {
      monthly: '$4.99',
      annual: '$49.99',
    },
    description: 'For serious competitors',
    features: [
      { text: 'Unlimited competitions' },
      { text: 'Advanced analytics' },
      { text: 'Competition group chat' },
      { text: 'Activity history & achievements' },
      { text: 'Priority support' },
    ],
    highlight: true,
  },
  {
    id: 'crusher',
    name: 'Crusher',
    price: {
      monthly: '$9.99',
      annual: '$99.99',
    },
    description: 'Everything you need to dominate',
    features: [
      { text: 'Everything in Mover' },
      { text: 'AI Coach (personalized workouts)' },
      { text: 'Goal recommendations' },
      { text: 'Motivational check-ins' },
    ],
  },
];


function TierCard({ tier, isCurrentTier, currentTier, onSelect, isLoading }: { 
  tier: Tier; 
  isCurrentTier: boolean;
  currentTier: 'starter' | 'mover' | 'crusher';
  onSelect: (tierId: string, period: 'monthly' | 'annual') => void;
  isLoading: boolean;
}) {
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [containerWidth, setContainerWidth] = useState(0);
  const containerWidthShared = useSharedValue(0);
  const { packages } = useSubscriptionStore();
  const slidePosition = useSharedValue(0); // 0 for monthly, 1 for annual
  
  useEffect(() => {
    slidePosition.value = withSpring(selectedPeriod === 'annual' ? 1 : 0, {
      damping: 25, // Increased damping to reduce overshoot
      stiffness: 300,
      overshootClamping: true, // Prevent overshooting the target
    });
  }, [selectedPeriod]);
  
  useEffect(() => {
    containerWidthShared.value = containerWidth;
  }, [containerWidth]);
  
  const animatedIndicatorStyle = useAnimatedStyle(() => {
    'worklet';
    // Both buttons are equal width with flex-1, separated by gap: 3
    // The indicator is 50% wide, positioned at left: 6 (padding)
    // Container has padding of 6px on each side (p-1.5 = 6px), and overflow: hidden
    // To move from Monthly to Annual: move by one button width + gap
    // But we need to prevent the indicator from extending beyond the right padding
    // Calculate using measured container width for accuracy
    if (containerWidthShared.value > 0) {
      const gap = 3;
      const padding = 6; // Container padding (p-1.5 = 6px)
      // Available width for buttons (excluding padding)
      const availableWidth = containerWidthShared.value - (padding * 2);
      // With flex-1 and gap, each button takes: (availableWidth - gap) / 2
      const buttonWidth = (availableWidth - gap) / 2;
      const indicatorWidth = containerWidthShared.value * 0.5; // Indicator is 50% of container
      // Move distance = button width + gap
      const moveDistance = buttonWidth + gap;
      // translateX percentage relative to indicator's own width (50% of container)
      let translatePercent = (moveDistance / indicatorWidth) * 100;
      // Reduce slightly to ensure indicator doesn't extend beyond right padding
      // Subtract a small buffer (about 2-3% of indicator width) to prevent cutoff
      const bufferPercent = 2.5; // Small buffer to prevent right-side cutoff
      translatePercent = translatePercent - bufferPercent;
      
      // Clamp slidePosition to [0, 1] to prevent spring animation overshoot from causing cutoff
      // During spring animation, the value might temporarily exceed bounds
      const clampedSlidePosition = Math.max(0, Math.min(1, slidePosition.value));
      const finalTranslate = clampedSlidePosition * translatePercent;
      
      return {
        transform: [{ translateX: finalTranslate + '%' }],
      };
    }
    // Fallback: use a conservative value to prevent cutoff
    // For typical container, this should be around 98-99%
    // Clamp slidePosition to prevent overshoot
    const clampedSlidePosition = Math.max(0, Math.min(1, slidePosition.value));
    return {
      transform: [{ translateX: clampedSlidePosition * 98 + '%' }],
    };
  });

  const getPackage = () => {
    if (tier.id === 'starter') return null;
    const packageId = `${tier.id}_${selectedPeriod}` as 'mover_monthly' | 'mover_annual' | 'crusher_monthly' | 'crusher_annual';
    return packages[packageId];
  };

  const packageToPurchase = getPackage();
  const price = packageToPurchase?.product.priceString || tier.price[selectedPeriod];

  // Tier-specific badge colors and gradient colors
  const tierConfig = {
    starter: { 
      bg: '#6b7280', 
      text: 'Free',
      gradient: ['#1a2a2e', '#1C1C1E', '#0D0D0D'],
      borderColor: '#6b728040',
      glowColor: '#6b728060',
    },
    mover: { 
      bg: '#3b82f6', 
      text: 'Popular',
      gradient: ['#1a2a3a', '#1C1C1E', '#0D0D0D'],
      borderColor: '#3b82f640',
      glowColor: '#3b82f660',
    },
    crusher: { 
      bg: '#8b5cf6', 
      text: 'Premium',
      gradient: ['#2a1a2e', '#1C1C1E', '#0D0D0D'],
      borderColor: '#8b5cf640',
      glowColor: '#8b5cf660',
    },
  };
  const config = tierConfig[tier.id];

  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(tier.id === 'starter' ? 100 : tier.id === 'mover' ? 200 : 300)}
      className="mb-4"
      style={{
        shadowColor: config.glowColor,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 20,
        elevation: 10,
      }}
    >
      <Pressable
        onPress={() => tier.id !== 'starter' && !isCurrentTier && !isLoading && packageToPurchase && onSelect(tier.id, selectedPeriod)}
        disabled={tier.id === 'starter' || isCurrentTier || isLoading || !packageToPurchase}
        className="active:opacity-80"
      >
        <LinearGradient
          colors={config.gradient}
          style={{ 
            borderRadius: 20, 
            padding: 20,
            borderWidth: 1.5,
            borderColor: config.borderColor,
          }}
        >
          {/* Header */}
          <View className="flex-row justify-between items-start mb-4">
            <View className="flex-1">
              <View className="flex-row items-center mb-2">
                <View
                  className="px-2 py-1 rounded-full mr-2"
                  style={{ backgroundColor: config.bg + '30' }}
                >
                  <Text style={{ color: config.bg }} className="text-xs font-medium">
                    {config.text}
                  </Text>
                </View>
                {isCurrentTier && (
                  <View className="px-2 py-1 rounded-full bg-green-500/30">
                    <Text className="text-green-400 text-xs font-medium">CURRENT</Text>
                  </View>
                )}
              </View>
              <Text className="text-white text-xl font-bold">{tier.name}</Text>
              <Text className="text-gray-400 text-sm mt-1">{tier.description}</Text>
            </View>
            <View className="items-end">
              <Text className="text-white text-2xl font-bold">{price}</Text>
              {tier.id !== 'starter' && (
                <Text className="text-gray-500 text-xs mt-1">
                  {selectedPeriod === 'annual' ? '/year' : '/month'}
                </Text>
              )}
            </View>
          </View>

          {/* Period Selector (for paid tiers) */}
          {tier.id !== 'starter' && (
            <View className="bg-black/30 rounded-xl p-1.5 mb-4" style={{ position: 'relative', overflow: 'hidden' }}>
              <View 
                className="flex-row relative" 
                style={{ gap: 3 }}
                onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
              >
                {/* Animated background indicator */}
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      top: 2,
                      bottom: 2,
                      left: 6,
                      width: '50%',
                      borderRadius: 8,
                    },
                    animatedIndicatorStyle,
                  ]}
                >
                  <LinearGradient
                    colors={[config.bg + '40', config.bg + '20']}
                    style={{
                      flex: 1,
                      borderRadius: 8,
                    }}
                  />
                </Animated.View>
                
                {/* Monthly Button */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedPeriod('monthly');
                  }}
                  className="flex-1 py-2.5 rounded-lg relative z-10"
                >
                  <Text 
                    className={`text-center text-sm font-semibold ${selectedPeriod === 'monthly' ? 'text-white' : 'text-gray-400'}`}
                  >
                    Monthly
                  </Text>
                </Pressable>
                
                {/* Annual Button */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedPeriod('annual');
                  }}
                  className="flex-1 py-2.5 rounded-lg relative z-10"
                >
                  <View className="flex-row items-center justify-center">
                    <Text 
                      className={`text-sm font-semibold ${selectedPeriod === 'annual' ? 'text-white' : 'text-gray-400'}`}
                    >
                      Annual
                    </Text>
                    {selectedPeriod === 'annual' && (
                      <Animated.View 
                        entering={FadeInDown.duration(200)}
                        className="ml-1.5 px-1.5 py-0.5 bg-green-500/30 rounded-full"
                      >
                        <Text className="text-xs text-green-400 font-bold">Save 17%</Text>
                      </Animated.View>
                    )}
                  </View>
                </Pressable>
              </View>
            </View>
          )}

          {/* Features */}
          <View className="bg-black/30 rounded-xl p-4 mb-4">
            <Text className="text-gray-400 text-sm mb-3 font-medium">Features</Text>
            {tier.features.map((feature, index) => (
              <View
                key={index}
                className="flex-row items-center py-2"
                style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)' }}
              >
                <View className="w-8 items-center">
                  <Check size={18} color={config.bg} />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-white text-sm">{feature.text}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* CTA Button */}
          <Pressable
            onPress={() => tier.id !== 'starter' && onSelect(tier.id, selectedPeriod)}
            disabled={tier.id === 'starter' || isLoading || isCurrentTier || !packageToPurchase}
            className="active:opacity-90"
          >
            <LinearGradient
              colors={[config.gradient[0], '#1C1C1E']}
              style={{
                paddingVertical: 16,
                borderRadius: 12,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: config.borderColor,
              }}
            >
              {isLoading && tier.id !== 'starter' ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  {tier.id === 'starter'
                    ? (isCurrentTier ? 'Current Plan' : 'Downgrade to Starter')
                    : isCurrentTier 
                      ? 'Current Plan' 
                      : (tier.id === 'mover' && currentTier === 'crusher')
                        ? 'Downgrade to Mover'
                        : `Upgrade to ${tier.name}`
                  }
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function UpgradeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tier: currentTier } = useSubscription();
  const { packages, purchasePackage, loadOfferings } = useSubscriptionStore();

  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => {
    loadOfferings();
  }, []);

  const handlePurchase = async (tierId: string, period: 'monthly' | 'annual') => {
    if (tierId === 'starter') return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);

    try {
      const packageId = `${tierId}_${period}` as 'mover_monthly' | 'mover_annual' | 'crusher_monthly' | 'crusher_annual';
      const success = await purchasePackage(packageId);

      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Your subscription has been activated!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Error', 'Failed to complete purchase. Please try again.');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert('Error', 'An error occurred during purchase. Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#1a1a2e', '#0f0f1a', '#000000']}
          style={{ paddingTop: insets.top + 8, paddingBottom: 24 }}
        >
          <Animated.View
            entering={FadeInDown.duration(400)}
            className="flex-row items-center justify-center px-5"
          >
            <Pressable
              onPress={() => router.back()}
              className="absolute left-5 w-10 h-10 rounded-full bg-white/10 items-center justify-center active:bg-white/20"
            >
              <ChevronLeft size={24} color="white" />
            </Pressable>
            <Text className="text-white text-xl font-bold">Choose Your Plan</Text>
          </Animated.View>
        </LinearGradient>

        {/* Tiers */}
        <View className="px-5 mt-6">
          {TIERS.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              isCurrentTier={currentTier === tier.id}
              currentTier={currentTier}
              onSelect={handlePurchase}
              isLoading={isPurchasing}
            />
          ))}
        </View>

        {/* Legal */}
        <Animated.View
          entering={FadeInUp.duration(400).delay(500)}
          className="px-8 mt-6"
        >
          <Text className="text-gray-600 text-xs text-center leading-5">
            Payment will be charged to your App Store account. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. You can manage and cancel your subscription in your App Store account settings.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}