import { View, Text, ScrollView, Pressable, Dimensions, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TripleActivityRings, ActivityRing } from '@/components/ActivityRing';
import { useFitnessStore } from '@/lib/fitness-store';
import { useHealthStore } from '@/lib/health-service';
import { useAuthStore } from '@/lib/auth-store';
import {
  ChevronLeft,
  Flame,
  Timer,
  Activity,
  TrendingUp,
  TrendingDown,
  Scale,
  Target,
  Plus,
  X,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Flag,
  Watch,
  Zap,
  Heart,
  Smartphone,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import Svg, { Rect, Text as SvgText, Path, Line, G, Defs, ClipPath, Circle as SvgCircle } from 'react-native-svg';
import { useState, useEffect } from 'react';

const { width } = Dimensions.get('window');

// BMI Categories
const BMI_CATEGORIES = [
  { label: 'Underweight', min: 0, max: 18.5, color: '#3B82F6' },
  { label: 'Healthy', min: 18.5, max: 25, color: '#22C55E' },
  { label: 'Overweight', min: 25, max: 30, color: '#EAB308' },
  { label: 'Obese', min: 30, max: 50, color: '#EF4444' },
];

function getBMICategory(bmi: number) {
  return BMI_CATEGORIES.find((cat) => bmi >= cat.min && bmi < cat.max) || BMI_CATEGORIES[3];
}

interface BMIScaleProps {
  bmi: number;
}

function BMIScale({ bmi }: BMIScaleProps) {
  const scaleWidth = width - 80;
  const scaleHeight = 24;
  const sectionWidth = scaleWidth / 4;
  
  const category = getBMICategory(bmi);

  const getMarkerPosition = (bmiValue: number) => {
    if (bmiValue < 18.5) {
      const progress = Math.max(0, bmiValue - 10) / 8.5;
      return progress * sectionWidth;
    } else if (bmiValue < 25) {
      const progress = (bmiValue - 18.5) / 6.5;
      return sectionWidth + progress * sectionWidth;
    } else if (bmiValue < 30) {
      const progress = (bmiValue - 25) / 5;
      return sectionWidth * 2 + progress * sectionWidth;
    } else {
      const progress = Math.min((bmiValue - 30) / 10, 1);
      return sectionWidth * 3 + progress * sectionWidth;
    }
  };

  const markerPosition = getMarkerPosition(bmi);

  return (
    <View className="mt-4">
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-gray-400 text-sm">Your BMI</Text>
          <Text className="text-white text-4xl font-bold">{bmi.toFixed(1)}</Text>
        </View>
        <View
          className="px-4 py-2 rounded-full"
          style={{ backgroundColor: category.color + '20' }}
        >
          <Text style={{ color: category.color }} className="font-semibold">
            {category.label}
          </Text>
        </View>
      </View>

      <View className="items-center">
        <Svg width={scaleWidth} height={50}>
          <Defs>
            <ClipPath id="roundedClip">
              <Rect x={0} y={10} width={scaleWidth} height={scaleHeight} rx={12} ry={12} />
            </ClipPath>
          </Defs>

          <Rect x={0} y={10} width={scaleWidth} height={scaleHeight} rx={12} ry={12} fill="#1C1C1E" />

          <G clipPath="url(#roundedClip)">
            <Rect x={0} y={10} width={sectionWidth} height={scaleHeight} fill="#3B82F6" />
            <Rect x={sectionWidth} y={10} width={sectionWidth} height={scaleHeight} fill="#22C55E" />
            <Rect x={sectionWidth * 2} y={10} width={sectionWidth} height={scaleHeight} fill="#EAB308" />
            <Rect x={sectionWidth * 3} y={10} width={sectionWidth} height={scaleHeight} fill="#EF4444" />
          </G>

          <Line x1={markerPosition} y1={6} x2={markerPosition} y2={38} stroke="white" strokeWidth={2} />
        </Svg>
      </View>

      <View className="flex-row justify-between mt-3 px-1">
        <View className="items-center flex-1">
          <Text className="text-xs font-medium" style={{ color: '#3B82F6' }}>Underweight</Text>
          <Text className="text-gray-600 text-[10px]">&lt;18.5</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-xs font-medium" style={{ color: '#22C55E' }}>Healthy</Text>
          <Text className="text-gray-600 text-[10px]">18.5-24.9</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-xs font-medium" style={{ color: '#EAB308' }}>Overweight</Text>
          <Text className="text-gray-600 text-[10px]">25-29.9</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-xs font-medium" style={{ color: '#EF4444' }}>Obese</Text>
          <Text className="text-gray-600 text-[10px]">&gt;30</Text>
        </View>
      </View>
    </View>
  );
}

interface WeightEntry {
  date: string;
  weight: number;
}

type TimeRange = '5D' | '15D' | '30D' | '60D';

interface WeightProgressChartProps {
  data: WeightEntry[];
  goalWeight: number;
  startWeight: number;
}

function WeightProgressChart({ data, goalWeight, startWeight }: WeightProgressChartProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>('30D');
  const chartWidth = width - 48;
  const chartHeight = 180;
  const paddingTop = 30;
  const paddingBottom = 40;
  const paddingLeft = 40;
  const paddingRight = 35;

  // Filter data based on selected range - direct calculation (no memo)
  const getFilteredData = () => {
    if (data.length === 0) return [];
    
    const now = new Date();
    let cutoffDate: Date;
    
    switch (selectedRange) {
      case '5D':
        cutoffDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
        break;
      case '15D':
        cutoffDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
        break;
      case '30D':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '60D':
      default:
        cutoffDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        break;
    }
    
    const filtered = data.filter(d => new Date(d.date) >= cutoffDate);
    console.log(`[WeightChart] Range: ${selectedRange}, Cutoff: ${cutoffDate.toISOString()}, Data points: ${filtered.length}`);
    return filtered;
  };

  const filteredData = getFilteredData();

  // Calculate progress percentage
  const currentWeight = data.length > 0 ? data[data.length - 1].weight : startWeight;
  const totalToLose = startWeight - goalWeight;
  const actualLost = startWeight - currentWeight;
  const progressPercent = totalToLose > 0 ? Math.round((actualLost / totalToLose) * 100) : 0;

  if (filteredData.length === 0) {
    return (
      <View className="bg-fitness-card rounded-2xl p-5 mb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-white text-lg font-semibold">Weight Progress</Text>
          <View className="flex-row items-center bg-white/10 px-3 py-1 rounded-full">
            <Flag size={14} color="#9CA3AF" />
            <Text className="text-gray-400 text-sm ml-1">{progressPercent}% of goal</Text>
          </View>
        </View>
        
        <View className="h-40 items-center justify-center">
          <Text className="text-gray-500 text-center">
            No weight data for this period.{'\n'}Try a longer time range.
          </Text>
        </View>

        {/* Time range tabs */}
        <View className="flex-row bg-black/30 rounded-xl p-1 mt-4">
          {(['5D', '15D', '30D', '60D'] as TimeRange[]).map((range) => (
            <Pressable
              key={range}
              onPress={() => setSelectedRange(range)}
              className={`flex-1 py-2 rounded-lg ${selectedRange === range ? 'bg-white/20' : ''}`}
            >
              <Text className={`text-center text-sm ${selectedRange === range ? 'text-white font-medium' : 'text-gray-500'}`}>
                {range}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  const weights = filteredData.map((d) => d.weight);
  const dataMin = Math.min(...weights);
  const dataMax = Math.max(...weights);
  const dataRange = dataMax - dataMin;
  
  // Add small padding, but ensure minimum range of 2 lbs for visibility
  // If data varies by less than 2 lbs, center the range around the data
  const minRange = 2;
  const padding = Math.max(dataRange * 0.1, 0.5); // 10% padding or 0.5 lbs minimum
  
  let minWeight: number;
  let maxWeight: number;
  
  if (dataRange < minRange) {
    // Data is very flat, create artificial range centered on data
    const center = (dataMin + dataMax) / 2;
    minWeight = center - minRange / 2;
    maxWeight = center + minRange / 2;
  } else {
    minWeight = dataMin - padding;
    maxWeight = dataMax + padding;
  }
  
  const weightRange = maxWeight - minWeight;

  const graphWidth = chartWidth - paddingLeft - paddingRight;
  const graphHeight = chartHeight - paddingTop - paddingBottom;

  const getY = (weight: number) => {
    return paddingTop + ((maxWeight - weight) / weightRange) * graphHeight;
  };

  const getX = (index: number) => {
    if (filteredData.length === 1) return paddingLeft + graphWidth / 2;
    return paddingLeft + (index / (filteredData.length - 1)) * graphWidth;
  };

  const linePath = filteredData
    .map((d, i) => {
      const x = getX(i);
      const y = getY(d.weight);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Generate Y-axis labels - show ~4 labels with 1 decimal precision
  const yLabels: number[] = [];
  const labelStep = weightRange / 3;
  for (let i = 0; i <= 3; i++) {
    yLabels.push(maxWeight - (i * labelStep));
  }

  // Generate X-axis labels - only show first, middle, and last for cleaner display
  const getXLabels = () => {
    if (filteredData.length === 1) return [0];
    if (filteredData.length === 2) return [0, 1];
    if (filteredData.length <= 5) return filteredData.map((_, i) => i);
    // For more data points, show first, middle, last
    return [0, Math.floor(filteredData.length / 2), filteredData.length - 1];
  };
  const xLabelIndices = [...new Set(getXLabels())]; // Remove any duplicates

  return (
    <View key={`chart-container-${selectedRange}`} className="bg-fitness-card rounded-2xl p-5 mb-4">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-white text-lg font-semibold">Weight Progress</Text>
        <View className="flex-row items-center bg-white/10 px-3 py-1 rounded-full">
          <Flag size={14} color="#9CA3AF" />
          <Text className="text-gray-400 text-sm ml-1">{progressPercent}% of goal</Text>
        </View>
      </View>

      <Svg key={`svg-${selectedRange}-${filteredData.length}`} width={chartWidth} height={chartHeight}>
        {/* Horizontal grid lines */}
        {yLabels.map((w, i) => (
          <G key={`grid-${selectedRange}-${i}`}>
            <Line
              x1={paddingLeft}
              y1={getY(w)}
              x2={chartWidth - paddingRight}
              y2={getY(w)}
              stroke="#333"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
            <SvgText
              x={paddingLeft - 8}
              y={getY(w) + 4}
              fontSize={10}
              fill="#6b7280"
              textAnchor="end"
            >
              {w.toFixed(1)}
            </SvgText>
          </G>
        ))}

        {/* Weight line */}
        <Path
          d={linePath}
          stroke="white"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {filteredData.map((d, i) => (
          <SvgCircle
            key={i}
            cx={getX(i)}
            cy={getY(d.weight)}
            r={4}
            fill="white"
          />
        ))}

        {/* X-axis labels */}
        {xLabelIndices.map((idx) => {
          if (idx >= filteredData.length) return null;
          const d = filteredData[idx];
          const date = new Date(d.date);
          const label = `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`;
          return (
            <SvgText
              key={`xlabel-${selectedRange}-${idx}`}
              x={getX(idx)}
              y={chartHeight - 10}
              fontSize={10}
              fill="#6b7280"
              textAnchor="middle"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>

      {/* Time range tabs */}
      <View className="flex-row bg-black/30 rounded-xl p-1 mt-2">
        {(['5D', '15D', '30D', '60D'] as TimeRange[]).map((range) => (
          <Pressable
            key={range}
            onPress={() => setSelectedRange(range)}
            className={`flex-1 py-2 rounded-lg ${selectedRange === range ? 'bg-white/20' : ''}`}
          >
            <Text className={`text-center text-sm ${selectedRange === range ? 'text-white font-medium' : 'text-gray-500'}`}>
              {range}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface WeightChangesProps {
  data: WeightEntry[];
}

function WeightChanges({ data }: WeightChangesProps) {
  const periods = [
    { label: '3 day', days: 3 },
    { label: '7 day', days: 7 },
    { label: '14 day', days: 14 },
    { label: '30 day', days: 30 },
    { label: '90 day', days: 90 },
    { label: 'All Time', days: -1 },
  ];

  const calculateChange = (days: number) => {
    if (data.length < 2) return { change: 0, hasData: false };
    
    const currentWeight = data[data.length - 1].weight;
    const now = new Date();
    
    let compareWeight: number;
    if (days === -1) {
      compareWeight = data[0].weight;
    } else {
      const targetDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const validEntries = data.filter(d => new Date(d.date) <= targetDate);
      if (validEntries.length === 0) {
        return { change: 0, hasData: false };
      }
      compareWeight = validEntries[validEntries.length - 1].weight;
    }
    
    return { change: currentWeight - compareWeight, hasData: true };
  };

  return (
    <View className="bg-fitness-card rounded-2xl p-5">
      <Text className="text-white text-lg font-semibold mb-4">Weight Changes</Text>

      {periods.map((period, index) => {
        const { change, hasData } = calculateChange(period.days);
        const isIncrease = change > 0;
        const isNoChange = Math.abs(change) < 0.1;

        return (
          <View key={period.label} className={`flex-row items-center py-3 ${index !== periods.length - 1 ? 'border-b border-white/5' : ''}`}>
            <Text className="text-gray-400 w-16">{period.label}</Text>

            <Text className="text-white font-medium flex-1 ml-4">
              {hasData ? `${Math.abs(change).toFixed(1)} lbs` : '-- lbs'}
            </Text>

            <View className="flex-row items-center">
              {hasData ? (
                <>
                  {isNoChange ? (
                    <>
                      <ArrowRight size={14} color="#6B7280" />
                      <Text className="text-gray-500 ml-1">No change</Text>
                    </>
                  ) : isIncrease ? (
                    <>
                      <ArrowUpRight size={14} color="#3B82F6" />
                      <Text className="text-blue-400 ml-1">Increase</Text>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight size={14} color="#22C55E" />
                      <Text className="text-green-400 ml-1">Decrease</Text>
                    </>
                  )}
                </>
              ) : (
                <Text className="text-gray-600">No data</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

interface LogWeightModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (weight: number) => void;
  currentWeight: number;
}

function LogWeightModal({ visible, onClose, onSave, currentWeight }: LogWeightModalProps) {
  const [weightInput, setWeightInput] = useState(currentWeight > 0 ? currentWeight.toString() : '');

  const handleSave = () => {
    const weight = parseFloat(weightInput);
    if (!isNaN(weight) && weight > 0) {
      onSave(weight);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <Pressable 
          className="flex-1 bg-black/70 justify-center items-center px-6"
          onPress={onClose}
        >
          <Pressable 
            className="bg-fitness-card w-full rounded-2xl p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-semibold">Log Weight</Text>
              <Pressable
                onPress={onClose}
                className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
              >
                <X size={18} color="white" />
              </Pressable>
            </View>

            <View className="bg-black/30 rounded-xl p-4 mb-6">
              <Text className="text-gray-400 text-sm mb-2">Weight (lbs)</Text>
              <View className="flex-row items-center">
                <TextInput
                  className="flex-1 text-white text-4xl font-bold"
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor="#666"
                  autoFocus
                />
                <Text className="text-gray-400 text-xl ml-2">lbs</Text>
              </View>
            </View>

            <View className="flex-row justify-center gap-3 mb-6">
              {[-1, -0.5, 0.5, 1].map((delta) => (
                <Pressable
                  key={delta}
                  onPress={() => {
                    const current = parseFloat(weightInput) || 0;
                    setWeightInput((current + delta).toFixed(1));
                  }}
                  className="bg-white/10 px-4 py-2 rounded-full"
                >
                  <Text className="text-white font-medium">
                    {delta > 0 ? '+' : ''}{delta}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={handleSave}
              className="bg-purple-500 rounded-xl py-4 items-center"
            >
              <Text className="text-white font-semibold text-lg">Save Weight</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface GoalEditModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (goal: number) => void;
  currentGoal: number;
  currentWeight: number;
}

function GoalEditModal({ visible, onClose, onSave, currentGoal, currentWeight }: GoalEditModalProps) {
  const [goalInput, setGoalInput] = useState(currentGoal > 0 ? currentGoal.toString() : '');

  const handleSave = () => {
    const goal = parseFloat(goalInput);
    if (!isNaN(goal) && goal > 0) {
      onSave(goal);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <Pressable 
          className="flex-1 bg-black/70 justify-center items-center px-6"
          onPress={onClose}
        >
          <Pressable 
            className="bg-fitness-card w-full rounded-2xl p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-semibold">Set Weight Goal</Text>
              <Pressable
                onPress={onClose}
                className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
              >
                <X size={18} color="white" />
              </Pressable>
            </View>

            <View className="bg-black/30 rounded-xl p-4 mb-4">
              <Text className="text-gray-400 text-sm mb-2">Goal Weight (lbs)</Text>
              <View className="flex-row items-center">
                <TextInput
                  className="flex-1 text-white text-4xl font-bold"
                  value={goalInput}
                  onChangeText={setGoalInput}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor="#666"
                  autoFocus
                />
                <Text className="text-gray-400 text-xl ml-2">lbs</Text>
              </View>
            </View>

            {currentWeight > 0 && goalInput && (
              <View className="bg-green-500/10 rounded-xl p-3 mb-6">
                <Text className="text-green-400 text-center">
                  {parseFloat(goalInput) < currentWeight 
                    ? `${(currentWeight - parseFloat(goalInput)).toFixed(1)} lbs to lose`
                    : parseFloat(goalInput) > currentWeight
                    ? `${(parseFloat(goalInput) - currentWeight).toFixed(1)} lbs to gain`
                    : "You're at your goal!"}
                </Text>
              </View>
            )}

            <Pressable
              onPress={handleSave}
              className="bg-green-500 rounded-xl py-4 items-center"
            >
              <Text className="text-white font-semibold text-lg">Save Goal</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface RingDetailCardProps {
  title: string;
  icon: React.ReactNode;
  current: number;
  goal: number;
  unit: string;
  color: string;
  progress: number;
  subtitle: string;
  delay?: number;
}

function RingDetailCard({
  title,
  icon,
  current,
  goal,
  unit,
  color,
  progress,
  subtitle,
  delay = 0,
}: RingDetailCardProps) {
  const percentage = Math.round(progress * 100);

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(delay)} className="mb-4">
      <View className="bg-fitness-card rounded-2xl p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <View className="mr-4">
              <ActivityRing
                size={70}
                strokeWidth={8}
                progress={progress}
                color={color}
                backgroundColor={color + '30'}
              />
              <View className="absolute inset-0 items-center justify-center">
                <Text className="text-white text-sm font-bold">{percentage}%</Text>
              </View>
            </View>
            <View className="flex-1">
              <View className="flex-row items-center">
                {icon}
                <Text className="text-white text-lg font-semibold ml-2">{title}</Text>
              </View>
              <Text className="text-gray-400 text-sm mt-1">{subtitle}</Text>
            </View>
          </View>
          <View className="items-end">
            <Text className="text-3xl font-bold" style={{ color }}>
              {current}
            </Text>
            <Text className="text-gray-500 text-sm">
              / {goal} {unit}
            </Text>
          </View>
        </View>

        <View className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
          <Animated.View
            entering={FadeIn.delay(delay + 200)}
            className="h-full rounded-full"
            style={{
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor: color,
            }}
          />
        </View>

        <View className="flex-row mt-4 pt-3 border-t border-white/10">
          <View className="flex-1">
            <Text className="text-gray-500 text-xs">Remaining</Text>
            <Text className="text-white font-semibold">
              {Math.max(goal - current, 0)} {unit}
            </Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-gray-500 text-xs">Goal</Text>
            <Text className="text-white font-semibold">
              {goal} {unit}
            </Text>
          </View>
          <View className="flex-1 items-end">
            <Text className="text-gray-500 text-xs">Progress</Text>
            <Text className="text-white font-semibold">
              {percentage}%
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export default function ActivityDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const currentUser = useFitnessStore((s) => s.currentUser);

  const currentMetrics = useHealthStore((s) => s.currentMetrics);
  const goals = useHealthStore((s) => s.goals);
  const weight = useHealthStore((s) => s.weight);
  const bmiData = useHealthStore((s) => s.bmi);
  const weightHistory = useHealthStore((s) => s.weightHistory) ?? [];
  const workouts = useHealthStore((s) => s.workouts);
  const syncWorkouts = useHealthStore((s) => s.syncWorkouts);
  const activeProvider = useHealthStore((s) => s.activeProvider);
  const logWeight = useHealthStore((s) => s.logWeight);
  const getWeightGoal = useHealthStore((s) => s.getWeightGoal);
  const setWeightGoal = useHealthStore((s) => s.setWeightGoal);
  const authUser = useAuthStore((s) => s.user);
  
  // Get weight goal for current user
  const weightGoal = authUser?.id ? getWeightGoal(authUser.id) : getWeightGoal();

  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);

  // Calculate start weight from first history entry
  const startWeight = weightHistory.length > 0 ? weightHistory[0].weight : (weight?.value ?? 0);
  const goalWeight = weightGoal ?? 0;

  const moveCalories = currentMetrics?.activeCalories ?? currentUser.moveCalories;
  const exerciseMinutes = currentMetrics?.exerciseMinutes ?? currentUser.exerciseMinutes;
  const standHours = currentMetrics?.standHours ?? currentUser.standHours;

  const moveGoal = goals.moveCalories;
  const exerciseGoal = goals.exerciseMinutes;
  const standGoal = goals.standHours;

  const moveProgress = moveCalories / moveGoal;
  const exerciseProgress = exerciseMinutes / exerciseGoal;
  const standProgress = standHours / standGoal;

  const currentWeight = weight?.value ?? 0;
  const bmi = bmiData?.value ?? 0;

  // Sync today's workouts on mount and when activeProvider changes
  useEffect(() => {
    if (activeProvider && syncWorkouts) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      
      console.log('[ActivityDetail] Syncing workouts for today:', {
        start: today.toISOString(),
        end: endOfToday.toISOString(),
      });
      
      syncWorkouts(today, endOfToday).catch((error) => {
        console.error('[ActivityDetail] Error syncing workouts:', error);
      });
    }
  }, [activeProvider, syncWorkouts]);

  // Filter workouts for today - use a more robust date comparison
  const todayWorkouts = workouts.filter((workout) => {
    try {
      const workoutDate = new Date(workout.startTime);
      const today = new Date();
      
      // Reset time to midnight for accurate date comparison
      const workoutDay = new Date(workoutDate.getFullYear(), workoutDate.getMonth(), workoutDate.getDate());
      const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      const isToday = workoutDay.getTime() === todayDay.getTime();
      
      if (isToday) {
        console.log('[ActivityDetail] Found today workout:', {
          type: workout.type,
          startTime: workout.startTime,
          duration: workout.duration,
        });
      }
      
      return isToday;
    } catch (error) {
      console.error('[ActivityDetail] Error filtering workout:', error, workout);
      return false;
    }
  });

  // Log for debugging
  useEffect(() => {
    console.log('[ActivityDetail] Workouts state:', {
      total: workouts.length,
      today: todayWorkouts.length,
      activeProvider,
      workoutDetails: workouts.map(w => ({
        type: w.type,
        startTime: w.startTime,
        date: new Date(w.startTime).toDateString(),
      })),
    });
  }, [workouts, todayWorkouts, activeProvider]);

  const handleLogWeight = (newWeight: number) => {
    if (logWeight) {
      logWeight(newWeight);
    }
  };

  const handleSetGoal = async (newGoal: number) => {
    if (setWeightGoal) {
      await setWeightGoal(newGoal, authUser?.id);
    }
  };

  // Get workout app icon based on source name
  const getWorkoutAppIcon = (sourceName?: string, sourceId?: string): { icon: React.ReactNode; color: string } => {
    if (!sourceName) {
      return { icon: <Activity size={24} color="#6B7280" />, color: '#6B7280' };
    }

    const sourceLower = sourceName.toLowerCase();
    
    // Apple Watch / Apple Health
    if (sourceLower.includes('apple') || sourceLower.includes('watch')) {
      return { icon: <Watch size={24} color="#FF2D55" />, color: '#FF2D55' };
    }
    
    // Nike Run Club
    if (sourceLower.includes('nike')) {
      return { icon: <Zap size={24} color="#000000" />, color: '#000000' };
    }
    
    // Strava
    if (sourceLower.includes('strava')) {
      return { icon: <Flame size={24} color="#FC4C02" />, color: '#FC4C02' };
    }
    
    // Peloton
    if (sourceLower.includes('peloton')) {
      return { icon: <Heart size={24} color="#000000" />, color: '#000000' };
    }
    
    // MyFitnessPal
    if (sourceLower.includes('myfitness') || sourceLower.includes('mfp')) {
      return { icon: <Activity size={24} color="#E94B3C" />, color: '#E94B3C' };
    }
    
    // Fitbit
    if (sourceLower.includes('fitbit')) {
      return { icon: <Watch size={24} color="#00B0B9" />, color: '#00B0B9' };
    }
    
    // Garmin
    if (sourceLower.includes('garmin')) {
      return { icon: <Watch size={24} color="#007CC3" />, color: '#007CC3' };
    }
    
    // Default - show source name as text
    return { 
      icon: <View className="w-6 h-6 rounded bg-gray-600 items-center justify-center">
        <Text className="text-white text-xs font-bold">
          {sourceName.charAt(0).toUpperCase()}
        </Text>
      </View>, 
      color: '#6B7280' 
    };
  };

  // Get workout type label
  const getWorkoutTypeLabel = (type: string) => {
    switch (type) {
      case 'running':
        return 'Running';
      case 'walking':
        return 'Walking';
      case 'cycling':
        return 'Cycling';
      case 'swimming':
        return 'Swimming';
      case 'strength':
        return 'Strength';
      case 'hiit':
        return 'HIIT';
      case 'yoga':
        return 'Yoga';
      default:
        return 'Workout';
    }
  };

  return (
    <View className="flex-1 bg-black">
      <LogWeightModal
        visible={showWeightModal}
        onClose={() => setShowWeightModal(false)}
        onSave={handleLogWeight}
        currentWeight={currentWeight}
      />

      <GoalEditModal
        visible={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        onSave={handleSetGoal}
        currentGoal={goalWeight}
        currentWeight={currentWeight}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#1a1a2e', '#000000']}
          style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24 }}
        >
          <View className="flex-row items-center mb-6">
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
            >
              <ChevronLeft size={24} color="white" />
            </Pressable>
            <Text className="text-white text-xl font-semibold ml-4">Activity</Text>
          </View>

          <Animated.View entering={FadeInDown.duration(600)} className="items-center">
            <TripleActivityRings
              size={width * 0.55}
              moveProgress={moveProgress}
              exerciseProgress={exerciseProgress}
              standProgress={standProgress}
              moveGoal={moveGoal}
              exerciseGoal={exerciseGoal}
              standGoal={standGoal}
            />
          </Animated.View>

          <Animated.View
            entering={FadeInDown.duration(600).delay(100)}
            className="flex-row justify-around mt-6"
          >
            <View className="items-center">
              <Text className="text-ring-move text-2xl font-bold">{Math.round(moveProgress * 100)}%</Text>
              <Text className="text-gray-400 text-sm">Move</Text>
            </View>
            <View className="items-center">
              <Text className="text-ring-exercise text-2xl font-bold">{Math.round(exerciseProgress * 100)}%</Text>
              <Text className="text-gray-400 text-sm">Exercise</Text>
            </View>
            <View className="items-center">
              <Text className="text-ring-stand text-2xl font-bold">{Math.round(standProgress * 100)}%</Text>
              <Text className="text-gray-400 text-sm">Stand</Text>
            </View>
          </Animated.View>
        </LinearGradient>

        {/* Ring Details */}
        <View className="px-5 mt-6">
          <Text className="text-white text-xl font-semibold mb-4">Today's Progress</Text>

          <RingDetailCard
            title="Move"
            icon={<Flame size={20} color="#FA114F" />}
            current={moveCalories}
            goal={moveGoal}
            unit="CAL"
            color="#FA114F"
            progress={moveProgress}
            subtitle="Active calories burned"
            delay={200}
          />

          <RingDetailCard
            title="Exercise"
            icon={<Timer size={20} color="#92E82A" />}
            current={exerciseMinutes}
            goal={exerciseGoal}
            unit="MIN"
            color="#92E82A"
            progress={exerciseProgress}
            subtitle="Minutes of brisk activity"
            delay={300}
          />

          <RingDetailCard
            title="Stand"
            icon={<Activity size={20} color="#00D4FF" />}
            current={standHours}
            goal={standGoal}
            unit="HRS"
            color="#00D4FF"
            progress={standProgress}
            subtitle="Hours with standing"
            delay={400}
          />

          {/* Workouts Section */}
          <Animated.View entering={FadeInDown.duration(500).delay(500)} className="mt-6">
            <Text className="text-white text-xl font-semibold mb-4">Workouts</Text>
            
            {todayWorkouts.length === 0 ? (
              <View className="bg-fitness-card rounded-2xl p-6 items-center justify-center">
                <Text className="text-gray-400 text-center">
                  No workouts recorded today
                </Text>
              </View>
            ) : (
              <View>
                {todayWorkouts.map((workout, index) => {
                  const appIcon = getWorkoutAppIcon(workout.sourceName, workout.sourceId);
                  const workoutLabel = getWorkoutTypeLabel(workout.type);
                  const startTime = new Date(workout.startTime);
                  const endTime = new Date(workout.endTime);
                  const timeString = `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                  
                  return (
                    <Animated.View
                      key={workout.id}
                      entering={FadeInDown.duration(400).delay(500 + index * 100)}
                      className="bg-fitness-card rounded-2xl p-4 mb-3"
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center flex-1">
                          <View
                            className="w-12 h-12 rounded-full items-center justify-center"
                            style={{ backgroundColor: appIcon.color + '20' }}
                          >
                            {appIcon.icon}
                          </View>
                          <View className="ml-4 flex-1">
                            <Text className="text-white text-base font-semibold">
                              {workoutLabel}
                            </Text>
                            <Text className="text-gray-400 text-sm mt-0.5">
                              {timeString}
                              {workout.sourceName && ` • ${workout.sourceName}`}
                            </Text>
                          </View>
                        </View>
                        <View className="items-end">
                          <Text className="text-white text-lg font-bold">
                            {workout.duration}
                          </Text>
                          <Text className="text-gray-500 text-xs">min</Text>
                        </View>
                      </View>
                      
                      {(workout.calories > 0 || workout.distance || workout.heartRateAvg) && (
                        <View className="flex-row mt-3 pt-3 border-t border-white/10">
                          {workout.calories > 0 && (
                            <View className="flex-1">
                              <Text className="text-gray-500 text-xs">Calories</Text>
                              <Text className="text-white font-semibold text-sm">
                                {workout.calories}
                              </Text>
                            </View>
                          )}
                          {workout.distance && (
                            <View className="flex-1">
                              <Text className="text-gray-500 text-xs">Distance</Text>
                              <Text className="text-white font-semibold text-sm">
                                {(workout.distance / 1000).toFixed(2)} km
                              </Text>
                            </View>
                          )}
                          {workout.heartRateAvg && (
                            <View className="flex-1 items-end">
                              <Text className="text-gray-500 text-xs">Avg HR</Text>
                              <Text className="text-white font-semibold text-sm">
                                {Math.round(workout.heartRateAvg)} bpm
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </Animated.View>
        </View>

        {/* Weight Section */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-white text-xl font-semibold">Weight & Body</Text>
            <Pressable
              onPress={() => setShowWeightModal(true)}
              className="flex-row items-center bg-purple-500/20 px-3 py-2 rounded-full"
            >
              <Plus size={16} color="#A855F7" />
              <Text className="text-purple-400 font-medium ml-1">Log Weight</Text>
            </Pressable>
          </View>

          {/* Current Weight Card */}
          <Animated.View entering={FadeInDown.duration(500).delay(500)}>
            <View className="bg-fitness-card rounded-2xl p-5 mb-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1">
                  <View className="w-12 h-12 rounded-full bg-purple-500/20 items-center justify-center">
                    <Scale size={24} color="#A855F7" />
                  </View>
                  <View className="ml-4">
                    <Text className="text-gray-400 text-sm">Current Weight</Text>
                    <Text className="text-white text-2xl font-bold">
                      {currentWeight > 0 ? `${currentWeight.toFixed(1)} lbs` : '-- lbs'}
                    </Text>
                  </View>
                </View>
                
                {/* Goal section */}
                <Pressable 
                  onPress={() => setShowGoalModal(true)}
                  className="items-end"
                >
                  <Text className="text-gray-400 text-sm">Goal</Text>
                  <Text className="text-green-400 text-xl font-bold">
                    {goalWeight > 0 ? `${goalWeight} lbs` : 'Set goal'}
                  </Text>
                </Pressable>
              </View>
              
              {/* Progress bar */}
              {goalWeight > 0 && currentWeight > 0 && startWeight > 0 && (
                <View className="mt-4 pt-4 border-t border-white/10">
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-gray-500 text-xs">Start: {startWeight.toFixed(1)} lbs</Text>
                    <Text className="text-gray-500 text-xs">
                      {Math.abs(currentWeight - goalWeight).toFixed(1)} lbs to go
                    </Text>
                  </View>
                  <View className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <View
                      className="h-full bg-green-500 rounded-full"
                      style={{
                        width: `${Math.min(Math.max(
                          ((startWeight - currentWeight) / (startWeight - goalWeight)) * 100,
                          0
                        ), 100)}%`,
                      }}
                    />
                  </View>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Weight Progress Chart */}
          <Animated.View entering={FadeInDown.duration(500).delay(550)}>
            <WeightProgressChart 
              data={weightHistory} 
              goalWeight={goalWeight}
              startWeight={startWeight}
            />
          </Animated.View>

          {/* Weight Changes */}
          <Animated.View entering={FadeInDown.duration(500).delay(600)}>
            <WeightChanges data={weightHistory} />
          </Animated.View>

          {/* BMI Scale */}
          {bmi > 0 && (
            <Animated.View entering={FadeInDown.duration(500).delay(650)}>
              <View className="bg-fitness-card rounded-2xl p-5 mt-4">
                <BMIScale bmi={bmi} />
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
