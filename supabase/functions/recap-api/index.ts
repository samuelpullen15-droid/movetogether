/**
 * recap-api
 *
 * Edge Function for retrieving weekly recap data for in-app display.
 * Returns aggregated stats for the current or specified week.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPES
// ============================================================================

interface WeeklyRecapData {
  totalRingsClosed: number;
  avgMovePercent: number;
  avgExercisePercent: number;
  avgStandPercent: number;
  bestDay: string | null;
  bestDayRings: number;
  daysWithActivity: number;
  competitionsPlayed: number;
  competitionsWon: number;
  bestPlacement: number | null;
  currentStreak: number;
  streakGained: number;
  achievementsUnlocked: number;
  achievementNames: string[];
  topFriend: {
    name: string;
    ringsClosed: number;
  } | null;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify token and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { action, params = {} } = await req.json();

    // Route to handler
    switch (action) {
      case 'get_my_weekly_recap':
        return await handleGetMyWeeklyRecap(supabase, user.id, params);
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[recap-api] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// HANDLERS
// ============================================================================

async function handleGetMyWeeklyRecap(
  supabase: SupabaseClient,
  userId: string,
  params: { week_offset?: number }
): Promise<Response> {
  try {
    // Get user's timezone
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();

    const timezone = profile?.timezone || 'America/New_York';
    const weekOffset = params.week_offset || 0;

    // Get week dates
    const weekDates = getWeekDates(timezone, weekOffset);

    // Gather all stats
    const data = await getWeeklyRecapData(supabase, userId, weekDates, timezone);

    return new Response(
      JSON.stringify({ data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[recap-api] Error getting weekly recap:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to get weekly recap' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================================
// DATA GATHERING
// ============================================================================

async function getWeeklyRecapData(
  supabase: SupabaseClient,
  userId: string,
  weekDates: { start: string; end: string; days: string[] },
  timezone: string
): Promise<WeeklyRecapData> {
  // Get user's goals
  const { data: goalsData } = await supabase
    .from('user_fitness_goals')
    .select('move_calories_goal, exercise_minutes_goal, stand_hours_goal')
    .eq('user_id', userId)
    .maybeSingle();

  const goals = {
    move: goalsData?.move_calories_goal || 500,
    exercise: goalsData?.exercise_minutes_goal || 30,
    stand: goalsData?.stand_hours_goal || 12,
  };

  // Get daily activity for the week
  const { data: activities } = await supabase
    .from('user_activity')
    .select('date, move_calories, exercise_minutes, stand_hours')
    .eq('user_id', userId)
    .gte('date', weekDates.start)
    .lte('date', weekDates.end);

  // Calculate ring stats
  let totalRingsClosed = 0;
  let totalMovePercent = 0;
  let totalExercisePercent = 0;
  let totalStandPercent = 0;
  let bestDay: string | null = null;
  let bestDayRings = 0;
  let daysWithActivity = 0;

  for (const activity of activities || []) {
    const movePercent = (activity.move_calories || 0) / goals.move;
    const exercisePercent = (activity.exercise_minutes || 0) / goals.exercise;
    const standPercent = (activity.stand_hours || 0) / goals.stand;

    totalMovePercent += movePercent;
    totalExercisePercent += exercisePercent;
    totalStandPercent += standPercent;

    let dayRings = 0;
    if (movePercent >= 1) { totalRingsClosed++; dayRings++; }
    if (exercisePercent >= 1) { totalRingsClosed++; dayRings++; }
    if (standPercent >= 1) { totalRingsClosed++; dayRings++; }

    if (activity.move_calories > 0 || activity.exercise_minutes > 0) {
      daysWithActivity++;
    }

    if (dayRings > bestDayRings) {
      bestDayRings = dayRings;
      bestDay = activity.date;
    }
  }

  const daysCount = activities?.length || 1;
  const avgMovePercent = Math.round((totalMovePercent / daysCount) * 100);
  const avgExercisePercent = Math.round((totalExercisePercent / daysCount) * 100);
  const avgStandPercent = Math.round((totalStandPercent / daysCount) * 100);

  // Get competition stats
  const { data: completedComps } = await supabase
    .from('competition_participants')
    .select(`
      final_rank,
      competitions!inner(id, status, end_date)
    `)
    .eq('user_id', userId)
    .eq('competitions.status', 'completed')
    .gte('competitions.end_date', weekDates.start)
    .lte('competitions.end_date', weekDates.end);

  const competitionsPlayed = completedComps?.length || 0;
  let competitionsWon = 0;
  let bestPlacement: number | null = null;

  for (const comp of completedComps || []) {
    if (comp.final_rank === 1) competitionsWon++;
    if (bestPlacement === null || (comp.final_rank && comp.final_rank < bestPlacement)) {
      bestPlacement = comp.final_rank;
    }
  }

  // Get streak stats
  const { data: streakData } = await supabase
    .from('user_streaks')
    .select('current_streak')
    .eq('user_id', userId)
    .maybeSingle();

  const currentStreak = streakData?.current_streak || 0;
  const streakGained = Math.min(daysWithActivity, 7);

  // Get achievements unlocked this week
  const { data: achievements } = await supabase
    .from('user_achievements')
    .select('achievement_id')
    .eq('user_id', userId)
    .gte('unlocked_at', weekDates.start)
    .lte('unlocked_at', weekDates.end + 'T23:59:59Z');

  const achievementsUnlocked = achievements?.length || 0;
  const achievementNames = achievements?.map((a: any) => formatAchievementName(a.achievement_id)) || [];

  // Get top friend performance
  const topFriend = await getTopFriend(supabase, userId, weekDates, goals);

  return {
    totalRingsClosed,
    avgMovePercent,
    avgExercisePercent,
    avgStandPercent,
    bestDay,
    bestDayRings,
    daysWithActivity,
    competitionsPlayed,
    competitionsWon,
    bestPlacement,
    currentStreak,
    streakGained,
    achievementsUnlocked,
    achievementNames,
    topFriend,
  };
}

async function getTopFriend(
  supabase: SupabaseClient,
  userId: string,
  weekDates: { start: string; end: string; days: string[] },
  goals: { move: number; exercise: number; stand: number }
): Promise<{ name: string; ringsClosed: number } | null> {
  // Get user's friends
  const { data: friendships } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (!friendships || friendships.length === 0) {
    return null;
  }

  const friendIds = friendships.map((f: any) =>
    f.user_id === userId ? f.friend_id : f.user_id
  );

  // Get friend activities
  const { data: friendActivities } = await supabase
    .from('user_activity')
    .select('user_id, move_calories, exercise_minutes, stand_hours')
    .in('user_id', friendIds)
    .gte('date', weekDates.start)
    .lte('date', weekDates.end);

  // Calculate rings closed per friend
  const friendRings: Record<string, number> = {};

  for (const activity of friendActivities || []) {
    const friendId = activity.user_id;
    if (!friendRings[friendId]) friendRings[friendId] = 0;

    if ((activity.move_calories || 0) >= goals.move) friendRings[friendId]++;
    if ((activity.exercise_minutes || 0) >= goals.exercise) friendRings[friendId]++;
    if ((activity.stand_hours || 0) >= goals.stand) friendRings[friendId]++;
  }

  // Find top friend
  let topFriendId: string | null = null;
  let topRings = 0;

  for (const [friendId, rings] of Object.entries(friendRings)) {
    if (rings > topRings) {
      topRings = rings;
      topFriendId = friendId;
    }
  }

  if (!topFriendId || topRings === 0) {
    return null;
  }

  // Get friend's name
  const { data: friendProfile } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', topFriendId)
    .maybeSingle();

  const friendName = friendProfile?.full_name?.split(' ')[0] ||
                     friendProfile?.username ||
                     'Your friend';

  return {
    name: friendName,
    ringsClosed: topRings,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function getWeekDates(
  timezone: string,
  weekOffset: number = 0
): { start: string; end: string; days: string[] } {
  try {
    const now = new Date();

    // Apply week offset
    if (weekOffset !== 0) {
      now.setDate(now.getDate() + (weekOffset * 7));
    }

    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    // Get today in user's timezone
    const todayParts = formatter.formatToParts(now);
    const year = parseInt(todayParts.find(p => p.type === 'year')?.value || '2024');
    const month = parseInt(todayParts.find(p => p.type === 'month')?.value || '1') - 1;
    const day = parseInt(todayParts.find(p => p.type === 'day')?.value || '1');

    const today = new Date(year, month, day);
    const dayOfWeek = today.getDay();

    // Go back to Sunday (start of week)
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - dayOfWeek);

    // End date is Saturday
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    // Generate all days
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      days.push(d.toISOString().split('T')[0]);
    }

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
      days,
    };
  } catch {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const startDate = new Date(now);
    startDate.setUTCDate(now.getUTCDate() - dayOfWeek);

    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setUTCDate(startDate.getUTCDate() + i);
      days.push(d.toISOString().split('T')[0]);
    }

    return {
      start: startDate.toISOString().split('T')[0],
      end: days[6],
      days,
    };
  }
}

function formatAchievementName(achievementId: string): string {
  return achievementId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
