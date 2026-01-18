import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Crown, Check, ChevronLeft } from 'lucide-react-native';
import { useSubscription } from '@/lib/useSubscription';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';

interface PaywallOverlayProps {
  requiredTier: 'mover' | 'crusher';
  feature: string;
  children: React.ReactNode;
}

/**
 * PaywallOverlay Component
 * 
 * Wraps content and shows a paywall overlay if user doesn't have the required subscription tier.
 * Matches the styling of ProPaywall component.
 * 
 * @param requiredTier - Minimum tier required ('mover' or 'crusher')
 * @param feature - Name of the feature being gated (e.g., "Activity Details")
 * @param children - Content to wrap
 */
export function PaywallOverlay({ requiredTier, feature, children }: PaywallOverlayProps) {
  const { tier, canAccessAnalytics } = useSubscription();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  
  const purchasePackage = useSubscriptionStore((s) => s.purchasePackage);
  const restore = useSubscriptionStore((s) => s.restore);
  const loadOfferings = useSubscriptionStore((s) => s.loadOfferings);
  const packages = useSubscriptionStore((s) => s.packages);

  // Check if user has access
  // For 'mover' tier requirement, user needs mover or crusher
  // For 'crusher' tier requirement, user needs crusher
  const hasAccess = requiredTier === 'mover' 
    ? canAccessAnalytics() // mover or crusher
    : tier === 'crusher'; // only crusher

  if (hasAccess) {
    return <>{children}</>;
  }

  // Determine tier name and package ID
  const tierName = requiredTier === 'mover' ? 'Mover' : 'Crusher';
  const packageId = requiredTier === 'mover' ? 'mover_monthly' : 'crusher_monthly';
  const recommendedPackage = packages[packageId];
  const price = recommendedPackage?.product.priceString ?? (requiredTier === 'mover' ? '$4.99' : '$9.99');

  const handlePurchase = async () => {
    if (!recommendedPackage) {
      loadOfferings();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);
    try {
      const result = await purchasePackage(packageId);
      setIsPurchasing(false);

      if (result === true) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (result !== 'cancelled') {
        // Only show error if not cancelled
      }
    } catch (error) {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    await restore();
    setIsRestoring(false);
  };

  return (
    <View style={styles.container}>
      {children}
      <View style={styles.overlay}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        
        {/* Back button - always visible */}
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { top: insets.top + 8 }]}
        >
          <View style={styles.backButtonContainer}>
            <ChevronLeft size={24} color="white" />
          </View>
        </Pressable>
        
        {/* "PAID FEATURE" badge */}
        <Animated.View
          entering={FadeInDown.duration(600)}
          style={styles.badgeContainer}
        >
          <View style={styles.badge}>
            <Crown size={18} color="#FFD700" />
            <Text style={styles.badgeText}>PAID FEATURE</Text>
          </View>
        </Animated.View>

        {/* Main content card */}
        <Animated.View
          entering={FadeInUp.duration(600).delay(100)}
          style={styles.cardContainer}
        >
          <BlurView
            intensity={80}
            tint="dark"
            style={styles.cardBlur}
          >
            <View style={styles.card}>
              {/* Title */}
              <View style={styles.titleContainer}>
                <Text style={styles.title}>Unlock {feature}</Text>
              </View>

              <View style={styles.descriptionContainer}>
                <Text style={styles.description}>
                  Upgrade to {tierName} to access this feature
                </Text>
              </View>

              {/* Pricing */}
              <View style={styles.pricingContainer}>
                <View style={styles.pricingRow}>
                  <Text style={styles.price}>{price}</Text>
                  <Text style={styles.pricePeriod}>/month</Text>
                </View>
              </View>

              {/* Subscribe Button */}
              <Pressable
                onPress={handlePurchase}
                disabled={isPurchasing}
                style={[styles.button, isPurchasing && styles.buttonDisabled]}
              >
                <LinearGradient
                  colors={['#FFD700', '#FFA500', '#FF8C00']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  {isPurchasing ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Check size={20} color="#000" strokeWidth={3} />
                      <Text style={styles.buttonText}>Upgrade to {tierName}</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              {/* Restore */}
              <Pressable onPress={handleRestore} disabled={isRestoring} style={styles.restoreButton}>
                {isRestoring ? (
                  <ActivityIndicator size="small" color="#9ca3af" />
                ) : (
                  <Text style={styles.restoreText}>Restore Purchase</Text>
                )}
              </Pressable>
            </View>
          </BlurView>
        </Animated.View>

        {/* Legal */}
        <Animated.View entering={FadeInUp.delay(400)} style={styles.legalContainer}>
          <Text style={styles.legalText}>
            Payment charged to App Store account. Subscription auto-renews unless cancelled 24 hours before period ends.
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    paddingHorizontal: 20,
    paddingTop: 60, // Leave space for back button
  },
  badgeContainer: {
    marginBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  badgeText: {
    color: '#FFD700',
    fontWeight: '600',
    fontSize: 12,
    marginLeft: 8,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 400,
  },
  cardBlur: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  card: {
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 24,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  descriptionContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  description: {
    color: 'rgba(156, 163, 175, 1)',
    fontSize: 14,
    textAlign: 'center',
  },
  pricingContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  pricePeriod: {
    color: 'rgba(156, 163, 175, 1)',
    fontSize: 16,
    marginLeft: 4,
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreText: {
    color: 'rgba(156, 163, 175, 1)',
    fontSize: 12,
    textAlign: 'center',
  },
  legalContainer: {
    marginTop: 16,
    paddingHorizontal: 32,
  },
  legalText: {
    color: 'rgba(107, 114, 128, 1)',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 16,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 1001,
  },
  backButtonContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
