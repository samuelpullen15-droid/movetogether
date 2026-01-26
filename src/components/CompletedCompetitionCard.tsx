import { View, Pressable, Image } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/lib/useThemeColors';
import { Calendar, Users, Crown, Trophy } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { CompletedCompetition } from '@/lib/competition-service';

function getCompetitionTypeLabel(type: string, startDate: string, endDate: string): string {
  if (type === 'custom') {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return `${days} Days`;
  }
  return type.charAt(0).toUpperCase() + type.slice(1);
}

interface CompletedCompetitionCardProps {
  competition: CompletedCompetition;
  index: number;
  onPress: () => void;
  userId: string;
}

export function CompletedCompetitionCard({
  competition,
  index,
  onPress,
  userId,
}: CompletedCompetitionCardProps) {
  const colors = useThemeColors();
  const isWinner = competition.winner?.id === userId;

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(index * 100)}>
      <Pressable className="mb-4 active:opacity-80" onPress={onPress}>
        <LinearGradient
          colors={colors.cardGradient}
          style={{ borderRadius: 20, padding: 20 }}
        >
          {/* Header */}
          <View className="flex-row justify-between items-start mb-3">
            <View className="flex-1">
              <View className="flex-row items-center mb-2">
                <View
                  className="px-2 py-1 rounded-full mr-2"
                  style={{ backgroundColor: 'rgba(107, 114, 128, 0.3)' }}
                >
                  <Text style={{ color: '#6b7280' }} className="text-xs font-medium">
                    Completed
                  </Text>
                </View>
                <Text style={{ color: colors.textSecondary }} className="text-xs">
                  {getCompetitionTypeLabel(competition.type, competition.startDate, competition.endDate)}
                </Text>
              </View>
              <Text style={{ color: colors.text }} className="text-xl font-bold">
                {competition.name}
              </Text>
              {competition.description && (
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-1">
                  {competition.description}
                </Text>
              )}
            </View>
            {/* User's placement badge */}
            {competition.userRank > 0 && (
              <View
                className="px-4 py-2 rounded-xl items-center"
                style={{
                  backgroundColor: isWinner ? 'rgba(250, 17, 79, 0.2)' : colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                }}
              >
                {isWinner ? (
                  <Trophy size={18} color="#FA114F" />
                ) : (
                  <Text style={{ color: colors.textSecondary }} className="text-xs">Placed</Text>
                )}
                <Text
                  style={{ color: isWinner ? '#FA114F' : colors.text }}
                  className="text-xl font-bold"
                >
                  #{competition.userRank}
                </Text>
              </View>
            )}
          </View>

          {/* Winner Section */}
          {competition.winner && (
            <View
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }}
            >
              <View className="flex-row items-center">
                <Crown size={18} color="#FFD700" />
                <Text style={{ color: colors.textSecondary }} className="text-sm ml-2 font-medium">
                  Winner
                </Text>
              </View>
              <View className="flex-row items-center mt-3">
                <Image
                  source={{ uri: competition.winner.avatar }}
                  className="w-10 h-10 rounded-full"
                />
                <View className="flex-1 ml-3">
                  <Text
                    style={{ color: competition.winner.id === userId ? '#FA114F' : colors.text }}
                    className="font-semibold text-base"
                  >
                    {competition.winner.name}
                    {competition.winner.id === userId && ' (You)'}
                  </Text>
                  <Text style={{ color: colors.textSecondary }} className="text-sm">
                    {competition.winner.points.toLocaleString()} pts
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Your Stats (if not winner) */}
          {competition.userRank > 1 && (
            <View
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)' }}
            >
              <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-1">
                Your Result
              </Text>
              <Text style={{ color: colors.text }} className="text-base font-semibold">
                {competition.userPoints.toLocaleString()} pts
              </Text>
            </View>
          )}

          {/* Footer */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Calendar size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary }} className="text-sm ml-2">
                {new Date(competition.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                {new Date(competition.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Users size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary }} className="text-sm ml-2">
                {competition.participantCount} {competition.participantCount === 1 ? 'person' : 'people'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
