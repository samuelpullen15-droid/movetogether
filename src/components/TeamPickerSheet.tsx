import { useMemo, useCallback } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Users } from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';
import * as Haptics from 'expo-haptics';
import type { TeamInfo } from '@/lib/fitness-store';

interface TeamPickerSheetProps {
  sheetRef: React.RefObject<BottomSheet | null>;
  teams: TeamInfo[];
  onTeamSelected: (teamId: string) => void;
  onClose?: () => void;
  isJoining?: boolean;
}

export default function TeamPickerSheet({
  sheetRef,
  teams,
  onTeamSelected,
  onClose,
  isJoining = false,
}: TeamPickerSheetProps) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => ['65%'], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  const handleSelect = (teamId: string) => {
    if (isJoining) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onTeamSelected(teamId);
  };

  // Sort teams by team_number
  const sortedTeams = [...teams].sort((a, b) => a.teamNumber - b.teamNumber);

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      backgroundStyle={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF' }}
      handleIndicatorStyle={{ backgroundColor: colors.isDark ? '#48484A' : '#D1D1D6' }}
      backdropComponent={renderBackdrop}
      onChange={(index) => {
        if (index === -1) {
          onClose?.();
        }
      }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text className="text-black dark:text-white text-2xl font-bold">
            Pick Your Team
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Choose which team you want to compete with
          </Text>
        </View>

        {/* Team Cards */}
        {sortedTeams.map((team) => (
          <Pressable
            key={team.id}
            onPress={() => handleSelect(team.id)}
            disabled={isJoining}
            style={({ pressed }) => [
              styles.teamCard,
              {
                backgroundColor: team.color + '10',
                borderColor: team.color + '30',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            {/* Color accent bar */}
            <View
              style={[styles.accentBar, { backgroundColor: team.color }]}
            />

            <View style={styles.teamCardContent}>
              {/* Left: Emoji + Name */}
              <View style={styles.teamInfo}>
                <Text style={{ fontSize: 32 }}>{team.emoji}</Text>
                <View style={styles.teamNameContainer}>
                  <Text className="text-black dark:text-white text-lg font-semibold">
                    {team.name}
                  </Text>
                  <View style={styles.memberRow}>
                    <Users size={14} color={colors.isDark ? '#9ca3af' : '#6b7280'} />
                    <Text className="text-gray-500 dark:text-gray-400 text-sm ml-1">
                      {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Right: Join Button */}
              <Pressable
                onPress={() => handleSelect(team.id)}
                disabled={isJoining}
                style={[styles.joinButton, { backgroundColor: team.color }]}
              >
                {isJoining ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-bold text-sm">Join</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        ))}

        {/* Note */}
        <View style={styles.note}>
          <Text className="text-gray-500 dark:text-gray-400 text-xs text-center">
            You cannot switch teams after joining
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  teamCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  accentBar: {
    height: 4,
    width: '100%',
  },
  teamCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  teamNameContainer: {
    marginLeft: 12,
    flex: 1,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  joinButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  note: {
    marginTop: 8,
    paddingBottom: 20,
  },
});
