/**
 * Historical Data Backfill Progress Modal
 * 
 * Shows progress when syncing historical health data after user
 * connects a new provider for the first time.
 */

import { View, Text, Modal, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { CheckCircle, AlertCircle } from 'lucide-react-native';
import { BackfillProgress } from '@/lib/historical-backfill-service';

interface BackfillProgressModalProps {
  visible: boolean;
  progress: BackfillProgress;
}

export function BackfillProgressModal({ visible, progress }: BackfillProgressModalProps) {
  if (!visible) return null;

  const isComplete = progress.progress === 100;
  const isFailed = !progress.isBackfilling && progress.progress === 0 && progress.syncedDays === 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View className="flex-1 bg-black/80 items-center justify-center px-6">
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
          className="w-full max-w-sm"
        >
          <LinearGradient
            colors={['#1C1C1E', '#0D0D0D']}
            className="rounded-3xl p-6"
          >
            {/* Icon */}
            <View className="items-center mb-4">
              {progress.isBackfilling && (
                <ActivityIndicator size="large" color="#FA114F" />
              )}
              {isComplete && (
                <View className="w-16 h-16 rounded-full bg-green-500/20 items-center justify-center">
                  <CheckCircle size={40} color="#10B981" />
                </View>
              )}
              {isFailed && (
                <View className="w-16 h-16 rounded-full bg-red-500/20 items-center justify-center">
                  <AlertCircle size={40} color="#EF4444" />
                </View>
              )}
            </View>

            {/* Title */}
            <Text className="text-white text-xl font-bold text-center mb-2">
              {progress.isBackfilling && 'Syncing Your History'}
              {isComplete && 'Sync Complete!'}
              {isFailed && 'Sync Failed'}
            </Text>

            {/* Message */}
            <Text className="text-gray-400 text-center mb-6">
              {progress.message}
            </Text>

            {/* Progress Bar */}
            {progress.isBackfilling && (
              <View className="mb-4">
                <View className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <View
                    className="h-full bg-fitness-accent rounded-full"
                    style={{ width: `${progress.progress}%` }}
                  />
                </View>
                <Text className="text-gray-500 text-xs text-center mt-2">
                  {progress.syncedDays} of {progress.totalDays} days synced
                </Text>
              </View>
            )}

            {/* Success Stats */}
            {isComplete && (
              <View className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
                <Text className="text-green-400 text-center font-semibold">
                  {progress.syncedDays} days of activity history loaded
                </Text>
              </View>
            )}

            {/* Tip */}
            {progress.isBackfilling && (
              <View className="bg-gray-800/50 rounded-xl p-4 mt-4">
                <Text className="text-gray-400 text-sm text-center">
                  💡 This may take a minute. Feel free to close this and continue using the app!
                </Text>
              </View>
            )}
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}
