import { View, Text, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFitnessStore, Achievement } from '@/lib/fitness-store';
import {
  Flame,
  Zap,
  Trophy,
  Sunrise,
  Activity,
  Users,
  Timer,
  Award,
  Lock,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

const iconMap: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  flame: Flame,
  zap: Zap,
  trophy: Trophy,
  sunrise: Sunrise,
  activity: Activity,
  users: Users,
  timer: Timer,
  award: Award,
};

const medalColors = {
  gold: { bg: '#FFD700', glow: 'rgba(255, 215, 0, 0.3)', gradient: ['#FFD700', '#FFA500'] },
  silver: { bg: '#C0C0C0', glow: 'rgba(192, 192, 192, 0.3)', gradient: ['#E8E8E8', '#A8A8A8'] },
  bronze: { bg: '#CD7F32', glow: 'rgba(205, 127, 50, 0.3)', gradient: ['#CD7F32', '#8B4513'] },
};

function AchievementCard({ achievement, index }: { achievement: Achievement; index: number }) {
  const Icon = iconMap[achievement.icon] || Award;
  const colors = medalColors[achievement.type];

  return (
    <Animated.View
      entering={FadeInUp.duration(500).delay(index * 80)}
      className="mb-3"
    >
      <Pressable className="active:scale-98 active:opacity-90">
        <View
          className="rounded-2xl p-4 flex-row items-center"
          style={{
            backgroundColor: achievement.earned ? '#1C1C1E' : '#0D0D0D',
            borderWidth: achievement.earned ? 1 : 0,
            borderColor: achievement.earned ? colors.glow : 'transparent',
          }}
        >
          {/* Medal Icon */}
          <View
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{
              backgroundColor: achievement.earned ? colors.glow : 'rgba(255,255,255,0.05)',
            }}
          >
            {achievement.earned ? (
              <Icon size={28} color={colors.bg} />
            ) : (
              <Lock size={24} color="#4a4a4a" />
            )}
          </View>

          {/* Content */}
          <View className="flex-1 ml-4">
            <View className="flex-row items-center">
              <Text
                className={`text-lg font-semibold ${
                  achievement.earned ? 'text-white' : 'text-gray-500'
                }`}
              >
                {achievement.name}
              </Text>
              {achievement.earned && (
                <View
                  className="ml-2 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: colors.glow }}
                >
                  <Text style={{ color: colors.bg }} className="text-xs font-bold capitalize">
                    {achievement.type}
                  </Text>
                </View>
              )}
            </View>
            <Text
              className={`text-sm mt-1 ${
                achievement.earned ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              {achievement.description}
            </Text>
            {achievement.earned && achievement.earnedDate && (
              <Text className="text-gray-500 text-xs mt-2">
                Earned {new Date(achievement.earnedDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function AchievementsScreen() {
  const insets = useSafeAreaInsets();
  const achievements = useFitnessStore((s) => s.achievements);

  const earnedAchievements = achievements.filter((a) => a.earned);
  const lockedAchievements = achievements.filter((a) => !a.earned);

  const goldCount = earnedAchievements.filter((a) => a.type === 'gold').length;
  const silverCount = earnedAchievements.filter((a) => a.type === 'silver').length;
  const bronzeCount = earnedAchievements.filter((a) => a.type === 'bronze').length;

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
            <Text className="text-white text-3xl font-bold">Achievements</Text>
            <Text className="text-gray-400 text-base mt-1">Earn medals by crushing your goals</Text>
          </Animated.View>
        </LinearGradient>

        {/* Medal Summary */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(100)}
          className="mx-5 -mt-2 mb-6"
        >
          <LinearGradient
            colors={['#1C1C1E', '#0D0D0D']}
            style={{ borderRadius: 20, padding: 20 }}
          >
            <View className="flex-row justify-around">
              {/* Gold */}
              <View className="items-center">
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-2"
                  style={{ backgroundColor: 'rgba(255, 215, 0, 0.2)' }}
                >
                  <Trophy size={32} color="#FFD700" />
                </View>
                <Text className="text-medal-gold text-2xl font-bold">{goldCount}</Text>
                <Text className="text-gray-500 text-sm">Gold</Text>
              </View>

              {/* Silver */}
              <View className="items-center">
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-2"
                  style={{ backgroundColor: 'rgba(192, 192, 192, 0.2)' }}
                >
                  <Award size={32} color="#C0C0C0" />
                </View>
                <Text className="text-medal-silver text-2xl font-bold">{silverCount}</Text>
                <Text className="text-gray-500 text-sm">Silver</Text>
              </View>

              {/* Bronze */}
              <View className="items-center">
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-2"
                  style={{ backgroundColor: 'rgba(205, 127, 50, 0.2)' }}
                >
                  <Award size={32} color="#CD7F32" />
                </View>
                <Text className="text-medal-bronze text-2xl font-bold">{bronzeCount}</Text>
                <Text className="text-gray-500 text-sm">Bronze</Text>
              </View>
            </View>

            <View className="mt-4 pt-4 border-t border-white/10">
              <View className="flex-row justify-between items-center">
                <Text className="text-gray-400">Total Earned</Text>
                <Text className="text-white font-bold text-lg">
                  {earnedAchievements.length}/{achievements.length}
                </Text>
              </View>
              <View className="h-2 bg-white/10 rounded-full mt-2 overflow-hidden">
                <View
                  className="h-full bg-fitness-accent rounded-full"
                  style={{ width: `${(earnedAchievements.length / achievements.length) * 100}%` }}
                />
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Earned Achievements */}
        {earnedAchievements.length > 0 && (
          <View className="px-5 mb-6">
            <Text className="text-white text-xl font-semibold mb-4">Earned</Text>
            {earnedAchievements.map((achievement, index) => (
              <AchievementCard key={achievement.id} achievement={achievement} index={index} />
            ))}
          </View>
        )}

        {/* Locked Achievements */}
        {lockedAchievements.length > 0 && (
          <View className="px-5">
            <Text className="text-white text-xl font-semibold mb-4">Locked</Text>
            {lockedAchievements.map((achievement, index) => (
              <AchievementCard
                key={achievement.id}
                achievement={achievement}
                index={index + earnedAchievements.length}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
