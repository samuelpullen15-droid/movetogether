import { View, Pressable, Image } from 'react-native';
import { Text, DisplayText } from '@/components/Text';
import { Card } from '@/components/Card';
import { useThemeColors } from '@/lib/useThemeColors';
import { Calendar, Users, Crown, Trophy } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { cardEnter } from '@/lib/animations';
import type { CompletedCompetition } from '@/lib/competition-service';

/**
 * Parse a date string (YYYY-MM-DD) as a local date, not UTC.
 * This prevents the date from shifting to the previous day in timezones west of UTC.
 */
function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getCompetitionTypeLabel(type: string, startDate: string, endDate: string): string {
  if (type === 'custom') {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
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
    <Animated.View entering={cardEnter(index)}>
      <Pressable className="mb-4 active:scale-[0.98]" onPress={onPress}>
        <Card variant="surface" radius={20}>
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
              <DisplayText style={{ color: colors.text }} className="text-xl font-bold">
                {competition.name}
              </DisplayText>
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

          {/* Prize Won / Prize Pool */}
          {competition.userPrizeWon && competition.userPrizeWon > 0 ? (
            <View
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: 'rgba(255, 215, 0, 0.1)' }}
            >
              <View className="flex-row items-center">
                <Trophy size={18} color="#FFD700" />
                <Text style={{ color: '#FFD700' }} className="text-sm ml-2 font-medium">
                  Prize Won
                </Text>
              </View>
              <DisplayText style={{ color: '#FFD700' }} className="text-2xl font-bold mt-2">
                ${competition.userPrizeWon.toFixed(2)}
              </DisplayText>
            </View>
          ) : competition.hasPrizePool && competition.prizePoolAmount ? (
            <View
              className="rounded-xl p-3 mb-4 flex-row items-center"
              style={{ backgroundColor: colors.isDark ? 'rgba(255,215,0,0.05)' : 'rgba(255,215,0,0.08)' }}
            >
              <Trophy size={16} color="#DAA520" />
              <Text style={{ color: '#DAA520' }} className="text-sm ml-2">
                Prize Pool: ${competition.prizePoolAmount}
              </Text>
            </View>
          ) : null}

          {/* Footer */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Calendar size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary }} className="text-sm ml-2">
                {parseLocalDate(competition.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                {parseLocalDate(competition.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Users size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary }} className="text-sm ml-2">
                {competition.participantCount} {competition.participantCount === 1 ? 'person' : 'people'}
              </Text>
            </View>
          </View>
        </Card>
      </Pressable>
    </Animated.View>
  );
}
