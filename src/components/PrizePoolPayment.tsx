// components/PrizePoolPayment.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlatformPay } from '@stripe/stripe-react-native';
import { usePrizePoolPayment } from '@/lib/use-prize-pool-payment';
import { useThemeColors } from '@/lib/useThemeColors';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { Check, Trophy } from 'lucide-react-native';

interface Props {
  competitionId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const PRESET_AMOUNTS = [10, 25, 50, 100];

const PAYOUT_STRUCTURES = [
  { label: 'Winner takes all', value: { first: 100 } },
  { label: '1st: 70% / 2nd: 30%', value: { first: 70, second: 30 } },
  { label: '1st: 50% / 2nd: 30% / 3rd: 20%', value: { first: 50, second: 30, third: 20 } },
];

export const PrizePoolPayment: React.FC<Props> = ({
  competitionId,
  onSuccess,
  onCancel,
}) => {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [amount, setAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState('');
  const [structure, setStructure] = useState(PAYOUT_STRUCTURES[0].value);
  const [canUsePlatformPay, setCanUsePlatformPay] = useState(false);

  const { isPlatformPaySupported } = usePlatformPay();
  const { payWithApplePay, payWithCard, loading } = usePrizePoolPayment();

  useEffect(() => {
    const checkPlatformPay = async () => {
      try {
        const supported = await isPlatformPaySupported();
        setCanUsePlatformPay(supported);
      } catch {
        setCanUsePlatformPay(false);
      }
    };
    checkPlatformPay();
  }, [isPlatformPaySupported]);

  const effectiveAmount = customAmount ? parseFloat(customAmount) : amount;
  const stripeFee = effectiveAmount * 0.029 + 0.30;
  const totalCharge = effectiveAmount + stripeFee;

  const handlePayment = async () => {
    if (effectiveAmount < 5 || effectiveAmount > 500) {
      Alert.alert('Invalid Amount', 'Prize must be between $5 and $500');
      return;
    }

    if (isNaN(effectiveAmount)) {
      Alert.alert('Invalid Amount', 'Please enter a valid number');
      return;
    }

    const paymentFn = canUsePlatformPay ? payWithApplePay : payWithCard;

    const result = await paymentFn({
      competitionId,
      prizeAmount: effectiveAmount,
      payoutStructure: structure,
    });

    if (result.success) {
      Alert.alert(
        'Prize Pool Added!',
        `Your $${effectiveAmount} prize pool is now active. The winner will receive their reward automatically when the competition ends.`,
        [{ text: 'Awesome!', onPress: onSuccess }]
      );
    } else if (result.cancelled) {
      // User cancelled, do nothing
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Overscroll background */}
        <View
          style={{
            position: 'absolute',
            top: -1000,
            left: 0,
            right: 0,
            height: 1000,
            backgroundColor: colors.isDark ? '#1C1C1E' : '#E0F2FE',
          }}
        />

        {/* Header */}
        <LinearGradient
          colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#E0F2FE', colors.bg]}
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            paddingBottom: 20,
          }}
        >
          <View className="mb-4">
            <LiquidGlassBackButton onPress={onCancel} />
          </View>
          <Text className="text-black dark:text-white text-3xl font-bold">Add Prize Pool</Text>
          <Text className="text-gray-500 dark:text-gray-400 text-base mt-1">
            Make it exciting with real rewards
          </Text>
        </LinearGradient>

        {/* Prize Amount */}
        <View className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">Prize Amount</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {PRESET_AMOUNTS.map((preset) => {
              const isSelected = amount === preset && !customAmount;
              return (
                <Pressable
                  key={preset}
                  onPress={() => {
                    setAmount(preset);
                    setCustomAmount('');
                  }}
                  className="active:opacity-80"
                  style={{ flex: 1 }}
                >
                  {isSelected ? (
                    <LinearGradient
                      colors={['#FA114F', '#D10040']}
                      style={{ borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
                    >
                      <Text className="text-white font-semibold text-base">${preset}</Text>
                    </LinearGradient>
                  ) : (
                    <View
                      style={{ backgroundColor: colors.card, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
                    >
                      <Text className="text-black dark:text-white font-semibold text-base">${preset}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Custom Amount */}
          <View
            style={{ backgroundColor: colors.card, minHeight: 56, marginTop: 12 }}
            className="rounded-2xl px-4 justify-center"
          >
            <TextInput
              value={customAmount}
              onChangeText={setCustomAmount}
              placeholder="Custom amount ($5 - $500)"
              placeholderTextColor={colors.isDark ? '#6b7280' : '#9ca3af'}
              keyboardType="decimal-pad"
              style={{
                color: colors.text,
                fontSize: 16,
                lineHeight: 20,
                paddingTop: 14,
                paddingBottom: 14,
              }}
            />
          </View>
        </View>

        {/* Payout Structure */}
        <View className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">Prize Distribution</Text>
          <View style={{ gap: 8 }}>
            {PAYOUT_STRUCTURES.map((option) => {
              const isSelected = JSON.stringify(structure) === JSON.stringify(option.value);
              return (
                <Pressable
                  key={option.label}
                  onPress={() => setStructure(option.value)}
                  className="active:opacity-80"
                >
                  <View
                    className="rounded-2xl p-4 flex-row items-center justify-between"
                    style={{
                      backgroundColor: isSelected
                        ? (colors.isDark ? 'rgba(250,17,79,0.15)' : 'rgba(250,17,79,0.08)')
                        : colors.card,
                      borderWidth: isSelected ? 1 : 0,
                      borderColor: isSelected ? 'rgba(250,17,79,0.4)' : 'transparent',
                    }}
                  >
                    <Text className="text-black dark:text-white" style={{ fontSize: 15 }}>
                      {option.label}
                    </Text>
                    {isSelected && (
                      <View
                        className="w-6 h-6 rounded-full items-center justify-center"
                        style={{ backgroundColor: '#FA114F' }}
                      >
                        <Check size={14} color="white" strokeWidth={3} />
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Summary */}
        <View className="px-5 mb-6">
          <Text className="text-black dark:text-white text-lg font-semibold mb-3">Summary</Text>
          <View
            style={{
              backgroundColor: colors.isDark ? 'rgba(255,193,7,0.1)' : 'rgba(255,193,7,0.15)',
              borderWidth: 1,
              borderColor: colors.isDark ? 'rgba(255,193,7,0.2)' : 'rgba(255,193,7,0.3)',
            }}
            className="rounded-2xl p-4"
          >
            <View className="flex-row items-center mb-3">
              <View
                style={{ backgroundColor: '#FFC10720' }}
                className="w-10 h-10 rounded-full items-center justify-center"
              >
                <Trophy size={20} color="#FFC107" />
              </View>
              <Text className="text-black dark:text-white text-lg font-bold ml-3">
                ${effectiveAmount.toFixed(2)} Prize
              </Text>
            </View>

            <View className="flex-row justify-between mb-2">
              <Text className="text-gray-600 dark:text-gray-400">Prize Amount</Text>
              <Text className="text-black dark:text-white">${effectiveAmount.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-gray-600 dark:text-gray-400">Processing Fee</Text>
              <Text className="text-gray-500 dark:text-gray-400">${stripeFee.toFixed(2)}</Text>
            </View>
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.isDark ? 'rgba(255,193,7,0.2)' : 'rgba(255,193,7,0.3)',
                paddingTop: 10,
                marginTop: 6,
              }}
              className="flex-row justify-between items-center"
            >
              <Text className="text-black dark:text-white font-bold">Total to Pay</Text>
              <Text className="text-amber-600 dark:text-amber-400 font-bold text-lg">
                ${totalCharge.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Winner notice */}
          <View className="flex-row items-center justify-center mt-3" style={{ gap: 6 }}>
            <Check size={16} color="#34C759" strokeWidth={3} />
            <Text style={{ color: '#34C759', fontWeight: '500', fontSize: 13 }}>
              {Object.keys(structure).length > 1 ? 'Winners receive' : 'Winner receives'} the full ${effectiveAmount.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Payment Button */}
        <View className="px-5 mb-4">
          <Pressable
            onPress={handlePayment}
            disabled={loading}
            className="active:opacity-80"
          >
            <LinearGradient
              colors={
                !loading
                  ? ['#FFC107', '#FF9800']
                  : colors.isDark
                  ? ['#3a3a3c', '#2a2a2c']
                  : ['#d1d5db', '#9ca3af']
              }
              style={{ borderRadius: 16, padding: 18, alignItems: 'center' }}
            >
              {loading ? (
                <View className="flex-row items-center">
                  <ActivityIndicator color="white" size="small" />
                  <Text className="text-white text-lg font-semibold ml-2">Processing...</Text>
                </View>
              ) : (
                <Text className="text-white text-lg font-semibold">
                  {`Add $${effectiveAmount.toFixed(0)} Prize Pool · $${totalCharge.toFixed(2)}`}
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        {/* Cancel */}
        <View className="px-5" style={{ paddingBottom: insets.bottom + 16 }}>
          <Pressable onPress={onCancel} className="active:opacity-60" style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text className="text-gray-500 dark:text-gray-400 text-base">Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};

export default PrizePoolPayment;
