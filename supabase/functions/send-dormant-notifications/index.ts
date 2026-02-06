/**
 * send-dormant-notifications
 *
 * Cron-scheduled Edge Function that sends re-engagement push notifications
 * to users who haven't opened the app in 3+ days. Four escalating tiers:
 *   day_3  (3–6 days)   — friendly nudge
 *   day_7  (7–13 days)  — slightly urgent
 *   day_14 (14–29 days) — warm re-invitation
 *   day_30 (30–59 days) — final "we saved your spot"
 *
 * Stops after 60 days (user considered churned).
 * Runs twice daily via pg_cron (10 AM + 6 PM UTC).
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

type DormancyTier = 'day_3' | 'day_7' | 'day_14' | 'day_30';

interface DormantUser {
  id: string;
  full_name: string | null;
  username: string | null;
  last_seen_at: string;
  timezone: string | null;
}

interface PersonalizationData {
  activeFriendName: string | null;
  activeCompetitionName: string | null;
  competitionPosition: number | null;
  streakWhenLeft: number;
  friendCount: number;
}

interface NotificationContent {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

interface ProcessedUser {
  userId: string;
  dormancyDays: number;
  tier: DormancyTier | null;
  notificationSent: boolean;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

const DORMANCY_TIERS: { tier: DormancyTier; minDays: number; maxDays: number }[] = [
  { tier: 'day_3',  minDays: 3,  maxDays: 6 },
  { tier: 'day_7',  minDays: 7,  maxDays: 13 },
  { tier: 'day_14', minDays: 14, maxDays: 29 },
  { tier: 'day_30', minDays: 30, maxDays: 59 },
];

// Only send during reasonable hours in the user's local timezone
const NOTIFICATION_WINDOW = { start: 9, end: 20 }; // 9 AM – 8 PM

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[send-dormant-notifications] Starting cron job...');

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[send-dormant-notifications] Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find users who haven't opened the app in 3–60 days
    const dormantUsers = await getDormantUsers(supabase);
    console.log(`[send-dormant-notifications] Found ${dormantUsers.length} dormant users`);

    const results: ProcessedUser[] = [];

    for (const user of dormantUsers) {
      const result = await processUser(supabase, user);
      results.push(result);
    }

    const sentCount = results.filter(r => r.notificationSent).length;
    const errorCount = results.filter(r => r.error).length;
    const duration = Date.now() - startTime;

    console.log(`[send-dormant-notifications] Complete: ${sentCount} sent, ${errorCount} errors, ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        sent: sentCount,
        errors: errorCount,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-dormant-notifications] Fatal error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// DORMANT USER QUERY
// ============================================================================

async function getDormantUsers(supabase: SupabaseClient): Promise<DormantUser[]> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, last_seen_at, timezone')
    .eq('onboarding_completed', true)
    .not('last_seen_at', 'is', null)
    .lte('last_seen_at', threeDaysAgo)
    .gte('last_seen_at', sixtyDaysAgo)
    .order('last_seen_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch dormant users: ${error.message}`);
  }

  return (data || []) as DormantUser[];
}

// ============================================================================
// USER PROCESSING
// ============================================================================

async function processUser(
  supabase: SupabaseClient,
  user: DormantUser
): Promise<ProcessedUser> {
  const dormancyMs = Date.now() - new Date(user.last_seen_at).getTime();
  const dormancyDays = Math.floor(dormancyMs / (24 * 60 * 60 * 1000));

  const result: ProcessedUser = {
    userId: user.id,
    dormancyDays,
    tier: null,
    notificationSent: false,
  };

  try {
    // Determine tier
    const tierConfig = DORMANCY_TIERS.find(
      t => dormancyDays >= t.minDays && dormancyDays <= t.maxDays
    );
    if (!tierConfig) {
      return result;
    }
    result.tier = tierConfig.tier;

    // Check timezone window (9 AM – 8 PM local)
    if (!isWithinNotificationWindow(user.timezone)) {
      return result;
    }

    // Check notification preference (account_push)
    const hasNotificationsEnabled = await checkNotificationPreference(supabase, user.id);
    if (!hasNotificationsEnabled) {
      console.log(`[send-dormant-notifications] User ${user.id}: notifications disabled`);
      return result;
    }

    // Check deduplication
    const alreadySent = await hasBeenNotifiedForTier(
      supabase, user.id, tierConfig.tier, user.last_seen_at
    );
    if (alreadySent) {
      return result;
    }

    // Gather personalization data
    const personalization = await gatherPersonalizationData(supabase, user.id);

    // Build notification content
    const content = buildNotificationContent(tierConfig.tier, dormancyDays, user, personalization);

    // Send via OneSignal
    const sent = await sendOneSignalNotification(user.id, content.title, content.body, content.data);

    if (sent) {
      // Log to prevent re-sending
      await logNotificationSent(supabase, user.id, tierConfig.tier, dormancyDays, content, user.last_seen_at);
      result.notificationSent = true;
      console.log(`[send-dormant-notifications] User ${user.id}: ${tierConfig.tier} sent (${dormancyDays}d dormant)`);
    } else {
      result.error = 'OneSignal send failed';
    }
  } catch (error) {
    console.error(`[send-dormant-notifications] Error processing user ${user.id}:`, error);
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

// ============================================================================
// PREFERENCE CHECK
// ============================================================================

async function checkNotificationPreference(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('account_push')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Default to enabled if no preferences found
    return true;
  }

  return data?.account_push ?? true;
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

async function hasBeenNotifiedForTier(
  supabase: SupabaseClient,
  userId: string,
  tier: DormancyTier,
  lastSeenAt: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('dormant_notification_log')
    .select('id')
    .eq('user_id', userId)
    .eq('dormancy_tier', tier)
    .eq('last_seen_at', lastSeenAt)
    .maybeSingle();

  if (error) {
    console.error('[send-dormant-notifications] Error checking log:', error);
    return false;
  }

  return !!data;
}

// ============================================================================
// PERSONALIZATION
// ============================================================================

async function gatherPersonalizationData(
  supabase: SupabaseClient,
  userId: string
): Promise<PersonalizationData> {
  const result: PersonalizationData = {
    activeFriendName: null,
    activeCompetitionName: null,
    competitionPosition: null,
    streakWhenLeft: 0,
    friendCount: 0,
  };

  try {
    // 1. Get accepted friendships
    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .eq('status', 'accepted')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .limit(50);

    const friendIds = (friendships || []).map((f: any) =>
      f.user_id === userId ? f.friend_id : f.user_id
    );
    result.friendCount = friendIds.length;

    // 2. Find a recently active friend (active in last 24h)
    if (friendIds.length > 0) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: activeFriend } = await supabase
        .from('profiles')
        .select('full_name, username')
        .in('id', friendIds)
        .gte('last_seen_at', yesterday)
        .limit(1)
        .maybeSingle();

      if (activeFriend) {
        result.activeFriendName = activeFriend.full_name || activeFriend.username || 'A friend';
      }
    }

    // 3. Check for active competitions
    const { data: participations } = await supabase
      .from('competition_participants')
      .select('competition_id, total_points')
      .eq('user_id', userId);

    if (participations && participations.length > 0) {
      // Check which of these competitions are active
      const compIds = participations.map((p: any) => p.competition_id);
      const { data: activeComps } = await supabase
        .from('competitions')
        .select('id, name')
        .in('id', compIds)
        .eq('status', 'active')
        .limit(1);

      if (activeComps && activeComps.length > 0) {
        const comp = activeComps[0] as any;
        result.activeCompetitionName = comp.name;

        // Get their rank in that competition
        const participation = participations.find((p: any) => p.competition_id === comp.id) as any;
        if (participation) {
          const { count } = await supabase
            .from('competition_participants')
            .select('*', { count: 'exact', head: true })
            .eq('competition_id', comp.id)
            .gt('total_points', participation.total_points);
          result.competitionPosition = (count || 0) + 1;
        }
      }
    }

    // 4. Get streak when they left
    const { data: streak } = await supabase
      .from('user_streaks')
      .select('current_streak')
      .eq('user_id', userId)
      .maybeSingle();

    result.streakWhenLeft = streak?.current_streak || 0;
  } catch (error) {
    console.error(`[send-dormant-notifications] Error gathering personalization for ${userId}:`, error);
    // Return partial data — non-fatal
  }

  return result;
}

// ============================================================================
// NOTIFICATION CONTENT
// ============================================================================

function buildNotificationContent(
  tier: DormancyTier,
  _dormancyDays: number,
  user: DormantUser,
  p: PersonalizationData
): NotificationContent {
  const firstName = (user.full_name || '').split(' ')[0] || 'there';

  switch (tier) {
    case 'day_3': {
      // Light, friendly nudge
      if (p.activeFriendName) {
        return {
          title: 'Your friends are crushing it!',
          body: `${p.activeFriendName} was active today. Open the app to see how they're doing!`,
          data: { type: 'dormant_reengagement', tier, deep_link: '/(tabs)/social' },
        };
      }
      if (p.activeCompetitionName) {
        return {
          title: 'Your competition is live!',
          body: `"${p.activeCompetitionName}" is still going. You're in position #${p.competitionPosition}!`,
          data: { type: 'dormant_reengagement', tier, deep_link: '/(tabs)/compete' },
        };
      }
      return {
        title: `Hey ${firstName}, we miss you!`,
        body: 'Your rings are waiting. A quick workout is all it takes to get back on track!',
        data: { type: 'dormant_reengagement', tier, deep_link: '/(tabs)' },
      };
    }

    case 'day_7': {
      // Slightly more urgent
      if (p.activeCompetitionName) {
        return {
          title: 'Your competition misses you!',
          body: `You're #${p.competitionPosition} in "${p.activeCompetitionName}". Still time to climb the leaderboard!`,
          data: { type: 'dormant_reengagement', tier, deep_link: '/(tabs)/compete' },
        };
      }
      if (p.streakWhenLeft > 3) {
        return {
          title: 'Your streak is waiting',
          body: `You had a ${p.streakWhenLeft}-day streak going! Start fresh today and build it back even stronger.`,
          data: { type: 'dormant_reengagement', tier, deep_link: '/movement-trail' },
        };
      }
      if (p.friendCount > 0) {
        return {
          title: `Your ${p.friendCount} friends miss you`,
          body: "It's been a week! Come back and see what your friends have been up to.",
          data: { type: 'dormant_reengagement', tier, deep_link: '/(tabs)/social' },
        };
      }
      return {
        title: "It's been a week!",
        body: `A fresh start is just one workout away, ${firstName}. Let's close some rings today.`,
        data: { type: 'dormant_reengagement', tier, deep_link: '/(tabs)' },
      };
    }

    case 'day_14': {
      // Warm re-invitation, no guilt
      if (p.friendCount > 0) {
        return {
          title: `${firstName}, your friends are still here`,
          body: "It's been 2 weeks. Your friends are still moving — come join them!",
          data: { type: 'dormant_reengagement', tier, deep_link: '/(tabs)/social' },
        };
      }
      return {
        title: 'Every day is a fresh start',
        body: "It doesn't matter how long you've been away. One step, one ring, one day at a time.",
        data: { type: 'dormant_reengagement', tier, deep_link: '/(tabs)' },
      };
    }

    case 'day_30': {
      // Final gentle message
      return {
        title: 'We saved your spot',
        body: `${firstName}, your profile and friends are still here whenever you're ready. We'd love to have you back.`,
        data: { type: 'dormant_reengagement', tier, deep_link: '/(tabs)' },
      };
    }
  }
}

// ============================================================================
// TIMEZONE
// ============================================================================

function isWithinNotificationWindow(timezone: string | null): boolean {
  const tz = timezone || 'America/New_York';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(formatter.format(new Date()), 10);
    return hour >= NOTIFICATION_WINDOW.start && hour < NOTIFICATION_WINDOW.end;
  } catch {
    // Default to sending on timezone error
    return true;
  }
}

// ============================================================================
// LOGGING
// ============================================================================

async function logNotificationSent(
  supabase: SupabaseClient,
  userId: string,
  tier: DormancyTier,
  dormancyDays: number,
  content: NotificationContent,
  lastSeenAt: string
): Promise<void> {
  const { error } = await supabase
    .from('dormant_notification_log')
    .insert({
      user_id: userId,
      dormancy_tier: tier,
      dormancy_days: dormancyDays,
      title: content.title,
      body: content.body,
      data: content.data,
      last_seen_at: lastSeenAt,
    });

  if (error) {
    console.error('[send-dormant-notifications] Error logging notification:', error);
    // Don't throw — notification was already sent
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
    console.error('[send-dormant-notifications] OneSignal credentials not configured');
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
        android_channel_id: 'reengagement',
        android_accent_color: 'FFFA114F',
        small_icon: 'ic_notification',
        // TTL — 24 hours (less time-sensitive than streak warnings)
        ttl: 86400,
      }),
    });

    const result = await response.json();

    if (result.errors) {
      console.error('[send-dormant-notifications] OneSignal error:', result.errors);
      return false;
    }

    console.log(`[send-dormant-notifications] OneSignal notification sent: ${result.id}`);
    return true;
  } catch (error) {
    console.error('[send-dormant-notifications] Failed to send notification:', error);
    return false;
  }
}
