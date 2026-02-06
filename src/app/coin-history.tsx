/**
 * coin-history.tsx - Coin Transaction History Screen
 *
 * Shows history of coin earnings and spending
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/Text';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Coins, Sparkles, TrendingUp, TrendingDown, History } from 'lucide-react-native';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import { useCosmeticsStore } from '@/lib/cosmetics-store';
import { formatCoins } from '@/lib/cosmetics-service';

export default function CoinHistoryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);

  const { transactions, isLoadingTransactions, fetchTransactionHistory } = useCosmeticsStore();

  useFocusEffect(
    useCallback(() => {
      fetchTransactionHistory();
    }, [fetchTransactionHistory])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTransactionHistory();
    setRefreshing(false);
  }, [fetchTransactionHistory]);

  const formatTransactionType = (type: string): string => {
    const typeMap: Record<string, string> = {
      earn_activity: 'Activity Reward',
      earn_competition: 'Competition Reward',
      earn_achievement: 'Achievement Reward',
      earn_streak: 'Streak Reward',
      purchase_iap: 'Coin Purchase',
      purchase_cosmetic: 'Cosmetic Purchase',
    };
    return typeMap[type] || type;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitle: '',
          headerLeft: () => <LiquidGlassBackButton />,
        }}
      />

      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.header}>
            <Text className="font-bold" style={[styles.title, { color: colors.text }]}>
              Coin History
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Your coin earnings and spending
            </Text>
          </View>

          {isLoadingTransactions ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <History size={48} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No transactions yet
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Complete activities to earn coins!
              </Text>
            </View>
          ) : (
            <View style={styles.transactionList}>
              {transactions.map((transaction, index) => {
                const isEarning =
                  transaction.earned_coin_delta > 0 || transaction.premium_coin_delta > 0;
                const earnedDelta = transaction.earned_coin_delta;
                const premiumDelta = transaction.premium_coin_delta;

                return (
                  <Animated.View
                    key={transaction.id}
                    entering={FadeInDown.delay(index * 50).springify()}
                    style={[
                      styles.transactionCard,
                      {
                        backgroundColor: colors.isDark
                          ? 'rgba(255, 255, 255, 0.05)'
                          : 'rgba(0, 0, 0, 0.03)',
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.transactionLeft}>
                      <View
                        style={[
                          styles.transactionIcon,
                          {
                            backgroundColor: isEarning
                              ? 'rgba(34, 197, 94, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                          },
                        ]}
                      >
                        {isEarning ? (
                          <TrendingUp size={20} color="#22C55E" strokeWidth={2} />
                        ) : (
                          <TrendingDown size={20} color="#EF4444" strokeWidth={2} />
                        )}
                      </View>
                      <View style={styles.transactionInfo}>
                        <Text
                          className="font-semibold"
                          style={[styles.transactionType, { color: colors.text }]}
                        >
                          {formatTransactionType(transaction.transaction_type)}
                        </Text>
                        <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
                          {formatDate(transaction.created_at)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.transactionRight}>
                      {earnedDelta !== 0 && (
                        <View style={styles.coinAmount}>
                          <Coins size={14} color="#FFD700" strokeWidth={2.5} />
                          <Text
                            className="font-semibold"
                            style={[
                              styles.amountText,
                              { color: earnedDelta > 0 ? '#22C55E' : '#EF4444' },
                            ]}
                          >
                            {earnedDelta > 0 ? '+' : ''}
                            {formatCoins(earnedDelta)}
                          </Text>
                        </View>
                      )}
                      {premiumDelta !== 0 && (
                        <View style={styles.coinAmount}>
                          <Sparkles size={14} color="#A855F7" strokeWidth={2.5} />
                          <Text
                            className="font-semibold"
                            style={[
                              styles.amountText,
                              { color: premiumDelta > 0 ? '#22C55E' : '#EF4444' },
                            ]}
                          >
                            {premiumDelta > 0 ? '+' : ''}
                            {formatCoins(premiumDelta)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
  },
  transactionList: {
    gap: 12,
  },
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionInfo: {
    flex: 1,
    gap: 2,
  },
  transactionType: {
    fontSize: 15,
  },
  transactionDate: {
    fontSize: 13,
  },
  transactionRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  coinAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  amountText: {
    fontSize: 15,
  },
});
