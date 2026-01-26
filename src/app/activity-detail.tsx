import { View, ScrollView, Pressable, Dimensions, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TripleActivityRings, ActivityRing } from '@/components/ActivityRing';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { AnimatedText } from '@/components/AnimatedText';
import { ThemeTransition } from '@/components/ThemeTransition';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
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
import { useThemeColors } from '@/lib/useThemeColors';

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
  colors: ReturnType<typeof useThemeColors>;
}

function BMIScale({ bmi, colors }: BMIScaleProps) {
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
    <View>
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="text-sm">Your BMI</AnimatedText>
          <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-4xl font-bold">{bmi.toFixed(1)}</AnimatedText>
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

          <Rect x={0} y={10} width={scaleWidth} height={scaleHeight} rx={12} ry={12} fill={colors.isDark ? '#1C1C1E' : '#E5E7EB'} />

          <G clipPath="url(#roundedClip)">
            <Rect x={0} y={10} width={sectionWidth} height={scaleHeight} fill="#3B82F6" />
            <Rect x={sectionWidth} y={10} width={sectionWidth} height={scaleHeight} fill="#22C55E" />
            <Rect x={sectionWidth * 2} y={10} width={sectionWidth} height={scaleHeight} fill="#EAB308" />
            <Rect x={sectionWidth * 3} y={10} width={sectionWidth} height={scaleHeight} fill="#EF4444" />
          </G>

          <Line x1={markerPosition} y1={6} x2={markerPosition} y2={38} stroke={colors.text} strokeWidth={2} />
        </Svg>
      </View>

      <View className="flex-row justify-between mt-3 px-1">
        <View className="items-center flex-1">
          <Text className="text-xs font-medium" style={{ color: '#3B82F6' }}>Underweight</Text>
          <Text className="text-gray-600 dark:text-gray-600 text-[10px]">&lt;18.5</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-xs font-medium" style={{ color: '#22C55E' }}>Healthy</Text>
          <Text className="text-gray-600 dark:text-gray-600 text-[10px]">18.5-24.9</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-xs font-medium" style={{ color: '#EAB308' }}>Overweight</Text>
          <Text className="text-gray-600 dark:text-gray-600 text-[10px]">25-29.9</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-xs font-medium" style={{ color: '#EF4444' }}>Obese</Text>
          <Text className="text-gray-600 dark:text-gray-600 text-[10px]">&gt;30</Text>
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
  colors: ReturnType<typeof useThemeColors>;
}

