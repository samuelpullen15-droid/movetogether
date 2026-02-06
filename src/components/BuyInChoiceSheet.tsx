// BuyInChoiceSheet.tsx - Bottom sheet offering pay or join-without-prize choice

import React, { useMemo, useCallback, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetMethods,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trophy, UserMinus } from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';

interface BuyInChoiceSheetProps {
  sheetRef: React.RefObject<BottomSheetMethods>;
  competitionName: string;
  buyInAmount: number;
  onPayToJoin: () => void;
  onJoinWithout: () => void;
  onCancel?: () => void;
}

export function BuyInChoiceSheet({
  sheetRef,
  competitionName,
  buyInAmount,
  onPayToJoin,
  onJoinWithout,
  onCancel,
}: BuyInChoiceSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [joiningFree, setJoiningFree] = useState(false);

  const snapPoints = useMemo(() => ['52%'], []);

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

  const handleJoinWithout = useCallback(async () => {
    setJoiningFree(true);
    try {
      onJoinWithout();
    } finally {
      setJoiningFree(false);
    }
  }, [onJoinWithout]);

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
            Prize Pool Competition
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

        {/* Option 1: Pay to join */}
        <Pressable
          onPress={onPayToJoin}
          style={{
            backgroundColor: '#F59E0B15',
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
            borderWidth: 1.5,
            borderColor: '#F59E0B',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Trophy size={18} color="#F59E0B" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
              Pay ${totalCharge.toFixed(2)} to Join
            </Text>
          </View>
          <Text
            style={{
              fontSize: 13,
              color: colors.secondaryText,
              lineHeight: 18,
            }}
          >
            Compete for prizes! Winners split the pool.
          </Text>
        </Pressable>

        {/* Option 2: Join without prize */}
        <Pressable
          onPress={handleJoinWithout}
          disabled={joiningFree}
          style={{
            backgroundColor: colors.isDark ? '#2C2C2E' : '#F2F2F7',
            borderRadius: 16,
            padding: 16,
            marginBottom: 24,
            borderWidth: 1.5,
            borderColor: colors.isDark ? '#3A3A3C' : '#E5E5EA',
          }}
        >
          {joiningFree ? (
            <ActivityIndicator color={colors.secondaryText} style={{ paddingVertical: 8 }} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <UserMinus size={18} color={colors.secondaryText} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                  Join Without Prize
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.secondaryText,
                  lineHeight: 18,
                }}
              >
                Compete for fun — you won't be eligible for prizes. You can opt in later.
              </Text>
            </>
          )}
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
