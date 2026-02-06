import { supabase, isSupabaseConfigured } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import type { Competition, Participant } from './fitness-store';
import type { ScoringConfig, TeamDefinition } from './competition-types';
import { useHealthStore } from './health-service';
import { Platform, NativeModules } from 'react-native';
import { createActivity } from './activity-service';
import { competitionApi, profileApi, notificationApi, challengesApi } from './edge-functions';

// Native module for querying Apple Health Activity Summary (for accurate stand hours)
const { ActivitySummaryModule } = NativeModules;

interface ActivityGoalsResult {
  moveGoal: number;
  exerciseGoal: number;
  standGoal: number;
  moveCalories?: number;
  exerciseMinutes?: number;
  standHours?: number;
  hasData: boolean;
}

async function sendNotification(
  type: string,
  recipientUserId: string,
  data: Record<string, any>
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  await notificationApi.send(type, recipientUserId, data);
}

/**
 * Parse a date string (YYYY-MM-DD) as a local date, not UTC.
 * This prevents the date from shifting to the previous day in timezones west of UTC.
 */
function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Check if the current user's local midnight has passed for this competition.
 * Returns true if the user's local date is after the competition end date.
 * When this returns true, the user's score should be locked.
 */
export function hasUserLocalMidnightPassed(endDate: string): boolean {
  const end = parseLocalDate(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day
  return end < today;
}

/**
 * Get the user's local competition state.
 * This is used for UI display to show personalized status messages.
 *
 * Returns:
 * - 'upcoming': Competition hasn't started for this user
 * - 'active': Competition is active and user can still contribute data
 * - 'locked': User's local midnight passed, their score is locked
 * - 'completed': Competition database status is completed (all scores finalized)
 */
export function getUserCompetitionState(
  startDate: string,
  endDate: string,
  dbStatus?: string
): 'upcoming' | 'active' | 'locked' | 'completed' {
  // If DB says completed, it's completed
  if (dbStatus === 'completed') return 'completed';

  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day

  // If competition hasn't started
  if (start > today) return 'upcoming';

  // If user's local date has passed end date, their score is locked
  if (end < today) {
    return 'locked';
  }

  // Competition is active for this user
  return 'active';
}

/**
 * Calculate the correct competition status based on dates.
 * This serves as a fallback when the database status hasn't been updated by the cron job.
 */
function calculateCompetitionStatus(
  startDate: string,
  endDate: string
): 'upcoming' | 'active' | 'completed' {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day

  // If competition hasn't started
  if (start > today) return 'upcoming';

  // Client-side fallback: use device timezone offset as an approximation
  // getTimezoneOffset() returns minutes positive for west of UTC (e.g., EST = 300)
  // Use at least 5 hours (Eastern US) as a floor, plus 2 hours safety buffer
  const deviceOffsetHours = Math.abs(new Date().getTimezoneOffset() / 60);
  const bufferHours = Math.max(deviceOffsetHours, 5) + 2;

  // end is parsed as local midnight of end_date. Add 24h (full last day) + buffer.
  const endOfCompetition = new Date(end.getTime() + (24 + bufferHours) * 60 * 60 * 1000);
  if (new Date() > endOfCompetition) {
    return 'completed';
  }

  // Competition is still active (at least one timezone hasn't hit midnight yet)
  return 'active';
}

/**
 * Lock a participant's score when their local midnight passes.
 * This should be called when syncing data if the user's midnight has passed.
 */
export async function lockParticipantScore(
  competitionId: string,
  participantId: string
): Promise<boolean> {
  try {
    const { error } = await competitionApi.lockParticipantScore(competitionId, participantId);
    if (error) {
      console.error('[CompetitionService] Error locking participant score:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[CompetitionService] Error in lockParticipantScore:', error);
    return false;
  }
}

/**
 * Check if a participant's score is locked.
 */
export async function isParticipantScoreLocked(
  competitionId: string,
  _userId: string
): Promise<boolean> {
  try {
    const { data, error } = await competitionApi.isScoreLocked(competitionId);
    if (error || !data) {
      return false;
    }
    return data.locked === true;
  } catch (error) {
    return false;
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

// Track which competitions we've already processed for winner activities
const processedCompetitionWinners = new Set<string>();

/**
 * Fetch a competition by ID with all participants and pending invitations
 * Per security rules: Uses RPC functions instead of direct table access
 */
export async function fetchCompetition(competitionId: string, currentUserId?: string): Promise<(Competition & { creatorId: string; pendingInvitations?: PendingInvitation[] }) | null> {
  try {
    // OPTIMIZATION: Fetch competition, participants, and prize pool in parallel
    const [competitionResult, participantsResult, prizePoolResult] = await Promise.all([
      competitionApi.getCompetitionFull(competitionId),
      competitionApi.getCompetitionParticipantsWithProfiles(competitionId),
      competitionApi.getPrizePoolAmounts([competitionId]),
    ]);

    const { data: competitionData, error } = competitionResult;
    const { data: participantsData, error: participantsErr } = participantsResult;

    if (error) {
      console.error('Error fetching competition:', error);
      return null;
    }

    // Edge Function returns single object
    const competition = competitionData;
    if (!competition) return null;

    const participants = participantsData;
    const participantsError = participantsErr;

    // Debug logging reduced for performance - uncomment if debugging participant issues
    // console.log('[CompetitionService] fetchCompetition - participants:', competitionId, participants?.length);

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      return null;
    }

    // Transform to Competition format
    // RPC returns flat structure with profile fields directly included
    const transformedParticipants: Participant[] = (participants || []).map((p: any) => {
      // RPC returns flat structure: full_name, username, avatar_url directly on p
      const firstName = p.full_name?.split(' ')[0] || p.username || 'User';
      // avatar_url should already be the full public URL from Supabase Storage, or null/empty
      // Use getAvatarUrl which handles both full URLs and generates fallback avatars
      const avatar = getAvatarUrl(p.avatar_url, firstName, p.username);

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
        lastSyncAt: p.last_sync_at || null,
        scoreLockedAt: p.score_locked_at || null,
        isBlocked: p.is_blocked || false,
        teamId: p.team_id || null,
        prizeEligible: p.prize_eligible ?? true,
      };
    });

    // Fetch pending invitations if current user is the creator
    // Per security rules: Use RPC function instead of direct table access
    let pendingInvitations: PendingInvitation[] | undefined = undefined;
    if (currentUserId && competition.creator_id === currentUserId) {
      const { data: invitations, error: invitationsError } = await competitionApi.getCompetitionPendingInvitations(competitionId);

      if (!invitationsError && invitations) {
        // Edge Function returns nested profiles object with invitee data
        pendingInvitations = invitations.map((inv: any) => {
          // Access nested profiles object
          const inviteeProfile = inv.profiles || {};
          const firstName = inviteeProfile.full_name?.split(' ')[0] || inviteeProfile.username || 'User';
          const avatar = getAvatarUrl(inviteeProfile.avatar_url, firstName, inviteeProfile.username);

          return {
            id: inv.id,
            inviteeId: inv.invitee_id,
            inviteeName: firstName,
            inviteeAvatar: avatar,
            invitedAt: inv.created_at,
          };
        });
      } else if (invitationsError) {
        console.error('Error fetching pending invitations:', invitationsError);
      }
    }

    // Fetch team data if this is a team competition
    let teams: import('@/lib/fitness-store').TeamInfo[] | undefined = undefined;
    if (competition.is_team_competition) {
      const { data: teamsData } = await competitionApi.getCompetitionTeams(competitionId);
      if (teamsData) {
        teams = teamsData.map((t: any) => ({
          id: t.id,
          teamNumber: t.team_number,
          name: t.name,
          color: t.color,
          emoji: t.emoji,
          memberCount: t.member_count,
          avgPoints: t.avg_points,
        }));
      }
    }

    // Only declare winners when the SERVER has marked the competition as completed.
    // The server-side cron (update-competition-statuses) uses the westernmost participant's
    // timezone to determine the correct deadline, then force-locks all scores before completing.
    // Previously this used a client-side calculateCompetitionStatus() which approximated the
    // deadline using the viewer's device timezone, causing premature winner declarations
    // before all participants had a chance to sync their final day's data.
    if (competition.status === 'completed' && participants && participants.length > 0) {
      // Only process each competition once per session
      if (!processedCompetitionWinners.has(competition.id)) {
        processedCompetitionWinners.add(competition.id);
        // Process competition completion server-side (winner activity + prize distribution)
        competitionApi.processCompetitionCompletion(competition.id).catch(console.error);
      }
    }

    return {
      id: competition.id,
      name: competition.name,
      description: competition.description || '',
      startDate: competition.start_date,
      endDate: competition.end_date,
      type: competition.type,
      // Return ORIGINAL DB status, let getUserCompetitionState handle display logic
      // This allows "locked" state to show when user's midnight passed but DB isn't updated yet
      status: competition.status as 'active' | 'upcoming' | 'completed',
      scoringType: competition.scoring_type || 'ring_close', // Map scoring_type from database
      participants: transformedParticipants,
      creatorId: competition.creator_id, // Include creator_id for checking if user is creator
      pendingInvitations, // Include pending invitations if user is creator
      isPublic: competition.is_public, // Include public/private status
      isTeamCompetition: competition.is_team_competition || false,
      teamCount: competition.team_count || undefined,
      teams,
      hasPrizePool: competition.has_prize_pool || false,
      prizePoolAmount: (prizePoolResult.data as any[])?.[0]?.total_amount || undefined,
      poolType: (prizePoolResult.data as any[])?.[0]?.pool_type || 'creator_funded',
      buyInAmount: (prizePoolResult.data as any[])?.[0]?.buy_in_amount
        ? parseFloat((prizePoolResult.data as any[])[0].buy_in_amount)
        : undefined,
      isSeasonalEvent: competition.is_seasonal_event || false,
      eventTheme: competition.event_theme || null,
      eventReward: competition.event_reward || null,
    };
  } catch (error) {
    console.error('Error in fetchCompetition:', error);
    return null;
  }
}

/**
 * Fetch all competitions a user is participating in
 * Per security rules: Uses RPC functions instead of direct table access
 */
export async function fetchUserCompetitions(userId: string): Promise<Competition[]> {
  try {
    // Get all competition IDs where user is a participant
    // Per security rules: Use Edge Function instead of direct RPC
    const { data: participants, error: participantsError } = await competitionApi.getMyCompetitionIds();

    if (participantsError) {
      console.error('Error fetching user participants:', participantsError);
      return [];
    }

    if (!participants || participants.length === 0) {
      return [];
    }

    // The Edge Function returns a flat array of competition IDs (strings)
    const competitionIds = participants as string[];

    // OPTIMIZATION: Fetch all competitions in parallel instead of sequentially
    // This dramatically speeds up loading when user has multiple competitions
    const competitionPromises = competitionIds.map(competitionId =>
      fetchCompetition(competitionId).catch(err => {
        console.error(`Error fetching competition ${competitionId}:`, err);
        return null;
      })
    );

    const results = await Promise.all(competitionPromises);
    const competitions = results.filter((c): c is Competition => c !== null && c.status !== 'draft');

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

    // Check if competition has started
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const competitionStartStr = startDate.split('T')[0]; // Get YYYY-MM-DD portion
    if (competitionStartStr > todayStr) {
      console.log('[CompetitionService] Competition has not started yet, skipping sync:', {
        competitionId,
        startDate: competitionStartStr,
        today: todayStr,
      });
      return true; // Return true since this isn't an error
    }

    // OPTIMIZATION: Fetch participant and competition scoring info in parallel
    // This reduces load time by running both API calls concurrently
    const [participantResult, competitionResult] = await Promise.all([
      competitionApi.getMyParticipantRecord(competitionId),
      competitionApi.getCompetitionScoringInfo(competitionId),
    ]);

    const { data: participantData, error: participantError } = participantResult;
    const { data: competitionData, error: competitionError } = competitionResult;

    // Edge Function returns single object
    const participant = participantData;
    if (participantError || !participant) {
      console.error('[CompetitionService] Failed to find participant:', participantError);
      return false;
    }

    // Edge Function returns 'id' field, not 'participant_id'
    const participantId = participant.id || participant.participant_id;
    console.log('[CompetitionService] Found participant:', {
      participantId,
      userId,
    });

    // Check if user's score is already locked (their local midnight has passed)
    if (participant.score_locked_at) {
      console.log('[CompetitionService] Score is locked, skipping sync:', {
        participantId,
        lockedAt: participant.score_locked_at,
      });
      return true; // Return true since this isn't an error, just no update needed
    }

    // Check if user's local midnight has passed - if so, lock their score
    if (hasUserLocalMidnightPassed(endDate)) {
      console.log('[CompetitionService] User local midnight passed, locking score:', {
        participantId,
        endDate,
      });
      await lockParticipantScore(competitionId, participantId);
      return true; // Score is now locked, no more syncing
    }

    // Edge Function returns single object
    const competition = competitionData;
    if (competitionError || !competition) {
      console.error('[CompetitionService] Failed to fetch competition:', competitionError);
      return false;
    }

    // Get user's goals for calculating progress
    const healthStore = useHealthStore.getState();
    const goals = healthStore.goals;

    // Prepare records for upsert
    // Table columns: id, competition_id, participant_id, user_id, date, move_calories, exercise_minutes,
    //                stand_hours, step_count, distance_meters, workouts_completed, points, synced_at
    const records = healthMetrics.map((metric) => {
      // Calculate progress (0-1 for each ring) for points calculation
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
        participant_id: participantId, // Required by table schema (NOT NULL)
        user_id: userId,
        date: metric.date,
        move_calories: Math.round(metric.moveCalories),
        exercise_minutes: Math.round(metric.exerciseMinutes),
        stand_hours: Math.round(metric.standHours),
        step_count: Math.round(metric.stepCount),
        distance_meters: metric.distanceMeters || 0,
        workouts_completed: metric.workoutsCompleted || 0,
        points: points,
      };
    });

    console.log('[CompetitionService] Upserting records via Edge Function:', {
      count: records.length,
      competitionId,
      userId,
      firstRecord: records[0],
      lastRecord: records[records.length - 1],
      allRecordDates: records.map(r => r.date),
    });

    // Validate records before sending
    if (!records || records.length === 0) {
      console.error('[CompetitionService] No records to sync - records array is empty');
      return false;
    }

    // Upsert daily data records via Edge Function (service_role has write access)
    const { data: syncData, error: upsertError } = await competitionApi.syncMyCompetitionDailyData(
      competitionId,
      records
    );

    if (upsertError) {
      console.error('[CompetitionService] Failed to upsert daily data:', {
        error: upsertError,
        message: upsertError.message,
        participantId,
        userId,
        competitionId,
        recordCount: records.length,
        firstRecordParticipantId: records[0]?.participant_id,
      });
      return false;
    }

    console.log('[CompetitionService] Successfully synced daily data via Edge Function');

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

    // Per security rules: Use Edge Function instead of direct RPC
    const { data: allDailyData, error: fetchError } = await competitionApi.getMyCompetitionDailyData(
      competitionId,
      normalizedStartDate,
      normalizedEndDate
    );

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

    // Update participant record with totals via edge function
    const { error: updateError } = await competitionApi.updateMyParticipantTotals(competitionId, {
      move_calories: totals.move_calories,
      exercise_minutes: totals.exercise_minutes,
      stand_hours: totals.stand_hours,
      step_count: totals.step_count,
      total_points: totals.total_points,
      move_progress: avgMoveProgress,
      exercise_progress: avgExerciseProgress,
      stand_progress: avgStandProgress,
    });

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

/**
 * Sync health data for ALL active competitions the user is participating in.
 * This is called when the app opens to ensure leaderboard data is up to date.
 */
export async function syncAllActiveCompetitionsHealthData(userId: string): Promise<void> {
  try {
    if (!isSupabaseConfigured() || !supabase) {
      console.log('[CompetitionService] Supabase not configured, skipping sync');
      return;
    }

    console.log('[CompetitionService] Starting sync for all active competitions');

    // Get all competitions the user is participating in
    const competitions = await fetchUserCompetitions(userId);

    // Filter to only active competitions that have started
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const activeCompetitions = competitions.filter((c) => {
      if (c.status !== 'active') return false;
      // Only include competitions that have started (start_date <= today)
      const startDate = c.startDate.split('T')[0]; // Get YYYY-MM-DD portion
      if (startDate > todayStr) {
        console.log(`[CompetitionService] Skipping competition ${c.id} - hasn't started yet (starts ${startDate})`);
        return false;
      }
      return true;
    });

    if (activeCompetitions.length === 0) {
      console.log('[CompetitionService] No active competitions to sync');
      return;
    }

    console.log(`[CompetitionService] Found ${activeCompetitions.length} active competitions to sync`);

    // Sync each active competition
    for (const competition of activeCompetitions) {
      try {
        const startDate = new Date(competition.startDate);
        const endDate = new Date(competition.endDate);

        // Fetch health data for this competition's date range
        const healthData = await fetchHealthDataForDateRange(startDate, endDate);

        if (healthData.length === 0) {
          console.log(`[CompetitionService] No health data for competition ${competition.id}`);
          continue;
        }

        // Sync the health data to this competition
        const success = await syncCompetitionHealthData(
          competition.id,
          userId,
          competition.startDate,
          competition.endDate,
          healthData
        );

        if (success) {
          console.log(`[CompetitionService] Successfully synced competition ${competition.id}`);
        } else {
          console.log(`[CompetitionService] Failed to sync competition ${competition.id}`);
        }
      } catch (error) {
        console.error(`[CompetitionService] Error syncing competition ${competition.id}:`, error);
        // Continue with other competitions even if one fails
      }
    }

    console.log('[CompetitionService] Finished syncing all active competitions');
  } catch (error) {
    console.error('[CompetitionService] Error in syncAllActiveCompetitionsHealthData:', error);
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
    // For TODAY: Use native ActivitySummaryModule for accurate calories (matches Apple Watch)
    // For historical days: Fall back to HealthKit quantity samples
    const getAppleWatchActiveEnergy = async (start: Date, end: Date): Promise<number> => {
      // Check if this is today's date - use native module for accurate data
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const queryDay = new Date(start);
      queryDay.setHours(0, 0, 0, 0);
      const isToday = queryDay.getTime() === today.getTime();

      if (isToday && Platform.OS === 'ios' && ActivitySummaryModule) {
        try {
          console.log(`[CompetitionService] Using native ActivitySummaryModule for today's active energy`);
          const goalsResult: ActivityGoalsResult = await Promise.race([
            ActivitySummaryModule.getActivityGoals(),
            new Promise<ActivityGoalsResult>((_, reject) =>
              setTimeout(() => reject(new Error('Native module timeout after 10s')), 10000)
            ),
          ]);

          if (goalsResult.hasData && goalsResult.moveCalories !== undefined) {
            console.log(`[CompetitionService] Native module returned active energy:`, goalsResult.moveCalories);
            return goalsResult.moveCalories;
          }
          console.log(`[CompetitionService] Native module has no calorie data, falling back to HealthKit`);
        } catch (nativeError) {
          console.log(`[CompetitionService] Native module failed, falling back to HealthKit:`, nativeError);
        }
      }

      // Fall back to HealthKit quantity samples for historical data or if native fails
      try {
        const samples = await queryQuantitySamples('HKQuantityTypeIdentifierActiveEnergyBurned', {
          filter: { date: { startDate: start, endDate: end } },
          limit: -1,
          ascending: false,
        });

        if (!samples || samples.length === 0) {
          return 0;
        }

        // Filter to only include samples from Apple Watch (matching health-service.ts logic)
        const watchSamples = samples.filter((sample: any) => {
          const sourceName = sample.sourceRevision?.source?.name || '';
          const sourceBundleId = sample.sourceRevision?.source?.bundleIdentifier || '';

          // Include only Apple Watch sources - exclude manually added data and third-party apps
          // Note: 'com.apple.health.' with dot to be more precise
          const isAppleWatch = sourceName.toLowerCase().includes('watch') ||
                              sourceBundleId.includes('com.apple.health.') ||
                              sourceName === 'iPhone';

          return isAppleWatch;
        });

        const total = watchSamples.reduce((sum: number, sample: any) => {
          return sum + (sample.quantity || 0);
        }, 0);

        console.log(`[CompetitionService] Apple Watch Active Energy (HealthKit fallback):`, {
          totalSamples: samples.length,
          watchSamples: watchSamples.length,
          total: total,
          sources: [...new Set(samples.map((s: any) => s.sourceRevision?.source?.name || 'unknown'))],
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
        // For stand hours, we use the native ActivitySummaryModule for today (most accurate),
        // and fall back to HealthKit queries for historical dates

        // Helper to safely query stand hours
        // For TODAY: Use native ActivitySummaryModule for accurate stand hours (matches Apple Watch)
        // For historical days: Fall back to HealthKit quantity samples
        const getStandHours = async (): Promise<number> => {
          // Check if this is today's date - use native module for accurate data
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const queryDay = new Date(dayStart);
          queryDay.setHours(0, 0, 0, 0);
          const isToday = queryDay.getTime() === today.getTime();

          if (isToday && Platform.OS === 'ios' && ActivitySummaryModule) {
            try {
              console.log(`[CompetitionService] Using native ActivitySummaryModule for today's stand hours`);
              const goalsResult: ActivityGoalsResult = await Promise.race([
                ActivitySummaryModule.getActivityGoals(),
                new Promise<ActivityGoalsResult>((_, reject) =>
                  setTimeout(() => reject(new Error('Native module timeout after 10s')), 10000)
                ),
              ]);

              if (goalsResult.hasData && goalsResult.standHours !== undefined) {
                console.log(`[CompetitionService] Native module returned stand hours:`, goalsResult.standHours);
                return goalsResult.standHours;
              }
              console.log(`[CompetitionService] Native module has no stand data, falling back to HealthKit`);
            } catch (nativeError) {
              console.log(`[CompetitionService] Native module failed, falling back to HealthKit:`, nativeError);
            }
          }

          // Fall back to HealthKit quantity samples for historical data or if native fails
          try {
            const standSamples = await queryQuantitySamples('HKQuantityTypeIdentifierAppleStandTime', {
              filter: { date: { startDate: dayStart, endDate: dayEnd } },
              limit: -1,
              ascending: false,
            });
            // Count unique hours with stand data
            const uniqueHours = new Set(
              (standSamples || []).map((s: any) => new Date(s.startDate || new Date()).getHours())
            ).size;
            console.log(`[CompetitionService] HealthKit fallback returned ${uniqueHours} stand hours for ${dateStr}`);
            return uniqueHours;
          } catch (quantityError) {
            console.log(`[CompetitionService] Stand quantity query failed:`, quantityError);
            return 0;
          }
        };

        const [moveCalories, exerciseMinutes, standHours, stepCount, distanceKm] = await Promise.all([
          getAppleWatchActiveEnergy(dayStart, dayEnd),
          getStatisticsSum('HKQuantityTypeIdentifierAppleExerciseTime', dayStart, dayEnd),
          getStandHours(),
          getStatisticsSum('HKQuantityTypeIdentifierStepCount', dayStart, dayEnd),
          getStatisticsSum('HKQuantityTypeIdentifierDistanceWalkingRunning', dayStart, dayEnd),
        ]);

        // Log raw values from HealthKit for debugging
        console.log(`[CompetitionService] Raw HealthKit data for ${dateStr}:`, {
          moveCalories: moveCalories,
          moveCaloriesRounded: Math.round(moveCalories),
          exerciseMinutes: exerciseMinutes,
          standHours: standHours,
          stepCount: stepCount,
          distanceKm: distanceKm,
          dayStart: dayStart.toISOString(),
          dayEnd: dayEnd.toISOString(),
        });
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
export async function joinPublicCompetition(competitionId: string, userId: string): Promise<{
  success: boolean;
  error?: string;
  requiresBuyIn?: boolean;
  buyInAmount?: number;
  competitionId?: string;
}> {
  try {
    // Per security rules: Use Edge Function instead of direct RPC
    const { data, error } = await competitionApi.joinPublicCompetition(competitionId);

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

    // Check if competition requires buy-in payment
    if (data?.requires_buy_in) {
      return {
        success: false,
        requiresBuyIn: true,
        buyInAmount: data.buy_in_amount,
        competitionId: data.competition_id,
      };
    }

    // Create activity for joining competition and notify participants
    // Per security rules: Use Edge Function instead of direct RPC
    let competitionName = 'a competition';
    try {
      // Fetch competition name for the activity
      const { data: fetchedName } = await competitionApi.getCompetitionName(competitionId);

      if (fetchedName) {
        competitionName = fetchedName;
        await createActivity(userId, 'competition_joined', {
          competitionId,
          competitionName: fetchedName,
        });
      }
    } catch (e) {
      console.error('[CompetitionService] Failed to create competition_joined activity:', e);
      // Don't fail the join if activity creation fails
    }

    // Track competition_participation challenge progress
    try {
      const { data: challengeResult } = await challengesApi.updateProgress('competition_participation', 1);
      if (challengeResult?.some(c => c.just_completed)) {
        console.log('[CompetitionService] Challenge completed: competition_participation');
      }
    } catch (e) {
      console.error('[CompetitionService] Failed to update competition_participation challenge:', e);
      // Don't fail the join if challenge tracking fails
    }

    // Notify other participants that someone joined
    // Per security rules: Use Edge Function instead of direct RPC
    try {
      const { data: joinerProfile } = await profileApi.getMyProfile();

      const participantName = joinerProfile?.full_name || joinerProfile?.username || 'Someone';

      // Get other participants using Edge Function
      const { data: participantsData } = await competitionApi.getCompetitionParticipantsWithProfiles(competitionId);

      if (participantsData) {
        for (const p of participantsData) {
          if (p.user_id !== userId) {
            await sendNotification('competition_joined', p.user_id, {
              competitionId,
              competitionName,
              participantName,
            });
          }
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
 * Join a public buy-in competition without paying (not prize eligible)
 */
export async function joinPublicCompetitionWithoutBuyIn(competitionId: string, userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { data, error } = await competitionApi.joinPublicCompetition(competitionId, true);

    if (error) {
      console.error('Error joining competition without buy-in:', error);
      return { success: false, error: error.message || 'Failed to join competition' };
    }

    if (data === false) {
      return { success: false, error: 'Cannot join this competition.' };
    }

    // Create activity for joining competition
    try {
      const { data: fetchedName } = await competitionApi.getCompetitionName(competitionId);
      if (fetchedName) {
        await createActivity(userId, 'competition_joined', {
          competitionId,
          competitionName: fetchedName,
        });
      }
    } catch (e) {
      console.error('[CompetitionService] Failed to create competition_joined activity:', e);
    }

    // Track competition_participation challenge progress
    try {
      const { data: challengeResult } = await challengesApi.updateProgress('competition_participation', 1);
      if (challengeResult?.some(c => c.just_completed)) {
        console.log('[CompetitionService] Challenge completed: competition_participation');
      }
    } catch (e) {
      console.error('[CompetitionService] Failed to update competition_participation challenge:', e);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in joinPublicCompetitionWithoutBuyIn:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to join competition',
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

    // Call leave-competition Edge Function via direct fetch
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/leave-competition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({
        competitionId,
        transactionId: paymentIntentId,
      }),
    });

    const responseText = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(responseText);
    } catch {
      // Non-JSON response
    }

    // Handle payment required (402)
    if (response.status === 402 || data?.requiresPayment) {
      return {
        success: false,
        error: data?.error || 'Free users must pay $2.99 to leave a competition. Upgrade to Mover or Crusher for free withdrawals.',
        requiresPayment: true,
        amount: data?.amount ?? 2.99,
      };
    }

    // Handle other errors
    if (!response.ok) {
      return {
        success: false,
        error: data?.error || `Failed to leave competition (${response.status})`,
      };
    }

    if (data?.error) {
      return {
        success: false,
        error: data.error,
        requiresPayment: data.requiresPayment,
        amount: data.amount,
      };
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
 * Per security rules: Uses RPC functions for verification
 *
 * Rules:
 * - Only creator can delete
 * - If competition has started AND has prize pool → block deletion
 * - If competition hasn't started AND has prize pool → refund first, then delete
 */
export async function deleteCompetition(
  competitionId: string,
  _userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete via edge function (server verifies creator, handles prize pool refund)
    const { data, error } = await competitionApi.deleteCompetition(competitionId);

    if (error) {
      console.error('Error deleting competition:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in deleteCompetition:', error);
    return { success: false, error: 'An unexpected error occurred' };
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
    isDraft?: boolean; // If true, creates with 'draft' status - must call finalizeDraftCompetition later
    isTeamCompetition?: boolean;
    teamCount?: number;
    teams?: TeamDefinition[];
  }
): Promise<{ success: boolean; competitionId?: string; error?: string }> {
  try {
    // Format dates in local timezone (YYYY-MM-DD) to avoid UTC conversion issues
    const start = new Date(settings.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(settings.endDate);
    end.setHours(0, 0, 0, 0);

    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const formattedStartDate = formatLocalDate(start);
    const formattedEndDate = formatLocalDate(end);

    console.log('[CompetitionService] Creating competition with dates:', {
      formattedStartDate,
      formattedEndDate,
    });

    // Create competition via edge function (server handles type/status/description)
    const { data, error: createError } = await competitionApi.createCompetition({
      name: settings.name,
      start_date: formattedStartDate,
      end_date: formattedEndDate,
      scoring_type: settings.scoringType,
      scoring_config: settings.scoringConfig || undefined,
      is_public: settings.isPublic,
      repeat_option: settings.repeatOption,
      is_draft: settings.isDraft,
      is_team_competition: settings.isTeamCompetition,
      team_count: settings.teamCount,
    });

    if (createError || !data) {
      console.error('Error creating competition:', createError);
      return { success: false, error: createError?.message || 'Failed to create competition' };
    }

    const competitionId = data.competition_id;

    // Create team definitions if this is a team competition
    if (settings.isTeamCompetition && settings.teams && settings.teams.length > 0) {
      const { error: teamsError } = await competitionApi.createCompetitionTeams(
        competitionId,
        settings.teams.map(t => ({
          team_number: t.team_number,
          name: t.name,
          color: t.color,
          emoji: t.emoji,
        }))
      );
      if (teamsError) {
        console.error('Error creating competition teams:', teamsError);
        // Continue anyway - competition is created, teams can be added later via edit
      }
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
 * Finalize a draft competition - changes status from 'draft' to 'active' or 'upcoming'
 * Call this after successful payment or when creating without a prize pool
 */
export async function finalizeDraftCompetition(
  competitionId: string,
  _userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Finalize via edge function (server verifies creator + draft status)
    const { data, error } = await competitionApi.finalizeDraft(competitionId);

    if (error) {
      console.error('Error finalizing competition:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in finalizeDraftCompetition:', error);
    return { success: false, error: error?.message || 'Unknown error finalizing competition' };
  }
}

/**
 * Delete a draft competition - used when user cancels or leaves the creation flow
 */
export async function deleteDraftCompetition(
  competitionId: string,
  _userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete via edge function (server verifies creator + draft status)
    const { data, error } = await competitionApi.deleteDraft(competitionId);

    if (error) {
      console.error('Error deleting draft competition:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in deleteDraftCompetition:', error);
    return { success: false, error: error?.message || 'Unknown error deleting competition' };
  }
}

/**
 * Update a competition (creator only)
 * Some fields cannot be changed based on competition status:
 * - Upcoming: all fields editable
 * - Active: only name, end date, and visibility editable
 * - Completed: no edits allowed
 */
export async function updateCompetition(
  competitionId: string,
  userId: string,
  updates: {
    name?: string;
    startDate?: Date;
    endDate?: Date;
    scoringType?: string;
    isPublic?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Format dates in local timezone (YYYY-MM-DD) to avoid UTC conversion issues
    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Build update payload for Edge Function
    const updatePayload: {
      name?: string;
      start_date?: string;
      end_date?: string;
      scoring_type?: string;
      is_public?: boolean;
    } = {};

    if (updates.name !== undefined) {
      updatePayload.name = updates.name.trim();
    }
    if (updates.startDate !== undefined) {
      updatePayload.start_date = formatLocalDate(updates.startDate);
    }
    if (updates.endDate !== undefined) {
      updatePayload.end_date = formatLocalDate(updates.endDate);
    }
    if (updates.scoringType !== undefined) {
      updatePayload.scoring_type = updates.scoringType;
    }
    if (updates.isPublic !== undefined) {
      updatePayload.is_public = updates.isPublic;
    }

    console.log('[CompetitionService] Updating competition:', {
      competitionId,
      userId,
      updates: updatePayload,
    });

    // Call Edge Function to update
    const { data, error } = await competitionApi.updateCompetition(competitionId, updatePayload);

    if (error) {
      console.error('Error updating competition:', error);
      return { success: false, error: error.message };
    }

    console.log('[CompetitionService] Competition updated successfully:', data);
    return { success: true };
  } catch (error: any) {
    console.error('Error in updateCompetition:', error);
    return { success: false, error: error?.message || 'Failed to update competition' };
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
  isTeamCompetition: boolean;
  teamCount: number | null;
  hasPrizePool: boolean;
  prizePoolAmount: number | null;
  poolType?: 'creator_funded' | 'buy_in';
  buyInAmount?: number | null;
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

    // Per security rules: Use Edge Function instead of direct RPC
    const { data, error } = await competitionApi.getPublicCompetitions(limit + 1, offset);

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
        isTeamCompetition: c.is_team_competition || false,
        teamCount: c.team_count || null,
        hasPrizePool: c.has_prize_pool || false,
        prizePoolAmount: null, // will be enriched below
      }));

    // Batch-fetch prize pool amounts for competitions with prize pools
    const prizeCompIds = competitions.filter(c => c.hasPrizePool).map(c => c.id);
    if (prizeCompIds.length > 0) {
      const { data: prizeData } = await competitionApi.getPrizePoolAmounts(prizeCompIds);
      if (prizeData && Array.isArray(prizeData)) {
        const prizeMap = new Map(prizeData.map((p: any) => [p.competition_id, p]));
        for (const c of competitions) {
          const pool = prizeMap.get(c.id);
          if (pool) {
            c.prizePoolAmount = pool.total_amount;
            c.poolType = pool.pool_type || 'creator_funded';
            c.buyInAmount = pool.buy_in_amount ? parseFloat(pool.buy_in_amount) : null;
          }
        }
      }
    }

    return { competitions, hasMore };
  } catch (error) {
    console.error('[CompetitionService] Error in fetchPublicCompetitions:', error);
    return { competitions: [], hasMore: false };
  }
}

/**
 * Completed competition for history list
 */
export interface CompletedCompetition {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  type: 'weekend' | 'weekly' | 'monthly' | 'custom';
  scoringType: string;
  participantCount: number;
  winner: {
    id: string;
    name: string;
    avatar: string;
    points: number;
  } | null;
  userRank: number;
  userPoints: number;
  hasPrizePool: boolean;
  prizePoolAmount: number | null;
  userPrizeWon: number | null;
}

/**
 * Fetch completed competitions for a user with pagination
 * Returns competitions where user participated that are now completed
 * Uses calculated status based on dates to catch competitions where DB status is stale
 */
export async function fetchCompletedCompetitions(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ competitions: CompletedCompetition[]; hasMore: boolean }> {
  try {
    // Get all competitions where user is a participant via edge function
    const { data: participantData, error: participantsError } = await competitionApi.getMyParticipatedCompetitions();

    if (participantsError) {
      console.error('[CompetitionService] Error fetching completed competitions:', participantsError);
      return { competitions: [], hasMore: false };
    }

    if (!participantData || participantData.length === 0) {
      return { competitions: [], hasMore: false };
    }

    // Filter to only include competitions that are completed based on calculated status
    // This catches competitions where DB status hasn't been updated by cron job
    const completedParticipantData = participantData.filter((p) => {
      const comp = p.competitions as any;
      if (!comp) return false;
      const calculatedStatus = calculateCompetitionStatus(comp.start_date, comp.end_date);
      return calculatedStatus === 'completed';
    });

    if (completedParticipantData.length === 0) {
      return { competitions: [], hasMore: false };
    }

    // Apply pagination after filtering
    const paginatedData = completedParticipantData.slice(offset, offset + limit + 1);
    const hasMore = paginatedData.length > limit;
    const competitionsToProcess = paginatedData.slice(0, limit);

    // Build completed competition list with rankings
    const competitions: CompletedCompetition[] = [];

    for (const p of competitionsToProcess) {
      const comp = p.competitions as any;
      if (!comp) continue;

      // Fetch all participants for this competition to determine rankings
      // Per security rules: Use Edge Function instead of direct RPC
      const { data: allParticipants, error: rankError } = await competitionApi.getCompetitionParticipantsWithProfiles(comp.id);

      if (rankError) {
        console.error('[CompetitionService] Error fetching participants for ranking:', rankError);
        continue;
      }

      // Find winner and user rank
      let winner: CompletedCompetition['winner'] = null;
      let userRank = 0;

      if (allParticipants && allParticipants.length > 0) {
        // Winner is first place (RPC returns sorted by total_points DESC)
        const winnerData = allParticipants[0] as any;
        // RPC returns flat structure with profile fields directly
        const winnerFirstName = winnerData.full_name?.split(' ')[0] || winnerData.username || 'User';
        winner = {
          id: winnerData.user_id,
          name: winnerFirstName,
          avatar: getAvatarUrl(winnerData.avatar_url, winnerFirstName, winnerData.username),
          points: Number(winnerData.total_points) || 0,
        };

        // Find user's rank
        const userIndex = allParticipants.findIndex((part: any) => part.user_id === userId);
        userRank = userIndex >= 0 ? userIndex + 1 : 0;
      }

      competitions.push({
        id: comp.id,
        name: comp.name,
        description: comp.description,
        startDate: comp.start_date,
        endDate: comp.end_date,
        type: comp.type as 'weekend' | 'weekly' | 'monthly' | 'custom',
        scoringType: comp.scoring_type || 'ring_close',
        participantCount: allParticipants?.length || 0,
        winner,
        userRank,
        userPoints: Number(p.total_points) || 0,
        hasPrizePool: comp.has_prize_pool || false,
        prizePoolAmount: null, // enriched below
        userPrizeWon: null, // enriched below
      });
    }

    // Batch-fetch prize pool amounts and user payouts for competitions with prize pools
    const prizeCompIds = competitions.filter(c => c.hasPrizePool).map(c => c.id);
    if (prizeCompIds.length > 0) {
      const [prizeAmounts, userPayouts] = await Promise.all([
        competitionApi.getPrizePoolAmounts(prizeCompIds),
        competitionApi.getUserPrizePayouts(prizeCompIds),
      ]);

      const amountMap = new Map(
        ((prizeAmounts.data as any[]) || []).map((p: any) => [p.competition_id, p.total_amount])
      );
      const wonMap = new Map(
        ((userPayouts.data as any[]) || []).map((p: any) => [p.competition_id, p.payout_amount])
      );

      for (const c of competitions) {
        c.prizePoolAmount = amountMap.get(c.id) || null;
        c.userPrizeWon = wonMap.get(c.id) || null;
      }
    }

    return { competitions, hasMore };
  } catch (error) {
    console.error('[CompetitionService] Error in fetchCompletedCompetitions:', error);
    return { competitions: [], hasMore: false };
  }
}