function WeightProgressChart({ data, goalWeight, startWeight, colors }: WeightProgressChartProps) {
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
      <View className="overflow-hidden rounded-2xl mb-4">
        <BlurView
          intensity={colors.isDark ? 30 : 20}
          tint={colors.isDark ? 'dark' : 'light'}
          style={{
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(245, 245, 247, 0.7)',
          }}
        >
          <View className="p-5">
            <View className="flex-row items-center justify-between mb-4">
              <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-lg font-semibold">Weight Progress</AnimatedText>
              <View style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} className="flex-row items-center px-3 py-1 rounded-full">
                <Flag size={14} color="#9CA3AF" />
                <Text className="text-gray-400 dark:text-gray-400 text-sm ml-1">{progressPercent}% of goal</Text>
              </View>
            </View>

            <View className="h-40 items-center justify-center">
              <Text className="text-gray-500 dark:text-gray-500 text-center">
                No weight data for this period.{'\n'}Try a longer time range.
              </Text>
            </View>

            {/* Time range tabs */}
            <View style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }} className="flex-row rounded-xl p-1 mt-4">
              {(['5D', '15D', '30D', '60D'] as TimeRange[]).map((range) => (
                <Pressable
                  key={range}
                  onPress={() => setSelectedRange(range)}
                  style={{ backgroundColor: selectedRange === range ? (colors.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)') : 'transparent' }}
                  className="flex-1 py-2 rounded-lg"
                >
                  <Text className={`text-center text-sm ${selectedRange === range ? 'text-black dark:text-white font-medium' : 'text-gray-500 dark:text-gray-500'}`}>
                    {range}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </BlurView>
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
    <View key={`chart-container-${selectedRange}`} className="overflow-hidden rounded-2xl mb-4">
      <BlurView
        intensity={colors.isDark ? 30 : 20}
        tint={colors.isDark ? 'dark' : 'light'}
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(245, 245, 247, 0.7)',
        }}
      >
        <View className="p-5">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-black dark:text-white text-lg font-semibold">Weight Progress</Text>
            <View style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} className="flex-row items-center px-3 py-1 rounded-full">
              <Flag size={14} color="#9CA3AF" />
              <Text className="text-gray-400 dark:text-gray-400 text-sm ml-1">{progressPercent}% of goal</Text>
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
              stroke={colors.isDark ? '#333' : '#E5E7EB'}
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
          stroke={colors.text}
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
            fill={colors.text}
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
          <View style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }} className="flex-row rounded-xl p-1 mt-2">
            {(['5D', '15D', '30D', '60D'] as TimeRange[]).map((range) => (
              <Pressable
                key={range}
                onPress={() => setSelectedRange(range)}
                style={{ backgroundColor: selectedRange === range ? (colors.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)') : 'transparent' }}
                className="flex-1 py-2 rounded-lg"
              >
                <Text className={`text-center text-sm ${selectedRange === range ? 'text-black dark:text-white font-medium' : 'text-gray-500 dark:text-gray-500'}`}>
                  {range}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </BlurView>
    </View>
  );
}

interface WeightChangesProps {
  data: WeightEntry[];
  colors: ReturnType<typeof useThemeColors>;
}

function WeightChanges({ data, colors }: WeightChangesProps) {
  const periods = [
    { label: '3 day', days: 3 },
    { label: '7 day', days: 7 },
    { label: '14 day', days: 14 },
    { label: '30 day', days: 30 },
    { label: '90 day', days: 90 },
    { label: 'All Time', days: -1 },
  ];

  // Ensure data is sorted chronologically (oldest to newest)
  const sortedData = [...data].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const calculateChange = (days: number) => {
    if (sortedData.length < 2) return { change: 0, hasData: false };
    
    const currentWeight = sortedData[sortedData.length - 1].weight;
    const now = new Date();
    
    let compareWeight: number;
    if (days === -1) {
      // All Time: compare to first (oldest) entry
      compareWeight = sortedData[0].weight;
    } else {
      // Find weight entry closest to the target date (X days ago)
      const targetDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      
      // Find the entry closest to the target date
      // We want the entry on or just before the target date
      let closestEntry = null;
      let closestDistance = Infinity;
      
      for (const entry of sortedData) {
        const entryDate = new Date(entry.date);
        const distance = Math.abs(entryDate.getTime() - targetDate.getTime());
        
        // Prefer entries on or before the target date
        if (entryDate <= targetDate && distance < closestDistance) {
          closestEntry = entry;
          closestDistance = distance;
        }
      }
      
      // If no entry before target date, use the closest entry overall (even if after)
      if (!closestEntry) {
        for (const entry of sortedData) {
          const entryDate = new Date(entry.date);
          const distance = Math.abs(entryDate.getTime() - targetDate.getTime());
          
          if (distance < closestDistance) {
            closestEntry = entry;
            closestDistance = distance;
          }
        }
      }
      
      if (!closestEntry) {
        return { change: 0, hasData: false };
      }
      
      // Check if the entry is within a reasonable range (2x the period)
      const daysDifference = closestDistance / (24 * 60 * 60 * 1000);
      if (daysDifference > days * 2) {
        return { change: 0, hasData: false };
      }
      
      compareWeight = closestEntry.weight;
    }
    
    return { change: currentWeight - compareWeight, hasData: true };
  };

  return (
    <View className="overflow-hidden rounded-2xl">
      <BlurView
        intensity={colors.isDark ? 30 : 20}
        tint={colors.isDark ? 'dark' : 'light'}
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(245, 245, 247, 0.7)',
        }}
      >
        <View className="p-5">
          <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-lg font-semibold mb-4">Weight Changes</AnimatedText>

          {periods.map((period, index) => {
        const { change, hasData } = calculateChange(period.days);
        const isIncrease = change > 0;
        const isNoChange = Math.abs(change) < 0.1;

        return (
          <View key={period.label} style={{ borderBottomWidth: index !== periods.length - 1 ? 1 : 0, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} className="flex-row items-center py-3">
            <Text className="text-gray-400 dark:text-gray-400 w-16">{period.label}</Text>

            <Text className="text-black dark:text-white font-medium flex-1 ml-4">
              {hasData ? `${Math.abs(change).toFixed(1)} lbs` : '-- lbs'}
            </Text>

            <View className="flex-row items-center">
              {hasData ? (
                <>
                  {isNoChange ? (
                    <>
                      <ArrowRight size={14} color="#6B7280" />
                      <Text className="text-gray-500 dark:text-gray-500 ml-1">No change</Text>
                    </>
                  ) : isIncrease ? (
                    <>
                      <ArrowUpRight size={14} color="#3B82F6" />
                      <Text className="text-blue-400 dark:text-blue-400 ml-1">Increase</Text>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight size={14} color="#22C55E" />
                      <Text className="text-green-400 dark:text-green-400 ml-1">Decrease</Text>
                    </>
                  )}
                </>
              ) : (
                <Text className="text-gray-600 dark:text-gray-600">No data</Text>
              )}
            </View>
          </View>
        );
      })}
        </View>
      </BlurView>
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
  const [weightInput, setWeightInput] = useState('');
  const colors = useThemeColors();

  // Reset input when modal opens - start empty so user enters fresh value
  useEffect(() => {
    if (visible) {
      setWeightInput('');
    }
  }, [visible]);

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
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
          className="flex-1 justify-center items-center px-6"
          onPress={onClose}
        >
          <Pressable
            style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7' }}
            className="w-full rounded-2xl p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-6">
              <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-xl font-semibold">Log Weight</AnimatedText>
              <Pressable
                onPress={onClose}
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                className="w-8 h-8 rounded-full items-center justify-center"
              >
                <X size={18} color={colors.text} />
              </Pressable>
            </View>

            <View
              style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }}
              className="rounded-xl p-4 mb-6"
            >
              <Text className="text-gray-400 dark:text-gray-400 text-sm mb-2">Weight (lbs)</Text>
              <View className="flex-row items-center">
                <TextInput
                  style={{ color: colors.text }}
                  className="flex-1 text-4xl font-bold"
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor={colors.isDark ? '#666' : '#999'}
                  autoFocus
                />
                <Text className="text-gray-400 dark:text-gray-400 text-xl ml-2">lbs</Text>
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
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                  className="px-4 py-2 rounded-full"
                >
                  <Text style={{ color: colors.text }} className="font-medium">
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
  const colors = useThemeColors();

  // Update goalInput when modal opens or currentGoal changes
  useEffect(() => {
    if (visible) {
      setGoalInput(currentGoal > 0 ? currentGoal.toString() : '');
    }
  }, [visible, currentGoal]);

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
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
          className="flex-1 justify-center items-center px-6"
          onPress={onClose}
        >
          <Pressable
            style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7' }}
            className="w-full rounded-2xl p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-6">
              <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-xl font-semibold">Set Weight Goal</AnimatedText>
              <Pressable
                onPress={onClose}
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                className="w-8 h-8 rounded-full items-center justify-center"
              >
                <X size={18} color={colors.text} />
              </Pressable>
            </View>

            <View
              style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }}
              className="rounded-xl p-4 mb-4"
            >
              <Text className="text-gray-400 dark:text-gray-400 text-sm mb-2">Goal Weight (lbs)</Text>
              <View className="flex-row items-center">
                <TextInput
                  style={{ color: colors.text }}
                  className="flex-1 text-4xl font-bold"
                  value={goalInput}
                  onChangeText={setGoalInput}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor={colors.isDark ? '#666' : '#999'}
                  autoFocus
                />
                <Text className="text-gray-400 dark:text-gray-400 text-xl ml-2">lbs</Text>
              </View>
            </View>

            {currentWeight > 0 && goalInput && (
              <View
                style={{ backgroundColor: colors.isDark ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.15)' }}
                className="rounded-xl p-3 mb-6"
              >
                <Text className="text-green-400 dark:text-green-400 text-center">
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

interface StartWeightEditModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (weight: number) => void;
  currentStartWeight: number;
  calculatedStartWeight: number;
}

function StartWeightEditModal({ visible, onClose, onSave, currentStartWeight, calculatedStartWeight }: StartWeightEditModalProps) {
  const [weightInput, setWeightInput] = useState(currentStartWeight > 0 ? currentStartWeight.toString() : '');
  const colors = useThemeColors();

  // Update weightInput when modal opens or currentStartWeight changes
  useEffect(() => {
    if (visible) {
      setWeightInput(currentStartWeight > 0 ? currentStartWeight.toString() : calculatedStartWeight.toString());
    }
  }, [visible, currentStartWeight, calculatedStartWeight]);

  const handleSave = () => {
    const weight = parseFloat(weightInput);
    if (!isNaN(weight) && weight > 0) {
      onSave(weight);
      onClose();
    }
  };

  const handleReset = () => {
    onSave(0); // Passing 0 will clear the custom start weight
    onClose();
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
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
          className="flex-1 justify-center items-center px-6"
          onPress={onClose}
        >
          <Pressable
            style={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#F5F5F7' }}
            className="w-full rounded-2xl p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-6">
              <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-xl font-semibold">Edit Start Weight</AnimatedText>
              <Pressable
                onPress={onClose}
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                className="w-8 h-8 rounded-full items-center justify-center"
              >
                <X size={18} color={colors.text} />
              </Pressable>
            </View>

            <View
              style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }}
              className="rounded-xl p-4 mb-4"
            >
              <Text className="text-gray-400 dark:text-gray-400 text-sm mb-2">Start Weight (lbs)</Text>
              <View className="flex-row items-center">
                <TextInput
                  style={{ color: colors.text }}
                  className="flex-1 text-4xl font-bold"
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor={colors.isDark ? '#666' : '#999'}
                  autoFocus
                />
                <Text className="text-gray-400 dark:text-gray-400 text-xl ml-2">lbs</Text>
              </View>
            </View>

            <View
              style={{ backgroundColor: colors.isDark ? 'rgba(107, 114, 128, 0.1)' : 'rgba(107, 114, 128, 0.15)' }}
              className="rounded-xl p-3 mb-6"
            >
              <Text className="text-gray-400 dark:text-gray-400 text-center text-sm">
                This is used to calculate your weight loss progress. The default is your weight closest to when you signed up.
              </Text>
            </View>

            <View className="gap-3">
              <Pressable
                onPress={handleSave}
                className="bg-purple-500 rounded-xl py-4 items-center"
              >
                <Text className="text-white font-semibold text-lg">Save Start Weight</Text>
              </Pressable>

              {currentStartWeight > 0 && (
                <Pressable
                  onPress={handleReset}
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                  className="rounded-xl py-4 items-center"
                >
                  <Text style={{ color: colors.text }} className="font-semibold text-lg">Reset to Default</Text>
                </Pressable>
              )}
            </View>
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
  colors: ReturnType<typeof useThemeColors>;
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
  colors,
}: RingDetailCardProps) {
  const percentage = Math.round(progress * 100);

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(delay)} className="mb-4 overflow-hidden rounded-2xl">
      <BlurView
        intensity={colors.isDark ? 30 : 20}
        tint={colors.isDark ? 'dark' : 'light'}
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(245, 245, 247, 0.7)',
        }}
      >
        <View className="p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <View className="mr-4" style={{ width: 70, height: 70 }}>
                <ActivityRing
                  size={70}
                  strokeWidth={8}
                  progress={progress}
                  color={color}
                  backgroundColor={color + '30'}
                />
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: 'bold' }}>{percentage}%</Text>
                </View>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center">
                  {icon}
                  <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-lg font-semibold ml-2">{title}</AnimatedText>
                </View>
                <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="text-sm mt-1">{subtitle}</AnimatedText>
              </View>
            </View>
            <View className="items-end">
              <Text className="text-3xl font-bold" style={{ color }}>
                {Math.round(current)}
              </Text>
              <Text className="text-gray-500 dark:text-gray-500 text-sm">
                / {Math.round(goal)} {unit}
              </Text>
            </View>
          </View>

          <View style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} className="mt-4 h-2 rounded-full overflow-hidden">
            <Animated.View
              entering={FadeIn.delay(delay + 200)}
              className="h-full rounded-full"
              style={{
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: color,
              }}
            />
          </View>

          <View style={{ borderTopColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} className="flex-row mt-4 pt-3 border-t">
            <View className="flex-1">
              <AnimatedText lightColor="#6B7280" darkColor="#6B7280" className="text-xs">Remaining</AnimatedText>
              <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="font-semibold">
                {Math.round(Math.max(goal - current, 0))} {unit}
              </AnimatedText>
            </View>
            <View className="flex-1 items-center">
              <AnimatedText lightColor="#6B7280" darkColor="#6B7280" className="text-xs">Goal</AnimatedText>
              <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="font-semibold">
                {Math.round(goal)} {unit}
              </AnimatedText>
            </View>
            <View className="flex-1 items-end">
              <AnimatedText lightColor="#6B7280" darkColor="#6B7280" className="text-xs">Progress</AnimatedText>
              <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="font-semibold">
                {percentage}%
              </AnimatedText>
            </View>
          </View>
        </View>
      </BlurView>
    </Animated.View>
  );
}

