/**
 * store.tsx - Cosmetics Store Screen
 *
 * Main store screen showing:
 * - Coin balance header
 * - Category tabs
 * - Cosmetic items grid
 * - Featured items section
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Pressable,
  TextInput,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import {
  Frame,
  Award,
  ImageIcon,
  Smartphone,
  Palette,
  Shield,
  Zap,
  LayoutGrid,
  History,
  ShoppingBag,
  Search,
  X,
} from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetDefaultBackdropProps } from '@gorhom/bottom-sheet/lib/typescript/components/bottomSheetBackdrop/types';

import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { CoinBalanceDisplay } from '@/components/CoinBalanceDisplay';
import { CosmeticCard, CosmeticCardFeatured } from '@/components/CosmeticCard';
import { PurchaseSheet } from '@/components/PurchaseSheet';
import { SkeletonCosmeticCard } from '@/components/SkeletonLoader';
import { EmptyState } from '@/components/EmptyState';
import { useThemeColors } from '@/lib/useThemeColors';
import {
  useCosmeticsStore,
  selectCatalogByType,
  selectEarnedCoins,
  selectPremiumCoins,
} from '@/lib/cosmetics-store';
import {
  type CosmeticItem,
  type CosmeticType,
  COSMETIC_TYPE_LABELS,
  COSMETIC_TYPE_ICONS,
  sortByRarityAndName,
} from '@/lib/cosmetics-service';

// ============================================
// Constants
// ============================================

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 12;
const GRID_PADDING = 20;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

type CategoryKey = CosmeticType | 'all';

const CATEGORIES: {
  key: CategoryKey;
  label: string;
  icon: React.FC<{ size: number; color: string; strokeWidth?: number }>;
}[] = [
  { key: 'all', label: 'All', icon: LayoutGrid },
  { key: 'profile_frame', label: 'Frames', icon: Frame },
  { key: 'achievement_badge', label: 'Badges', icon: Award },
  { key: 'profile_background', label: 'Backgrounds', icon: ImageIcon },
  { key: 'ring_theme', label: 'Ring Themes', icon: Palette },
  { key: 'app_icon', label: 'App Icons', icon: Smartphone },
  { key: 'streak_freeze', label: 'Streak Freezes', icon: Shield },
  { key: 'competition_boost', label: 'Boosts', icon: Zap },
];

// ============================================
// Component
// ============================================

export default function StoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const purchaseSheetRef = useRef<BottomSheetModal>(null);

  // Store state
  const {
    catalog,
    catalogByType,
    isLoadingCatalog,
    isLoadingBalance,
    error,
    fetchCatalog,
    fetchCoinBalance,
    fetchInventory,
    fetchActiveEffects,
    refreshAll,
    clearError,
  } = useCosmeticsStore();

  const earnedCoins = useCosmeticsStore(selectEarnedCoins);
  const premiumCoins = useCosmeticsStore(selectPremiumCoins);

  // Local state
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const [selectedItem, setSelectedItem] = useState<CosmeticItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load data on mount and focus
  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [refreshAll])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const handleCategoryPress = useCallback((key: CategoryKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(key);
  }, []);

  const handleItemPress = useCallback((item: CosmeticItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedItem(item);
    purchaseSheetRef.current?.present();
  }, []);

  const handleBuyCoins = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/coin-bundles');
  }, [router]);

  const handleViewHistory = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/coin-history');
  }, [router]);

  const handleViewInventory = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/inventory');
  }, [router]);

  const handlePurchaseComplete = useCallback(() => {
    purchaseSheetRef.current?.dismiss();
    refreshAll();
  }, [refreshAll]);

  // Get filtered items
  const getFilteredItems = useCallback((): CosmeticItem[] => {
    let items = selectedCategory === 'all'
      ? catalog
      : catalogByType[selectedCategory] || [];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
      );
    }

    return sortByRarityAndName(items);
  }, [selectedCategory, catalog, catalogByType, searchQuery]);

  // Get featured items (epic and legendary)
  const featuredItems = catalog.filter(
    (item) => (item.rarity === 'epic' || item.rarity === 'legendary') && !item.is_owned
  );

  const filteredItems = getFilteredItems();

  // Render backdrop
  const renderBackdrop = useCallback(
    (props: BottomSheetDefaultBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
      />
    ),
    []
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitle: '',
          headerLeft: () => <LiquidGlassBackButton />,
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable onPress={handleViewInventory} style={styles.headerButton}>
                <BlurView
                  intensity={80}
                  tint={colors.isDark ? 'dark' : 'light'}
                  style={styles.headerButtonBlur}
                >
                  <ShoppingBag size={18} color={colors.text} strokeWidth={2} />
                </BlurView>
              </Pressable>
              <Pressable onPress={handleViewHistory} style={styles.headerButton}>
                <BlurView
                  intensity={80}
                  tint={colors.isDark ? 'dark' : 'light'}
                  style={styles.headerButtonBlur}
                >
                  <History size={18} color={colors.text} strokeWidth={2} />
                </BlurView>
              </Pressable>
            </View>
          ),
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
          {/* Header */}
          <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
            <Text className="font-bold" style={[styles.title, { color: colors.text }]}>
              Store
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Customize your profile with cosmetics
            </Text>
          </Animated.View>

          {/* Coin Balance */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.balanceSection}>
            <CoinBalanceDisplay variant="full" onPress={handleBuyCoins} colors={colors} />
          </Animated.View>

          {/* Search Bar */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.searchSection}>
            <View
              style={[
                styles.searchContainer,
                {
                  backgroundColor: colors.isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.05)',
                  borderColor: colors.isDark
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            >
              <Search size={18} color={colors.textSecondary} strokeWidth={2} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search cosmetics..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <X size={18} color={colors.textSecondary} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          </Animated.View>

          {/* Featured Items */}
          {featuredItems.length > 0 && (
            <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.section}>
              <Text className="font-semibold" style={[styles.sectionTitle, { color: colors.text }]}>
                Featured
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.featuredScroll}
              >
                {featuredItems.slice(0, 3).map((item) => (
                  <View key={item.id} style={styles.featuredItem}>
                    <CosmeticCardFeatured
                      item={item}
                      onPress={handleItemPress}
                      tagline={item.rarity === 'legendary' ? 'Legendary' : 'Limited'}
                      colors={colors}
                    />
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Category Tabs */}
          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.categorySection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {CATEGORIES.map((category) => {
                const isSelected = selectedCategory === category.key;
                const Icon = category.icon;
                const count = category.key === 'all'
                  ? catalog.length
                  : (catalogByType[category.key] || []).length;

                // Selected tab: solid primary background with white content
                // Unselected tab: light background with icon + count
                const tabBackgroundColor = isSelected
                  ? '#FA114F'  // Use explicit primary color
                  : colors.isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.05)';

                const tabBorderColor = isSelected
                  ? '#FA114F'
                  : colors.isDark
                  ? 'rgba(255, 255, 255, 0.1)'
                  : 'rgba(0, 0, 0, 0.08)';

                return (
                  <Pressable
                    key={category.key}
                    onPress={() => handleCategoryPress(category.key)}
                    style={[
                      styles.categoryTab,
                      {
                        backgroundColor: tabBackgroundColor,
                        borderColor: tabBorderColor,
                        paddingHorizontal: isSelected ? 14 : 12,
                      },
                    ]}
                  >
                    <Icon
                      size={16}
                      color={isSelected ? '#FFFFFF' : colors.textSecondary}
                      strokeWidth={2}
                    />
                    {isSelected ? (
                      <Text style={styles.categoryLabelSelected}>
                        {category.label}
                      </Text>
                    ) : (
                      <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>
                        {category.label}
                      </Text>
                    )}
                    {!isSelected && count > 0 && (
                      <View style={[styles.categoryCount, { backgroundColor: colors.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }]}>
                        <Text style={[styles.categoryCountText, { color: colors.textSecondary }]}>
                          {count}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>

          {/* Items Grid */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text className="font-semibold" style={[styles.sectionTitle, { color: colors.text }]}>
                {selectedCategory === 'all'
                  ? 'All Items'
                  : COSMETIC_TYPE_LABELS[selectedCategory as CosmeticType]}
              </Text>
              <Text style={[styles.itemCount, { color: colors.textSecondary }]}>
                {filteredItems.length} items
              </Text>
            </View>

            {isLoadingCatalog ? (
              <View style={styles.grid}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <View key={index} style={{ width: CARD_WIDTH }}>
                    <SkeletonCosmeticCard />
                  </View>
                ))}
              </View>
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={searchQuery ? Search : LayoutGrid}
                title={searchQuery ? 'No results found' : 'No items available'}
                description={
                  searchQuery
                    ? `No cosmetics match "${searchQuery}"`
                    : 'No items in this category yet'
                }
                actionLabel={searchQuery ? 'Clear search' : undefined}
                onAction={searchQuery ? () => setSearchQuery('') : undefined}
                compact
                style={styles.emptyState}
              />
            ) : (
              <View style={styles.grid}>
                {filteredItems.map((item, index) => (
                  <View key={item.id} style={{ width: CARD_WIDTH }}>
                    <CosmeticCard
                      item={item}
                      onPress={handleItemPress}
                      index={index}
                      userEarnedCoins={earnedCoins}
                      userPremiumCoins={premiumCoins}
                      colors={colors}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Error Display */}
          {error && (
            <Animated.View
              entering={FadeIn}
              style={[styles.errorContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}
            >
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={clearError}>
                <Text style={styles.errorDismiss}>Dismiss</Text>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>

        {/* Purchase Sheet */}
        <BottomSheetModal
          ref={purchaseSheetRef}
          snapPoints={['65%']}
          backdropComponent={renderBackdrop}
          enablePanDownToClose
          handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
          backgroundStyle={{
            backgroundColor: colors.isDark ? '#1C1C1E' : '#F2F2F7',
          }}
        >
          {selectedItem && (
            <PurchaseSheet
              item={selectedItem}
              userEarnedCoins={earnedCoins}
              userPremiumCoins={premiumCoins}
              onPurchaseComplete={handlePurchaseComplete}
              onClose={() => purchaseSheetRef.current?.dismiss()}
              colors={colors}
            />
          )}
        </BottomSheetModal>
      </View>
    </>
  );
}

// ============================================
// Styles
// ============================================

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

  // Header
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
    marginRight: 16,
  },
  headerButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerButtonBlur: {
    padding: 10,
  },

  // Balance
  balanceSection: {
    marginBottom: 16,
  },

  // Search
  searchSection: {
    marginBottom: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
  },
  itemCount: {
    fontSize: 13,
  },

  // Featured
  featuredScroll: {
    paddingRight: 20,
  },
  featuredItem: {
    width: SCREEN_WIDTH - 80,
    marginRight: 16,
  },

  // Categories
  categorySection: {
    marginBottom: 24,
  },
  categoryScroll: {
    paddingRight: 20,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  categoryLabelSelected: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  categoryCount: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    minWidth: 18,
    alignItems: 'center',
    marginLeft: -2,
  },
  categoryCountText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },

  // Loading & Empty
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: 40,
  },

  // Error
  errorContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
    flex: 1,
  },
  errorDismiss: {
    color: '#EF4444',
    fontWeight: '600',
    marginLeft: 12,
  },
});
