import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useHealthStore } from '@/lib/health-service';
import { useAuthStore } from '@/lib/auth-store';
import { HealthProvider } from '@/lib/health-types';
import {
  Heart,
  Activity,
  Watch,
  Compass,
  Smartphone,
  Zap,
  Circle,
  ChevronLeft,
  Check,
  RefreshCw,
  AlertCircle,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
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
  const Icon = iconMap[provider.icon] || Activity;
  const currentPlatform = Platform.OS;

  // Check if provider is available on current platform
  const isAvailable = provider.platforms.includes(currentPlatform as 'ios' | 'android' | 'web');

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 80)}>
      <Pressable
        className="mb-3 active:opacity-80"
        onPress={provider.connected ? onDisconnect : onConnect}
        disabled={!isAvailable || isConnecting}
      >
        <View
          className="rounded-2xl p-4 flex-row items-center"
          style={{
            backgroundColor: provider.connected ? '#1C1C1E' : '#0D0D0D',
            borderWidth: provider.connected ? 1 : 0,
            borderColor: provider.connected ? provider.color + '50' : 'transparent',
            opacity: isAvailable ? 1 : 0.5,
          }}
        >
          {/* Provider Icon */}
          <View
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{
              backgroundColor: provider.color + '20',
            }}
          >
            <Icon size={28} color={provider.color} />
          </View>

          {/* Content */}
          <View className="flex-1 ml-4">
            <View className="flex-row items-center">
              <Text className="text-white text-lg font-semibold">{provider.name}</Text>
              {provider.connected && (
                <View
                  className="ml-2 w-5 h-5 rounded-full items-center justify-center"
                  style={{ backgroundColor: '#22c55e' }}
                >
                  <Check size={12} color="white" strokeWidth={3} />
                </View>
              )}
            </View>
            <Text className="text-gray-400 text-sm mt-1">{provider.description}</Text>
            {!isAvailable && (
              <Text className="text-yellow-500 text-xs mt-1">
                Not available on {currentPlatform === 'ios' ? 'iOS' : currentPlatform === 'android' ? 'Android' : 'Web'}
              </Text>
            )}
            {provider.connected && provider.lastSync && (
              <Text className="text-gray-500 text-xs mt-1">
                Last sync: {new Date(provider.lastSync).toLocaleTimeString()}
              </Text>
            )}
          </View>

          {/* Action Button */}
          {isAvailable && (
            <View>
              {isConnecting ? (
                <ActivityIndicator size="small" color={provider.color} />
              ) : provider.connected ? (
                <View className="px-3 py-2 rounded-lg bg-white/10">
                  <Text className="text-gray-400 text-sm">Connected</Text>
                </View>
              ) : (
                <View
                  className="px-4 py-2 rounded-lg"
                  style={{ backgroundColor: provider.color }}
                >
                  <Text className="text-white text-sm font-semibold">Connect</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ConnectHealthScreen() {
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

  const connectedProviders = providers.filter((p) => p.connected);

  const handleConnect = async (providerId: string) => {
    console.log('[ConnectHealth] handleConnect called with:', providerId);
    setConnectingId(providerId);
    try {
      console.log('[ConnectHealth] Calling connectProvider...');
      const result = await connectProvider(providerId as any);
      console.log('[ConnectHealth] connectProvider result:', result);
    } catch (error) {
      console.log('[ConnectHealth] Error:', error);
    }
    setConnectingId(null);
  };

  const handleDisconnect = async (providerId: string) => {
    await disconnectProvider(providerId as any);
  };

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#1a1a2e', '#000000']}
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            <Pressable
              onPress={() => router.back()}
              className="flex-row items-center mb-4"
            >
              <ChevronLeft size={24} color="white" />
              <Text className="text-white text-base ml-1">Back</Text>
            </Pressable>
            <Text className="text-white text-3xl font-bold">Connect Health</Text>
            <Text className="text-gray-400 text-base mt-1">
              Sync your fitness data from your favorite devices
            </Text>
          </Animated.View>
        </LinearGradient>

        {/* Sync Status Card */}
        {connectedProviders.length > 0 && (
          <Animated.View
            entering={FadeInRight.duration(600).delay(100)}
            className="mx-5 mb-6"
          >
            <LinearGradient
              colors={['#1C1C1E', '#0D0D0D']}
              style={{ borderRadius: 20, padding: 20 }}
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-white text-lg font-semibold">
                    {connectedProviders.length} Provider{connectedProviders.length > 1 ? 's' : ''} Connected
                  </Text>
                  <Text className="text-gray-400 text-sm mt-1">
                    {activeProvider
                      ? `Active: ${providers.find((p) => p.id === activeProvider)?.name}`
                      : 'Tap to sync your data'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => syncHealthData(authUser?.id)}
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
                <View className="flex-row items-center mt-3 pt-3 border-t border-white/10">
                  <AlertCircle size={16} color="#ef4444" />
                  <Text className="text-red-400 text-sm ml-2">{lastSyncError}</Text>
                </View>
              )}
            </LinearGradient>
          </Animated.View>
        )}

        {/* Available Providers */}
        <View className="px-5">
          <Text className="text-white text-xl font-semibold mb-4">Available Providers</Text>
          {providers.map((provider, index) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              index={index}
              onConnect={() => handleConnect(provider.id)}
              onDisconnect={() => handleDisconnect(provider.id)}
              isConnecting={connectingId === provider.id}
            />
          ))}
        </View>

        {/* Info Card */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(600)}
          className="mx-5 mt-6"
        >
          <View className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20">
            <Text className="text-blue-400 text-sm font-medium mb-2">
              How it works
            </Text>
            <Text className="text-gray-400 text-sm leading-5">
              Connect your fitness device or health app to automatically sync your activity data.
              Your Move, Exercise, and Stand rings will update in real-time, and your progress
              will count toward competitions with friends.
            </Text>
          </View>
        </Animated.View>

        {/* Setup Instructions */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(700)}
          className="mx-5 mt-4"
        >
          <View className="bg-fitness-card rounded-2xl p-4">
            <Text className="text-white text-sm font-medium mb-2">
              Need API credentials?
            </Text>
            <Text className="text-gray-400 text-sm leading-5">
              Some providers require API keys. Visit the ENV tab in Vibecode to add your
              credentials for Fitbit, Garmin, Google Fit, and others.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
