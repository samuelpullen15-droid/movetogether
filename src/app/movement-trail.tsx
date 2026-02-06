/**
 * Movement Trail Screen
 *
 * A Duolingo/Ahead-style illustrated journey screen with milestone nodes
 * arranged along a winding path through an illustrated landscape.
 * 
 * KEY: Both path and nodes use THE SAME coordinate functions and container.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Dimensions,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import Svg, { Path, Ellipse, G } from 'react-native-svg';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Shield,
  Flame,
  Trophy,
  Lock,
  Check,
  Gift,
  Star,
  Sparkles,
  ChevronLeft,
  Info,
  Zap,
  Crown,
  Award,
  Flag,
  Target,
} from 'lucide-react-native';
import { MilestoneDetailModal } from '@/components/MilestoneDetailModal';
import { useStreak, Milestone, MilestoneProgress } from '@/hooks/useStreak';
import { useAuthStore } from '@/lib/auth-store';
import { useThemeColors } from '@/lib/useThemeColors';
import { getAvatarUrl } from '@/lib/avatar-utils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Design constants
const NODE_SIZE = 56;
const NODE_SIZE_MILESTONE = 64;
const NODE_SIZE_CURRENT = 68;
const NODE_VERTICAL_SPACING = 130;
const HEADER_HEIGHT = 140;

// Theme colors
const TRAIL_COLORS = {
  bgGradient: ['#D4EEF3', '#B5E0E9', '#96D2DE', '#7AC4D2'],
  mountainFar: 'rgba(150, 185, 190, 0.3)',
  mountainMid: 'rgba(130, 170, 175, 0.4)',
  mountainNear: 'rgba(110, 155, 160, 0.5)',
  treeDark: '#5A8477',
  treeMid: '#6A9487',
  pathCompleted: '#7C5CE0',
  pathLocked: 'rgba(255, 255, 255, 0.6)',
  nodeCompleted: '#7C5CE0',
  nodeCurrent: '#FA114F',
  nodeLocked: '#E8E8E8',
  nodeFarFuture: '#F0F0F0',
  nodeTextLocked: '#999999',
  milestoneLockedBorder: 'rgba(255, 215, 0, 0.5)',
};

const REWARD_ICONS: Record<string, React.ComponentType<any>> = {
  badge: Award,
  trial_mover: Zap,
  trial_coach: Sparkles,
  trial_crusher: Crown,
  profile_frame: Star,
  leaderboard_flair: Flag,
  app_icon: Target,
  points_multiplier: Trophy,
  custom: Gift,
};

// ============================================================================
// SHARED POSITION CALCULATIONS
// These MUST be used by both path and nodes to ensure alignment
// ============================================================================

const X_POSITIONS = [0.5, 0.72, 0.5, 0.28]; // center, right, center, left

function getNodeCenterX(index: number): number {
  return SCREEN_WIDTH * X_POSITIONS[index % X_POSITIONS.length];
}

function getNodeCenterY(index: number): number {
  // First node starts at Y=50, then each subsequent node is spaced by NODE_VERTICAL_SPACING
  return 50 + index * NODE_VERTICAL_SPACING;
}

// ============================================================================
// BACKGROUND
// ============================================================================

function IllustratedBackground({ scrollY }: { scrollY: Animated.SharedValue<number> }) {
  const mountainBackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * 0.1 }],
  }));
  const mountainMidStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * 0.2 }],
  }));
  const mountainFrontStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * 0.3 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.bgLayer, mountainBackStyle]}>
        <Svg height="100%" width="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMin slice">
          <Path d="M0,200 Q50,140 100,180 Q150,120 200,160 Q250,100 300,150 Q350,90 400,140 L400,800 L0,800 Z" fill={TRAIL_COLORS.mountainFar} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.bgLayer, mountainMidStyle]}>
        <Svg height="100%" width="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMin slice">
          <Path d="M0,280 Q80,200 160,260 Q240,180 320,240 Q360,200 400,220 L400,800 L0,800 Z" fill={TRAIL_COLORS.mountainMid} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.bgLayer, mountainFrontStyle]}>
        <Svg height="100%" width="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMin slice">
          <Path d="M0,350 Q100,280 200,340 Q300,260 400,320 L400,800 L0,800 Z" fill={TRAIL_COLORS.mountainNear} />
        </Svg>
      </Animated.View>
      <View style={styles.bgLayer}>
        <Svg height="100%" width="100%" viewBox="0 0 400 2000" preserveAspectRatio="xMidYMin slice">
          <G opacity={0.45}><Ellipse cx="35" cy="400" rx="20" ry="30" fill={TRAIL_COLORS.treeDark} /></G>
          <G opacity={0.4}><Ellipse cx="365" cy="550" rx="22" ry="32" fill={TRAIL_COLORS.treeDark} /></G>
          <G opacity={0.45}><Ellipse cx="30" cy="900" rx="18" ry="26" fill={TRAIL_COLORS.treeDark} /></G>
          <G opacity={0.4}><Ellipse cx="370" cy="1100" rx="20" ry="28" fill={TRAIL_COLORS.treeDark} /></G>
          <G opacity={0.45}><Ellipse cx="40" cy="1400" rx="22" ry="30" fill={TRAIL_COLORS.treeDark} /></G>
        </Svg>
      </View>
      <FloatingClouds />
    </View>
  );
}

function FloatingClouds() {
  const cloud1X = useSharedValue(0);
  const cloud2X = useSharedValue(0);

  useEffect(() => {
    cloud1X.value = withRepeat(withTiming(30, { duration: 20000, easing: Easing.linear }), -1, true);
    cloud2X.value = withRepeat(withTiming(-25, { duration: 25000, easing: Easing.linear }), -1, true);
  }, []);

  const cloud1Style = useAnimatedStyle(() => ({ transform: [{ translateX: cloud1X.value }] }));
  const cloud2Style = useAnimatedStyle(() => ({ transform: [{ translateX: cloud2X.value }] }));

  return (
    <View style={styles.bgLayer} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', top: 120, left: 20 }, cloud1Style]}>
        <Svg width="80" height="40" viewBox="0 0 80 40">
          <Ellipse cx="25" cy="25" rx="20" ry="12" fill="rgba(255,255,255,0.6)" />
          <Ellipse cx="45" cy="22" rx="25" ry="15" fill="rgba(255,255,255,0.7)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 200, right: 30 }, cloud2Style]}>
        <Svg width="60" height="30" viewBox="0 0 60 30">
          <Ellipse cx="20" cy="18" rx="15" ry="10" fill="rgba(255,255,255,0.5)" />
          <Ellipse cx="38" cy="15" rx="18" ry="12" fill="rgba(255,255,255,0.6)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

// ============================================================================
// TRAIL COMPONENT - Contains BOTH path SVG and nodes
// ============================================================================

interface TrailProps {
  milestones: Milestone[];
  currentStreak: number;
  onMilestonePress: (milestone: Milestone) => void;
}

function Trail({ milestones, currentStreak, onMilestonePress }: TrailProps) {
  const nodeCount = milestones.length;
  
  // Calculate total height needed
  const totalHeight = getNodeCenterY(nodeCount - 1) + 150;

  // Build the SVG path string using the SAME position functions
  const pathD = useMemo(() => {
    let d = '';
    for (let i = 0; i < nodeCount; i++) {
      const x = getNodeCenterX(i);
      const y = getNodeCenterY(i);

      if (i === 0) {
        d += `M ${x} ${y}`;
      } else {
        const prevX = getNodeCenterX(i - 1);
        const prevY = getNodeCenterY(i - 1);
        const midY = (prevY + y) / 2;
        d += ` C ${prevX} ${midY}, ${x} ${midY}, ${x} ${y}`;
      }
    }
    return d;
  }, [nodeCount]);

  const isMilestoneReward = (m: Milestone) => {
    // Milestone days are the last day of each segment
    const milestoneDays = [3, 7, 14, 21, 30, 45, 60, 75, 90, 100, 120, 150, 180, 200, 240, 270, 300, 330, 365];
    return milestoneDays.includes(m.day_number);
  };

  const getNodeState = (dayNumber: number): 'completed' | 'current' | 'locked' | 'far-future' => {
    if (dayNumber <= currentStreak) return 'completed';
    if (dayNumber === currentStreak + 1) return 'current';
    if (dayNumber <= currentStreak + 15) return 'locked';
    return 'far-future';
  };

  return (
    <View style={[styles.trailContainer, { height: totalHeight }]}>
      {/* SVG Track - a wider path that looks like a trail/road */}
      <Svg width={SCREEN_WIDTH} height={totalHeight} style={styles.pathSvg}>
        {/* Track shadow/depth */}
        <Path
          d={pathD}
          stroke="rgba(0, 0, 0, 0.08)"
          strokeWidth={36}
          fill="none"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          strokeMiterlimit={1}
        />
        {/* Track base - the "road" surface */}
        <Path
          d={pathD}
          stroke="rgba(255, 255, 255, 0.45)"
          strokeWidth={30}
          fill="none"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          strokeMiterlimit={1}
        />
        {/* Center dashed line */}
        <Path
          d={pathD}
          stroke="rgba(255, 255, 255, 0.5)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          strokeDasharray="6,10"
        />
      </Svg>

      {/* Nodes - each absolutely positioned using SAME getNodeCenterX/Y functions */}
      {milestones.map((milestone, index) => {
        const state = getNodeState(milestone.day_number);
        const isReward = isMilestoneReward(milestone);
        const nodeSize = state === 'current' ? NODE_SIZE_CURRENT : isReward ? NODE_SIZE_MILESTONE : NODE_SIZE;
        
        // Position so the CENTER of the node is at (centerX, centerY)
        const centerX = getNodeCenterX(index);
        const centerY = getNodeCenterY(index);
        const left = centerX - nodeSize / 2;
        const top = centerY - nodeSize / 2;

        return (
          <TrailNode
            key={milestone.id}
            milestone={milestone}
            index={index}
            state={state}
            isMilestoneReward={isReward}
            nodeSize={nodeSize}
            left={left}
            top={top}
            onPress={() => onMilestonePress(milestone)}
            currentStreak={currentStreak}
          />
        );
      })}
    </View>
  );
}

