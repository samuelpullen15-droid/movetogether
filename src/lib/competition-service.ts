import { supabase, isSupabaseConfigured } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import type { Competition, Participant } from './fitness-store';
import type { ScoringConfig } from './competition-types';
import { useHealthStore } from './health-service';
import { Platform, NativeModules } from 'react-native';
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

    // Fetch participants with profile data from competition_standings (read-only, server-calculated)
    // Fallback to competition_participants if standings table doesn't exist yet
    let participants: any[] | null = null;
    let participantsError: any = null;
    
    // Try to fetch from competition_standings first (server-calculated standings)
    const { data: standings, error: standingsError } = await supabase
      .from('competition_standings')
      .select(`
        *,
        profiles:user_id (
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('competition_id', competitionId)
      .order('rank', { ascending: true });

    if (!standingsError && standings && standings.length > 0) {
      // Use standings data (server-calculated)
      // Map standings fields to participant format
      participants = standings.map((s: any) => ({
        ...s,
        // Ensure all expected fields are present
        total_points: s.total_points || s.points || 0,
        move_progress: s.move_progress || 0,
        exercise_progress: s.exercise_progress || 0,
        stand_progress: s.stand_progress || 0,
        move_calories: s.move_calories || 0,
        exercise_minutes: s.exercise_minutes || 0,
        stand_hours: s.stand_hours || 0,
        step_count: s.step_count || 0,
      }));
    } else {
      // Fallback to competition_participants if standings not available
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
    }

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
 * DEPRECATED: This function is no longer used. 
 * Edge Functions now handle syncing competition data and calculating scores.
 * The sync-provider-data and calculate-daily-score Edge Functions automatically
 * update competition_daily_data and competition_standings tables.
 * 
 * This function is kept for backward compatibility but should not be called.
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
  console.warn('[CompetitionService] syncCompetitionHealthData is deprecated. Edge Functions now handle this automatically.');
  // Edge Functions handle all competition data syncing and scoring
  // This function is kept for backward compatibility but does nothing
  return true;
}

/**
 * Fetch health data for a date range from Apple Health
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

    // Ensure HealthKit is initialized by ensuring the provider is connected
    if (!healthStore.providers.find(p => p.id === 'apple_health')?.connected) {
      await healthStore.connectProvider('apple_health');
    }

    // Get the native HealthKit module
    const { AppleHealthKit: NativeHealthKit } = NativeModules;
    if (!NativeHealthKit) {
      console.log('[CompetitionService] Native HealthKit module not available');
      return [];
    }

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

    // Use local date to ensure we're working with calendar dates, not UTC timestamps
    // Convert startDate and endDate to local date strings first
    const startDateLocal = new Date(startDate);
    const endDateLocal = new Date(endDate);
    
    // Get the date string in YYYY-MM-DD format using local time
    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const startDateStr = formatLocalDate(startDateLocal);
    const endDateStr = formatLocalDate(endDateLocal);
    

    // Create date objects for iteration in local timezone
    const currentDate = new Date(startDateLocal);
    currentDate.setHours(0, 0, 0, 0);
    const endDateNormalized = new Date(endDateLocal);
    endDateNormalized.setHours(23, 59, 59, 999);

    while (currentDate <= endDateNormalized) {
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);
      
      const dateStr = formatLocalDate(currentDate);
      

      try {
        // Fetch metrics for this day
        const [activitySummary, exerciseMinutesFromSamples, stepCount, distanceMeters, workouts] = await Promise.all([
          getActivitySummaryForDate(NativeHealthKit, dayStart),
          getExerciseMinutesForDate(NativeHealthKit, dayStart, dayEnd), // Fallback: get exercise minutes from individual samples
          getStepsForDate(NativeHealthKit, dayStart, dayEnd),
          getDistanceForDate(NativeHealthKit, dayStart, dayEnd),
          getWorkoutsForDate(NativeHealthKit, dayStart, dayEnd),
        ]);
        
        // Aggregate metrics from ActivitySummary or individual samples
        // Note: ActivitySummary.appleExerciseTime is already in minutes (react-native-health converts it)
        // Use exercise minutes from individual samples (which are in seconds, converted to minutes in helper)
        // as they're more reliable than ActivitySummary for specific dates
        const moveCalories = activitySummary?.activeEnergyBurned || 0;
        const exerciseMinutes = exerciseMinutesFromSamples || activitySummary?.appleExerciseTime || 0;
        const standHours = activitySummary?.appleStandHours || 0;
        
        dailyData.push({
          date: dateStr, // Use local date string instead of UTC
          moveCalories: Math.round(moveCalories),
          exerciseMinutes,
          standHours,
          stepCount,
          distanceMeters,
          workoutsCompleted: workouts.length,
          points: 0, // Will be calculated by the scoring function
        });
      } catch (error) {
        console.error(`[CompetitionService] Error fetching data for ${formatLocalDate(currentDate)}:`, error);
        // Add empty entry for this day
        dailyData.push({
          date: formatLocalDate(currentDate), // Use local date string instead of UTC
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
    

    return dailyData;
  } catch (error) {
    console.error('[CompetitionService] Error fetching health data for date range:', error);
    return [];
  }
}

// Helper function to get ActivitySummary for a specific date
async function getActivitySummaryForDate(NativeHealthKit: any, date: Date): Promise<any> {
  return new Promise((resolve) => {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      NativeHealthKit.getActivitySummary(
        {
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        },
        (err: any, results: any) => {
          if (err || !results || results.length === 0) {
            resolve(null);
            return;
          }
          
          // Find the summary for the specific date by matching dateComponents
          // ActivitySummary dateComponents are in the local calendar's timezone
          const targetYear = date.getFullYear();
          const targetMonth = date.getMonth() + 1; // getMonth() returns 0-11
          const targetDay = date.getDate();
          
          // Try to find matching summary by dateComponents
          let matchingSummary = null;
          for (const summary of results) {
            if (summary.dateComponents) {
              const summaryYear = summary.dateComponents.year || summary.dateComponents.era;
              const summaryMonth = summary.dateComponents.month;
              const summaryDay = summary.dateComponents.day;
              
              if (summaryYear === targetYear && summaryMonth === targetMonth && summaryDay === targetDay) {
                matchingSummary = summary;
                break;
              }
            }
          }
          
          // If no matching summary found, use the last result (for today)
          if (!matchingSummary && results.length > 0) {
            matchingSummary = results[results.length - 1];
          }
          
          resolve(matchingSummary);
        }
      );
    } catch (e) {
      resolve(null);
    }
  });
}

// Helper function to get exercise minutes for a date range from individual samples
async function getExerciseMinutesForDate(NativeHealthKit: any, startDate: Date, endDate: Date): Promise<number> {
  return new Promise((resolve) => {
    try {
      NativeHealthKit.getAppleExerciseTime(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (err: any, results: any) => {
          if (err || !results) {
            resolve(0);
            return;
          }
          if (Array.isArray(results)) {
            // Values are in seconds, convert to minutes
            const totalSeconds = results.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
            resolve(Math.round(totalSeconds / 60));
          } else {
            resolve(Math.round((results.value || 0) / 60));
          }
        }
      );
    } catch (e) {
      resolve(0);
    }
  });
}

// Helper function to get steps for a date range
async function getStepsForDate(NativeHealthKit: any, startDate: Date, endDate: Date): Promise<number> {
  return new Promise((resolve) => {
    try {
      NativeHealthKit.getStepCount(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (err: any, results: any) => {
          if (err || !results) {
            resolve(0);
            return;
          }
          if (Array.isArray(results)) {
            const total = results.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
            resolve(Math.round(total));
          } else {
            resolve(Math.round(results.value || 0));
          }
        }
      );
    } catch (e) {
      resolve(0);
    }
  });
}

// Helper function to get distance for a date range
async function getDistanceForDate(NativeHealthKit: any, startDate: Date, endDate: Date): Promise<number> {
  return new Promise((resolve) => {
    try {
      NativeHealthKit.getDistanceWalkingRunning(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (err: any, results: any) => {
          if (err || !results) {
            resolve(0);
            return;
          }
          if (Array.isArray(results)) {
            const total = results.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
            resolve(Math.round(total));
          } else {
            resolve(Math.round(results.value || 0));
          }
        }
      );
    } catch (e) {
      resolve(0);
    }
  });
}

// Helper function to get workouts for a date range
async function getWorkoutsForDate(NativeHealthKit: any, startDate: Date, endDate: Date): Promise<any[]> {
  return new Promise((resolve) => {
    try {
      NativeHealthKit.getSamples(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          type: 'Workout',
        },
        (err: any, results: any) => {
          if (err || !results) {
            resolve([]);
            return;
          }
          resolve(Array.isArray(results) ? results : []);
        }
      );
    } catch (e) {
      resolve([]);
    }
  });
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
          paymentIntentId 
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
    const start = new Date(settings.startDate);
    const end = new Date(settings.endDate);
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

    // Create competition in Supabase
    const { data: competition, error: competitionError } = await supabase
      .from('competitions')
      .insert({
        creator_id: settings.creatorId,
        name: settings.name.trim(),
        description,
        start_date: formatLocalDate(start),
        end_date: formatLocalDate(end),
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
