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
    // Note: This assumes RLS policies allow reading other users' goals
    const { data: fitness, error: fitnessError } = await supabase
      .from('user_fitness')
      .select('move_goal, exercise_goal, stand_goal')
      .eq('user_id', userId)
      .maybeSingle();

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
      console.warn('[getUserProfile] Error fetching fitness goals (may be RLS blocking):', {
        code: fitnessError.code,
        message: fitnessError.message,
        details: fitnessError.details,
        hint: fitnessError.hint,
      });
    }

    // Use fetched goals or defaults
    const moveGoal = fitness?.move_goal ?? 400;
    const exerciseGoal = fitness?.exercise_goal ?? 30;
    const standGoal = fitness?.stand_goal ?? 12;

    // Fetch today's activity data from user_activity table
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // Fetch today's activity data from user_activity table
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
    });

    // Use activity data if available, otherwise use 0
    const moveCalories = todayActivity?.move_calories ?? 0;
    const exerciseMinutes = todayActivity?.exercise_minutes ?? 0;
    const standHours = todayActivity?.stand_hours ?? 0;

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

    // Build friend profile with available data
    // Using placeholder/default values for stats, medals, achievements until we have those tables
    const friendProfile: FriendProfile = {
      id: profile.id,
      name: displayName,
      username,
      avatar,
      bio: '', // TODO: Add bio field to profiles table if needed
      memberSince: profile.created_at,
      stats: {
        totalPoints: 0, // TODO: Calculate from competitions/activities
        currentStreak: 0, // TODO: Calculate from activity data
        longestStreak: 0, // TODO: Calculate from activity data
        competitionsWon: 0, // TODO: Calculate from competitions
        competitionsJoined: 0, // TODO: Calculate from competitions
        workoutsThisMonth: 0, // TODO: Calculate from activities
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