// ============================================================================
// NODE COMPONENT
// ============================================================================

type NodeState = 'completed' | 'current' | 'locked' | 'far-future';

interface TrailNodeProps {
  milestone: Milestone;
  index: number;
  state: NodeState;
  isMilestoneReward: boolean;
  nodeSize: number;
  left: number;
  top: number;
  onPress: () => void;
  currentStreak: number;
}

function TrailNode({
  milestone,
  index,
  state,
  isMilestoneReward,
  nodeSize,
  left,
  top,
  onPress,
  currentStreak,
}: TrailNodeProps) {
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.2);

  useEffect(() => {
    if (state === 'current') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [state]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: state === 'current' ? pulseScale.value : 1 }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const RewardIcon = REWARD_ICONS[milestone.reward_type] || Gift;

  const colors = {
    completed: { bg: TRAIL_COLORS.nodeCompleted, border: TRAIL_COLORS.nodeCompleted, borderWidth: 0 },
    current: { bg: TRAIL_COLORS.nodeCurrent, border: '#FFFFFF', borderWidth: 4 },
    locked: { bg: TRAIL_COLORS.nodeLocked, border: isMilestoneReward ? TRAIL_COLORS.milestoneLockedBorder : 'transparent', borderWidth: isMilestoneReward ? 3 : 0 },
    'far-future': { bg: TRAIL_COLORS.nodeFarFuture, border: 'transparent', borderWidth: 0 },
  }[state];

  const daysAway = milestone.day_number - currentStreak;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 40).springify()}
      style={[
        styles.nodeWrapper,
        { left, top, width: nodeSize },
      ]}
    >
      {/* Milestone label */}
      {isMilestoneReward && (
        <View style={[styles.milestoneLabel, { bottom: nodeSize + 10 }]}>
          <Text style={styles.milestoneLabelText}>{milestone.name}</Text>
        </View>
      )}

      {/* Glow for current */}
      {state === 'current' && (
        <Animated.View
          style={[
            styles.glow,
            {
              width: nodeSize + 35,
              height: nodeSize + 35,
              borderRadius: (nodeSize + 35) / 2,
              backgroundColor: TRAIL_COLORS.nodeCurrent,
              left: (nodeSize - (nodeSize + 35)) / 2,
              top: (nodeSize - (nodeSize + 35)) / 2,
            },
            glowStyle,
          ]}
        />
      )}

      {/* Golden glow for milestones */}
      {isMilestoneReward && (state === 'completed' || state === 'current') && (
        <View
          style={[
            styles.glow,
            {
              width: nodeSize + 14,
              height: nodeSize + 14,
              borderRadius: (nodeSize + 14) / 2,
              backgroundColor: 'rgba(255, 215, 0, 0.35)',
              left: -7,
              top: -7,
            },
          ]}
        />
      )}

      {/* Node circle */}
      <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}>
        <Animated.View
          style={[
            styles.node,
            {
              width: nodeSize,
              height: nodeSize,
              borderRadius: nodeSize / 2,
              backgroundColor: colors.bg,
              borderColor: colors.border,
              borderWidth: colors.borderWidth,
              opacity: state === 'far-future' ? 0.5 : 1,
            },
            pulseStyle,
          ]}
        >
          {state === 'completed' ? (
            <Check size={24} color="#FFFFFF" strokeWidth={3} />
          ) : state === 'locked' || state === 'far-future' ? (
            isMilestoneReward ? (
              <RewardIcon size={24} color={TRAIL_COLORS.nodeTextLocked} />
            ) : (
              <Text style={[styles.nodeNumber, { color: TRAIL_COLORS.nodeTextLocked }]}>{milestone.day_number}</Text>
            )
          ) : isMilestoneReward ? (
            <RewardIcon size={26} color="#FFFFFF" />
          ) : (
            <Text style={styles.nodeNumber}>{milestone.day_number}</Text>
          )}
        </Animated.View>
      </Pressable>

      {/* Day label */}
      {!isMilestoneReward && (
        <Text style={[styles.dayLabel, { color: state === 'completed' || state === 'current' ? '#555' : '#888' }]}>
          Day {milestone.day_number}
        </Text>
      )}

      {/* Days away badge */}
      {state === 'current' && daysAway > 0 && (
        <View style={styles.daysAwayBadge}>
          <Text style={styles.daysAwayText}>{daysAway} {daysAway === 1 ? 'day' : 'days'} away</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ============================================================================
// SEGMENT TABS - Horizontal scrollable tabs showing all journey segments
// ============================================================================

interface SegmentTabsProps {
  segments: { startDay: number; endDay: number; milestoneName: string; reward_type: string }[];
  currentSegmentIndex: number;
  unlockedSegmentIndex: number;
  viewingSegmentIndex: number;
  onSegmentPress: (index: number) => void;
}

function SegmentTabs({ segments, currentSegmentIndex, unlockedSegmentIndex, viewingSegmentIndex, onSegmentPress }: SegmentTabsProps) {
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Auto-scroll to viewing segment
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: Math.max(0, viewingSegmentIndex * 110 - 50), animated: true });
    }, 300);
  }, [viewingSegmentIndex]);

  return (
    <View style={[styles.segmentTabsContainer, { top: insets.top + HEADER_HEIGHT }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segmentTabsContent}
      >
        {segments.map((segment, index) => {
          const isUnlocked = index <= unlockedSegmentIndex;
          const isActive = index === currentSegmentIndex;
          const isCompleted = index < currentSegmentIndex;
          const isViewing = index === viewingSegmentIndex;

          return (
            <Pressable
              key={index}
              onPress={() => {
                if (isUnlocked) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSegmentPress(index);
                }
              }}
              style={[
                styles.segmentTab,
                isViewing && styles.segmentTabViewing,
                isCompleted && !isViewing && styles.segmentTabCompleted,
                !isUnlocked && styles.segmentTabLocked,
              ]}
            >
              {!isUnlocked ? (
                <Lock size={14} color="#999" />
              ) : isCompleted && !isViewing ? (
                <Check size={14} color="#FFFFFF" strokeWidth={3} />
              ) : (
                <Text style={[
                  styles.segmentTabDay,
                  (isViewing || isCompleted) && styles.segmentTabDayCurrent,
                ]}>
                  {segment.endDay}
                </Text>
              )}
              <Text
                style={[
                  styles.segmentTabName,
                  (isViewing || isCompleted) && styles.segmentTabNameCurrent,
                  !isUnlocked && styles.segmentTabNameLocked,
                ]}
                numberOfLines={1}
              >
                {isUnlocked ? segment.milestoneName : '???'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// HEADER
// ============================================================================

function StatsHeader({ currentStreak, longestStreak, shieldsAvailable, onBack, onInfo }: {
  currentStreak: number; longestStreak: number; shieldsAvailable: number; onBack: () => void; onInfo: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
      <BlurView intensity={80} tint="light" style={styles.headerBlur}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} style={styles.headerButton}><ChevronLeft size={28} color="#333" /></Pressable>
          <Text style={styles.headerTitle}>Movement Trail</Text>
          <Pressable onPress={onInfo} style={styles.headerButton}><Info size={22} color="#666" /></Pressable>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Flame size={18} color="#FF6B35" fill="#FF6B35" />
            <Text style={styles.statNumber}>{currentStreak}</Text>
            <Text style={styles.statLabel}>days</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Trophy size={16} color="#FFD700" />
            <Text style={styles.statNumber}>{longestStreak}</Text>
            <Text style={styles.statLabel}>best</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Shield size={16} color="#00D4FF" fill="#00D4FF" />
            <Text style={styles.statNumber}>{shieldsAvailable}</Text>
            <Text style={styles.statLabel}>shields</Text>
          </View>
        </View>
      </BlurView>
    </View>
  );
}

// ============================================================================
// MASCOT
// ============================================================================

function TrailMascot({ nextMilestoneDays, nextMilestoneName }: { nextMilestoneDays: number; nextMilestoneName: string }) {
  const bounceY = useSharedValue(0);
  useEffect(() => {
    bounceY.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);
  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bounceY.value }] }));

  return (
    <Animated.View style={[styles.mascotContainer, bounceStyle]}>
      <View style={styles.speechBubble}>
        <Text style={styles.speechText}>{nextMilestoneDays} days to{'\n'}{nextMilestoneName}!</Text>
      </View>
      <View style={styles.mascotIcon}>
        <Flame size={26} color="#FF6B35" fill="#FF6B35" />
      </View>
    </Animated.View>
  );
}

// ============================================================================
// MAIN SCREEN
// ============================================================================

export default function MovementTrailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollY = useSharedValue(0);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [viewingSegmentIndex, setViewingSegmentIndex] = useState(0);

  const {
    currentStreak = 0,
    longestStreak = 0,
    streakShieldsAvailable = 1,
    earnedMilestones = [],
    fetchStreakData,
    claimReward,
  } = useStreak();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => { scrollY.value = event.contentOffset.y; },
  });

  // Define journey segments - each ends with a milestone achievement
  // Full 365-day journey broken into meaningful chunks
  const journeySegments = useMemo(() => [
    // Week 1: Building the habit (frequent milestones)
    { startDay: 1, endDay: 3, milestoneName: 'First Steps', reward_type: 'badge', reward_value: { badge_id: 'first_steps' } },
    { startDay: 4, endDay: 7, milestoneName: 'Week Warrior', reward_type: 'trial_mover', reward_value: { trial_days: 1 } },
    
    // Weeks 2-4: Establishing consistency
    { startDay: 8, endDay: 14, milestoneName: 'Fortnight Fighter', reward_type: 'profile_frame', reward_value: { frame_id: 'fortnight' } },
    { startDay: 15, endDay: 21, milestoneName: 'Three Week Trek', reward_type: 'trial_coach', reward_value: { trial_days: 1 } },
    { startDay: 22, endDay: 30, milestoneName: 'Monthly Mover', reward_type: 'badge', reward_value: { badge_id: 'monthly' } },
    
    // Month 2: Building momentum
    { startDay: 31, endDay: 45, milestoneName: 'Six Week Streak', reward_type: 'leaderboard_flair', reward_value: { flair_id: 'six_week' } },
    { startDay: 46, endDay: 60, milestoneName: 'Two Month Titan', reward_type: 'trial_coach', reward_value: { trial_days: 2 } },
    
    // Month 3: Quarter milestone
    { startDay: 61, endDay: 75, milestoneName: 'Ten Week Wonder', reward_type: 'badge', reward_value: { badge_id: 'ten_week' } },
    { startDay: 76, endDay: 90, milestoneName: 'Quarter Champion', reward_type: 'app_icon', reward_value: { icon_id: 'quarter' } },
    
    // 100 days: Major milestone!
    { startDay: 91, endDay: 100, milestoneName: 'Century Club', reward_type: 'trial_crusher', reward_value: { trial_days: 7, badge_id: 'century' } },
    
    // Months 4-5
    { startDay: 101, endDay: 120, milestoneName: 'Momentum Master', reward_type: 'profile_frame', reward_value: { frame_id: 'momentum' } },
    { startDay: 121, endDay: 150, milestoneName: 'Five Month Force', reward_type: 'badge', reward_value: { badge_id: 'five_month' } },
    
    // 6 months: Half year! Major milestone
    { startDay: 151, endDay: 180, milestoneName: 'Half Year Hero', reward_type: 'trial_crusher', reward_value: { trial_days: 14, badge_id: 'half_year' } },
    
    // Months 7-8
    { startDay: 181, endDay: 200, milestoneName: 'Two Hundred Club', reward_type: 'leaderboard_flair', reward_value: { flair_id: 'two_hundred' } },
    { startDay: 201, endDay: 240, milestoneName: 'Eight Month Elite', reward_type: 'app_icon', reward_value: { icon_id: 'eight_month' } },
    
    // Months 9-10
    { startDay: 241, endDay: 270, milestoneName: 'Nine Month Navigator', reward_type: 'badge', reward_value: { badge_id: 'nine_month' } },
    { startDay: 271, endDay: 300, milestoneName: 'Three Hundred Legend', reward_type: 'profile_frame', reward_value: { frame_id: 'three_hundred' } },
    
    // Final stretch: Months 11-12
    { startDay: 301, endDay: 330, milestoneName: 'Eleven Month Champion', reward_type: 'trial_crusher', reward_value: { trial_days: 30 } },
    { startDay: 331, endDay: 365, milestoneName: 'Year-Long Legend', reward_type: 'custom', reward_value: { badge_id: 'year_legend', special: true } },
  ], []);

  // Find which segment the user is currently in (for unlocking purposes)
  const currentSegmentIndex = useMemo(() => {
    for (let i = 0; i < journeySegments.length; i++) {
      if (currentStreak < journeySegments[i].endDay) {
        return i;
      }
    }
    return journeySegments.length - 1; // Completed all
  }, [currentStreak, journeySegments]);

  // Set initial viewing segment to current
  useEffect(() => {
    setViewingSegmentIndex(currentSegmentIndex);
  }, [currentSegmentIndex]);

  // Build milestones for the VIEWING segment only
  const displayMilestones: Milestone[] = useMemo(() => {
    const milestones: Milestone[] = [];
    const segment = journeySegments[viewingSegmentIndex];
    
    if (!segment) return milestones;

    // Add each day in this segment
    for (let day = segment.startDay; day <= segment.endDay; day++) {
      const isMilestoneDay = day === segment.endDay;
      
      milestones.push({
        id: `day-${day}`,
        day_number: day,
        name: isMilestoneDay ? segment.milestoneName : `Day ${day}`,
        description: isMilestoneDay ? `${segment.milestoneName}!` : `Day ${day}`,
        reward_type: isMilestoneDay ? segment.reward_type : 'badge',
        reward_value: isMilestoneDay ? segment.reward_value : {},
        icon_name: isMilestoneDay ? 'trophy' : 'star',
        celebration_type: isMilestoneDay ? 'confetti' : 'sparkle',
        is_repeatable: false,
        repeat_interval: null,
      });
    }

    return milestones;
  }, [viewingSegmentIndex, journeySegments]);

  // Handle segment tab press
  const handleSegmentPress = (index: number) => {
    setViewingSegmentIndex(index);
    // Scroll to top when changing segments
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Get current segment info for UI
  const currentSegment = journeySegments[currentSegmentIndex];
  const viewingSegment = journeySegments[viewingSegmentIndex];

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchStreakData();
    setIsRefreshing(false);
  }, [fetchStreakData]);

  const handleMilestonePress = (milestone: Milestone) => {
    setSelectedMilestone(milestone);
    setShowMilestoneModal(true);
  };

  const handleClaimReward = async (progressId: string) => {
    const success = await claimReward(progressId);
    if (success) {
      setShowCelebration(true);
      setTimeout(() => { setShowCelebration(false); setShowMilestoneModal(false); }, 2500);
    }
  };

  const getMilestoneProgress = (milestone: Milestone) => {
    return earnedMilestones.find((m) => m.milestone_id === milestone.id) || null;
  };

  const nextMilestoneInfo = useMemo(() => {
    const segment = journeySegments[viewingSegmentIndex];
    const daysAway = segment.endDay - currentStreak;
    return {
      daysAway: daysAway > 0 ? daysAway : 0,
      name: segment.milestoneName,
      isViewingCurrent: viewingSegmentIndex === currentSegmentIndex,
    };
  }, [currentStreak, viewingSegmentIndex, currentSegmentIndex, journeySegments]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={TRAIL_COLORS.bgGradient} style={StyleSheet.absoluteFill} />
      <IllustratedBackground scrollY={scrollY} />

      <Animated.ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={{
          // Add top spacing for header + segment tabs
          paddingTop: insets.top + HEADER_HEIGHT + 60 + 20,
          paddingBottom: insets.bottom + 150,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={TRAIL_COLORS.nodeCurrent}
            progressViewOffset={insets.top + HEADER_HEIGHT + 60}
          />
        }
      >
        {/* Single Trail component containing BOTH path and nodes */}
        <Trail
          milestones={displayMilestones}
          currentStreak={currentStreak}
          onMilestonePress={handleMilestonePress}
        />
      </Animated.ScrollView>

      {nextMilestoneInfo.daysAway > 0 && nextMilestoneInfo.isViewingCurrent && (
        <TrailMascot nextMilestoneDays={nextMilestoneInfo.daysAway} nextMilestoneName={nextMilestoneInfo.name} />
      )}

      {/* Segment tabs - below header */}
      <SegmentTabs
        segments={journeySegments}
        currentSegmentIndex={currentSegmentIndex}
        unlockedSegmentIndex={currentSegmentIndex}
        viewingSegmentIndex={viewingSegmentIndex}
        onSegmentPress={handleSegmentPress}
      />

      <StatsHeader
        currentStreak={currentStreak}
        longestStreak={longestStreak}
        shieldsAvailable={streakShieldsAvailable}
        onBack={() => router.back()}
        onInfo={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      />

      <MilestoneDetailModal
        visible={showMilestoneModal}
        milestone={selectedMilestone}
        progress={selectedMilestone ? getMilestoneProgress(selectedMilestone) : null}
        onClose={() => setShowMilestoneModal(false)}
        onClaimReward={handleClaimReward}
        currentStreak={currentStreak}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  bgLayer: { ...StyleSheet.absoluteFillObject },

  // Trail container - holds both path and nodes in same coordinate space
  trailContainer: {
    position: 'relative',
    width: SCREEN_WIDTH,
  },
  pathSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },

  // Node wrapper - absolutely positioned within trailContainer
  nodeWrapper: {
    position: 'absolute',
    alignItems: 'center',
  },
  node: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  glow: {
    position: 'absolute',
  },
  nodeNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dayLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  daysAwayBadge: {
    marginTop: 6,
    backgroundColor: TRAIL_COLORS.nodeCurrent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  daysAwayText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  milestoneLabel: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignSelf: 'center',
  },
  milestoneLabelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },

  // Header
  headerContainer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 },
  headerBlur: { paddingBottom: 12, backgroundColor: 'rgba(255,255,255,0.85)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  statsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, marginHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statNumber: { fontSize: 16, fontWeight: '700', color: '#333' },
  statLabel: { fontSize: 13, color: '#666' },
  statDivider: { width: 1, height: 20, backgroundColor: 'rgba(0,0,0,0.1)', marginHorizontal: 12 },

  // Mascot
  mascotContainer: { position: 'absolute', top: 280, right: 12, alignItems: 'center', zIndex: 50 },
  speechBubble: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  speechText: { fontSize: 11, fontWeight: '600', color: '#333', textAlign: 'center' },
  mascotIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },

  // Segment tabs
  segmentTabsContainer: {
    position: 'absolute',
    top: 0, // Will be adjusted by paddingTop in component
    left: 0,
    right: 0,
    zIndex: 90,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  segmentTabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  segmentTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    minWidth: 80,
  },
  segmentTabViewing: {
    backgroundColor: TRAIL_COLORS.nodeCurrent,
  },
  segmentTabCurrent: {
    backgroundColor: TRAIL_COLORS.nodeCurrent,
  },
  segmentTabCompleted: {
    backgroundColor: TRAIL_COLORS.nodeCompleted,
  },
  segmentTabLocked: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  segmentTabDay: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  segmentTabDayCurrent: {
    color: '#FFFFFF',
  },
  segmentTabName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    maxWidth: 80,
  },
  segmentTabNameCurrent: {
    color: '#FFFFFF',
  },
  segmentTabNameCompleted: {
    color: '#FFFFFF',
  },
  segmentTabNameLocked: {
    color: '#999',
  },
});