export default function ActivityDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
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
  const setWeightGoal = useHealthStore((s) => s.setWeightGoal);
  const setCustomStartWeight = useHealthStore((s) => s.setCustomStartWeight);
  const authUser = useAuthStore((s) => s.user);

  // Get weight goal reactively using selectors
  const globalWeightGoal = useHealthStore((s) => s.weightGoal);
  const weightGoalsByUser = useHealthStore((s) => s.weightGoalsByUser);
  const weightGoal = authUser?.id
    ? (weightGoalsByUser[authUser.id] ?? globalWeightGoal)
    : globalWeightGoal;

  // Get custom start weight reactively using selectors
  const globalCustomStartWeight = useHealthStore((s) => s.customStartWeight);
  const customStartWeightsByUser = useHealthStore((s) => s.customStartWeightsByUser);
  const customStartWeight = authUser?.id
    ? (customStartWeightsByUser[authUser.id] ?? globalCustomStartWeight)
    : globalCustomStartWeight;

  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showStartWeightModal, setShowStartWeightModal] = useState(false);

  // Calculate default start weight from weight recorded on or closest to signup date
  const calculateDefaultStartWeight = () => {
    // Sort weight history chronologically (oldest to newest)
    const sortedHistory = [...weightHistory].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    if (!authUser?.createdAt || sortedHistory.length === 0) {
      // Fallback to oldest history entry or current weight
      return sortedHistory.length > 0 ? sortedHistory[0].weight : (weight?.value ?? 0);
    }

    const signupDate = new Date(authUser.createdAt);
    const signupDateStr = signupDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Find weight entries on or after signup date
    const entriesOnOrAfterSignup = sortedHistory.filter(entry => {
      const entryDate = new Date(entry.date).toISOString().split('T')[0];
      return entryDate >= signupDateStr;
    });

    if (entriesOnOrAfterSignup.length > 0) {
      // Use the first weight entry on or after signup date (closest to signup)
      return entriesOnOrAfterSignup[0].weight;
    }

    // If no entries on or after signup, find the closest entry before signup
    const entriesBeforeSignup = [...sortedHistory]
      .filter(entry => {
        const entryDate = new Date(entry.date).toISOString().split('T')[0];
        return entryDate < signupDateStr;
      })
      .reverse(); // Reverse to get most recent first

    if (entriesBeforeSignup.length > 0) {
      // Use the most recent weight entry before signup
      return entriesBeforeSignup[0].weight;
    }

    // Fallback to oldest history entry or current weight
    return sortedHistory.length > 0 ? sortedHistory[0].weight : (weight?.value ?? 0);
  };

  const calculatedStartWeight = calculateDefaultStartWeight();
  // Use custom start weight if set, otherwise use the calculated default
  const startWeight = (customStartWeight && customStartWeight > 0) ? customStartWeight : calculatedStartWeight;
  const goalWeight = weightGoal ?? 0;

  // Check if a health provider is connected
  const hasConnectedProvider = activeProvider !== null;

  // Use health service data ONLY when provider is connected
  // Don't fall back to stale currentUser data - show 0 until fresh data loads
  const rawMoveCalories = hasConnectedProvider 
    ? (currentMetrics?.activeCalories ?? 0)
    : (currentUser.moveCalories ?? 0);
  const rawExerciseMinutes = hasConnectedProvider 
    ? (currentMetrics?.exerciseMinutes ?? 0)
    : (currentUser.exerciseMinutes ?? 0);
  const rawStandHours = hasConnectedProvider 
    ? (currentMetrics?.standHours ?? 0)
    : (currentUser.standHours ?? 0);

  // Validate values are valid numbers
  const moveCalories = (typeof rawMoveCalories === 'number' && isFinite(rawMoveCalories) && rawMoveCalories >= 0) ? rawMoveCalories : 0;
  const exerciseMinutes = (typeof rawExerciseMinutes === 'number' && isFinite(rawExerciseMinutes) && rawExerciseMinutes >= 0) ? rawExerciseMinutes : 0;
  const standHours = (typeof rawStandHours === 'number' && isFinite(rawStandHours) && rawStandHours >= 0) ? rawStandHours : 0;

  // Get goals with defensive checks (matching home screen logic)
  const moveGoal = (typeof goals.moveCalories === 'number' && goals.moveCalories > 0) ? goals.moveCalories : 500;
  const exerciseGoal = (typeof goals.exerciseMinutes === 'number' && goals.exerciseMinutes > 0) ? goals.exerciseMinutes : 30;
  const standGoal = (typeof goals.standHours === 'number' && goals.standHours > 0) ? goals.standHours : 12;

  // Calculate progress with defensive checks
  const moveProgress = moveGoal > 0 ? Math.max(0, moveCalories / moveGoal) : 0;
  const exerciseProgress = exerciseGoal > 0 ? Math.max(0, exerciseMinutes / exerciseGoal) : 0;
  const standProgress = standGoal > 0 ? Math.max(0, standHours / standGoal) : 0;

  // Use the most recent weight - compare weight.value and weightHistory to find the newest
  // Sort weight history chronologically (oldest to newest) to get the most recent entry
  const sortedWeightHistory = [...weightHistory].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const latestHistoryEntry = sortedWeightHistory.length > 0 ? sortedWeightHistory[sortedWeightHistory.length - 1] : null;

  // Compare dates to determine which weight is more recent
  const getCurrentWeight = () => {
    const historyDate = latestHistoryEntry ? new Date(latestHistoryEntry.date).getTime() : 0;
    const weightDate = weight?.date ? new Date(weight.date).getTime() : 0;

    // Use whichever is more recent
    if (weightDate > historyDate && weight?.value) {
      return weight.value;
    } else if (latestHistoryEntry?.weight) {
      return latestHistoryEntry.weight;
    } else {
      return weight?.value ?? 0;
    }
  };
  const currentWeight = getCurrentWeight();
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
  const todayWorkouts = (workouts || []).filter((workout) => {
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
      total: (workouts || []).length,
      today: todayWorkouts.length,
      activeProvider,
      workoutDetails: (workouts || []).map(w => ({
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

  const handleSetStartWeight = async (newStartWeight: number) => {
    if (setCustomStartWeight) {
      // If 0 is passed, clear the custom start weight (reset to default)
      await setCustomStartWeight(newStartWeight === 0 ? null : newStartWeight, authUser?.id);
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
    <PaywallOverlay requiredTier="mover" feature="Activity Details">
      <ThemeTransition>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
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

      <StartWeightEditModal
        visible={showStartWeightModal}
        onClose={() => setShowStartWeightModal(false)}
        onSave={handleSetStartWeight}
        currentStartWeight={customStartWeight ?? 0}
        calculatedStartWeight={calculatedStartWeight}
      />

      {/* Background Layer - Positioned to fill screen with extra coverage */}
      <Image
        source={require('../../assets/AppActivityViewScreen.png')}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: width,
          height: width,
        }}
        contentFit="cover"
      />
      {/* Fill color below image to handle scroll bounce */}
      <View
        style={{
          position: 'absolute',
          top: width,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bg,
        }}
      />

      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24 }}>
          <View className="flex-row items-center mb-6" style={{ zIndex: 1001 }}>
            <LiquidGlassBackButton onPress={() => router.back()} />
            <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-xl font-semibold ml-4">Activity</AnimatedText>
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
              <Text className="text-gray-400 dark:text-gray-400 text-sm">Move</Text>
            </View>
            <View className="items-center">
              <Text className="text-ring-exercise text-2xl font-bold">{Math.round(exerciseProgress * 100)}%</Text>
              <Text className="text-gray-400 dark:text-gray-400 text-sm">Exercise</Text>
            </View>
            <View className="items-center">
              <Text className="text-ring-stand text-2xl font-bold">{Math.round(standProgress * 100)}%</Text>
              <Text className="text-gray-400 dark:text-gray-400 text-sm">Stand</Text>
            </View>
          </Animated.View>
        </View>

        {/* Ring Details */}
        <View className="px-5 mt-6">
          <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-xl font-semibold mb-4">Today's Progress</AnimatedText>

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
            colors={colors}
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
            colors={colors}
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
            colors={colors}
          />

          {/* Workouts Section */}
          <Animated.View entering={FadeInDown.duration(500).delay(500)} className="mt-6">
            <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-xl font-semibold mb-4">Workouts</AnimatedText>

            {todayWorkouts.length === 0 ? (
              <View className="overflow-hidden rounded-2xl">
                <BlurView
                  intensity={colors.isDark ? 30 : 20}
                  tint={colors.isDark ? 'dark' : 'light'}
                  style={{
                    borderRadius: 16,
                    overflow: 'hidden',
                    backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(245, 245, 247, 0.7)',
                  }}
                >
                  <View className="p-6 items-center justify-center">
                    <Text className="text-gray-400 dark:text-gray-400 text-center">
                      No workouts recorded today
                    </Text>
                  </View>
                </BlurView>
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
                      className="overflow-hidden rounded-2xl mb-3"
                    >
                      <BlurView
                        intensity={colors.isDark ? 30 : 20}
                        tint={colors.isDark ? 'dark' : 'light'}
                        style={{
                          borderRadius: 16,
                          overflow: 'hidden',
                          backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(245, 245, 247, 0.7)',
                        }}
                      >
                        <View className="p-4">
                          <View className="flex-row items-center justify-between">
                            <View className="flex-row items-center flex-1">
                              <View
                                className="w-12 h-12 rounded-full items-center justify-center"
                                style={{ backgroundColor: appIcon.color + '20' }}
                              >
                                {appIcon.icon}
                              </View>
                              <View className="ml-4 flex-1">
                                <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-base font-semibold">
                                  {workoutLabel}
                                </AnimatedText>
                                <Text className="text-gray-400 dark:text-gray-400 text-sm mt-0.5">
                                  {timeString}
                                  {workout.sourceName && ` • ${workout.sourceName}`}
                                </Text>
                              </View>
                            </View>
                            <View className="items-end">
                              <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-lg font-bold">
                                {workout.duration}
                              </AnimatedText>
                              <Text className="text-gray-500 dark:text-gray-500 text-xs">min</Text>
                            </View>
                          </View>

                          {(workout.calories > 0 || workout.distance || workout.heartRateAvg) && (
                            <View style={{ borderTopColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} className="flex-row mt-3 pt-3 border-t">
                              {workout.calories > 0 && (
                                <View className="flex-1">
                                  <Text className="text-gray-500 dark:text-gray-500 text-xs">Calories</Text>
                                  <Text className="text-black dark:text-white font-semibold text-sm">
                                    {workout.calories}
                                  </Text>
                                </View>
                              )}
                              {workout.distance && (
                                <View className="flex-1">
                                  <Text className="text-gray-500 dark:text-gray-500 text-xs">Distance</Text>
                                  <Text className="text-black dark:text-white font-semibold text-sm">
                                    {(workout.distance / 1000).toFixed(2)} km
                                  </Text>
                                </View>
                              )}
                              {workout.heartRateAvg && (
                                <View className="flex-1 items-end">
                                  <Text className="text-gray-500 dark:text-gray-500 text-xs">Avg HR</Text>
                                  <Text className="text-black dark:text-white font-semibold text-sm">
                                    {Math.round(workout.heartRateAvg)} bpm
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      </BlurView>
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
            <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-xl font-semibold">Weight & Body</AnimatedText>
            <Pressable
              onPress={() => setShowWeightModal(true)}
              className="flex-row items-center bg-purple-500/20 px-3 py-2 rounded-full"
            >
              <Plus size={16} color="#A855F7" />
              <Text className="text-purple-400 dark:text-purple-400 font-medium ml-1">Log Weight</Text>
            </Pressable>
          </View>

          {/* Current Weight Card */}
          <Animated.View entering={FadeInDown.duration(500).delay(500)} className="overflow-hidden rounded-2xl mb-4">
            <BlurView
              intensity={colors.isDark ? 30 : 20}
              tint={colors.isDark ? 'dark' : 'light'}
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(245, 245, 247, 0.7)',
              }}
            >
              <View className="p-5">
                <View className="flex-row items-center justify-between">
                  {/* Current weight - tappable to log weight */}
                  <Pressable
                    onPress={() => setShowWeightModal(true)}
                    className="flex-row items-center flex-1 active:opacity-70"
                  >
                    <View className="w-12 h-12 rounded-full bg-purple-500/20 items-center justify-center">
                      <Scale size={24} color="#A855F7" />
                    </View>
                    <View className="ml-4">
                      <AnimatedText lightColor="#6B7280" darkColor="#9CA3AF" className="text-sm">Current Weight</AnimatedText>
                      <AnimatedText lightColor="#000000" darkColor="#FFFFFF" className="text-2xl font-bold">
                        {currentWeight > 0 ? `${currentWeight.toFixed(1)} lbs` : 'Tap to log'}
                      </AnimatedText>
                    </View>
                  </Pressable>

                  {/* Goal section */}
                  <Pressable
                    onPress={() => setShowGoalModal(true)}
                    className="items-end active:opacity-70"
                  >
                    <Text className="text-gray-400 dark:text-gray-400 text-sm">Goal</Text>
                    <Text className="text-green-400 dark:text-green-400 text-xl font-bold">
                      {goalWeight > 0 ? `${goalWeight} lbs` : 'Set goal'}
                    </Text>
                  </Pressable>
                </View>

                {/* Progress bar */}
                {goalWeight > 0 && currentWeight > 0 && startWeight > 0 && (
                  <View style={{ borderTopColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} className="mt-4 pt-4 border-t">
                    <View className="flex-row justify-between mb-2">
                      <Pressable onPress={() => setShowStartWeightModal(true)}>
                        <Text className="text-purple-400 dark:text-purple-400 text-xs underline">Start: {startWeight.toFixed(1)} lbs</Text>
                      </Pressable>
                      <Text className="text-gray-500 dark:text-gray-500 text-xs">
                        {Math.abs(currentWeight - goalWeight).toFixed(1)} lbs to go
                      </Text>
                    </View>
                    <View style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} className="h-2 rounded-full overflow-hidden">
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
            </BlurView>
          </Animated.View>

          {/* Weight Progress Chart */}
          <Animated.View entering={FadeInDown.duration(500).delay(550)}>
            <WeightProgressChart
              data={weightHistory}
              goalWeight={goalWeight}
              startWeight={startWeight}
              colors={colors}
            />
          </Animated.View>

          {/* Weight Changes */}
          <Animated.View entering={FadeInDown.duration(500).delay(600)}>
            <WeightChanges data={weightHistory} colors={colors} />
          </Animated.View>

          {/* BMI Scale */}
          {bmi > 0 && (
            <Animated.View entering={FadeInDown.duration(500).delay(650)} className="overflow-hidden rounded-2xl mt-4">
              <BlurView
                intensity={colors.isDark ? 30 : 20}
                tint={colors.isDark ? 'dark' : 'light'}
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: colors.isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(245, 245, 247, 0.7)',
                }}
              >
                <View className="p-5">
                  <BMIScale bmi={bmi} colors={colors} />
                </View>
              </BlurView>
            </Animated.View>
          )}
        </View>
      </ScrollView>
        </View>
      </ThemeTransition>
    </PaywallOverlay>
  );
}
