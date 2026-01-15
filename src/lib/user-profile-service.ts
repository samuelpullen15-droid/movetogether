import { supabase, isSupabaseConfigured } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import { FriendProfile } from './social-types';

/**
 * Get a user's public profile by user ID
 */
export async function getUserProfile(userId: string): Promise<FriendProfile | null> {
  if (!isSupabaseConfigured() || !supabase) {
    return null;
  }

  try {
    // Fetch profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, created_at')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return null;
    }

    // Fetch fitness goals from user_fitness table
    // Note: RLS policies allow reading friend goals (see migration 20260111164500_allow_read_friend_fitness_goals.sql)
    // Fetch fitness goals using the same method as the home page (useHealthStore.loadGoalsFromSupabase)
    // Use .single() to match the home page behavior exactly
    let fitness: { move_goal: number; exercise_goal: number; stand_goal: number } | null = null;
    let fitnessError: any = null;
    
    const { data: fitnessData, error: fitnessErr } = await supabase
      .from('user_fitness')
      .select('move_goal, exercise_goal, stand_goal')
      .eq('user_id', userId)
      .single();
    
    // Handle the error the same way as the home page - PGRST116 means no rows found
    if (fitnessErr && fitnessErr.code !== 'PGRST116') {
      // Real error (not just "no rows found")
      fitnessError = fitnessErr;
      fitness = null;
    } else if (fitnessErr && fitnessErr.code === 'PGRST116') {
      // No rows found - this is expected if user hasn't set goals yet
      fitness = null;
      fitnessError = null; // Don't treat this as an error
    } else {
      // Success - data found
      fitness = fitnessData;
      fitnessError = null;
    }

    console.log('[getUserProfile] Fitness goals fetch:', {
      userId,
      hasFitness: !!fitness,
      error: fitnessError?.message,
      errorCode: fitnessError?.code,
      errorDetails: fitnessError,
      moveGoal: fitness?.move_goal,
      exerciseGoal: fitness?.exercise_goal,
      standGoal: fitness?.stand_goal,
    });

    if (fitnessError) {
      console.warn('[getUserProfile] Error fetching fitness goals:', {
        code: fitnessError.code,
        message: fitnessError.message,
        details: fitnessError.details,
        hint: fitnessError.hint,
      });
    }

    // Use fetched goals or defaults
    // Match the defaults used on the home page (from useHealthStore)
    let moveGoal = fitness?.move_goal ?? 500;
    let exerciseGoal = fitness?.exercise_goal ?? 30;
    let standGoal = fitness?.stand_goal ?? 12;

    // If no fitness data found, the user might not have set goals yet
    // In this case, we use reasonable defaults that match the home page defaults
    // Note: These defaults (500, 30, 12) match useHealthStore defaults
    // If the user has different goals, they need to be set in user_fitness table
    
    if (!fitness) {
      console.warn('[getUserProfile] No fitness goals found for user, using defaults (matching home page):', { userId, moveGoal, exerciseGoal, standGoal });
    } else {
      console.log('[getUserProfile] Fitness goals found and set:', { userId, moveGoal, exerciseGoal, standGoal });
    }

    // Fetch today's activity data from user_activity table
    // Use UTC date to match what health-service.ts stores
    const todayStr = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD (UTC)

    const { data: todayActivity, error: activityError } = await supabase
      .from('user_activity')
      .select('move_calories, exercise_minutes, stand_hours')
      .eq('user_id', userId)
      .eq('date', todayStr)
      .maybeSingle();

    console.log('[getUserProfile] Today activity fetch:', {
      userId,
      today: todayStr,
      hasActivity: !!todayActivity,
      error: activityError?.message,
      errorCode: activityError?.code,
      moveCalories: todayActivity?.move_calories,
      exerciseMinutes: todayActivity?.exercise_minutes,
      standHours: todayActivity?.stand_hours,
      moveGoal,
      exerciseGoal,
      standGoal,
    });

    // Use activity data if available, otherwise try to get from competition_daily_data
    let moveCalories = 0;
    let exerciseMinutes = 0;
    let standHours = 0;

    // Check if user_activity has meaningful data (not all zeros)
    const hasValidActivity = todayActivity && (
      (todayActivity.move_calories && todayActivity.move_calories > 0) ||
      (todayActivity.exercise_minutes && todayActivity.exercise_minutes > 0) ||
      (todayActivity.stand_hours && todayActivity.stand_hours > 0)
    );

    if (hasValidActivity) {
      moveCalories = typeof todayActivity.move_calories === 'number' ? todayActivity.move_calories : 0;
      exerciseMinutes = typeof todayActivity.exercise_minutes === 'number' ? todayActivity.exercise_minutes : 0;
      standHours = typeof todayActivity.stand_hours === 'number' ? todayActivity.stand_hours : 0;
    } else {
      // Fallback: Try to get today's activity from competition_daily_data
      // Aggregate across all competitions for today
      const { data: competitionActivities, error: compActivityError } = await supabase
        .from('competition_daily_data')
        .select('move_calories, exercise_minutes, stand_hours')
        .eq('user_id', userId)
        .eq('date', todayStr);

      if (competitionActivities && competitionActivities.length > 0) {
        // Use the first entry (they should all be the same for the same user/date)
        const activity = competitionActivities[0];
        moveCalories = typeof activity.move_calories === 'number' ? activity.move_calories : 0;
        exerciseMinutes = typeof activity.exercise_minutes === 'number' ? activity.exercise_minutes : 0;
        standHours = typeof activity.stand_hours === 'number' ? activity.stand_hours : 0;
      }
    }

    const currentRings = {
      move: moveCalories,
      moveGoal,
      exercise: exerciseMinutes,
      exerciseGoal,
      stand: standHours,
      standGoal,
    };

    const displayName = profile.full_name || profile.username || 'User';
    const username = profile.username ? `@${profile.username}` : '';
    const avatar = getAvatarUrl(profile.avatar_url, displayName, profile.username || '');

    // Calculate real stats from competitions
    // Fetch all competition participants for this user
    const { data: participants, error: participantsError } = await supabase
      .from('competition_participants')
      .select('competition_id, total_points')
      .eq('user_id', userId);

    let totalPoints = 0;
    let competitionsJoined = 0;
    let competitionsWon = 0;

    if (!participantsError && participants) {
      competitionsJoined = participants.length;
      
      // Calculate total points
      for (const participant of participants) {
        totalPoints += Number(participant.total_points) || 0;
      }
      
      // Calculate wins by checking each competition
      // Only count wins for completed competitions
      const competitionIds = [...new Set(participants.map(p => p.competition_id))];
      
      for (const competitionId of competitionIds) {
        // First check if competition is completed
        const { data: competition, error: compError } = await supabase
          .from('competitions')
          .select('id, status')
          .eq('id', competitionId)
          .maybeSingle();
        
        // Only check wins for completed competitions
        if (!compError && competition && competition.status === 'completed') {
          // Get top participant for this competition
          const { data: topParticipant, error: rankError } = await supabase
            .from('competition_participants')
            .select('user_id, total_points')
            .eq('competition_id', competitionId)
            .order('total_points', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (!rankError && topParticipant && topParticipant.user_id === userId) {
            competitionsWon++;
          }
        }
      }
    }

    // Calculate streaks from activity data
    // Fetch last 30 days of activity to calculate current streak
    // Use UTC dates consistently to match how activity is stored
    const now = new Date();
    const thirtyDaysAgoDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoStr = thirtyDaysAgoDate.toISOString().split('T')[0];

    const { data: recentActivity, error: recentActivityError } = await supabase
      .from('user_activity')
      .select('date, move_calories, exercise_minutes, stand_hours, workouts_completed')
      .eq('user_id', userId)
      .gte('date', thirtyDaysAgoStr)
      .order('date', { ascending: false });

    let currentStreak = 0;
    let longestStreak = 0;
    let workoutsThisMonth = 0;

    if (!recentActivityError && recentActivity) {
      // Helper to check if activity has meaningful data
      const hasActivityData = (a: typeof recentActivity[0]) => 
        (a.move_calories && a.move_calories > 0) ||
        (a.exercise_minutes && a.exercise_minutes > 0) ||
        (a.stand_hours && a.stand_hours > 0);

      // Create a Set of dates with activity for O(1) lookup
      const datesWithActivity = new Set(
        recentActivity.filter(hasActivityData).map(a => a.date)
      );

      // Calculate current streak using UTC dates
      // Start from today (UTC) and count consecutive days backwards
      const todayUtc = new Date().toISOString().split('T')[0];
      let checkDateMs = new Date(todayUtc + 'T00:00:00Z').getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;
      let streakCount = 0;
      
      for (let i = 0; i < 30; i++) {
        const checkDateStr = new Date(checkDateMs).toISOString().split('T')[0];
        
        if (datesWithActivity.has(checkDateStr)) {
          streakCount++;
        } else {
          // If today has no activity, streak is 0 but we continue checking for longest
          // If a past day has no activity, the current streak ends
          if (i > 0) {
            break;
          }
        }
        
        checkDateMs -= oneDayMs;
      }
      
      currentStreak = streakCount;
      
      // Calculate longest streak by checking consecutive days properly
      // Sort dates and check for actual consecutive day gaps
      const sortedDates = [...datesWithActivity].sort();
      let maxStreak = 0;
      let tempStreak = 0;
      let prevDateMs: number | null = null;
      
      for (const dateStr of sortedDates) {
        const currentDateMs = new Date(dateStr + 'T00:00:00Z').getTime();
        
        if (prevDateMs === null) {
          // First date
          tempStreak = 1;
        } else {
          const daysDiff = (currentDateMs - prevDateMs) / oneDayMs;
          if (daysDiff === 1) {
            // Consecutive day
            tempStreak++;
          } else {
            // Gap in days, reset streak
            tempStreak = 1;
          }
        }
        
        maxStreak = Math.max(maxStreak, tempStreak);
        prevDateMs = currentDateMs;
      }
      
      longestStreak = maxStreak;
      
      // Count workouts this month from stored data (synced from Apple Health)
      const nowUtc = new Date();
      const firstDayOfMonthUtc = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), 1));
      const firstDayStr = firstDayOfMonthUtc.toISOString().split('T')[0];
      
      // Sum up workouts_completed from stored activity data
      workoutsThisMonth = recentActivity
        .filter(a => a.date >= firstDayStr)
        .reduce((sum, a) => sum + (a.workouts_completed || 0), 0);
    }

    // Build friend profile with calculated stats
    const friendProfile: FriendProfile = {
      id: profile.id,
      name: displayName,
      username,
      avatar,
      bio: '', // TODO: Add bio field to profiles table if needed
      memberSince: profile.created_at,
      stats: {
        totalPoints,
        currentStreak,
        longestStreak,
        competitionsWon,
        competitionsJoined,
        workoutsThisMonth,
      },
      medals: {
        gold: 0, // TODO: Calculate from achievements
        silver: 0, // TODO: Calculate from achievements
        bronze: 0, // TODO: Calculate from achievements
      },
      recentAchievements: [], // TODO: Fetch from achievements table
      currentRings,
    };

    return friendProfile;
  } catch (error) {
    console.error('Error in getUserProfile:', error);
    return null;
  }
}
