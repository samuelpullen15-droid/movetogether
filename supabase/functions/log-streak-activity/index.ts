import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPES
// ============================================================================

type ActivityType = 'steps' | 'workout' | 'competition_goal' | 'active_minutes' | 'rings_closed' | 'custom';

interface RequestBody {
  activity_type: ActivityType;
  activity_value: number;
  source?: string;
  // Optional: override timezone for this specific activity
  // Useful when logging historical data
  override_timezone?: string;
  // Optional: specify exact date (YYYY-MM-DD) for historical logging
  override_date?: string;
}

interface UserStreak {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  streak_started_at: string | null;
  timezone: string;
  streak_shields_available: number;
  streak_shields_used_this_week: number;
  shield_week_start: string | null;
  total_active_days: number;
}

interface StreakActivityLog {
  id: string;
  user_id: string;
  activity_date: string;
  activity_type: string;
  activity_value: number;
  qualifies_for_streak: boolean;
  source: string | null;
}

interface ProcessStreakResult {
  current_streak: number;
  longest_streak: number;
  streak_continued: boolean;
  streak_started: boolean;
  streak_broken: boolean;
  shield_used: boolean;
  shields_remaining: number;
  milestones_earned: Array<{
    milestone_id: string;
    day_number: number;
    name: string;
    description: string;
    reward_type: string;
    reward_value: Record<string, unknown>;
    icon_name: string;
    celebration_type: string;
    reward_expires_at: string | null;
  }>;
  next_milestone: {
    day_number: number;
    name: string;
    days_away: number;
  } | null;
  total_active_days: number;
}

interface LogActivityResult {
  activity_logged: boolean;
  activity_date: string;
  qualifies_for_streak: boolean;
  was_new_qualifying_activity: boolean;
  streak_processed: boolean;
  streak_status: ProcessStreakResult | null;
  error?: string;
}

// ============================================================================
// QUALIFICATION RULES
// ============================================================================

