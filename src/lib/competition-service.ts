import { supabase, isSupabaseConfigured } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import type { Competition, Participant } from './fitness-store';
import type { ScoringConfig } from './competition-types';
import { useHealthStore } from './health-service';
import { Platform } from 'react-native';
import { createActivity } from './activity-service';

async function sendNotification(
  type: string,
  recipientUserId: string,
  data: Record<string, any>
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  
  try {
    await supabase.functions.invoke('send-notification', {
      body: { type, recipientUserId, data },
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

export interface CompetitionRecord {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  type: 'weekend' | 'weekly' | 'monthly' | 'custom';
  status: 'upcoming' | 'active' | 'completed';
  scoring_type: string;
  scoring_config: ScoringConfig | null;
  is_public: boolean;
  repeat_option: string;
  created_at: string;
  updated_at: string;
}

export interface ParticipantRecord {
  id: string;
  competition_id: string;
  user_id: string;
  joined_at: string;
  last_sync_at: string | null;
  total_points: number;
  move_calories: number;
  exercise_minutes: number;
  stand_hours: number;
  step_count: number;
  move_progress: number;
  exercise_progress: number;
  stand_progress: number;
  // Joined from profiles
  username?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface DailyDataRecord {
  id: string;
  competition_id: string;
  participant_id: string;
  user_id: string;
  date: string;
  move_calories: number;
  exercise_minutes: number;
  stand_hours: number;
  step_count: number;
  distance_meters: number;
  workouts_completed: number;
  points: number;
  synced_at: string;
}

export interface PendingInvitation {
  id: string;
  inviteeId: string;
  inviteeName: string;
  inviteeAvatar: string;
  invitedAt: string;
}

export interface PendingInvitation {
  id: string;
  inviteeId: string;
  inviteeName: string;
  inviteeAvatar: string;
  invitedAt: string;
}

// Track which competitions we've already processed for winner activities
const processedCompetitionWinners = new Set<string>();

async function checkAndCreateWinnerActivity(competition: any, participants: any[]): Promise<void> {
  // Only process completed competitions
  if (competition.status !== 'completed') return;
  
  // Only process each competition once per session
  if (processedCompetitionWinners.has(competition.id)) return;
  processedCompetitionWinners.add(competition.id);
  
  // Find the winner (first place by points)
  if (!participants || participants.length === 0) return;
  
  const sortedParticipants = [...participants].sort((a, b) => 
    (Number(b.total_points) || 0) - (Number(a.total_points) || 0)
  );
  
  const winner = sortedParticipants[0];
  if (!winner || !winner.user_id) return;
  
  try {
    // Check if winner activity already exists for this competition
    const { data: existing } = await supabase
      .from('activity_feed')
      .select('id')
      .eq('user_id', winner.user_id)
      .eq('activity_type', 'competition_won')
      .eq('metadata->>competitionId', competition.id)
      .limit(1);
    
    if (existing && existing.length > 0) return;
    
    // Create the winner activity
    await createActivity(winner.user_id, 'competition_won', {
      competitionId: competition.id,
      competitionName: competition.name,
      participantCount: participants.length,
    });
    
    console.log('[CompetitionService] Created competition_won activity for', winner.user_id);

    // Notify the winner
    await sendNotification('competition_won', winner.user_id, {
      competitionId: competition.id,
      competitionName: competition.name,
    });
  } catch (error) {
    console.error('[CompetitionService] Failed to create winner activity:', error);
  }
}

/**
 * Fetch a competition by ID with all participants and pending invitations
 */
export async function fetchCompetition(competitionId: string, currentUserId?: string): Promise<(Competition & { creatorId: string; pendingInvitations?: PendingInvitation[] }) | null> {
  try {
    const { data: competition, error } = await supabase
      .from('competitions')
      .select('*')
      .eq('id', competitionId)
      .single();

    if (error) {
      console.error('Error fetching competition:', error);
      return null;
    }

    if (!competition) return null;

    // Fetch participants with profile data from competition_participants (primary source)
    // competition_standings view may be stale, so we always use competition_participants
    let participants: any[] | null = null;
    let participantsError: any = null;

    // Fetch directly from competition_participants for most up-to-date data
    const { data: participantsData, error: participantsErr } = await supabase
      .from('competition_participants')
      .select(`
        *,
        profiles:user_id (
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('competition_id', competitionId)
      .order('total_points', { ascending: false });

    participants = participantsData;
    participantsError = participantsErr;

    console.log('[CompetitionService] fetchCompetition - participants data:', {
      competitionId,
      participantCount: participants?.length || 0,
      participants: participants?.map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        total_points: p.total_points,
        move_calories: p.move_calories,
        exercise_minutes: p.exercise_minutes,
        stand_hours: p.stand_hours,
        move_progress: p.move_progress,
        exercise_progress: p.exercise_progress,
        stand_progress: p.stand_progress,
      })),
    });

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      return null;
    }

    // Transform to Competition format
    const transformedParticipants: Participant[] = (participants || []).map((p: any) => {
      const profile = p.profiles || {};
      const firstName = profile.full_name?.split(' ')[0] || profile.username || 'User';
      // avatar_url should already be the full public URL from Supabase Storage, or null/empty
      // Use getAvatarUrl which handles both full URLs and generates fallback avatars
      const avatar = getAvatarUrl(profile.avatar_url, firstName, profile.username);

      return {
        id: p.user_id,
        name: firstName,
        avatar,
        points: Number(p.total_points) || 0,
        moveProgress: Number(p.move_progress) || 0,
        exerciseProgress: Number(p.exercise_progress) || 0,
        standProgress: Number(p.stand_progress) || 0,
        moveCalories: Number(p.move_calories) || 0, // Raw calories for raw_numbers scoring
        exerciseMinutes: Number(p.exercise_minutes) || 0, // Raw minutes for raw_numbers scoring
        standHours: Number(p.stand_hours) || 0, // Raw hours for raw_numbers scoring
        stepCount: Number(p.step_count) || 0, // Raw step count for step_count scoring
      };
    });

    // Fetch pending invitations if current user is the creator
    let pendingInvitations: PendingInvitation[] | undefined = undefined;
    if (currentUserId && competition.creator_id === currentUserId) {
      const { data: invitations, error: invitationsError } = await supabase
        .from('competition_invitations')
        .select(`
          id,
          invitee_id,
          invited_at,
          profiles:invitee_id (
            username,
            full_name,
            avatar_url
          )
        `)
        .eq('competition_id', competitionId)
        .eq('status', 'pending')
        .order('invited_at', { ascending: false });

      if (!invitationsError && invitations) {
        pendingInvitations = invitations.map((inv: any) => {
          const profile = inv.profiles || {};
          const firstName = profile.full_name?.split(' ')[0] || profile.username || 'User';
          const avatar = getAvatarUrl(profile.avatar_url, firstName, profile.username);

          return {
            id: inv.id,
            inviteeId: inv.invitee_id,
            inviteeName: firstName,
            inviteeAvatar: avatar,
            invitedAt: inv.invited_at,
          };
        });
      } else if (invitationsError) {
        console.error('Error fetching pending invitations:', invitationsError);
      }
    }

    // Check if competition just ended and create winner activity
    if (competition.status === 'completed' && participants && participants.length > 0) {
      checkAndCreateWinnerActivity(competition, participants).catch(console.error);
    }

    return {
      id: competition.id,
      name: competition.name,
      description: competition.description || '',
      startDate: competition.start_date,
      endDate: competition.end_date,
      type: competition.type,
      status: competition.status,
      scoringType: competition.scoring_type || 'ring_close', // Map scoring_type from database
      participants: transformedParticipants,
      creatorId: competition.creator_id, // Include creator_id for checking if user is creator
      pendingInvitations, // Include pending invitations if user is creator
    };
  } catch (error) {
    console.error('Error in fetchCompetition:', error);
    return null;
  }
}

/**
 * Fetch all competitions a user is participating in
 */
export async function fetchUserCompetitions(userId: string): Promise<Competition[]> {
  try {
    // Get all competition IDs where user is a participant
    const { data: participants, error: participantsError } = await supabase
      .from('competition_participants')
      .select('competition_id')
      .eq('user_id', userId);

    if (participantsError) {
      console.error('Error fetching user participants:', participantsError);
      return [];
    }

    if (!participants || participants.length === 0) {
      return [];
    }

    const competitionIds = participants.map((p) => p.competition_id);

    // Fetch all competitions for these IDs
    const competitions: Competition[] = [];
    for (const competitionId of competitionIds) {
      const competition = await fetchCompetition(competitionId);
      if (competition) {
        competitions.push(competition);
      }
    }

    return competitions;
  } catch (error: any) {
    console.error('Error in fetchUserCompetitions:', error);
    return [];
  }
}

/**
 * Subscribe to real-time updates for a competition
 */
export function subscribeToCompetition(
  competitionId: string,
  callback: (competition: Competition | null) => void
) {
  const channel = supabase
    .channel(`competition:${competitionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'competition_participants',
        filter: `competition_id=eq.${competitionId}`,
      },
      async () => {
        // Refetch competition when participants change
        const updatedCompetition = await fetchCompetition(competitionId);
        callback(updatedCompetition);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'competitions',
        filter: `id=eq.${competitionId}`,
      },
      async () => {
        // Refetch competition when competition data changes
        const updatedCompetition = await fetchCompetition(competitionId);
        callback(updatedCompetition);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Sync health data to competition_daily_data table.
 * This updates the user's daily health metrics for a competition.
 * The database trigger will automatically recalculate standings.
 */
export async function syncCompetitionHealthData(
  competitionId: string,
  userId: string,
  startDate: string,
  endDate: string,
  healthMetrics: Array<{
    date: string;
    moveCalories: number;
    exerciseMinutes: number;
    standHours: number;
    stepCount: number;
    distanceMeters?: number;
    workoutsCompleted?: number;
    points?: number;
  }>
): Promise<boolean> {
  try {
    if (!isSupabaseConfigured() || !supabase) {
      console.error('[CompetitionService] Supabase not configured');
      return false;
    }

    console.log('[CompetitionService] syncCompetitionHealthData called:', {
      competitionId,
      userId,
      startDate,
      endDate,
      metricsCount: healthMetrics.length,
    });

    // Get participant ID for this user in this competition
    const { data: participant, error: participantError } = await supabase
      .from('competition_participants')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('user_id', userId)
      .single();

    if (participantError || !participant) {
      console.error('[CompetitionService] Failed to find participant:', participantError);
      return false;
    }

    const participantId = participant.id;
    console.log('[CompetitionService] Found participant:', { participantId, userId });

    // Get competition details for scoring
    const { data: competition, error: competitionError } = await supabase
      .from('competitions')
      .select('scoring_type, scoring_config')
      .eq('id', competitionId)
      .single();

    if (competitionError || !competition) {
      console.error('[CompetitionService] Failed to fetch competition:', competitionError);
      return false;
    }

    // Get user's goals for calculating progress
    const healthStore = useHealthStore.getState();
    const goals = healthStore.goals;

    // Prepare records for upsert
    const records = healthMetrics.map((metric) => {
      // Calculate progress (0-1 for each ring)
      const moveProgress = goals.moveCalories > 0 ? metric.moveCalories / goals.moveCalories : 0;
      const exerciseProgress = goals.exerciseMinutes > 0 ? metric.exerciseMinutes / goals.exerciseMinutes : 0;
      const standProgress = goals.standHours > 0 ? metric.standHours / goals.standHours : 0;

      // Calculate points based on scoring type
      let points = 0;
      const scoringType = competition.scoring_type || 'ring_close';

      if (scoringType === 'ring_close') {
        // Points for closing each ring (progress >= 1.0)
        if (moveProgress >= 1.0) points += 100;
        if (exerciseProgress >= 1.0) points += 100;
        if (standProgress >= 1.0) points += 100;
      } else if (scoringType === 'percentage') {
        // Points based on percentage of goal completed (capped at 100%)
        points = Math.round(
          (Math.min(moveProgress, 1.0) * 100 +
            Math.min(exerciseProgress, 1.0) * 100 +
            Math.min(standProgress, 1.0) * 100) / 3
        );
      } else if (scoringType === 'raw_numbers') {
        // Points = sum of calories + minutes + hours
        points = metric.moveCalories + metric.exerciseMinutes + metric.standHours;
      } else if (scoringType === 'step_count') {
        // Points = step count
        points = metric.stepCount;
      }

      return {
        competition_id: competitionId,
        participant_id: participantId,
        user_id: userId,
        date: metric.date,
        move_calories: Math.round(metric.moveCalories),
        exercise_minutes: Math.round(metric.exerciseMinutes),
        stand_hours: Math.round(metric.standHours),
        step_count: Math.round(metric.stepCount),
        distance_meters: Math.round(metric.distanceMeters || 0),
        workouts_completed: metric.workoutsCompleted || 0,
        points: points,
        synced_at: new Date().toISOString(),
      };
    });

    console.log('[CompetitionService] Upserting records:', {
      count: records.length,
      firstRecord: records[0],
      lastRecord: records[records.length - 1],
    });

    // Upsert daily data records
    const { error: upsertError } = await supabase
      .from('competition_daily_data')
      .upsert(records, {
        onConflict: 'competition_id,user_id,date',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error('[CompetitionService] Failed to upsert daily data:', upsertError);
      return false;
    }

    console.log('[CompetitionService] Successfully synced daily data');

    // Now update the participant's aggregated totals
    // Calculate totals from all daily data for this competition within the date range
    // Normalize dates to YYYY-MM-DD format (database stores dates without time)
    const normalizeDate = (dateStr: string): string => {
      // Handle ISO format "2025-01-15T00:00:00.000Z" or plain "2025-01-15"
      return dateStr.split('T')[0];
    };
    const normalizedStartDate = normalizeDate(startDate);
    const normalizedEndDate = normalizeDate(endDate);

    console.log('[CompetitionService] Fetching daily data with normalized dates:', {
      originalStartDate: startDate,
      originalEndDate: endDate,
      normalizedStartDate,
      normalizedEndDate,
    });

    const { data: allDailyData, error: fetchError } = await supabase
      .from('competition_daily_data')
      .select('*')
      .eq('competition_id', competitionId)
      .eq('user_id', userId)
      .gte('date', normalizedStartDate)
      .lte('date', normalizedEndDate);

    if (fetchError) {
      console.error('[CompetitionService] Failed to fetch all daily data:', fetchError);
      return false;
    }

    console.log('[CompetitionService] Fetched daily data for aggregation:', {
      recordCount: allDailyData?.length || 0,
      records: (allDailyData || []).map(d => ({
        date: d.date,
        move_calories: d.move_calories,
        exercise_minutes: d.exercise_minutes,
        stand_hours: d.stand_hours,
        points: d.points,
      })),
    });

    // Aggregate totals
    const totals = (allDailyData || []).reduce(
      (acc, day) => ({
        move_calories: acc.move_calories + (day.move_calories || 0),
        exercise_minutes: acc.exercise_minutes + (day.exercise_minutes || 0),
        stand_hours: acc.stand_hours + (day.stand_hours || 0),
        step_count: acc.step_count + (day.step_count || 0),
        total_points: acc.total_points + (day.points || 0),
      }),
      { move_calories: 0, exercise_minutes: 0, stand_hours: 0, step_count: 0, total_points: 0 }
    );

    // Calculate progress as average across all days
    const dayCount = allDailyData?.length || 1;
    const avgMoveProgress = goals.moveCalories > 0 ? totals.move_calories / (goals.moveCalories * dayCount) : 0;
    const avgExerciseProgress = goals.exerciseMinutes > 0 ? totals.exercise_minutes / (goals.exerciseMinutes * dayCount) : 0;
    const avgStandProgress = goals.standHours > 0 ? totals.stand_hours / (goals.standHours * dayCount) : 0;

    console.log('[CompetitionService] Updating participant totals:', {
      participantId,
      totals,
      dayCount,
      avgMoveProgress,
      avgExerciseProgress,
      avgStandProgress,
    });

    // Update participant record with totals
    const { error: updateError } = await supabase
      .from('competition_participants')
      .update({
        move_calories: totals.move_calories,
        exercise_minutes: totals.exercise_minutes,
        stand_hours: totals.stand_hours,
        step_count: totals.step_count,
        total_points: totals.total_points,
        move_progress: avgMoveProgress,
        exercise_progress: avgExerciseProgress,
        stand_progress: avgStandProgress,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', participantId);

    if (updateError) {
      console.error('[CompetitionService] Failed to update participant totals:', updateError);
      return false;
    }

    console.log('[CompetitionService] Successfully updated participant totals');
    return true;
  } catch (error) {
    console.error('[CompetitionService] Error syncing health data:', error);
    return false;
  }
}

// Lazy load HealthKit module with caching (same pattern as health-service.ts)
let cachedHealthKitModule: typeof import('@kingstinct/react-native-healthkit') | null = null;

const loadHealthKitModule = async () => {
  if (cachedHealthKitModule) {
    return cachedHealthKitModule;
  }

  if (Platform.OS !== 'ios') {
    return null;
  }

  try {
    const module = await import('@kingstinct/react-native-healthkit');
    cachedHealthKitModule = module;
    console.log('[CompetitionService] HealthKit module loaded');
    return cachedHealthKitModule;
  } catch (error) {
    console.error('[CompetitionService] Failed to load HealthKit module:', error);
    return null;
  }
};

/**
 * Fetch health data for a date range from Apple Health
 * Uses @kingstinct/react-native-healthkit library
 */
export async function fetchHealthDataForDateRange(
  startDate: Date,
  endDate: Date
): Promise<Array<{
  date: string;
  moveCalories: number;
  exerciseMinutes: number;
  standHours: number;
  stepCount: number;
  distanceMeters: number;
  workoutsCompleted: number;
  points: number;
}>> {
  try {
    if (Platform.OS !== 'ios') {
      console.log('[CompetitionService] Apple Health only available on iOS');
      return [];
    }

    const healthStore = useHealthStore.getState();
    const activeProvider = healthStore.activeProvider;

    if (activeProvider !== 'apple_health') {
      console.log('[CompetitionService] Apple Health is not the active provider');
      return [];
    }

    // Ensure HealthKit is initialized
    if (!healthStore.providers.find(p => p.id === 'apple_health')?.connected) {
      await healthStore.connectProvider('apple_health');
    }

    // Load the HealthKit module
    const HealthKit = await loadHealthKitModule();
    if (!HealthKit) {
      console.log('[CompetitionService] HealthKit module not available');
      return [];
    }

    const { queryStatisticsForQuantity, queryQuantitySamples } = HealthKit;

    // Get the date string in YYYY-MM-DD format using local time
    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Helper to query statistics with de-duplication (for cumulative metrics)
    const getStatisticsSum = async (
      typeIdentifier: 'HKQuantityTypeIdentifierActiveEnergyBurned' | 'HKQuantityTypeIdentifierAppleExerciseTime' | 'HKQuantityTypeIdentifierStepCount' | 'HKQuantityTypeIdentifierDistanceWalkingRunning',
      start: Date,
      end: Date
    ): Promise<number> => {
      try {
        const result = await queryStatisticsForQuantity(typeIdentifier, ['cumulativeSum'], {
          filter: {
            date: { startDate: start, endDate: end },
          },
        });
        // The result contains sumQuantity which is the de-duplicated sum
        return result?.sumQuantity?.quantity || 0;
      } catch (error) {
        console.warn(`[CompetitionService] Statistics query failed for ${typeIdentifier}:`, error);
        return 0;
      }
    };

    // Helper to get Active Energy from Apple Watch only (to match the Move ring)
    // The Move ring in Apple Fitness only shows calories from Apple Watch, not other sources
    const getAppleWatchActiveEnergy = async (start: Date, end: Date): Promise<number> => {
      try {
        // Query all active energy samples
        const samples = await queryQuantitySamples('HKQuantityTypeIdentifierActiveEnergyBurned', {
          filter: { date: { startDate: start, endDate: end } },
          limit: -1,
          ascending: false,
        });

        if (!samples || samples.length === 0) {
          return 0;
        }

        // Filter to only include samples from Apple Watch
        // Apple Watch samples have device.productType containing "Watch" or source.bundleIdentifier from Apple
        const watchSamples = samples.filter((sample: any) => {
          const device = sample.device;
          const source = sample.sourceRevision?.source;

          // Check if it's from Apple Watch
          const isFromWatch = device?.productType?.toLowerCase().includes('watch') ||
                              device?.name?.toLowerCase().includes('watch') ||
                              source?.bundleIdentifier?.includes('com.apple.health');

          return isFromWatch;
        });

        // Sum up the Apple Watch samples
        const total = watchSamples.reduce((sum: number, sample: any) => {
          return sum + (sample.quantity || 0);
        }, 0);

        console.log(`[CompetitionService] Apple Watch Active Energy:`, {
          totalSamples: samples.length,
          watchSamples: watchSamples.length,
          total: total,
          sources: [...new Set(samples.map((s: any) => s.sourceRevision?.source?.bundleIdentifier || 'unknown'))],
        });

        return total;
      } catch (error) {
        console.warn('[CompetitionService] Failed to get Apple Watch active energy:', error);
        return 0;
      }
    };

    // Fetch metrics for each day in the date range
    const dailyData: Array<{
      date: string;
      moveCalories: number;
      exerciseMinutes: number;
      standHours: number;
      stepCount: number;
      distanceMeters: number;
      workoutsCompleted: number;
      points: number;
    }> = [];

    const startDateLocal = new Date(startDate);
    const endDateLocal = new Date(endDate);

    // Create date objects for iteration in local timezone
    const currentDate = new Date(startDateLocal);
    currentDate.setHours(0, 0, 0, 0);
    const endDateNormalized = new Date(endDateLocal);
    endDateNormalized.setHours(23, 59, 59, 999);

    console.log('[CompetitionService] Fetching data for date range:', {
      start: formatLocalDate(currentDate),
      end: formatLocalDate(endDateNormalized),
    });

    while (currentDate <= endDateNormalized) {
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      const dateStr = formatLocalDate(currentDate);

      try {
        // Fetch metrics using statistics queries (properly de-duplicates data from multiple sources)
        // For Active Energy, we filter to Apple Watch only to match the Move ring display
        // For stand hours, we still need samples to count unique hours
        const [moveCalories, exerciseMinutes, standSamples, stepCount, distanceKm] = await Promise.all([
          getAppleWatchActiveEnergy(dayStart, dayEnd),
          getStatisticsSum('HKQuantityTypeIdentifierAppleExerciseTime', dayStart, dayEnd),
          queryQuantitySamples('HKQuantityTypeIdentifierAppleStandTime', {
            filter: { date: { startDate: dayStart, endDate: dayEnd } },
            limit: -1,
            ascending: false,
          }),
          getStatisticsSum('HKQuantityTypeIdentifierStepCount', dayStart, dayEnd),
          getStatisticsSum('HKQuantityTypeIdentifierDistanceWalkingRunning', dayStart, dayEnd),
        ]);

        // Log raw values from HealthKit for debugging
        console.log(`[CompetitionService] Raw HealthKit data for ${dateStr}:`, {
          moveCalories: moveCalories,
          moveCaloriesRounded: Math.round(moveCalories),
          exerciseMinutes: exerciseMinutes,
          stepCount: stepCount,
          distanceKm: distanceKm,
          dayStart: dayStart.toISOString(),
          dayEnd: dayEnd.toISOString(),
        });

        // Count unique hours with stand data (can't use statistics for this)
        const standHours = new Set(
          (standSamples || []).map((s: any) => new Date(s.startDate || new Date()).getHours())
        ).size;
        const distanceMeters = Math.round(distanceKm * 1000); // km to meters

        dailyData.push({
          date: dateStr,
          moveCalories: Math.round(moveCalories),
          exerciseMinutes: Math.round(exerciseMinutes),
          standHours,
          stepCount: Math.round(stepCount),
          distanceMeters,
          workoutsCompleted: 0, // Skipping workouts for now to keep it simple
          points: 0,
        });
      } catch (error) {
        console.error(`[CompetitionService] Error fetching data for ${dateStr}:`, error);
        // Add empty entry for this day
        dailyData.push({
          date: dateStr,
          moveCalories: 0,
          exerciseMinutes: 0,
          standHours: 0,
          stepCount: 0,
          distanceMeters: 0,
          workoutsCompleted: 0,
          points: 0,
        });
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log('[CompetitionService] Fetched daily data:', {
      daysCount: dailyData.length,
      firstDay: dailyData[0],
      lastDay: dailyData[dailyData.length - 1],
    });

    return dailyData;
  } catch (error) {
    console.error('[CompetitionService] Error fetching health data for date range:', error);
    return [];
  }
}

/**
 * Join a public competition
 * Uses database function for server-side validation
 */
export async function joinPublicCompetition(competitionId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('join_public_competition', {
      p_competition_id: competitionId,
    });

    if (error) {
      console.error('Error joining public competition:', error);
      return { success: false, error: error.message || 'Failed to join competition' };
    }

    if (data === false) {
      return { 
        success: false, 
        error: 'Cannot join this competition. It may not be public, already started, or you may already be a participant.' 
      };
    }

    // Create activity for joining competition and notify participants
    let competitionName = 'a competition';
    try {
      // Fetch competition name for the activity
      const { data: competition } = await supabase
        .from('competitions')
        .select('name')
        .eq('id', competitionId)
        .single();
      
      if (competition) {
        competitionName = competition.name;
        await createActivity(userId, 'competition_joined', {
          competitionId,
          competitionName: competition.name,
        });
      }
    } catch (e) {
      console.error('[CompetitionService] Failed to create competition_joined activity:', e);
      // Don't fail the join if activity creation fails
    }

    // Notify other participants that someone joined
    try {
      const { data: joinerProfile } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', userId)
        .single();
      
      const participantName = joinerProfile?.full_name || joinerProfile?.username || 'Someone';
      
      // Get other participants
      const { data: participants } = await supabase
        .from('competition_participants')
        .select('user_id')
        .eq('competition_id', competitionId)
        .neq('user_id', userId);
      
      if (participants) {
        for (const p of participants) {
          await sendNotification('competition_joined', p.user_id, {
            competitionId,
            competitionName,
            participantName,
          });
        }
      }
    } catch (e) {
      console.error('Failed to send competition joined notifications:', e);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in joinPublicCompetition:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to join competition' 
    };
  }
}

/**
 * Leave a competition
 * Uses Edge Function for server-side validation and subscription checks
 */
export async function leaveCompetition(
  competitionId: string, 
  userId: string,
  paymentIntentId?: string
): Promise<{ success: boolean; error?: string; requiresPayment?: boolean; amount?: number }> {
  try {
    // Get session for authorization
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Call Edge Function for server-side validation
    const { data, error: functionError } = await supabase.functions.invoke(
      'leave-competition',
      {
        body: {
          competitionId,
          transactionId: paymentIntentId  // Edge function expects transactionId
        },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      }
    );

    if (functionError) {
      // Check if it's a payment required error (402)
      // The error context may contain the response
      const errorContext = functionError.context;
      if (errorContext && typeof errorContext === 'object' && 'status' in errorContext) {
        const status = (errorContext as any).status;
        if (status === 402) {
          // Try to parse the error body
          try {
            if ('json' in errorContext && typeof (errorContext as any).json === 'function') {
              const errorBody = await (errorContext as any).json();
              return {
                success: false,
                error: errorBody.error || 'Payment required to leave competition',
                requiresPayment: errorBody.requiresPayment ?? true,
                amount: errorBody.amount ?? 2.99,
              };
            }
          } catch (e) {
            // Fall through to default payment required message
          }
          
          // Default payment required response
          return {
            success: false,
            error: 'Free users must pay $2.99 to leave a competition. Upgrade to Mover or Crusher for free withdrawals.',
            requiresPayment: true,
            amount: 2.99,
          };
        }
      }
      
      // Other errors
      const errorMessage = functionError.message || 'Failed to leave competition';
      return { success: false, error: errorMessage };
    }

    // Check if data indicates an error
    if (data) {
      if (data.error) {
        return { 
          success: false, 
          error: data.error,
          requiresPayment: data.requiresPayment,
          amount: data.amount,
        };
      }
      
      if (data.success === false) {
        return { 
          success: false, 
          error: data.error || 'Failed to leave competition',
          requiresPayment: data.requiresPayment,
          amount: data.amount,
        };
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error in leaveCompetition:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to leave competition' 
    };
  }
}

/**
 * Delete a competition (creator only)
 */
export async function deleteCompetition(competitionId: string, userId: string): Promise<boolean> {
  try {
    // Verify user is creator
    const { data: competition, error: checkError } = await supabase
      .from('competitions')
      .select('creator_id')
      .eq('id', competitionId)
      .single();

    if (checkError || !competition) {
      console.error('Error checking competition:', checkError);
      return false;
    }

    if (competition.creator_id !== userId) {
      console.error('User is not the creator');
      return false;
    }

    // Delete competition (cascade will delete participants and daily data)
    const { error } = await supabase
      .from('competitions')
      .delete()
      .eq('id', competitionId);

    if (error) {
      console.error('Error deleting competition:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteCompetition:', error);
    return false;
  }
}

/**
 * Create a new competition and add participants
 */
export async function createCompetition(
  settings: {
    name: string;
    startDate: Date;
    endDate: Date;
    scoringType: string;
    scoringConfig?: ScoringConfig | null;
    isPublic: boolean;
    repeatOption: string;
    creatorId: string;
    creatorName: string;
    creatorAvatar: string;
    invitedFriendIds?: string[];
  }
): Promise<{ success: boolean; competitionId?: string; error?: string }> {
  try {
    // Check rate limit: 10 competitions per day
    const { checkRateLimit, RATE_LIMITS } = await import('./rate-limit-service');
    const rateLimit = await checkRateLimit(
      settings.creatorId,
      'create-competition',
      RATE_LIMITS.COMPETITION_CREATION.limit,
      RATE_LIMITS.COMPETITION_CREATION.windowMinutes
    );

    if (!rateLimit.allowed) {
      return { 
        success: false, 
        error: rateLimit.error || 'Rate limit exceeded. Please try again later.' 
      };
    }
    // Calculate duration to determine type
    // Normalize dates to midnight local time to avoid any time-based issues
    const start = new Date(settings.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(settings.endDate);
    end.setHours(0, 0, 0, 0);
    const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Determine competition type
    let type: 'weekend' | 'weekly' | 'monthly' | 'custom' = 'custom';
    const startDay = start.getDay();
    if (durationDays === 2 && startDay === 6) {
      type = 'weekend';
    } else if (durationDays === 7) {
      type = 'weekly';
    } else if (durationDays >= 28 && durationDays <= 31) {
      type = 'monthly';
    }

    // Determine status
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDateNormalized = new Date(start);
    startDateNormalized.setHours(0, 0, 0, 0);
    const status: 'active' | 'upcoming' = startDateNormalized <= today ? 'active' : 'upcoming';

    // Generate description
    let description: string;
    if (type === 'weekend') {
      description = 'Close your rings all weekend!';
    } else if (type === 'weekly') {
      description = 'A full week of competition!';
    } else if (type === 'monthly') {
      description = 'A month-long challenge!';
    } else {
      description = `${durationDays}-day challenge`;
    }

    // Format dates in local timezone (YYYY-MM-DD) to avoid UTC conversion issues
    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const formattedStartDate = formatLocalDate(start);
    const formattedEndDate = formatLocalDate(end);

    console.log('[CompetitionService] Creating competition with dates:', {
      inputStartDate: settings.startDate?.toString(),
      inputEndDate: settings.endDate?.toString(),
      normalizedStart: start.toISOString(),
      normalizedEnd: end.toISOString(),
      formattedStartDate,
      formattedEndDate,
      localTimezoneOffset: new Date().getTimezoneOffset(),
    });

    // Create competition in Supabase
    const { data: competition, error: competitionError } = await supabase
      .from('competitions')
      .insert({
        creator_id: settings.creatorId,
        name: settings.name.trim(),
        description,
        start_date: formattedStartDate,
        end_date: formattedEndDate,
        type,
        status,
        scoring_type: settings.scoringType,
        scoring_config: settings.scoringConfig || null,
        is_public: settings.isPublic,
        repeat_option: settings.repeatOption,
      })
      .select('id')
      .single();

    if (competitionError || !competition) {
      console.error('Error creating competition:', competitionError);
      return { success: false, error: competitionError?.message || 'Failed to create competition' };
    }

    const competitionId = competition.id;

    // Add creator as participant
    const { data: creatorParticipant, error: creatorParticipantError } = await supabase
      .from('competition_participants')
      .insert({
        competition_id: competitionId,
        user_id: settings.creatorId,
      })
      .select('id')
      .single();

    if (creatorParticipantError) {
      console.error('Error adding creator as participant:', creatorParticipantError);
      // Continue anyway - competition is created
    }

    // Create invitations for invited friends instead of directly adding as participants
    // This allows users to accept/decline invitations
    if (settings.invitedFriendIds && settings.invitedFriendIds.length > 0) {
      // Import the invitation service dynamically to avoid circular dependencies
      const { createCompetitionInvitations } = await import('./invitation-service');
      const invitationResult = await createCompetitionInvitations(
        competitionId,
        settings.creatorId,
        settings.invitedFriendIds
      );

      if (!invitationResult.success) {
        console.error('Error creating invitations:', invitationResult.error);
        // Continue anyway - competition is created with creator, invitations can be retried
      }
    }

    return { success: true, competitionId };
  } catch (error: any) {
    console.error('Error in createCompetition:', error);
    return { success: false, error: error?.message || 'Unknown error creating competition' };
  }
}

/**
 * Public competition for discovery list
 */
export interface PublicCompetition {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  type: 'weekend' | 'weekly' | 'monthly' | 'custom';
  status: 'upcoming' | 'active';
  scoringType: string;
  participantCount: number;
  creatorName: string | null;
  creatorAvatar: string | null;
}

/**
 * Fetch public competitions that user can join
 * Excludes competitions user is already participating in
 */
export async function fetchPublicCompetitions(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ competitions: PublicCompetition[]; hasMore: boolean }> {
  try {
    if (!isSupabaseConfigured() || !supabase) {
      console.error('[CompetitionService] Supabase not configured');
      return { competitions: [], hasMore: false };
    }

    const { data, error } = await supabase.rpc('get_public_competitions', {
      p_user_id: userId,
      p_limit: limit + 1, // Fetch one extra to check if there are more
      p_offset: offset,
    });

    if (error) {
      console.error('[CompetitionService] Error fetching public competitions:', error);
      return { competitions: [], hasMore: false };
    }

    const hasMore = data && data.length > limit;
    const competitions: PublicCompetition[] = (data || [])
      .slice(0, limit)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        startDate: c.start_date,
        endDate: c.end_date,
        type: c.type as 'weekend' | 'weekly' | 'monthly' | 'custom',
        status: c.status as 'upcoming' | 'active',
        scoringType: c.scoring_type,
        participantCount: Number(c.participant_count) || 0,
        creatorName: c.creator_name,
        creatorAvatar: c.creator_avatar,
      }));

    return { competitions, hasMore };
  } catch (error) {
    console.error('[CompetitionService] Error in fetchPublicCompetitions:', error);
    return { competitions: [], hasMore: false };
  }
}
