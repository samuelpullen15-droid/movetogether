// BuyInPaymentSheet.tsx - Bottom sheet for buy-in payment when joining a competition

import React, { useMemo, useCallback, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetMethods,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DollarSign, Users, Trophy, X } from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';
import { usePrizePoolPayment } from '@/lib/use-prize-pool-payment';

interface BuyInPaymentSheetProps {
  sheetRef: React.RefObject<BottomSheetMethods>;
  competitionId: string;
  competitionName: string;
  buyInAmount: number;
  invitationId?: string;
  isOptInLater?: boolean;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function BuyInPaymentSheet({
  sheetRef,
  competitionId,
  competitionName,
  buyInAmount,
  invitationId,
  isOptInLater,
  onSuccess,
  onCancel,
}: BuyInPaymentSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { payBuyIn, loading } = usePrizePoolPayment();
  const [paying, setPaying] = useState(false);

  const snapPoints = useMemo(() => ['55%'], []);

  const stripeFee = useMemo(
    () => Math.ceil(buyInAmount * 0.029 * 100 + 30) / 100,
    [buyInAmount]
  );
  const totalCharge = useMemo(
    () => buyInAmount + stripeFee,
    [buyInAmount, stripeFee]
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  const handlePay = useCallback(async () => {
    setPaying(true);
    try {
      const result = await payBuyIn({ competitionId, invitationId });
      if (result.success) {
        sheetRef.current?.close();
        onSuccess();
      } else if (result.cancelled) {
        // User cancelled — keep sheet open
      }
    } finally {
      setPaying(false);
    }
  }, [competitionId, invitationId, payBuyIn, onSuccess, sheetRef]);

  const isLoading = loading || paying;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      backgroundStyle={{
        backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF',
      }}
      handleIndicatorStyle={{
        backgroundColor: colors.isDark ? '#48484A' : '#D1D1D6',
      }}
      backdropComponent={renderBackdrop}
      onChange={(index) => {
        if (index === -1) onCancel?.();
      }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 16,
        }}
      >
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: '#F59E0B20',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Trophy size={28} color="#F59E0B" />
          </View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: colors.text,
              textAlign: 'center',
            }}
          >
            {isOptInLater ? 'Join the Prize Pool' : 'Buy-In Required'}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: colors.secondaryText,
              textAlign: 'center',
              marginTop: 4,
            }}
          >
            {competitionName}
          </Text>
        </View>

        {/* Amount breakdown */}
        <View
          style={{
            backgroundColor: colors.isDark ? '#2C2C2E' : '#F2F2F7',
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 15, color: colors.secondaryText }}>
              Buy-in amount
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
              ${buyInAmount.toFixed(2)}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 15, color: colors.secondaryText }}>
              Processing fee
            </Text>
            <Text style={{ fontSize: 15, color: colors.secondaryText }}>
              ${stripeFee.toFixed(2)}
            </Text>
          </View>
          <View
            style={{
              height: 1,
              backgroundColor: colors.isDark ? '#3A3A3C' : '#E5E5EA',
              marginBottom: 12,
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
              Total
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#F59E0B' }}>
              ${totalCharge.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Info note */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 24,
            paddingHorizontal: 4,
          }}
        >
          <Users size={16} color={colors.secondaryText} style={{ marginRight: 8 }} />
          <Text
            style={{
              fontSize: 13,
              color: colors.secondaryText,
              flex: 1,
            }}
          >
            {isOptInLater
              ? 'Become eligible for prize winnings.'
              : 'Everyone pays to join. The prize pool grows with each player.'}
          </Text>
        </View>

        {/* Pay button */}
        <Pressable
          onPress={handlePay}
          disabled={isLoading}
          style={{
            backgroundColor: isLoading ? '#F59E0B80' : '#F59E0B',
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
          }}
        >
          {isLoading ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <>
              <DollarSign size={18} color="#000" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#000' }}>
                Pay ${totalCharge.toFixed(2)} to Join
              </Text>
            </>
          )}
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
