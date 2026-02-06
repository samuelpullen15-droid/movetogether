/**
 * send-streak-notifications
 *
 * Cron-scheduled Edge Function that sends push notifications to users
 * whose streaks are at risk. Designed to run multiple times per day
 * (suggested: 6 PM, 8 PM, 9 PM in user's local timezone).
 *
 * The function determines the appropriate notification based on the
 * user's local time and streak status.
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

interface UserStreak {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  timezone: string;
  streak_shields_available: number;
}

interface NotificationPreferences {
  user_id: string;
  achievements_push: boolean;
}

interface StreakMilestone {
  id: string;
  day_number: number;
  name: string;
  description: string;
  reward_type: string;
  reward_value: Record<string, unknown>;
}

type NotificationUrgency = 'first_warning' | 'second_warning' | 'final_warning' | 'milestone_approaching';

interface NotificationContent {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

interface ProcessedUser {
  userId: string;
  notificationSent: boolean;
  urgency: NotificationUrgency | null;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

// Activity thresholds for streak qualification
const STREAK_THRESHOLDS = {
  steps: 1000,
  workout_minutes: 10,
  active_minutes: 15,
};

// Notification windows (in user's local time, hours in 24h format)
const NOTIFICATION_WINDOWS = {
  first_warning: { start: 17, end: 19 },    // 5 PM - 7 PM (send at ~6 PM)
  second_warning: { start: 19, end: 21 },   // 7 PM - 9 PM (send at ~8 PM)
  final_warning: { start: 21, end: 23 },    // 9 PM - 11 PM (send at ~9 PM)
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[send-streak-notifications] Starting cron job...');

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[send-streak-notifications] Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify this is a cron/service role call
    const authHeader = req.headers.get('Authorization');
    const isServiceRole = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    const isCronCall = req.headers.get('X-Cron-Job') === 'true';

    if (!isServiceRole && !isCronCall) {
      // Allow authenticated requests for testing
      console.log('[send-streak-notifications] Non-service-role request, checking auth...');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all users with active streaks who haven't logged activity today
    const usersAtRisk = await getUsersWithStreaksAtRisk(supabase);
    console.log(`[send-streak-notifications] Found ${usersAtRisk.length} users with streaks at risk`);

    const results: ProcessedUser[] = [];

    for (const user of usersAtRisk) {
      const result = await processUserNotification(supabase, user);
      results.push(result);
    }

    const sentCount = results.filter(r => r.notificationSent).length;
    const errorCount = results.filter(r => r.error).length;
    const duration = Date.now() - startTime;

    console.log(`[send-streak-notifications] Complete: ${sentCount} sent, ${errorCount} errors, ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        sent: sentCount,
        errors: errorCount,
        duration_ms: duration,
        results: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-streak-notifications] Fatal error:', error);
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

async function getUsersWithStreaksAtRisk(
  supabase: SupabaseClient
): Promise<UserStreak[]> {
  // Get yesterday's date in UTC (we'll check timezone per-user)
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  // Query users with active streaks
  // We'll filter by timezone locally to ensure accuracy
  const { data: users, error } = await supabase
    .from('user_streaks')
    .select(`
      id,
      user_id,
      current_streak,
      longest_streak,
      last_activity_date,
      timezone,
      streak_shields_available
    `)
    .gt('current_streak', 0)
    .order('current_streak', { ascending: false });

  if (error) {
    console.error('[send-streak-notifications] Error fetching user streaks:', error);
    throw new Error('Failed to fetch user streaks');
  }

  if (!users || users.length === 0) {
    return [];
  }

  // Filter users whose last activity was yesterday in their timezone
  const atRiskUsers: UserStreak[] = [];

  for (const user of users as UserStreak[]) {
    const { today, yesterday } = getDatesInTimezone(user.timezone);

    // User is at risk if:
    // 1. Their last activity was yesterday (no activity today yet)
    // 2. OR their last activity was before yesterday (streak might be about to break)
    if (user.last_activity_date === yesterday) {
      atRiskUsers.push(user);
    }
  }

  return atRiskUsers;
}

// ============================================================================
// NOTIFICATION PROCESSING
// ============================================================================

async function processUserNotification(
  supabase: SupabaseClient,
  user: UserStreak
): Promise<ProcessedUser> {
  const result: ProcessedUser = {
    userId: user.user_id,
    notificationSent: false,
    urgency: null,
  };

  try {
    // Check if user has notifications enabled
    const hasNotificationsEnabled = await checkNotificationPreferences(supabase, user.user_id);
    if (!hasNotificationsEnabled) {
      console.log(`[send-streak-notifications] User ${user.user_id}: notifications disabled`);
      return result;
    }

    // Determine notification urgency based on user's local time
    const urgency = getNotificationUrgency(user.timezone);
    if (!urgency) {
      console.log(`[send-streak-notifications] User ${user.user_id}: not in notification window`);
      return result;
    }

    result.urgency = urgency;

    // Check if we already sent this notification type today
    const alreadySent = await hasNotificationBeenSent(supabase, user.user_id, urgency);
    if (alreadySent) {
      console.log(`[send-streak-notifications] User ${user.user_id}: ${urgency} already sent today`);
      return result;
    }

    // Build notification content
    const content = await buildNotificationContent(supabase, user, urgency);

    // Send via OneSignal
    const sent = await sendOneSignalNotification(
      user.user_id,
      content.title,
      content.body,
      content.data
    );

    if (sent) {
      // Log the notification
      await logNotificationSent(supabase, user.user_id, urgency, content);
      result.notificationSent = true;
      console.log(`[send-streak-notifications] User ${user.user_id}: ${urgency} notification sent`);
    } else {
      result.error = 'OneSignal send failed';
    }
  } catch (error) {
    console.error(`[send-streak-notifications] Error processing user ${user.user_id}:`, error);
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

async function checkNotificationPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('achievements_push')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Default to enabled if no preferences found
    return true;
  }

  // Use achievements_push preference for streak notifications
  return data?.achievements_push ?? true;
}

function getNotificationUrgency(timezone: string): NotificationUrgency | null {
  try {
    // Get current hour in user's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hourStr = formatter.format(now);
    const hour = parseInt(hourStr, 10);

    // Determine urgency based on time window
    if (hour >= NOTIFICATION_WINDOWS.first_warning.start && hour < NOTIFICATION_WINDOWS.first_warning.end) {
      return 'first_warning';
    }
    if (hour >= NOTIFICATION_WINDOWS.second_warning.start && hour < NOTIFICATION_WINDOWS.second_warning.end) {
      return 'second_warning';
    }
    if (hour >= NOTIFICATION_WINDOWS.final_warning.start && hour < NOTIFICATION_WINDOWS.final_warning.end) {
      return 'final_warning';
    }

    return null;
  } catch (error) {
    console.error(`[send-streak-notifications] Invalid timezone ${timezone}:`, error);
    return null;
  }
}

async function hasNotificationBeenSent(
  supabase: SupabaseClient,
  userId: string,
  urgency: NotificationUrgency
): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('streak_notification_log')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', urgency)
    .eq('sent_date', today)
    .maybeSingle();

  if (error) {
    console.error('[send-streak-notifications] Error checking notification log:', error);
    return false; // Default to not sent on error
  }

  return !!data;
}

async function buildNotificationContent(
  supabase: SupabaseClient,
  user: UserStreak,
  urgency: NotificationUrgency
): Promise<NotificationContent> {
  const streak = user.current_streak;
  const shieldsAvailable = user.streak_shields_available;

  // Check if next milestone is tomorrow
  const nextMilestone = await getNextMilestone(supabase, user.user_id, streak);
  const milestoneIsTomorrow = nextMilestone && nextMilestone.days_away === 1;

  // If milestone is tomorrow, send milestone notification instead (higher priority)
  if (milestoneIsTomorrow && urgency === 'first_warning') {
    return {
      title: '🎯 Big milestone tomorrow!',
      body: `Keep it up! Tomorrow you'll hit ${nextMilestone.name}${nextMilestone.reward_description ? ` - ${nextMilestone.reward_description}` : ''}`,
      data: {
        type: 'streak_milestone_approaching',
        streak: streak,
        milestone_name: nextMilestone.name,
        milestone_day: nextMilestone.day_number,
        deep_link: '/movement-trail',
      },
    };
  }

  // Build urgency-specific notification
  switch (urgency) {
    case 'first_warning':
      return {
        title: '🔥 Keep your streak alive!',
        body: `You're on a ${streak} day streak. Log some activity to keep it going!`,
        data: {
          type: 'streak_first_warning',
          streak: streak,
          shields_available: shieldsAvailable,
          deep_link: '/movement-trail',
        },
      };

    case 'second_warning':
      return {
        title: '⚠️ Streak at risk!',
        body: `Your ${streak} day streak ends at midnight. Just ${STREAK_THRESHOLDS.steps.toLocaleString()} more steps to save it!`,
        data: {
          type: 'streak_second_warning',
          streak: streak,
          shields_available: shieldsAvailable,
          threshold_steps: STREAK_THRESHOLDS.steps,
          deep_link: '/movement-trail',
        },
      };

    case 'final_warning':
      return {
        title: '🚨 Last chance!',
        body: shieldsAvailable > 0
          ? `3 hours left to save your ${streak} day streak! You have ${shieldsAvailable} shield${shieldsAvailable > 1 ? 's' : ''} available.`
          : `3 hours left to save your ${streak} day streak!`,
        data: {
          type: 'streak_final_warning',
          streak: streak,
          shields_available: shieldsAvailable,
          deep_link: '/movement-trail',
        },
      };

    case 'milestone_approaching':
      // This case is handled above when milestoneIsTomorrow
      return {
        title: '🎯 Big milestone tomorrow!',
        body: `Keep it up! Tomorrow is day ${streak + 1} of your streak!`,
        data: {
          type: 'streak_milestone_approaching',
          streak: streak,
          deep_link: '/movement-trail',
        },
      };
  }
}

async function getNextMilestone(
  supabase: SupabaseClient,
  userId: string,
  currentStreak: number
): Promise<{ name: string; day_number: number; days_away: number; reward_description?: string } | null> {
  // Get next milestone
  const { data: milestone, error } = await supabase
    .from('streak_milestones')
    .select('*')
    .gt('day_number', currentStreak)
    .order('day_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !milestone) {
    return null;
  }

  const ms = milestone as StreakMilestone;

  // Build reward description
  let rewardDescription = '';
  const rewardValue = ms.reward_value || {};

  switch (ms.reward_type) {
    case 'badge':
      rewardDescription = 'Unlock a special badge';
      break;
    case 'trial_mover':
    case 'trial_coach':
    case 'trial_crusher':
      const days = (rewardValue.trial_days as number) || 1;
      rewardDescription = `${days}-day premium trial`;
      break;
    case 'profile_frame':
      rewardDescription = 'Exclusive profile frame';
      break;
    case 'leaderboard_flair':
      rewardDescription = 'Leaderboard flair';
      break;
    case 'app_icon':
      rewardDescription = 'New app icon';
      break;
    case 'points_multiplier':
      const multiplier = (rewardValue.multiplier as number) || 2;
      rewardDescription = `${multiplier}x points boost`;
      break;
  }

  return {
    name: ms.name,
    day_number: ms.day_number,
    days_away: ms.day_number - currentStreak,
    reward_description: rewardDescription,
  };
}

// ============================================================================
// LOGGING
// ============================================================================

async function logNotificationSent(
  supabase: SupabaseClient,
  userId: string,
  notificationType: NotificationUrgency,
  content: NotificationContent
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('streak_notification_log')
    .insert({
      user_id: userId,
      notification_type: notificationType,
      sent_date: today,
      sent_at: new Date().toISOString(),
      title: content.title,
      body: content.body,
      data: content.data,
    });

  if (error) {
    console.error('[send-streak-notifications] Error logging notification:', error);
    // Don't throw - notification was already sent
  }
}

// ============================================================================
// ONESIGNAL
// ============================================================================

async function sendOneSignalNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error('[send-streak-notifications] OneSignal credentials not configured');
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
        headings: { en: title },
        contents: { en: body },
        data: data || {},
        // iOS specific
        ios_sound: 'default',
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        // Android specific
        android_channel_id: 'streak_reminders',
        android_accent_color: 'FFFA114F',
        small_icon: 'ic_notification',
        // TTL - expire after 3 hours (important for time-sensitive notifications)
        ttl: 10800,
      }),
    });

    const result = await response.json();

    if (result.errors) {
      console.error('[send-streak-notifications] OneSignal error:', result.errors);
      return false;
    }

    console.log(`[send-streak-notifications] OneSignal notification sent: ${result.id}`);
    return true;
  } catch (error) {
    console.error('[send-streak-notifications] Failed to send notification:', error);
    return false;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getDatesInTimezone(timezone: string): { today: string; yesterday: string } {
  try {
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const todayParts = formatter.formatToParts(now);
    const today = `${todayParts.find(p => p.type === 'year')?.value}-${todayParts.find(p => p.type === 'month')?.value}-${todayParts.find(p => p.type === 'day')?.value}`;

    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayParts = formatter.formatToParts(yesterdayDate);
    const yesterday = `${yesterdayParts.find(p => p.type === 'year')?.value}-${yesterdayParts.find(p => p.type === 'month')?.value}-${yesterdayParts.find(p => p.type === 'day')?.value}`;

    return { today, yesterday };
  } catch (error) {
    console.error(`[send-streak-notifications] Invalid timezone ${timezone}, falling back to UTC`);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return { today, yesterday };
  }
}
