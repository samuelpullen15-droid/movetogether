/**
 * inventory.tsx - User's Cosmetic Inventory Screen
 *
 * Shows all owned cosmetics with equip/unequip functionality
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Text } from '@/components/Text';
import { Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Package,
  Frame,
  Award,
  ImageIcon,
  Smartphone,
  Palette,
  Shield,
  Zap,
  Check,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import { useCosmeticsStore } from '@/lib/cosmetics-store';
import {
  RARITY_COLORS,
  COSMETIC_TYPE_LABELS,
  type CosmeticInventoryItem,
  type CosmeticType,
} from '@/lib/cosmetics-service';

const TYPE_ICONS: Record<CosmeticType, React.FC<{ size: number; color: string }>> = {
  profile_frame: Frame,
  achievement_badge: Award,
  profile_background: ImageIcon,
  app_icon: Smartphone,
  ring_theme: Palette,
  streak_freeze: Shield,
  competition_boost: Zap,
};

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);

  const {
    inventory,
    isLoadingInventory,
    isEquipping,
    fetchInventory,
    fetchActiveEffects,
    equipCosmetic,
    unequipCosmetic,
  } = useCosmeticsStore();

  useFocusEffect(
    useCallback(() => {
      fetchInventory();
      fetchActiveEffects();
    }, [fetchInventory, fetchActiveEffects])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchInventory(), fetchActiveEffects()]);
    setRefreshing(false);
  }, [fetchInventory, fetchActiveEffects]);

  const handleEquipToggle = useCallback(
    async (item: CosmeticInventoryItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (item.is_equipped) {
        await unequipCosmetic(item.id);
      } else {
        await equipCosmetic(item.id);
      }
    },
    [equipCosmetic, unequipCosmetic]
  );

  // Filter out consumed items and group by type
  const activeItems = inventory.filter((item) => !item.is_consumed);
  const groupedItems = activeItems.reduce(
    (acc, item) => {
      const type = item.cosmetic_item?.cosmetic_type as CosmeticType;
      if (!acc[type]) acc[type] = [];
      acc[type].push(item);
      return acc;
    },
    {} as Record<CosmeticType, CosmeticInventoryItem[]>
  );

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
          <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
            <Text className="font-bold" style={[styles.title, { color: colors.text }]}>
              Inventory
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {activeItems.length} items owned
            </Text>
          </Animated.View>

          {isLoadingInventory ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : activeItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Package size={48} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Your inventory is empty
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Visit the store to get cosmetics!
              </Text>
            </View>
          ) : (
            Object.entries(groupedItems).map(([type, items]) => {
              const TypeIcon = TYPE_ICONS[type as CosmeticType] || Package;
              return (
                <Animated.View
                  key={type}
                  entering={FadeInDown.springify()}
                  style={styles.section}
                >
                  <View style={styles.sectionHeader}>
                    <TypeIcon size={18} color={colors.textSecondary} />
                    <Text
                      className="font-semibold"
                      style={[styles.sectionTitle, { color: colors.text }]}
                    >
                      {COSMETIC_TYPE_LABELS[type as CosmeticType]}
                    </Text>
                    <Text style={[styles.itemCount, { color: colors.textSecondary }]}>
                      {items.length}
                    </Text>
                  </View>

                  <View style={styles.itemGrid}>
                    {items.map((item, index) => {
                      const cosmeticItem = item.cosmetic_item;
                      if (!cosmeticItem) return null;

                      const rarity = cosmeticItem.rarity || 'common';
                      const rarityColors = RARITY_COLORS[rarity];
                      const isConsumable = cosmeticItem.is_consumable;

                      return (
                        <Animated.View
                          key={item.id}
                          entering={FadeInDown.delay(index * 50).springify()}
                          style={styles.itemWrapper}
                        >
                          <Pressable
                            onPress={() => !isConsumable && handleEquipToggle(item)}
                            disabled={isEquipping || isConsumable}
                            style={[
                              styles.itemCard,
                              {
                                backgroundColor: colors.isDark
                                  ? 'rgba(255, 255, 255, 0.05)'
                                  : 'rgba(0, 0, 0, 0.03)',
                                borderColor: item.is_equipped
                                  ? colors.primary
                                  : colors.border,
                                borderWidth: item.is_equipped ? 2 : 1,
                              },
                            ]}
                          >
                            <LinearGradient
                              colors={[`${rarityColors.primary}30`, 'transparent']}
                              style={styles.rarityGradient}
                            />

                            {/* Equipped Badge */}
                            {item.is_equipped && (
                              <View
                                style={[
                                  styles.equippedBadge,
                                  { backgroundColor: colors.primary },
                                ]}
                              >
                                <Check size={12} color="#fff" strokeWidth={3} />
                              </View>
                            )}

                            <View style={styles.itemContent}>
                              <Text
                                className="font-semibold"
                                style={[styles.itemName, { color: colors.text }]}
                                numberOfLines={2}
                              >
                                {cosmeticItem.name}
                              </Text>
                              <Text
                                style={[
                                  styles.rarityText,
                                  { color: rarityColors.text },
                                ]}
                              >
                                {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
                              </Text>
                            </View>

                            {!isConsumable && (
                              <Text
                                style={[
                                  styles.actionText,
                                  {
                                    color: item.is_equipped
                                      ? colors.primary
                                      : colors.textSecondary,
                                  },
                                ]}
                              >
                                {item.is_equipped ? 'Equipped' : 'Tap to equip'}
                              </Text>
                            )}

                            {isConsumable && (
                              <Text style={[styles.actionText, { color: colors.textSecondary }]}>
                                Consumable
                              </Text>
                            )}
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                </Animated.View>
              );
            })
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
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    flex: 1,
  },
  itemCount: {
    fontSize: 13,
  },
  itemGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  itemWrapper: {
    width: '47%',
  },
  itemCard: {
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    minHeight: 120,
    justifyContent: 'space-between',
  },
  rarityGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  equippedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    gap: 4,
  },
  itemName: {
    fontSize: 15,
  },
  rarityText: {
    fontSize: 12,
    fontWeight: '500',
  },
  actionText: {
    fontSize: 12,
    marginTop: 8,
  },
});
