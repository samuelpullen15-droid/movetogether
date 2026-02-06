import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPES
// ============================================================================

type StreakRewardType =
  | 'badge'
  | 'trial_mover'
  | 'trial_coach'
  | 'trial_crusher'
  | 'profile_frame'
  | 'leaderboard_flair'
  | 'app_icon'
  | 'points_multiplier'
  | 'custom';

interface StreakMilestone {
  id: string;
  day_number: number;
  name: string;
  description: string;
  reward_type: StreakRewardType;
  reward_value: Record<string, unknown>;
  icon_name: string;
  celebration_type: string;
  is_repeatable: boolean;
  repeat_interval: number | null;
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
  source: string;
}

interface MilestoneEarned {
  milestone_id: string;
  day_number: number;
  name: string;
  description: string;
  reward_type: StreakRewardType;
  reward_value: Record<string, unknown>;
  icon_name: string;
  celebration_type: string;
  reward_expires_at: string | null;
}

interface ProcessStreakResult {
  current_streak: number;
  longest_streak: number;
  streak_continued: boolean;
  streak_started: boolean;
  streak_broken: boolean;
  shield_used: boolean;
  shields_remaining: number;
  milestones_earned: MilestoneEarned[];
  next_milestone: {
    day_number: number;
    name: string;
    days_away: number;
  } | null;
  total_active_days: number;
}

interface RequestBody {
  user_id?: string; // For service role/cron calls
}