const QUALIFICATION_RULES: Record<ActivityType, (value: number) => boolean> = {
  steps: (value) => value >= 1000,
  workout: (value) => value >= 10, // 10 minutes
  competition_goal: () => true, // Always qualifies
  active_minutes: (value) => value >= 15,
  rings_closed: (value) => value >= 1, // At least 1 ring closed
  custom: () => false, // Custom activities don't qualify by default
};

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
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      console.error('[log-streak-activity] Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Service role client for database operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('[log-streak-activity] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Parse request body
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required fields
    if (!body.activity_type) {
      return new Response(
        JSON.stringify({ error: 'activity_type is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.activity_value === undefined || body.activity_value === null) {
      return new Response(
        JSON.stringify({ error: 'activity_value is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate activity_type
    const validActivityTypes: ActivityType[] = ['steps', 'workout', 'competition_goal', 'active_minutes', 'rings_closed', 'custom'];
    if (!validActivityTypes.includes(body.activity_type)) {
      return new Response(
        JSON.stringify({ error: `Invalid activity_type. Must be one of: ${validActivityTypes.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate activity_value is a positive number
    if (typeof body.activity_value !== 'number' || body.activity_value < 0) {
      return new Response(
        JSON.stringify({ error: 'activity_value must be a non-negative number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process the activity
    const result = await logActivity(
      supabaseAdmin,
      userId,
      body.activity_type,
      body.activity_value,
      body.source || 'unknown',
      body.override_timezone,
      body.override_date,
      authHeader
    );

    console.log(`[log-streak-activity] Result for ${userId}:`, JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[log-streak-activity] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// ACTIVITY LOGGING LOGIC
// ============================================================================

async function logActivity(
  supabase: SupabaseClient,
  userId: string,
  activityType: ActivityType,
  activityValue: number,
  source: string,
  overrideTimezone?: string,
  overrideDate?: string,
  authHeader?: string
): Promise<LogActivityResult> {
  // Get user's timezone from user_streaks
  const timezone = await getUserTimezone(supabase, userId, overrideTimezone);
  console.log(`[log-streak-activity] User ${userId}: timezone=${timezone}`);

  // Calculate activity date in user's timezone
  const activityDate = overrideDate || getDateInTimezone(timezone);
  console.log(`[log-streak-activity] User ${userId}: activity_date=${activityDate}`);

  // Determine if this activity qualifies for streak
  const qualificationRule = QUALIFICATION_RULES[activityType];
  const qualifiesForStreak = qualificationRule ? qualificationRule(activityValue) : false;
  console.log(`[log-streak-activity] User ${userId}: ${activityType}=${activityValue} qualifies=${qualifiesForStreak}`);

  // Check if there's already a qualifying activity for today BEFORE we upsert
  const { data: existingActivity } = await supabase
    .from('streak_activity_log')
    .select('id, qualifies_for_streak, activity_value')
    .eq('user_id', userId)
    .eq('activity_date', activityDate)
    .maybeSingle();

  const hadQualifyingActivityBefore = existingActivity?.qualifies_for_streak === true;

  // Determine final qualification status
  // If existing was qualifying, keep it qualifying (don't downgrade)
  // If new activity qualifies, upgrade to qualifying
  const finalQualifies = hadQualifyingActivityBefore || qualifiesForStreak;

  // Upsert the activity log
  // Strategy: If entry exists, update with new values (keeping best qualification status)
  // For activity_value, we could either replace or accumulate - here we replace
  // but keep the better qualification status
  const { error: upsertError } = await supabase
    .from('streak_activity_log')
    .upsert(
      {
        user_id: userId,
        activity_date: activityDate,
        activity_type: activityType,
        activity_value: activityValue,
        qualifies_for_streak: finalQualifies,
        source: source,
        created_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,activity_date',
        ignoreDuplicates: false,
      }
    );

  if (upsertError) {
    console.error('[log-streak-activity] Error upserting activity:', upsertError);
    throw new Error('Failed to log activity');
  }

  console.log(`[log-streak-activity] User ${userId}: activity logged for ${activityDate}`);

  // Determine if this is a NEW qualifying activity
  // (either no activity before, or had activity but it wasn't qualifying and now is)
  const isNewQualifyingActivity = qualifiesForStreak && !hadQualifyingActivityBefore;

  let streakStatus: ProcessStreakResult | null = null;
  let streakProcessed = false;

  // If this is a new qualifying activity, process the streak
  if (isNewQualifyingActivity) {
    console.log(`[log-streak-activity] User ${userId}: New qualifying activity, processing streak`);

    try {
      streakStatus = await processStreakInternal(supabase, userId);
      streakProcessed = true;
      console.log(`[log-streak-activity] User ${userId}: Streak processed successfully`);
    } catch (streakError) {
      console.error('[log-streak-activity] Error processing streak:', streakError);
      // Don't fail the whole request, just note the error
      return {
        activity_logged: true,
        activity_date: activityDate,
        qualifies_for_streak: finalQualifies,
        was_new_qualifying_activity: isNewQualifyingActivity,
        streak_processed: false,
        streak_status: null,
        error: 'Activity logged but streak processing failed',
      };
    }
  } else {
    // Get current streak status without processing
    streakStatus = await getCurrentStreakStatus(supabase, userId);
  }

  return {
    activity_logged: true,
    activity_date: activityDate,
    qualifies_for_streak: finalQualifies,
    was_new_qualifying_activity: isNewQualifyingActivity,
    streak_processed: streakProcessed,
    streak_status: streakStatus,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getUserTimezone(
  supabase: SupabaseClient,
  userId: string,
  override?: string
): Promise<string> {
  if (override) {
    // Validate the override timezone
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: override });
      return override;
    } catch {
      console.warn(`[log-streak-activity] Invalid override timezone: ${override}`);
    }
  }

  // Get from user_streaks
  const { data, error } = await supabase
    .from('user_streaks')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    // If no streak record, create one with default timezone
    await ensureUserStreakExists(supabase, userId);
    return 'America/New_York';
  }

  return data.timezone || 'America/New_York';
}

async function ensureUserStreakExists(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_streaks')
    .upsert(
      {
        user_id: userId,
        current_streak: 0,
        longest_streak: 0,
        timezone: 'America/New_York',
        streak_shields_available: 1,
        streak_shields_used_this_week: 0,
        total_active_days: 0,
      },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );

  if (error) {
    console.error('[log-streak-activity] Error ensuring user_streaks exists:', error);
  }
}

function getDateInTimezone(timezone: string): string {
  try {
    const now = new Date();

    // Use Intl.DateTimeFormat to get the date in the user's timezone
    // en-CA locale gives us YYYY-MM-DD format
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

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error(`[log-streak-activity] Error with timezone ${timezone}:`, error);
    // Fallback to UTC
    return new Date().toISOString().split('T')[0];
  }
}

// ============================================================================
// STREAK PROCESSING (INLINE VERSION)
// ============================================================================

// Shield limits by subscription tier
const SHIELD_LIMITS: Record<string, number> = {
  starter: 2,
  mover: 3,
  crusher: 5,
};

async function processStreakInternal(
  supabase: SupabaseClient,
  userId: string
): Promise<ProcessStreakResult> {
  // Get user streak record
  let userStreak = await getOrCreateUserStreak(supabase, userId);

  // Get user's subscription tier for shield limits
  const subscriptionTier = await getUserSubscriptionTier(supabase, userId);
  const maxShields = SHIELD_LIMITS[subscriptionTier] || SHIELD_LIMITS.starter;

  // Handle weekly shield reset
  userStreak = await handleShieldWeeklyReset(supabase, userStreak, maxShields);

  // Calculate dates in user's timezone
  const { today, yesterday } = getDatesInTimezone(userStreak.timezone);

  console.log(`[log-streak-activity] Processing streak: timezone=${userStreak.timezone}, today=${today}, yesterday=${yesterday}`);

  // Check for qualifying activity today
  const hasActivityToday = await hasQualifyingActivity(supabase, userId, today);

  if (!hasActivityToday) {
    console.log(`[log-streak-activity] No qualifying activity today`);
    const nextMilestone = await getNextMilestone(supabase, userId, userStreak.current_streak);
    return {
      current_streak: userStreak.current_streak,
      longest_streak: userStreak.longest_streak,
      streak_continued: false,
      streak_started: false,
      streak_broken: false,
      shield_used: false,
      shields_remaining: userStreak.streak_shields_available,
      milestones_earned: [],
      next_milestone: nextMilestone,
      total_active_days: userStreak.total_active_days,
    };
  }

  const lastActivityDate = userStreak.last_activity_date;

  // Already processed today
  if (lastActivityDate === today) {
    console.log(`[log-streak-activity] Already processed today`);
    const nextMilestone = await getNextMilestone(supabase, userId, userStreak.current_streak);
    return {
      current_streak: userStreak.current_streak,
      longest_streak: userStreak.longest_streak,
      streak_continued: false,
      streak_started: false,
      streak_broken: false,
      shield_used: false,
      shields_remaining: userStreak.streak_shields_available,
      milestones_earned: [],
      next_milestone: nextMilestone,
      total_active_days: userStreak.total_active_days,
    };
  }

  let streakContinued = false;
  let streakStarted = false;
  let streakBroken = false;
  let shieldUsed = false;
  let newStreak = userStreak.current_streak;
  let longestStreak = userStreak.longest_streak;
  let streakStartedAt = userStreak.streak_started_at;
  let shieldsAvailable = userStreak.streak_shields_available;
  let shieldsUsedThisWeek = userStreak.streak_shields_used_this_week;
  let totalActiveDays = userStreak.total_active_days + 1;

  if (!lastActivityDate) {
    // First ever activity
    newStreak = 1;
    streakStartedAt = new Date().toISOString();
    streakStarted = true;
  } else if (lastActivityDate === yesterday) {
    // Consecutive day
    newStreak = userStreak.current_streak + 1;
    streakContinued = true;
  } else {
    // Gap in activity
    const daysSinceLastActivity = calculateDaysBetween(lastActivityDate, today);

    if (daysSinceLastActivity === 2 && shieldsAvailable > 0) {
      // Use shield
      newStreak = userStreak.current_streak + 1;
      shieldsAvailable -= 1;
      shieldsUsedThisWeek += 1;
      shieldUsed = true;
      streakContinued = true;
    } else {
      // Reset streak
      newStreak = 1;
      streakStartedAt = new Date().toISOString();
      streakBroken = true;
    }
  }

  // Update longest streak
  if (newStreak > longestStreak) {
    longestStreak = newStreak;
  }

  // Update database
  const { error: updateError } = await supabase
    .from('user_streaks')
    .update({
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_activity_date: today,
      streak_started_at: streakStartedAt,
      streak_shields_available: shieldsAvailable,
      streak_shields_used_this_week: shieldsUsedThisWeek,
      total_active_days: totalActiveDays,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('[log-streak-activity] Error updating user_streaks:', updateError);
    throw new Error('Failed to update streak');
  }

  // Check for milestones
  const milestonesEarned = await checkAndAwardMilestones(supabase, userId, newStreak);

  // Get next milestone
  const nextMilestone = await getNextMilestone(supabase, userId, newStreak);

  return {
    current_streak: newStreak,
    longest_streak: longestStreak,
    streak_continued: streakContinued,
    streak_started: streakStarted,
    streak_broken: streakBroken,
    shield_used: shieldUsed,
    shields_remaining: shieldsAvailable,
    milestones_earned: milestonesEarned,
    next_milestone: nextMilestone,
    total_active_days: totalActiveDays,
  };
}

async function getCurrentStreakStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<ProcessStreakResult> {
  const userStreak = await getOrCreateUserStreak(supabase, userId);
  const nextMilestone = await getNextMilestone(supabase, userId, userStreak.current_streak);

  return {
    current_streak: userStreak.current_streak,
    longest_streak: userStreak.longest_streak,
    streak_continued: false,
    streak_started: false,
    streak_broken: false,
    shield_used: false,
    shields_remaining: userStreak.streak_shields_available,
    milestones_earned: [],
    next_milestone: nextMilestone,
    total_active_days: userStreak.total_active_days,
  };
}

async function getOrCreateUserStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<UserStreak> {
  const { data: existing, error: fetchError } = await supabase
    .from('user_streaks')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('[log-streak-activity] Error fetching user_streaks:', fetchError);
    throw new Error('Failed to fetch user streak');
  }

  if (existing) {
    return existing as UserStreak;
  }

  const { data: newRecord, error: insertError } = await supabase
    .from('user_streaks')
    .insert({
      user_id: userId,
      current_streak: 0,
      longest_streak: 0,
      timezone: 'America/New_York',
      streak_shields_available: 1,
      streak_shields_used_this_week: 0,
      total_active_days: 0,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[log-streak-activity] Error creating user_streaks:', insertError);
    throw new Error('Failed to create user streak');
  }

  return newRecord as UserStreak;
}

async function getUserSubscriptionTier(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[log-streak-activity] Error fetching subscription tier:', error);
    return 'starter';
  }

  return data?.subscription_tier || 'starter';
}

async function handleShieldWeeklyReset(
  supabase: SupabaseClient,
  userStreak: UserStreak,
  maxShields: number
): Promise<UserStreak> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  if (!userStreak.shield_week_start) {
    const { error } = await supabase
      .from('user_streaks')
      .update({
        shield_week_start: todayStr,
        streak_shields_used_this_week: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userStreak.user_id);

    if (!error) {
      userStreak.shield_week_start = todayStr;
      userStreak.streak_shields_used_this_week = 0;
    }
    return userStreak;
  }

  const weekStart = new Date(userStreak.shield_week_start);
  const daysSinceWeekStart = Math.floor(
    (today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceWeekStart >= 7) {
    const newShieldsAvailable = Math.min(userStreak.streak_shields_available + 1, maxShields);

    const { error } = await supabase
      .from('user_streaks')
      .update({
        shield_week_start: todayStr,
        streak_shields_used_this_week: 0,
        streak_shields_available: newShieldsAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userStreak.user_id);

    if (!error) {
      userStreak.shield_week_start = todayStr;
      userStreak.streak_shields_used_this_week = 0;
      userStreak.streak_shields_available = newShieldsAvailable;
    }
  }

  return userStreak;
}

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
    console.error(`[log-streak-activity] Invalid timezone ${timezone}, falling back to UTC`);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return { today, yesterday };
  }
}

function calculateDaysBetween(dateStr1: string, dateStr2: string): number {
  const date1 = new Date(dateStr1);
  const date2 = new Date(dateStr2);
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

async function hasQualifyingActivity(
  supabase: SupabaseClient,
  userId: string,
  activityDate: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('streak_activity_log')
    .select('id')
    .eq('user_id', userId)
    .eq('activity_date', activityDate)
    .eq('qualifies_for_streak', true)
    .maybeSingle();

  if (error) {
    console.error('[log-streak-activity] Error checking activity:', error);
    return false;
  }

  return !!data;
}

async function checkAndAwardMilestones(
  supabase: SupabaseClient,
  userId: string,
  currentStreak: number
): Promise<Array<{
  milestone_id: string;
  day_number: number;
  name: string;
  description: string;
  reward_type: string;
  reward_value: Record<string, unknown>;
  icon_name: string;
  celebration_type: string;
  reward_expires_at: string | null;
}>> {
  const milestonesEarned: Array<{
    milestone_id: string;
    day_number: number;
    name: string;
    description: string;
    reward_type: string;
    reward_value: Record<string, unknown>;
    icon_name: string;
    celebration_type: string;
    reward_expires_at: string | null;
  }> = [];

  const { data: milestones, error: milestonesError } = await supabase
    .from('streak_milestones')
    .select('*')
    .lte('day_number', currentStreak)
    .order('day_number', { ascending: true });

  if (milestonesError || !milestones) {
    console.error('[log-streak-activity] Error fetching milestones:', milestonesError);
    return [];
  }

  const today = new Date().toISOString().split('T')[0];

  for (const milestone of milestones) {
    let shouldEarn = false;

    if (milestone.is_repeatable && milestone.repeat_interval) {
      if (currentStreak >= milestone.day_number) {
        const daysAfterInitial = currentStreak - milestone.day_number;
        if (daysAfterInitial % milestone.repeat_interval === 0) {
          const { data: existingToday } = await supabase
            .from('user_milestone_progress')
            .select('id')
            .eq('user_id', userId)
            .eq('milestone_id', milestone.id)
            .gte('earned_at', `${today}T00:00:00Z`)
            .lte('earned_at', `${today}T23:59:59Z`)
            .maybeSingle();

          shouldEarn = !existingToday;
        }
      }
    } else {
      if (currentStreak === milestone.day_number) {
        const { data: existing } = await supabase
          .from('user_milestone_progress')
          .select('id')
          .eq('user_id', userId)
          .eq('milestone_id', milestone.id)
          .maybeSingle();

        shouldEarn = !existing;
      }
    }

    if (shouldEarn) {
      let rewardExpiresAt: string | null = null;
      const rewardValue = milestone.reward_value as Record<string, unknown>;

      if (['trial_mover', 'trial_coach', 'trial_crusher'].includes(milestone.reward_type)) {
        const trialDays = (rewardValue.trial_days as number) || 1;
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + trialDays);
        rewardExpiresAt = expirationDate.toISOString();
      }

      const { error: insertError } = await supabase
        .from('user_milestone_progress')
        .insert({
          user_id: userId,
          milestone_id: milestone.id,
          earned_at: new Date().toISOString(),
          reward_claimed: false,
          reward_expires_at: rewardExpiresAt,
        });

      if (insertError) {
        console.error(`[log-streak-activity] Error awarding milestone ${milestone.id}:`, insertError);
        continue;
      }

      milestonesEarned.push({
        milestone_id: milestone.id,
        day_number: milestone.day_number,
        name: milestone.name,
        description: milestone.description,
        reward_type: milestone.reward_type,
        reward_value: milestone.reward_value,
        icon_name: milestone.icon_name,
        celebration_type: milestone.celebration_type,
        reward_expires_at: rewardExpiresAt,
      });
    }
  }

  return milestonesEarned;
}

async function getNextMilestone(
  supabase: SupabaseClient,
  userId: string,
  currentStreak: number
): Promise<{ day_number: number; name: string; days_away: number } | null> {
  const { data: allMilestones, error: milestonesError } = await supabase
    .from('streak_milestones')
    .select('*')
    .gt('day_number', currentStreak)
    .order('day_number', { ascending: true });

  if (milestonesError || !allMilestones || allMilestones.length === 0) {
    const { data: repeatableMilestones } = await supabase
      .from('streak_milestones')
      .select('*')
      .eq('is_repeatable', true)
      .order('day_number', { ascending: true })
      .limit(1);

    if (repeatableMilestones && repeatableMilestones.length > 0) {
      const milestone = repeatableMilestones[0];
      if (currentStreak >= milestone.day_number && milestone.repeat_interval) {
        const daysAfterInitial = currentStreak - milestone.day_number;
        const completedRepeats = Math.floor(daysAfterInitial / milestone.repeat_interval);
        const nextOccurrence = milestone.day_number + (completedRepeats + 1) * milestone.repeat_interval;
        return {
          day_number: nextOccurrence,
          name: milestone.name,
          days_away: nextOccurrence - currentStreak,
        };
      }
    }
    return null;
  }

  for (const milestone of allMilestones) {
    if (!milestone.is_repeatable) {
      const { data: existing } = await supabase
        .from('user_milestone_progress')
        .select('id')
        .eq('user_id', userId)
        .eq('milestone_id', milestone.id)
        .maybeSingle();

      if (!existing) {
        return {
          day_number: milestone.day_number,
          name: milestone.name,
          days_away: milestone.day_number - currentStreak,
        };
      }
    } else {
      return {
        day_number: milestone.day_number,
        name: milestone.name,
        days_away: milestone.day_number - currentStreak,
      };
    }
  }

  return null;
}
