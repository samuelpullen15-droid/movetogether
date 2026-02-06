/**
 * WeeklyRecapShareCard
 *
 * A visually appealing card component designed to be captured
 * and shared as an image via social media or messaging apps.
 */

import React, { forwardRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Text, DisplayText } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Target,
  Flame,
  Trophy,
  Award,
  Calendar,
  Dumbbell,
  Clock,
} from 'lucide-react-native';
import type { WeeklyRecapData } from '@/lib/edge-functions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48;

interface WeeklyRecapShareCardProps {
  data: WeeklyRecapData;
  userName?: string;
}

export const WeeklyRecapShareCard = forwardRef<View, WeeklyRecapShareCardProps>(
  ({ data, userName }, ref) => {
    const weeklyGoalPercent = Math.round((data.totalRingsClosed / 21) * 100);

    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        <LinearGradient
          colors={['#1a1a2e', '#16213e', '#0f3460']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {/* Header */}
          <View style={styles.header}>
            <DisplayText style={styles.appName}>MoveTogether</DisplayText>
            <Text style={styles.weekLabel}>WEEKLY RECAP</Text>
          </View>

          {/* Main Stat */}
          <View style={styles.mainStat}>
            <View style={styles.mainStatIconWrapper}>
              <LinearGradient
                colors={['rgba(255, 107, 53, 0.4)', 'rgba(255, 107, 53, 0)']}
                style={styles.mainStatGlow}
              />
              <View style={styles.mainStatCircle}>
                <Target size={28} color="#FF6B35" strokeWidth={2} />
              </View>
            </View>
            <DisplayText style={styles.mainStatValue}>{data.totalRingsClosed}</DisplayText>
            <Text style={styles.mainStatLabel}>RINGS CLOSED</Text>
          </View>

          {/* Ring Breakdown */}
          <View style={styles.ringBreakdown}>
            <View style={[styles.ringItem, { backgroundColor: 'rgba(250, 17, 79, 0.15)' }]}>
              <Text style={[styles.ringValue, { color: '#FA114F' }]}>{data.avgMovePercent}%</Text>
              <Text style={styles.ringLabel}>Move</Text>
            </View>
            <View style={[styles.ringItem, { backgroundColor: 'rgba(146, 232, 42, 0.15)' }]}>
              <Text style={[styles.ringValue, { color: '#92E82A' }]}>{data.avgExercisePercent}%</Text>
              <Text style={styles.ringLabel}>Exercise</Text>
            </View>
            <View style={[styles.ringItem, { backgroundColor: 'rgba(0, 212, 255, 0.15)' }]}>
              <Text style={[styles.ringValue, { color: '#00D4FF' }]}>{data.avgStandPercent}%</Text>
              <Text style={styles.ringLabel}>Stand</Text>
            </View>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            {data.currentStreak > 0 && (
              <View style={styles.statItem}>
                <Flame size={16} color="#FF6B35" fill="#FF6B35" />
                <Text style={styles.statValue}>{data.currentStreak}</Text>
                <Text style={styles.statLabel}>Day Streak</Text>
              </View>
            )}
            {data.competitionsPlayed > 0 && (
              <View style={styles.statItem}>
                <Trophy size={16} color="#9B59B6" />
                <Text style={styles.statValue}>
                  {data.competitionsWon > 0 ? data.competitionsWon : data.competitionsPlayed}
                </Text>
                <Text style={styles.statLabel}>
                  {data.competitionsWon > 0 ? 'Won' : 'Competed'}
                </Text>
              </View>
            )}
            {data.achievementsUnlocked > 0 && (
              <View style={styles.statItem}>
                <Award size={16} color="#F39C12" />
                <Text style={styles.statValue}>{data.achievementsUnlocked}</Text>
                <Text style={styles.statLabel}>Achievements</Text>
              </View>
            )}
            <View style={styles.statItem}>
              <Calendar size={16} color="#3498DB" />
              <Text style={styles.statValue}>{data.daysWithActivity}/7</Text>
              <Text style={styles.statLabel}>Active Days</Text>
            </View>
          </View>

          {/* Weekly Goal Progress */}
          <View style={styles.progressSection}>
            <Text style={styles.progressLabel}>Weekly Goal Progress</Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${Math.min(weeklyGoalPercent, 100)}%` }]} />
            </View>
            <Text style={styles.progressValue}>{weeklyGoalPercent}%</Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {userName && (
              <Text style={styles.userName}>@{userName}</Text>
            )}
            <View style={styles.branding}>
              <Text style={styles.brandingText}>movetogetherfitness.com</Text>
            </View>
          </View>

          {/* Decorative Elements */}
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />
        </LinearGradient>
      </View>
    );
  }
);

WeeklyRecapShareCard.displayName = 'WeeklyRecapShareCard';

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  gradient: {
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  appName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FA114F',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  weekLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 2,
    marginTop: 4,
  },

  // Main Stat
  mainStat: {
    alignItems: 'center',
    marginBottom: 12,
  },
  mainStatIconWrapper: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  mainStatGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  mainStatCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainStatValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 52,
  },
  mainStatLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 2,
    marginTop: 0,
    marginBottom: 8,
  },

  // Ring Breakdown
  ringBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  ringItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  ringLabel: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ringValue: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 70,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 1,
  },

  // Progress
  progressSection: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  progressBarContainer: {
    width: '100%',
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FF6B35',
    borderRadius: 5,
  },
  progressValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B35',
    marginTop: 6,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandingText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
  },

  // Decorative
  decorCircle1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(250, 17, 79, 0.1)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0, 212, 255, 0.1)',
  },
});

export default WeeklyRecapShareCard;
