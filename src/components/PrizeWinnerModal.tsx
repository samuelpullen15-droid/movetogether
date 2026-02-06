// components/PrizeWinnerModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Modal,
  Pressable,
  Animated,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trophy, Gift, Mail, ExternalLink } from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';
import * as Haptics from 'expo-haptics';
import { Confetti } from '@/components/Confetti';


export interface PrizeWin {
  id: string;
  competitionId: string;
  competitionName: string;
  placement: number;
  payoutAmount: number;
  status: 'pending' | 'processing' | 'executed' | 'delivered' | 'failed';
  claimStatus: 'unclaimed' | 'claimed' | 'expired';
}

interface Props {
  visible: boolean;
  prizeWin: PrizeWin | null;
  onClose: () => void;
  onClaim: (payoutId: string) => Promise<boolean>;
  onViewDetails?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const getPlacementText = (placement: number): string => {
  switch (placement) {
    case 1: return '1st Place';
    case 2: return '2nd Place';
    case 3: return '3rd Place';
    default: return `${placement}th Place`;
  }
};

export const PrizeWinnerModal: React.FC<Props> = ({
  visible,
  prizeWin,
  onClose,
  onClaim,
  onViewDetails,
}) => {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  // Animation values - start at full visibility for reliability
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const trophyBounce = useRef(new Animated.Value(0)).current;

  // Reset state when prizeWin changes
  useEffect(() => {
    if (prizeWin) {
      setClaimed(prizeWin.claimStatus === 'claimed');
      setIsClaiming(false);
    }
  }, [prizeWin?.id]);

  // Handle animations when modal visibility changes
  useEffect(() => {
    if (visible) {
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Set to visible immediately
      scaleAnim.setValue(1);
      opacityAnim.setValue(1);
      trophyBounce.setValue(0);

      // Confetti animation
      Animated.timing(confettiAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }).start();
    } else {
      // Reset animations when closing
      confettiAnim.setValue(0);
      trophyBounce.setValue(0);
    }
  }, [visible]);

