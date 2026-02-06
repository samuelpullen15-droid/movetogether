/**
 * send-morning-motivation
 *
 * Cron-scheduled Edge Function that sends personalized morning motivation
 * push notifications to users at 7 AM in their local timezone.
 *
 * Messages are personalized based on:
 * - Yesterday's ring completion performance
 * - Current streak status
 * - Active competition status
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

interface UserProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  timezone: string;
}

interface YesterdayActivity {
  move_calories: number;
  exercise_minutes: number;
  stand_hours: number;
}

interface UserGoals {
  move_calories: number;
  exercise_minutes: number;
  stand_hours: number;
}

interface ActiveCompetition {
  id: string;
  name: string;
  rank: number;
  total_participants: number;
  days_remaining: number;
}

interface NotificationContent {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

// Morning notification window (7 AM - 9 AM local time)
const NOTIFICATION_WINDOW_START = 7;
const NOTIFICATION_WINDOW_END = 9;

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[send-morning-motivation] Starting cron job...');

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[send-morning-motivation] Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get users whose local time is within the notification window
    const eligibleUsers = await getEligibleUsers(supabase);
    console.log(`[send-morning-motivation] Found ${eligibleUsers.length} users in morning window`);

    let sentCount = 0;
    let errorCount = 0;

    for (const user of eligibleUsers) {
      try {
        const sent = await sendMorningMotivation(supabase, user);
        if (sent) sentCount++;
      } catch (error) {
        console.error(`[send-morning-motivation] Error for user ${user.id}:`, error);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[send-morning-motivation] Complete: ${sentCount} sent, ${errorCount} errors, ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: eligibleUsers.length,
        sent: sentCount,
        errors: errorCount,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-morning-motivation] Fatal error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// USER QUERY
// ============================================================================

async function getEligibleUsers(supabase: SupabaseClient): Promise<UserProfile[]> {
  // Get all users with timezone info
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, timezone')
    .not('timezone', 'is', null);

  if (error) {
    console.error('[send-morning-motivation] Error fetching profiles:', error);
    throw new Error('Failed to fetch profiles');
  }

  if (!profiles || profiles.length === 0) {
    return [];
  }

  // Filter to users whose local time is in the notification window
  const eligibleUsers: UserProfile[] = [];

  for (const profile of profiles as UserProfile[]) {
    const localHour = getLocalHour(profile.timezone);
    if (localHour >= NOTIFICATION_WINDOW_START && localHour < NOTIFICATION_WINDOW_END) {
      eligibleUsers.push(profile);
    }
  }

  return eligibleUsers;
}

function getLocalHour(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(now), 10);
  } catch {
    // Default to UTC hour if timezone is invalid
    return new Date().getUTCHours();
  }
}

// ============================================================================
// NOTIFICATION PROCESSING
// ============================================================================

async function sendMorningMotivation(
  supabase: SupabaseClient,
  user: UserProfile
): Promise<boolean> {
  // Check if user has notifications enabled
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('coach_push')
    .eq('user_id', user.id)
    .maybeSingle();

  // Use coach_push for motivation notifications (or default to true)
  if (prefs && prefs.coach_push === false) {
    console.log(`[send-morning-motivation] User ${user.id}: notifications disabled`);
    return false;
  }

  // Check if we already sent today
  const today = getTodayInTimezone(user.timezone);
  const { data: alreadySent } = await supabase
    .from('streak_notification_log')
    .select('id')
    .eq('user_id', user.id)
    .eq('notification_type', 'morning_motivation')
    .eq('sent_date', today)
    .maybeSingle();

  if (alreadySent) {
    console.log(`[send-morning-motivation] User ${user.id}: already sent today`);
    return false;
  }

  // Get yesterday's activity data
  const yesterday = getYesterdayInTimezone(user.timezone);
  const yesterdayActivity = await getYesterdayActivity(supabase, user.id, yesterday);

  // Get user's goals
  const goals = await getUserGoals(supabase, user.id);

  // Get active competition status
  const activeCompetition = await getActiveCompetition(supabase, user.id, today);

  // Get current streak
  const streak = await getCurrentStreak(supabase, user.id);

  // Build personalized notification
  const content = buildMotivationContent(
    user,
    yesterdayActivity,
    goals,
    activeCompetition,
    streak
  );

  // Send notification
  const sent = await sendOneSignalNotification(user.id, content);

  if (sent) {
    // Log the notification
    await supabase
      .from('streak_notification_log')
      .insert({
        user_id: user.id,
        notification_type: 'morning_motivation',
        sent_date: today,
        sent_at: new Date().toISOString(),
        title: content.title,
        body: content.body,
        data: content.data,
      });

    console.log(`[send-morning-motivation] User ${user.id}: notification sent`);
  }

  return sent;
}

async function getYesterdayActivity(
  supabase: SupabaseClient,
  userId: string,
  yesterday: string
): Promise<YesterdayActivity | null> {
  const { data, error } = await supabase
    .from('user_activity')
    .select('move_calories, exercise_minutes, stand_hours')
    .eq('user_id', userId)
    .eq('date', yesterday)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    move_calories: data.move_calories || 0,
    exercise_minutes: data.exercise_minutes || 0,
    stand_hours: data.stand_hours || 0,
  };
}

async function getUserGoals(
  supabase: SupabaseClient,
  userId: string
): Promise<UserGoals> {
  const { data } = await supabase
    .from('user_fitness_goals')
    .select('move_calories_goal, exercise_minutes_goal, stand_hours_goal')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    move_calories: data?.move_calories_goal || 500,
    exercise_minutes: data?.exercise_minutes_goal || 30,
    stand_hours: data?.stand_hours_goal || 12,
  };
}

async function getActiveCompetition(
  supabase: SupabaseClient,
  userId: string,
  today: string
): Promise<ActiveCompetition | null> {
  // Get user's active competitions
  const { data: participations } = await supabase
    .from('competition_participants')
    .select(`
      competition_id,
      total_points,
      competitions!inner(id, name, status, start_date, end_date)
    `)
    .eq('user_id', userId)
    .eq('competitions.status', 'active')
    .lte('competitions.start_date', today)
    .gte('competitions.end_date', today)
    .limit(1);

  if (!participations || participations.length === 0) {
    return null;
  }

  const participation = participations[0];
  const competition = participation.competitions as any;

  // Get participant count and user's rank
  const { data: allParticipants } = await supabase
    .from('competition_participants')
    .select('user_id, total_points')
    .eq('competition_id', competition.id)
    .order('total_points', { ascending: false });

  if (!allParticipants) {
    return null;
  }

  const rank = allParticipants.findIndex((p: any) => p.user_id === userId) + 1;
  const daysRemaining = Math.ceil(
    (new Date(competition.end_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    id: competition.id,
    name: competition.name,
    rank,
    total_participants: allParticipants.length,
    days_remaining: daysRemaining,
  };
}

async function getCurrentStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data } = await supabase
    .from('user_streaks')
    .select('current_streak')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.current_streak || 0;
}

// ============================================================================
// NOTIFICATION CONTENT
// ============================================================================

function buildMotivationContent(
  user: UserProfile,
  yesterdayActivity: YesterdayActivity | null,
  goals: UserGoals,
  activeCompetition: ActiveCompetition | null,
  streak: number
): NotificationContent {
  const firstName = (user.full_name?.split(' ')[0] || user.username || 'there');

  // Calculate yesterday's performance
  let movePercent = 0;
  let exercisePercent = 0;
  let standPercent = 0;
  let ringsClosed = 0;

  if (yesterdayActivity) {
    movePercent = Math.round((yesterdayActivity.move_calories / goals.move_calories) * 100);
    exercisePercent = Math.round((yesterdayActivity.exercise_minutes / goals.exercise_minutes) * 100);
    standPercent = Math.round((yesterdayActivity.stand_hours / goals.stand_hours) * 100);

    if (movePercent >= 100) ringsClosed++;
    if (exercisePercent >= 100) ringsClosed++;
    if (standPercent >= 100) ringsClosed++;
  }

  // Build personalized message
  let title: string;
  let body: string;

  // Check for competition urgency first
  if (activeCompetition && activeCompetition.days_remaining <= 2 && activeCompetition.rank > 1) {
    title = '🏆 Competition crunch time!';
    body = `You're #${activeCompetition.rank} in "${activeCompetition.name}" with ${activeCompetition.days_remaining} day${activeCompetition.days_remaining !== 1 ? 's' : ''} left. Time to make a move!`;
  }
  // Great performance yesterday
  else if (ringsClosed === 3) {
    title = '🔥 You crushed it yesterday!';
    body = `All 3 rings closed! ${streak > 1 ? `Your ${streak}-day streak is on fire.` : ''} Let's do it again today!`;
  }
  // Good performance
  else if (ringsClosed === 2) {
    title = '💪 Great job yesterday!';
    const closedRings = [];
    if (movePercent >= 100) closedRings.push('Move');
    if (exercisePercent >= 100) closedRings.push('Exercise');
    if (standPercent >= 100) closedRings.push('Stand');
    body = `You closed your ${closedRings.join(' and ')} ring${closedRings.length > 1 ? 's' : ''}! Can you get all 3 today?`;
  }
  // Some activity
  else if (yesterdayActivity && (movePercent > 0 || exercisePercent > 0)) {
    const bestRing = movePercent >= exercisePercent ? 'Move' : 'Exercise';
    const bestPercent = Math.max(movePercent, exercisePercent);
    title = '☀️ Good morning!';
    body = `Yesterday: ${bestPercent}% on ${bestRing}. ${streak > 0 ? `${streak}-day streak going strong!` : 'Every day is a fresh start!'}`;
  }
  // No activity yesterday or no data
  else if (streak > 0) {
    title = '⏰ Your streak needs you!';
    body = `Your ${streak}-day streak is waiting. A quick workout keeps it alive!`;
  }
  // Active competition motivation
  else if (activeCompetition) {
    title = '🏆 Competition mode!';
    body = `You're #${activeCompetition.rank} of ${activeCompetition.total_participants} in "${activeCompetition.name}". Get moving!`;
  }
  // Default motivation
  else {
    const greetings = [
      { title: '☀️ Rise and shine!', body: `Good morning, ${firstName}! Let's make today count.` },
      { title: '💪 New day, new goals!', body: 'Your rings are waiting to be closed. You got this!' },
      { title: '🌟 Fresh start!', body: `Hey ${firstName}, every step today matters. Let's go!` },
      { title: '⚡ Ready to move?', body: 'Your body is ready for action. Time to earn those rings!' },
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    title = greeting.title;
    body = greeting.body;
  }

  return {
    title,
    body,
    data: {
      type: 'morning_motivation',
      streak,
      competition_id: activeCompetition?.id,
      deep_link: '/(tabs)',
    },
  };
}

// ============================================================================
// ONESIGNAL
// ============================================================================

async function sendOneSignalNotification(
  userId: string,
  content: NotificationContent
): Promise<boolean> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error('[send-morning-motivation] OneSignal credentials not configured');
    return false;
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_external_user_ids: [userId],
        headings: { en: content.title },
        contents: { en: content.body },
        data: content.data,
        // iOS specific
        ios_sound: 'default',
        // Android specific
        android_channel_id: 'morning_motivation',
        android_accent_color: 'FFFA114F',
        small_icon: 'ic_notification',
        // TTL - expire after 4 hours
        ttl: 14400,
      }),
    });

    const result = await response.json();

    if (result.errors) {
      console.error('[send-morning-motivation] OneSignal error:', result.errors);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[send-morning-motivation] Failed to send notification:', error);
    return false;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getTodayInTimezone(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function getYesterdayInTimezone(timezone: string): string {
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(yesterday);
    return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
  } catch {
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }
}
