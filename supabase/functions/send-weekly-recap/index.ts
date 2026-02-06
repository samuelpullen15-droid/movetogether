/**
 * send-weekly-recap
 *
 * Cron-scheduled Edge Function that sends weekly recap digest push notifications
 * to users on Saturday at 10 AM in their local timezone.
 *
 * Recap includes:
 * - Weekly ring completion stats
 * - Competition performance
 * - Streak progress
 * - Achievement unlocks
 * - Friend highlights
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
  email?: string;
}

interface WeeklyStats {
  // Ring stats
  totalRingsClosed: number;
  avgMovePercent: number;
  avgExercisePercent: number;
  avgStandPercent: number;
  bestDay: string | null;
  bestDayRings: number;
  daysWithActivity: number;

  // Competition stats
  competitionsPlayed: number;
  competitionsWon: number;
  bestPlacement: number | null;

  // Streak stats
  currentStreak: number;
  streakGained: number;

  // Achievement stats
  achievementsUnlocked: number;
  achievementNames: string[];

  // Friend stats
  topFriend: {
    name: string;
    ringsClosed: number;
  } | null;
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
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// Saturday 10 AM notification window
const NOTIFICATION_WINDOW_START = 10;
const NOTIFICATION_WINDOW_END = 12;
const TARGET_DAY_OF_WEEK = 6; // Saturday (0 = Sunday, 6 = Saturday)

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[send-weekly-recap] Starting...');

  // Check for test mode with specific user
  let forceUserId: string | null = null;
  try {
    const body = await req.json();
    forceUserId = body?.force_user_id || null;
  } catch {
    // No body or invalid JSON - normal cron mode
  }

  // Feature flag: Skip automatic sending unless enabled
  // Manual testing with force_user_id still works
  const isEnabled = Deno.env.get('WEEKLY_RECAP_ENABLED') === 'true';
  if (!isEnabled && !forceUserId) {
    console.log('[send-weekly-recap] Feature disabled (WEEKLY_RECAP_ENABLED != true). Skipping.');
    return new Response(
      JSON.stringify({ message: 'Weekly recap feature is disabled', sent: 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[send-weekly-recap] Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let eligibleUsers: UserProfile[];

    if (forceUserId) {
      // Test mode: send to specific user regardless of day/time
      console.log(`[send-weekly-recap] Test mode for user: ${forceUserId}`);
      const user = await getSpecificUser(supabase, forceUserId);
      eligibleUsers = user ? [user] : [];
    } else {
      // Normal cron mode: Get users whose local time is Saturday 10 AM
      eligibleUsers = await getEligibleUsers(supabase);
    }
    console.log(`[send-weekly-recap] Found ${eligibleUsers.length} users to process`);

    let sentCount = 0;
    let errorCount = 0;

    for (const user of eligibleUsers) {
      try {
        const sent = await sendWeeklyRecap(supabase, user, !!forceUserId);
        if (sent) sentCount++;
      } catch (error) {
        console.error(`[send-weekly-recap] Error for user ${user.id}:`, error);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[send-weekly-recap] Complete: ${sentCount} sent, ${errorCount} errors, ${duration}ms`);

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
    console.error('[send-weekly-recap] Fatal error:', error);
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
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, timezone')
    .not('timezone', 'is', null);

  if (error) {
    console.error('[send-weekly-recap] Error fetching profiles:', error);
    throw new Error('Failed to fetch profiles');
  }

  if (!profiles || profiles.length === 0) {
    return [];
  }

  const eligibleUsers: UserProfile[] = [];

  for (const profile of profiles as UserProfile[]) {
    const { hour, dayOfWeek } = getLocalTimeInfo(profile.timezone);

    // Check if it's Saturday and within the notification window
    if (dayOfWeek === TARGET_DAY_OF_WEEK &&
        hour >= NOTIFICATION_WINDOW_START &&
        hour < NOTIFICATION_WINDOW_END) {
      // Fetch email from auth.users
      const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
      eligibleUsers.push({
        ...profile,
        email: authUser?.user?.email || undefined,
      });
    }
  }

  return eligibleUsers;
}

async function getSpecificUser(supabase: SupabaseClient, userId: string): Promise<UserProfile | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, timezone')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile) {
    console.error('[send-weekly-recap] Error fetching user:', error);
    return null;
  }

  // Fetch email from auth.users
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);

  return {
    ...profile,
    timezone: profile.timezone || 'America/New_York',
    email: authUser?.user?.email || undefined,
  };
}

function getLocalTimeInfo(timezone: string): { hour: number; dayOfWeek: number } {
  try {
    const now = new Date();

    const hourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(hourFormatter.format(now), 10);

    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    });
    const dayStr = dayFormatter.format(now);
    const dayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };
    const dayOfWeek = dayMap[dayStr] ?? new Date().getUTCDay();

    return { hour, dayOfWeek };
  } catch {
    return { hour: new Date().getUTCHours(), dayOfWeek: new Date().getUTCDay() };
  }
}

// ============================================================================
// WEEKLY RECAP PROCESSING
// ============================================================================

async function sendWeeklyRecap(
  supabase: SupabaseClient,
  user: UserProfile,
  skipDuplicateCheck: boolean = false
): Promise<boolean> {
  // Check notification preferences (skip in test mode)
  if (!skipDuplicateCheck) {
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('activity_push')
      .eq('user_id', user.id)
      .maybeSingle();

    if (prefs && prefs.activity_push === false) {
      console.log(`[send-weekly-recap] User ${user.id}: notifications disabled`);
      return false;
    }
  }

  // Check if already sent this week (skip in test mode)
  const weekId = getWeekId(user.timezone);
  if (!skipDuplicateCheck) {
    const { data: alreadySent } = await supabase
      .from('streak_notification_log')
      .select('id')
      .eq('user_id', user.id)
      .eq('notification_type', 'weekly_recap')
      .eq('sent_date', weekId)
      .maybeSingle();

    if (alreadySent) {
      console.log(`[send-weekly-recap] User ${user.id}: already sent this week`);
      return false;
    }
  }

  // Get weekly stats
  const weekDates = getWeekDates(user.timezone);
  const stats = await getWeeklyStats(supabase, user.id, weekDates);

  // Build notification content
  const content = buildRecapContent(user, stats);

  // Send push notification
  const pushSent = await sendOneSignalNotification(user.id, content);

  // Send email recap (if user has email)
  let emailSent = false;
  if (user.email) {
    emailSent = await sendRecapEmail(user, stats);
  }

  if (pushSent || emailSent) {
    await supabase
      .from('streak_notification_log')
      .insert({
        user_id: user.id,
        notification_type: 'weekly_recap',
        sent_date: weekId,
        sent_at: new Date().toISOString(),
        title: content.title,
        body: content.body,
        data: { ...content.data, email_sent: emailSent },
      });

    console.log(`[send-weekly-recap] User ${user.id}: push=${pushSent}, email=${emailSent}`);
  }

  return pushSent || emailSent;
}

// ============================================================================
// STATS GATHERING
// ============================================================================

async function getWeeklyStats(
  supabase: SupabaseClient,
  userId: string,
  weekDates: { start: string; end: string; days: string[] }
): Promise<WeeklyStats> {
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
  // Streak gained is approximately the number of days with activity this week
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
// NOTIFICATION CONTENT
// ============================================================================

function buildRecapContent(user: UserProfile, stats: WeeklyStats): NotificationContent {
  const firstName = user.full_name?.split(' ')[0] || user.username || 'there';

  let title: string;
  let body: string;

  // Highlight based on best stat
  if (stats.competitionsWon > 0) {
    title = '🏆 Weekly Champion!';
    body = `You won ${stats.competitionsWon} competition${stats.competitionsWon > 1 ? 's' : ''} this week! ` +
           `${stats.totalRingsClosed} rings closed.`;
  } else if (stats.totalRingsClosed >= 18) { // Perfect week (3 rings × 7 days = 21, close is 18+)
    title = '🔥 Incredible week!';
    body = `${stats.totalRingsClosed} rings closed! Avg: ${stats.avgMovePercent}% Move, ` +
           `${stats.avgExercisePercent}% Exercise. You're crushing it!`;
  } else if (stats.achievementsUnlocked > 0) {
    title = '🎖️ Achievement unlocked!';
    body = `You earned ${stats.achievementsUnlocked} new achievement${stats.achievementsUnlocked > 1 ? 's' : ''}! ` +
           `Plus ${stats.totalRingsClosed} rings closed.`;
  } else if (stats.currentStreak >= 7) {
    title = '🔥 Streak on fire!';
    body = `${stats.currentStreak}-day streak! You closed ${stats.totalRingsClosed} rings this week.`;
  } else if (stats.daysWithActivity >= 5) {
    title = '💪 Great week!';
    body = `${stats.daysWithActivity} active days, ${stats.totalRingsClosed} rings closed. ` +
           `Avg: ${Math.round((stats.avgMovePercent + stats.avgExercisePercent) / 2)}%`;
  } else if (stats.competitionsPlayed > 0) {
    title = '🏃 Week in review';
    body = `${stats.competitionsPlayed} competition${stats.competitionsPlayed > 1 ? 's' : ''} played. ` +
           `${stats.totalRingsClosed} rings closed. Keep pushing!`;
  } else {
    title = `📊 Your weekly recap`;
    body = stats.totalRingsClosed > 0
      ? `${stats.totalRingsClosed} rings closed this week. ${stats.currentStreak > 0 ? `${stats.currentStreak}-day streak!` : 'Start a new streak!'}`
      : `Hey ${firstName}! A new week begins. Let's make it count!`;
  }

  // Add friend highlight if impressive
  if (stats.topFriend && stats.topFriend.ringsClosed >= 10) {
    body += ` 👑 ${stats.topFriend.name} closed ${stats.topFriend.ringsClosed} rings!`;
  }

  return {
    title,
    body,
    data: {
      type: 'weekly_recap',
      stats: {
        rings_closed: stats.totalRingsClosed,
        competitions_played: stats.competitionsPlayed,
        competitions_won: stats.competitionsWon,
        current_streak: stats.currentStreak,
        achievements_unlocked: stats.achievementsUnlocked,
      },
      deep_link: '/weekly-recap',
    },
  };
}

// ============================================================================
// EMAIL
// ============================================================================

async function sendRecapEmail(
  user: UserProfile,
  stats: WeeklyStats
): Promise<boolean> {
  if (!RESEND_API_KEY || !user.email) {
    return false;
  }

  try {
    const firstName = user.full_name?.split(' ')[0] || user.username || 'there';
    const html = buildRecapEmailHtml(firstName, stats);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'MoveTogether <hello@notifications.movetogetherfitness.com>',
        to: [user.email],
        subject: `🎯 Your Week in Review: ${stats.totalRingsClosed} rings closed!`,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[send-weekly-recap] Email error:', errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[send-weekly-recap] Failed to send email:', error);
    return false;
  }
}

function buildRecapEmailHtml(firstName: string, stats: WeeklyStats): string {
  const ringProgress = Math.round((stats.totalRingsClosed / 21) * 100);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Weekly Recap</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                Your Week in Review
              </h1>
              <p style="margin: 8px 0 0; color: #9ca3af; font-size: 14px;">
                Hey ${firstName}, here's how you did this week!
              </p>
            </td>
          </tr>

          <!-- Main Stats Card -->
          <tr>
            <td style="background: linear-gradient(135deg, #1f1f23 0%, #2a2a2e 100%); border-radius: 24px; padding: 32px;">
              <!-- Rings Section -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #FF6B35 0%, #FF8F5C 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                      <span style="font-size: 36px;">🎯</span>
                    </div>
                    <h2 style="margin: 16px 0 4px; color: #ffffff; font-size: 48px; font-weight: 700;">
                      ${stats.totalRingsClosed}
                    </h2>
                    <p style="margin: 0; color: #9ca3af; font-size: 16px; text-transform: uppercase; letter-spacing: 2px;">
                      Rings Closed
                    </p>
                  </td>
                </tr>

                <!-- Ring Breakdown -->
                <tr>
                  <td style="padding: 24px 0; border-top: 1px solid #3a3a3e; border-bottom: 1px solid #3a3a3e;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="33%" align="center">
                          <p style="margin: 0 0 4px; color: #FA114F; font-size: 24px; font-weight: 700;">${stats.avgMovePercent}%</p>
                          <p style="margin: 0; color: #9ca3af; font-size: 12px;">Move</p>
                        </td>
                        <td width="33%" align="center">
                          <p style="margin: 0 0 4px; color: #92E82A; font-size: 24px; font-weight: 700;">${stats.avgExercisePercent}%</p>
                          <p style="margin: 0; color: #9ca3af; font-size: 12px;">Exercise</p>
                        </td>
                        <td width="33%" align="center">
                          <p style="margin: 0 0 4px; color: #00D4FF; font-size: 24px; font-weight: 700;">${stats.avgStandPercent}%</p>
                          <p style="margin: 0; color: #9ca3af; font-size: 12px;">Stand</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Other Stats -->
                <tr>
                  <td style="padding-top: 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${stats.currentStreak > 0 ? `
                      <tr>
                        <td style="padding: 12px 0;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td width="40" valign="middle">
                                <span style="font-size: 24px;">🔥</span>
                              </td>
                              <td valign="middle">
                                <p style="margin: 0; color: #ffffff; font-size: 16px;">Current Streak</p>
                              </td>
                              <td align="right" valign="middle">
                                <p style="margin: 0; color: #FF6B35; font-size: 18px; font-weight: 700;">${stats.currentStreak} days</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      ` : ''}
                      ${stats.competitionsPlayed > 0 ? `
                      <tr>
                        <td style="padding: 12px 0;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td width="40" valign="middle">
                                <span style="font-size: 24px;">🏆</span>
                              </td>
                              <td valign="middle">
                                <p style="margin: 0; color: #ffffff; font-size: 16px;">Competitions</p>
                              </td>
                              <td align="right" valign="middle">
                                <p style="margin: 0; color: #9B59B6; font-size: 18px; font-weight: 700;">${stats.competitionsWon > 0 ? `${stats.competitionsWon} won` : `${stats.competitionsPlayed} played`}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      ` : ''}
                      ${stats.achievementsUnlocked > 0 ? `
                      <tr>
                        <td style="padding: 12px 0;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td width="40" valign="middle">
                                <span style="font-size: 24px;">🎖️</span>
                              </td>
                              <td valign="middle">
                                <p style="margin: 0; color: #ffffff; font-size: 16px;">New Achievements</p>
                              </td>
                              <td align="right" valign="middle">
                                <p style="margin: 0; color: #F39C12; font-size: 18px; font-weight: 700;">${stats.achievementsUnlocked}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 12px 0;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td width="40" valign="middle">
                                <span style="font-size: 24px;">📅</span>
                              </td>
                              <td valign="middle">
                                <p style="margin: 0; color: #ffffff; font-size: 16px;">Active Days</p>
                              </td>
                              <td align="right" valign="middle">
                                <p style="margin: 0; color: #3498DB; font-size: 18px; font-weight: 700;">${stats.daysWithActivity}/7</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding: 32px 0;">
              <a href="movetogether://weekly-recap" style="display: inline-block; background: linear-gradient(135deg, #FA114F 0%, #FF6B5A 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 16px 32px; border-radius: 50px;">
                View Full Recap
              </a>
            </td>
          </tr>

          ${stats.topFriend ? `
          <!-- Friend Highlight -->
          <tr>
            <td style="background: #1f1f23; border-radius: 16px; padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="40" valign="middle">
                    <span style="font-size: 24px;">👑</span>
                  </td>
                  <td valign="middle">
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">TOP FRIEND</p>
                    <p style="margin: 4px 0 0; color: #ffffff; font-size: 16px; font-weight: 600;">${stats.topFriend.name}</p>
                  </td>
                  <td align="right" valign="middle">
                    <p style="margin: 0; color: #FFD700; font-size: 18px; font-weight: 700;">${stats.topFriend.ringsClosed} rings</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Motivation -->
          <tr>
            <td align="center" style="padding: 32px 0 16px;">
              <p style="margin: 0; color: #9ca3af; font-size: 14px;">
                Keep pushing! Next week awaits. 💪
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 24px; border-top: 1px solid #2a2a2e;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                MoveTogether • Fitness with friends
              </p>
              <p style="margin: 8px 0 0; color: #4b5563; font-size: 11px;">
                <a href="movetogether://notification-settings" style="color: #4b5563;">Manage email preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ============================================================================
// ONESIGNAL
// ============================================================================

async function sendOneSignalNotification(
  userId: string,
  content: NotificationContent
): Promise<boolean> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error('[send-weekly-recap] OneSignal credentials not configured');
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
        ios_sound: 'default',
        android_channel_id: 'weekly_recap',
        android_accent_color: 'FFFA114F',
        small_icon: 'ic_notification',
        ttl: 86400, // 24 hours
      }),
    });

    const result = await response.json();

    if (result.errors) {
      console.error('[send-weekly-recap] OneSignal error:', result.errors);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[send-weekly-recap] Failed to send notification:', error);
    return false;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getWeekId(timezone: string): string {
  // Returns a unique identifier for the current week (YYYY-Www format)
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;

    // Calculate week number
    const date = new Date(`${year}-${month}-${day}`);
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(
      ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
    );

    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
  } catch {
    const now = new Date();
    const weekNumber = Math.ceil(
      ((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7
    );
    return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  }
}

function getWeekDates(timezone: string): { start: string; end: string; days: string[] } {
  try {
    const now = new Date();
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
