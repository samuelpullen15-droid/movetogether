import { View, ScrollView, Pressable, ActivityIndicator, Platform, Image } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useHealthStore, useHealthStore as healthStore } from '@/lib/health-service';
import { useAuthStore } from '@/lib/auth-store';
import { HealthProvider } from '@/lib/health-types';
import { useProviderOAuth, OAuthProvider } from '@/lib/use-provider-oauth';
import { useThemeColors } from '@/lib/useThemeColors';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import {
  Heart,
  Activity,
  Watch,
  Compass,
  Smartphone,
  Zap,
  Circle,
  Check,
  RefreshCw,
  AlertCircle,
} from 'lucide-react-native';
import { useState } from 'react';

const iconMap: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  heart: Heart,
  activity: Activity,
  watch: Watch,
  compass: Compass,
  smartphone: Smartphone,
  zap: Zap,
  circle: Circle,
};

function ProviderCard({
  provider,
  index,
  onConnect,
  onDisconnect,
  isConnecting,
}: {
  provider: HealthProvider;
  index: number;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting: boolean;
}) {
  const colors = useThemeColors();
  const Icon = iconMap[provider.icon] || Activity;
  const currentPlatform = Platform.OS;

  const isAvailable = provider.platforms.includes(currentPlatform as 'ios' | 'android' | 'web');

  return (
    <View>
      <Pressable
        className="mb-3 active:opacity-80"
        onPress={provider.connected ? onDisconnect : onConnect}
        disabled={!isAvailable || isConnecting}
      >
        <View
          className="rounded-2xl p-4 flex-row items-center"
          style={{
            backgroundColor: provider.connected
              ? (colors.isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)')
              : (colors.isDark ? '#0D0D0D' : '#FFFFFF'),
            borderWidth: provider.connected ? 1 : 0,
            borderColor: provider.connected ? 'rgba(34, 197, 94, 0.3)' : 'transparent',
            opacity: isAvailable ? 1 : 0.5,
          }}
        >
          <View
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{
              backgroundColor: (provider.id === 'apple_health' || provider.id === 'fitbit' || provider.id === 'whoop' || provider.id === 'oura') ? 'transparent' : provider.color + '20',
            }}
          >
            {provider.id === 'apple_health' ? (
              <Image
                source={require('../../assets/apple-health-icon.png')}
                style={{ width: 40, height: 40 }}
                resizeMode="contain"
              />
            ) : provider.id === 'fitbit' ? (
              <Image
                source={require('../../assets/fitbit-icon.png')}
                style={{ width: 40, height: 40 }}
                fadeDuration={0}
                resizeMethod="resize"
              />
            ) : provider.id === 'whoop' ? (
              <View style={{ borderWidth: 1, borderColor: '#000000', borderRadius: 8, overflow: 'hidden' }}>
                <Image
                  source={require('../../assets/whoop-icon.png')}
                  style={{ width: 40, height: 40 }}
                  fadeDuration={0}
                  resizeMethod="resize"
                />
              </View>
            ) : provider.id === 'oura' ? (
              <Image
                source={require('../../assets/oura-icon.png')}
                style={{ width: 40, height: 40 }}
                fadeDuration={0}
                resizeMethod="resize"
              />
            ) : (
              <Icon size={28} color={provider.color} />
            )}
          </View>

          <View className="flex-1 ml-4">
            <View className="flex-row items-center">
              <Text className="text-black dark:text-white text-lg font-semibold">{provider.name}</Text>
              {provider.connected && (
                <View
                  className="ml-2 w-5 h-5 rounded-full items-center justify-center"
                  style={{ backgroundColor: '#22c55e' }}
                >
                  <Check size={12} color="white" strokeWidth={3} />
                </View>
              )}
            </View>
            <Text className="text-gray-600 dark:text-gray-400 text-sm mt-1">{provider.description}</Text>
            {!isAvailable && (
              <Text className="text-yellow-500 text-xs mt-1">
                Not available on {currentPlatform === 'ios' ? 'iOS' : currentPlatform === 'android' ? 'Android' : 'Web'}
              </Text>
            )}
            {provider.connected && provider.lastSync && (
              <Text className="text-gray-600 dark:text-gray-500 text-xs mt-1">
                Last sync: {new Date(provider.lastSync).toLocaleTimeString()}
              </Text>
            )}
          </View>

          {isAvailable && (
            <View>
              {isConnecting ? (
                <ActivityIndicator size="small" color={provider.color} />
              ) : provider.connected ? (
                <View className="px-4 py-2.5 rounded-lg" style={{ backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }}>
                  <Text className="text-gray-600 dark:text-gray-400 text-sm font-semibold">Connected</Text>
                </View>
              ) : (
                <View
                  className="px-4 py-2.5 rounded-lg"
                  style={{ 
                    backgroundColor: provider.color,
                    borderWidth: provider.id === 'whoop' ? 1 : 0,
                    borderColor: provider.id === 'whoop' ? '#333' : 'transparent',
                  }}
                >
                  <Text 
                    className="text-sm font-semibold"
                    style={{ color: provider.id === 'whoop' ? '#000000' : '#FFFFFF' }}
                  >
                    Connect
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
}

export default function ConnectHealthScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const authUser = useAuthStore((s) => s.user);
  const providers = useHealthStore((s) => s.providers);
  const connectProvider = useHealthStore((s) => s.connectProvider);
  const disconnectProvider = useHealthStore((s) => s.disconnectProvider);
  const syncHealthData = useHealthStore((s) => s.syncHealthData);
  const isSyncing = useHealthStore((s) => s.isSyncing);
  const lastSyncError = useHealthStore((s) => s.lastSyncError);
  const activeProvider = useHealthStore((s) => s.activeProvider);

  const fitbitOAuth = useProviderOAuth('fitbit');
  const whoopOAuth = useProviderOAuth('whoop');
  const garminOAuth = useProviderOAuth('garmin');
  const ouraOAuth = useProviderOAuth('oura');
  const stravaOAuth = useProviderOAuth('strava');

  const oauthHooks: Record<string, { startOAuthFlow: () => Promise<void>; isConnecting: boolean }> = {
    fitbit: fitbitOAuth,
    whoop: whoopOAuth,
    garmin: garminOAuth,
    oura: ouraOAuth,
    strava: stravaOAuth,
  };

  const connectedProviders = providers.filter((p) => p.connected);

  const handleConnect = async (providerId: string) => {
    console.log('[ConnectHealth] handleConnect called with:', providerId);

    const oauthHook = oauthHooks[providerId];
    if (oauthHook) {
      console.log(`[ConnectHealth] Using OAuth for ${providerId}`);
      await oauthHook.startOAuthFlow();
      return;
    }

    setConnectingId(providerId);
    try {
      console.log('[ConnectHealth] Calling connectProvider...');
      const result = await connectProvider(providerId as any);
      console.log('[ConnectHealth] connectProvider result:', result);
      
      setTimeout(() => {
        const currentState = useHealthStore.getState();
        if (currentState.isSyncing) {
          console.warn('[ConnectHealth] Clearing stuck sync state after connection');
          useHealthStore.setState({ isSyncing: false });
        }
      }, 500);
    } catch (error) {
      console.log('[ConnectHealth] Error:', error);
      useHealthStore.setState({ isSyncing: false, isConnecting: false });
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    await disconnectProvider(providerId as any);
  };

  const isProviderConnecting = (providerId: string) => {
    const oauthHook = oauthHooks[providerId];
    if (oauthHook) {
      return oauthHook.isConnecting;
    }
    return connectingId === providerId;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Overscroll background for dark mode */}
      {colors.isDark && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 300,
            backgroundColor: '#1C1C1E',
            zIndex: -1,
          }}
        />
      )}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#FFB6C1', '#F5D0D6', colors.bg]}
          style={{
            paddingTop: insets.top + 100,
            marginTop: -100,
            paddingHorizontal: 20,
            paddingBottom: 24,
          }}
        >
          <View>
            <View className="flex-row items-center mb-4">
              <LiquidGlassBackButton onPress={() => router.back()} />
            </View>
            <Text className="text-black dark:text-white text-3xl font-bold">Connect Health</Text>
            <Text className="text-gray-600 dark:text-gray-400 text-base">
              Sync your fitness data from your favorite devices
            </Text>
          </View>
        </LinearGradient>

        {/* Sync Status Card */}
        {connectedProviders.length > 0 && (
          <View className="mx-5 mt-4 mb-4">
            <BlurView
              intensity={colors.isDark ? 30 : 20}
              tint={colors.isDark ? 'dark' : 'light'}
              style={{
                borderRadius: 20,
                overflow: 'hidden',
                backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(245, 245, 247, 0.7)',
                padding: 20,
              }}
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-black dark:text-white text-lg font-semibold">
                    {connectedProviders.length} Provider{connectedProviders.length > 1 ? 's' : ''} Connected
                  </Text>
                  <Text className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    {activeProvider
                      ? `Active: ${providers.find((p) => p.id === activeProvider)?.name}`
                      : 'Tap to sync your data'}
                  </Text>
                </View>
                <Pressable
                  onPress={async () => {
                    try {
                      await syncHealthData(authUser?.id);
                    } catch (error) {
                      console.error('[ConnectHealth] Manual sync failed:', error);
                      useHealthStore.setState({ isSyncing: false });
                    }
                  }}
                  disabled={isSyncing}
                  className="w-12 h-12 rounded-full bg-fitness-accent/20 items-center justify-center active:bg-fitness-accent/30"
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#FA114F" />
                  ) : (
                    <RefreshCw size={22} color="#FA114F" />
                  )}
                </Pressable>
              </View>

              {lastSyncError && (
                <View className="flex-row items-center mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }}>
                  <AlertCircle size={16} color="#ef4444" />
                  <Text className="text-red-400 text-sm ml-2">{lastSyncError}</Text>
                </View>
              )}
            </BlurView>
          </View>
        )}

        {/* Available Providers */}
        <View className="px-5">
          <Text className="text-black dark:text-white text-xl font-semibold mb-4">Available Providers</Text>
          {providers
            .filter((provider) => provider.platforms.includes(Platform.OS as 'ios' | 'android' | 'web'))
            .filter((provider) => provider.id !== 'garmin')
            .map((provider, index) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                index={index}
                onConnect={() => handleConnect(provider.id)}
                onDisconnect={() => handleDisconnect(provider.id)}
                isConnecting={isProviderConnecting(provider.id)}
              />
            ))}
        </View>

        {/* Info Card */}
        <View className="mx-5 mt-6">
          <View
            className="rounded-2xl p-4"
            style={{
              backgroundColor: colors.isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
              borderWidth: 1,
              borderColor: colors.isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
            }}
          >
            <Text className="text-blue-400 text-sm font-medium mb-2">
              How it works
            </Text>
            <Text className="text-gray-600 dark:text-gray-400 text-sm leading-5">
              Connect your fitness device or health app to automatically sync your activity data.
              Your Move, Exercise, and Stand rings will update in real-time, and your progress
              will count toward competitions with friends.
            </Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}