// Shield limits by subscription tier
const SHIELD_LIMITS: Record<string, number> = {
  starter: 2,
  mover: 3,
  crusher: 5,
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
      console.error('Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Service role client for database operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body
    let body: RequestBody = {};
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      // Empty body is OK for authenticated user requests
    }

    let userId: string;

    // Check for service role authorization (for cron jobs)
    const authHeader = req.headers.get('Authorization');
    const isServiceRole = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

    if (isServiceRole && body.user_id) {
      // Service role can process any user (for cron jobs)
      userId = body.user_id;
      console.log(`[process-daily-streak] Service role processing user: ${userId}`);
    } else if (authHeader) {
      // Authenticated user request
      const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        console.error('Auth error:', authError);
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
      console.log(`[process-daily-streak] Authenticated user: ${userId}`);
    } else {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process the streak
    const result = await processUserStreak(supabaseAdmin, userId);

    console.log(`[process-daily-streak] Result for ${userId}:`, JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[process-daily-streak] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// STREAK PROCESSING LOGIC
// ============================================================================

async function processUserStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<ProcessStreakResult> {
  // Get or create user streak record
  let userStreak = await getOrCreateUserStreak(supabase, userId);

  // Get user's subscription tier for shield limits
  const subscriptionTier = await getUserSubscriptionTier(supabase, userId);
  const maxShields = SHIELD_LIMITS[subscriptionTier] || SHIELD_LIMITS.starter;

  // Handle weekly shield reset
  userStreak = await handleShieldWeeklyReset(supabase, userStreak, maxShields);

  // Calculate dates in user's timezone
  const { today, yesterday } = getDatesInTimezone(userStreak.timezone);

  console.log(`[process-daily-streak] User ${userId}: timezone=${userStreak.timezone}, today=${today}, yesterday=${yesterday}`);

  // Check for qualifying activity today
  const hasActivityToday = await hasQualifyingActivity(supabase, userId, today);

  if (!hasActivityToday) {
    console.log(`[process-daily-streak] User ${userId}: No qualifying activity today`);
    // No activity today - return current state without changes
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
    console.log(`[process-daily-streak] User ${userId}: Already processed today`);
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
  let totalActiveDays = userStreak.total_active_days + 1; // Increment active days

  if (!lastActivityDate) {
    // First ever activity - start streak at 1
    newStreak = 1;
    streakStartedAt = new Date().toISOString();
    streakStarted = true;
    console.log(`[process-daily-streak] User ${userId}: First activity, starting streak at 1`);
  } else if (lastActivityDate === yesterday) {
    // Consecutive day - increment streak
    newStreak = userStreak.current_streak + 1;
    streakContinued = true;
    console.log(`[process-daily-streak] User ${userId}: Consecutive day, streak now ${newStreak}`);
  } else {
    // Gap in activity - check if we can use a shield
    const daysSinceLastActivity = calculateDaysBetween(lastActivityDate, today);
    console.log(`[process-daily-streak] User ${userId}: Gap of ${daysSinceLastActivity} days since last activity`);

    if (daysSinceLastActivity === 2 && shieldsAvailable > 0) {
      // Gap is exactly 1 day (missed yesterday), can use shield
      newStreak = userStreak.current_streak + 1; // Continue as if no gap
      shieldsAvailable -= 1;
      shieldsUsedThisWeek += 1;
      shieldUsed = true;
      streakContinued = true;
      console.log(`[process-daily-streak] User ${userId}: Shield used! Streak continues at ${newStreak}`);
    } else {
      // Gap too large or no shields - reset streak
      newStreak = 1;
      streakStartedAt = new Date().toISOString();
      streakBroken = true;
      console.log(`[process-daily-streak] User ${userId}: Streak broken, resetting to 1`);
    }
  }

  // Update longest streak if needed
  if (newStreak > longestStreak) {
    longestStreak = newStreak;
    console.log(`[process-daily-streak] User ${userId}: New longest streak: ${longestStreak}`);
  }

  // Update user_streaks record
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
    console.error(`[process-daily-streak] Error updating user_streaks:`, updateError);
    throw new Error('Failed to update streak');
  }

  // Check for newly earned milestones
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getOrCreateUserStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<UserStreak> {
  // Try to get existing record
  const { data: existing, error: fetchError } = await supabase
    .from('user_streaks')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('[process-daily-streak] Error fetching user_streaks:', fetchError);
    throw new Error('Failed to fetch user streak');
  }

  if (existing) {
    return existing as UserStreak;
  }

  // Create new record
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
    console.error('[process-daily-streak] Error creating user_streaks:', insertError);
    throw new Error('Failed to create user streak');
  }

  console.log(`[process-daily-streak] Created new user_streaks record for ${userId}`);
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
    console.error('[process-daily-streak] Error fetching subscription tier:', error);
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

  // If no shield_week_start set, initialize it
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

  // Check if week has elapsed (7 days)
  const weekStart = new Date(userStreak.shield_week_start);
  const daysSinceWeekStart = Math.floor(
    (today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceWeekStart >= 7) {
    // Reset weekly shields and grant one new shield (up to max)
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
      console.log(`[process-daily-streak] Weekly shield reset for ${userStreak.user_id}: shields=${newShieldsAvailable}`);
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

    // Format date in user's timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const todayParts = formatter.formatToParts(now);
    const today = `${todayParts.find(p => p.type === 'year')?.value}-${todayParts.find(p => p.type === 'month')?.value}-${todayParts.find(p => p.type === 'day')?.value}`;

    // Yesterday
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayParts = formatter.formatToParts(yesterdayDate);
    const yesterday = `${yesterdayParts.find(p => p.type === 'year')?.value}-${yesterdayParts.find(p => p.type === 'month')?.value}-${yesterdayParts.find(p => p.type === 'day')?.value}`;

    return { today, yesterday };
  } catch (error) {
    console.error(`[process-daily-streak] Invalid timezone ${timezone}, falling back to UTC`);
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
    console.error('[process-daily-streak] Error checking activity:', error);
    return false;
  }

  return !!data;
}

async function checkAndAwardMilestones(
  supabase: SupabaseClient,
  userId: string,
  currentStreak: number
): Promise<MilestoneEarned[]> {
  const milestonesEarned: MilestoneEarned[] = [];

  // Get all milestones that could be earned at this streak level
  const { data: milestones, error: milestonesError } = await supabase
    .from('streak_milestones')
    .select('*')
    .lte('day_number', currentStreak)
    .order('day_number', { ascending: true });

  if (milestonesError || !milestones) {
    console.error('[process-daily-streak] Error fetching milestones:', milestonesError);
    return [];
  }

  const today = new Date().toISOString().split('T')[0];

  for (const milestone of milestones as StreakMilestone[]) {
    // Check if user should earn this milestone
    let shouldEarn = false;

    if (milestone.is_repeatable && milestone.repeat_interval) {
      // For repeatable milestones (e.g., every 100 days after 365)
      // Check if current streak matches milestone pattern
      if (currentStreak >= milestone.day_number) {
        const daysAfterInitial = currentStreak - milestone.day_number;
        if (daysAfterInitial % milestone.repeat_interval === 0) {
          // Check if already earned today
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
      // Non-repeatable milestone - check if day_number matches exactly and not already earned
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
      // Calculate reward expiration for trial rewards
      let rewardExpiresAt: string | null = null;
      const rewardValue = milestone.reward_value as Record<string, unknown>;

      if (['trial_mover', 'trial_coach', 'trial_crusher'].includes(milestone.reward_type)) {
        const trialDays = (rewardValue.trial_days as number) || 1;
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + trialDays);
        rewardExpiresAt = expirationDate.toISOString();
      }

      // Insert milestone progress
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
        console.error(`[process-daily-streak] Error awarding milestone ${milestone.id}:`, insertError);
        continue;
      }

      console.log(`[process-daily-streak] User ${userId} earned milestone: ${milestone.name} (day ${milestone.day_number})`);

      // Award coins for streak milestone
      await awardStreakMilestoneCoins(supabase, userId, milestone);

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
  // Get all milestones user hasn't earned yet
  const { data: allMilestones, error: milestonesError } = await supabase
    .from('streak_milestones')
    .select('*')
    .gt('day_number', currentStreak)
    .order('day_number', { ascending: true });

  if (milestonesError || !allMilestones || allMilestones.length === 0) {
    // Check for repeatable milestones if no regular ones left
    const { data: repeatableMilestones } = await supabase
      .from('streak_milestones')
      .select('*')
      .eq('is_repeatable', true)
      .order('day_number', { ascending: true })
      .limit(1);

    if (repeatableMilestones && repeatableMilestones.length > 0) {
      const milestone = repeatableMilestones[0] as StreakMilestone;
      // Calculate next occurrence
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

  // Find next unearned milestone
  for (const milestone of allMilestones as StreakMilestone[]) {
    if (!milestone.is_repeatable) {
      // Check if already earned
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
      // Repeatable milestone - always show as next if eligible
      return {
        day_number: milestone.day_number,
        name: milestone.name,
        days_away: milestone.day_number - currentStreak,
      };
    }
  }

  return null;
}

// ============================================================================
// COIN REWARDS FOR STREAK MILESTONES
// ============================================================================

// Default coin rewards for streak milestones (can be overridden in coin_reward_config)
const DEFAULT_STREAK_COIN_REWARDS: Record<number, number> = {
  7: 25,    // 7-day milestone
  14: 50,   // 2-week milestone
  30: 100,  // 30-day milestone
  60: 150,  // 60-day milestone
  90: 200,  // 90-day milestone
  180: 300, // 6-month milestone
  365: 500, // 1-year milestone
};

async function awardStreakMilestoneCoins(
  supabase: SupabaseClient,
  userId: string,
  milestone: StreakMilestone
): Promise<void> {
  try {
    const referenceId = `streak_${milestone.id}`;

    // Check if we already awarded coins for this milestone (idempotency)
    const { data: existingReward } = await supabase
      .from('coin_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('transaction_type', 'earn_streak_milestone')
      .eq('reference_id', referenceId)
      .maybeSingle();

    if (existingReward) {
      console.log(`[process-daily-streak] Coins already awarded for milestone ${milestone.name}`);
      return;
    }

    // Try to get reward amount from config
    const { data: rewardConfig } = await supabase
      .from('coin_reward_config')
      .select('earned_coins')
      .eq('event_type', `streak_milestone_${milestone.day_number}`)
      .eq('is_active', true)
      .maybeSingle();

    // Use config value, or default, or fallback to scaled amount
    let coinsToAward = rewardConfig?.earned_coins;
    if (coinsToAward === undefined || coinsToAward === null) {
      coinsToAward = DEFAULT_STREAK_COIN_REWARDS[milestone.day_number];
    }
    if (coinsToAward === undefined || coinsToAward === null) {
      // Fallback: scale coins based on day number (min 10, increases with day)
      coinsToAward = Math.max(10, Math.floor(milestone.day_number / 7) * 25);
    }

    // Award the coins
    const { error: creditError } = await supabase.rpc('credit_coins', {
      p_user_id: userId,
      p_earned_amount: coinsToAward,
      p_premium_amount: 0,
      p_transaction_type: 'earn_streak_milestone',
      p_reference_type: 'streak_milestone',
      p_reference_id: referenceId,
      p_metadata: {
        milestone_id: milestone.id,
        milestone_name: milestone.name,
        day_number: milestone.day_number,
        description: milestone.description,
      },
    });

    if (creditError) {
      console.error(`[process-daily-streak] Failed to credit coins for milestone ${milestone.name}:`, creditError);
    } else {
      console.log(`[process-daily-streak] Awarded ${coinsToAward} coins for streak milestone: ${milestone.name} (day ${milestone.day_number})`);
    }
  } catch (error) {
    console.error(`[process-daily-streak] Error awarding milestone coins:`, error);
    // Don't throw - milestone was awarded, coins are best-effort
  }
}
