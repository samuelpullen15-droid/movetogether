import React, { useMemo } from 'react';
import { View, Pressable, ScrollView, Dimensions } from 'react-native';
import { Text } from '@/components/Text';
import { TripleActivityRings } from '@/components/ActivityRing';
import { useThemeColors } from '@/lib/useThemeColors';

const { width: screenWidth } = Dimensions.get('window');
const RING_SIZE = 32;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKS_TO_SHOW = 4;

export interface DayActivityData {
  date: string;
  moveCalories: number;
  exerciseMinutes: number;
  standHours: number;
  stepCount: number;
  workoutsCompleted: number;
}

interface WeeklyDayStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  allActivity: Record<string, DayActivityData>;
  todayLiveData: DayActivityData | null;
  goals: {
    moveCalories: number;
    exerciseMinutes: number;
    standHours: number;
  };
  colors: ReturnType<typeof useThemeColors>;
}

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generateWeeks(numWeeks: number) {
  const today = new Date();
  const todayStr = getTodayString();

  // Find Monday of the current week
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() + mondayOffset);
  currentMonday.setHours(0, 0, 0, 0);

  const weeks: Array<{
    key: string;
    days: Array<{
      date: string;
      dayLetter: string;
      isToday: boolean;
      isFuture: boolean;
    }>;
  }> = [];

  for (let w = numWeeks - 1; w >= 0; w--) {
    const weekMonday = new Date(currentMonday);
    weekMonday.setDate(currentMonday.getDate() - w * 7);

    const days = DAY_LETTERS.map((letter, index) => {
      const d = new Date(weekMonday);
      d.setDate(weekMonday.getDate() + index);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isFuture = dayStart.getTime() > todayStart.getTime();

      return {
        date: dateStr,
        dayLetter: letter,
        isToday: dateStr === todayStr,
        isFuture,
      };
    });

    weeks.push({
      key: `week-${weekMonday.toISOString().split('T')[0]}`,
      days,
    });
  }

  return weeks;
}

export function WeeklyDayStrip({
  selectedDate,
  onSelectDate,
  allActivity,
  todayLiveData,
  goals,
  colors,
}: WeeklyDayStripProps) {
  const weeks = useMemo(() => generateWeeks(WEEKS_TO_SHOW), []);

  // Start scrolled to the last page (current week)
  const initialOffset = screenWidth * (WEEKS_TO_SHOW - 1);

  return (
    <View style={{ marginBottom: 12, marginHorizontal: -20 }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: initialOffset, y: 0 }}
      >
        {weeks.map((week) => (
          <View
            key={week.key}
            style={{
              width: screenWidth,
              flexDirection: 'row',
              paddingHorizontal: 20,
            }}
          >
            {week.days.map((day) => {
              let activity: DayActivityData | null = null;
              if (day.isToday && todayLiveData) {
                activity = todayLiveData;
              } else {
                activity = allActivity[day.date] || null;
              }

              const moveProgress =
                activity && goals.moveCalories > 0
                  ? activity.moveCalories / goals.moveCalories
                  : 0;
              const exerciseProgress =
                activity && goals.exerciseMinutes > 0
                  ? activity.exerciseMinutes / goals.exerciseMinutes
                  : 0;
              const standProgress =
                activity && goals.standHours > 0
                  ? activity.standHours / goals.standHours
                  : 0;

              const isSelected = selectedDate === day.date;
              const opacity = day.isFuture ? 0.3 : 1;

              return (
                <Pressable
                  key={day.date}
                  onPress={day.isFuture ? undefined : () => onSelectDate(day.date)}
                  disabled={day.isFuture}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 4,
                    opacity,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: isSelected ? '700' : '500',
                      color: isSelected
                        ? colors.text
                        : day.isToday
                          ? '#FA114F'
                          : '#8E8E93',
                      marginBottom: 4,
                    }}
                  >
                    {day.dayLetter}
                  </Text>

                  <TripleActivityRings
                    size={RING_SIZE}
                    moveProgress={moveProgress}
                    exerciseProgress={exerciseProgress}
                    standProgress={standProgress}
                    moveGoal={goals.moveCalories}
                    exerciseGoal={goals.exerciseMinutes}
                    standGoal={goals.standHours}
                    forceRender
                  />

                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 2.5,
                      backgroundColor: isSelected ? '#FA114F' : 'transparent',
                      marginTop: 4,
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
