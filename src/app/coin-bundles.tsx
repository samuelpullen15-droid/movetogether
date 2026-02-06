/**
 * coin-bundles.tsx - Premium Coin Purchase Screen
 *
 * IAP screen for purchasing premium coin bundles via RevenueCat
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Coins } from 'lucide-react-native';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';

export default function CoinBundlesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

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
        <View style={[styles.content, { paddingTop: insets.top + 60 }]}>
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
            <Coins size={48} color="#A855F7" strokeWidth={2} />
          </View>
          <Text className="font-bold" style={[styles.title, { color: colors.text }]}>
            Premium Coins
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Coming soon! Purchase premium coins to unlock exclusive cosmetics.
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});