  const handleClaimPrize = async () => {
    if (!prizeWin) {
      return;
    }

    setIsClaiming(true);
    try {
      const success = await onClaim(prizeWin.id);
      if (success) {
        setClaimed(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Error', 'Failed to claim prize. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsClaiming(false);
    }
  };

  if (!prizeWin) return null;

  const isFirstPlace = prizeWin.placement === 1;
  const isUnclaimed = prizeWin.claimStatus === 'unclaimed' && !claimed;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
        {/* Full confetti animation */}
        <Confetti count={60} />

        {/* Animated confetti/sparkles background */}
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: confettiAnim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, 1, 0.3],
            }),
          }}
        >
          {[...Array(20)].map((_, i) => (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: isFirstPlace ? '#FFD700' : '#C0C0C0',
                opacity: confettiAnim.interpolate({
                  inputRange: [0, 0.3, 0.7, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [{
                  translateY: confettiAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 100 + Math.random() * 200],
                  }),
                }],
              }}
            />
          ))}
        </Animated.View>

        <Animated.View
          style={{
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
            width: SCREEN_WIDTH - 48,
            maxWidth: 380,
            maxHeight: '90%',
          }}
        >
          <LinearGradient
            colors={isFirstPlace
              ? ['#FFD700', '#FFA500', '#FF8C00']
              : prizeWin.placement === 2
                ? ['#C0C0C0', '#A8A8A8', '#909090']
                : ['#CD7F32', '#B87333', '#A0522D']
            }
            style={{
              borderRadius: 24,
              padding: 2,
            }}
          >
            <View
              style={{ backgroundColor: colors.card }}
              className="rounded-3xl overflow-hidden"
            >
              {/* Trophy Header - Compact */}
              <LinearGradient
                colors={isFirstPlace
                  ? ['rgba(255,215,0,0.3)', 'rgba(255,165,0,0.1)']
                  : ['rgba(192,192,192,0.3)', 'rgba(160,160,160,0.1)']
                }
                style={{
                  width: '100%',
                  paddingTop: 16,
                  paddingBottom: 12,
                  paddingHorizontal: 20,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Animated.View
                    style={{
                      transform: [{ translateY: trophyBounce }],
                    }}
                  >
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isFirstPlace ? '#FFD700' : prizeWin.placement === 2 ? '#C0C0C0' : '#CD7F32',
                        shadowColor: isFirstPlace ? '#FFD700' : '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.4,
                        shadowRadius: 8,
                        elevation: 6,
                      }}
                    >
                      <Trophy size={28} color="white" strokeWidth={2} />
                    </View>
                  </Animated.View>

                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text
                      className="text-xl font-extrabold"
                      style={{
                        color: isFirstPlace ? '#B8860B' : colors.isDark ? '#fff' : '#333'
                      }}
                    >
                      {getPlacementText(prizeWin.placement)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        marginTop: 2,
                        color: colors.isDark ? '#d1d5db' : '#4b5563'
                      }}
                      numberOfLines={1}
                    >
                      {prizeWin.competitionName}
                    </Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Prize Amount */}
              <View className="items-center py-3 px-5">
                <Text className="text-gray-500 dark:text-gray-400 text-sm">
                  {isUnclaimed ? 'You won' : 'Prize claimed'}
                </Text>
                <Text
                  className="text-3xl font-bold"
                  style={{ color: '#22C55E' }}
                >
                  ${prizeWin.payoutAmount.toFixed(2)}
                </Text>
              </View>

              {/* Unclaimed: Show claim button */}
              {isUnclaimed && (
                <View className="px-5 pb-4">
                  <View
                    className="rounded-2xl p-3 mb-3"
                    style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}
                  >
                    <View className="flex-row items-center">
                      <View className="w-9 h-9 rounded-full bg-blue-500/20 items-center justify-center mr-3">
                        <Mail size={18} color="#3B82F6" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-black dark:text-white font-semibold text-sm">
                          We'll send you an email
                        </Text>
                        <Text className="text-gray-500 dark:text-gray-400 text-xs">
                          Choose Visa, PayPal, Venmo, or Cash App
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Claim Button */}
                  <Pressable
                    onPress={handleClaimPrize}
                    disabled={isClaiming}
                    className="active:opacity-80"
                  >
                    <LinearGradient
                      colors={!isClaiming
                        ? ['#FFD700', '#FFA500']
                        : colors.isDark ? ['#3a3a3c', '#2a2a2c'] : ['#d1d5db', '#9ca3af']
                      }
                      style={{ borderRadius: 14, padding: 12, alignItems: 'center' }}
                    >
                      {isClaiming ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="text-white text-base font-semibold">
                          Claim My Prize
                        </Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                </View>
              )}

              {/* Claimed: Show confirmation */}
              {!isUnclaimed && (
                <View className="px-5 pb-4">
                  <View
                    className="rounded-2xl p-3 mb-3"
                    style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}
                  >
                    <View className="flex-row items-center mb-2">
                      <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: 'rgba(255,215,0,0.2)' }}>
                        <Gift size={18} color="#FFD700" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-black dark:text-white font-semibold text-sm">
                          Prize Claimed
                        </Text>
                        <Text className="text-gray-500 dark:text-gray-400 text-xs">
                          Visa, PayPal, Venmo, or Cash App
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center">
                      <View className="w-9 h-9 rounded-full bg-blue-500/20 items-center justify-center mr-3">
                        <Mail size={18} color="#3B82F6" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-black dark:text-white font-semibold text-sm">
                          Check your email!
                        </Text>
                        <Text className="text-gray-500 dark:text-gray-400 text-xs">
                          Select your reward in the email
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Pressable
                    onPress={onClose}
                    className="active:opacity-80"
                  >
                    <LinearGradient
                      colors={['#FFD700', '#FFA500']}
                      style={{ borderRadius: 14, padding: 14, alignItems: 'center' }}
                    >
                      <Text className="text-white text-base font-semibold">
                        Awesome!
                      </Text>
                    </LinearGradient>
                  </Pressable>

                  {onViewDetails && (
                    <Pressable
                      onPress={onViewDetails}
                      className="mt-2 p-2 flex-row items-center justify-center"
                    >
                      <Text className="text-blue-500 font-medium text-sm mr-1">View Competition</Text>
                      <ExternalLink size={14} color="#3B82F6" />
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default PrizeWinnerModal;
