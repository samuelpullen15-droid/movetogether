// supabase/functions/update-achievements/index.ts
// Updates user achievement progress based on their activity data

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Achievement definitions with tier thresholds
const ACHIEVEMENTS = {
  // Milestone achievements
  daily_record_calories: { bronze: 500, silver: 1000, gold: 2000, platinum: 3500 },
  total_calories: { bronze: 10000, silver: 50000, gold: 250000, platinum: 1000000 },
  total_steps: { bronze: 100000, silver: 500000, gold: 2000000, platinum: 10000000 },
  total_active_minutes: { bronze: 1000, silver: 5000, gold: 20000, platinum: 100000 },

  // Consistency achievements
  daily_streak: { bronze: 7, silver: 30, gold: 100, platinum: 365 },

  // Competition achievements
  competitions_won: { bronze: 5, silver: 25, gold: 100, platinum: 500 },
  first_blood: { bronze: -1, silver: -1, gold: -1, platinum: 1 },
  competitions_created: { bronze: 3, silver: 10, gold: 25, platinum: 100 },

  // Social achievements
  unique_opponents: { bronze: 5, silver: 15, gold: 50, platinum: 100 },
};

type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

interface NewUnlock {
  achievementId: string;
  tier: Tier;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get request body
    const { userId, eventType, eventData } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[update-achievements] Processing for user ${userId}, event: ${eventType}`);

    const newUnlocks: NewUnlock[] = [];
    const now = new Date().toISOString();

    // Get existing progress
    const { data: existingProgress, error: progressError } = await supabase
      .from('user_achievement_progress')
      .select('*')
      .eq('user_id', userId);

    if (progressError) {
      console.error('[update-achievements] Error fetching existing progress:', progressError);
    }

    const progressMap = new Map(
      (existingProgress || []).map((p: any) => [p.achievement_id, p])
    );

    // Calculate achievement progress values
    const progressValues: Record<string, number> = {};

    // Fetch ALL activity data in one efficient query
    const { data: allActivityData, error: activityError } = await supabase
      .from('user_activity')
      .select('move_calories, step_count, exercise_minutes, date, workouts_completed')
      .eq('user_id', userId);

    if (activityError) {
      console.error('[update-achievements] Error fetching activity data:', activityError);
    }

    const activityRows = allActivityData || [];
    console.log(`[update-achievements] Found ${activityRows.length} activity rows for user`);

    // Calculate all metrics from historical activity data
    let maxDailyCalories = 0;
    let maxCaloriesDate = '';
    let totalCalories = 0;
    let totalSteps = 0;
    let totalActiveMinutes = 0;

    for (const row of activityRows) {
      const calories = row.move_calories || 0;
      const steps = row.step_count || 0;
      const minutes = row.exercise_minutes || 0;

      if (calories > maxDailyCalories) {
        maxDailyCalories = calories;
        maxCaloriesDate = row.date;
      }
      totalCalories += calories;
      totalSteps += steps;
      totalActiveMinutes += minutes;
    }

    progressValues.daily_record_calories = Math.round(maxDailyCalories);
    progressValues.total_calories = Math.round(totalCalories);
    progressValues.total_steps = Math.round(totalSteps);
    progressValues.total_active_minutes = Math.round(totalActiveMinutes);

    console.log(`[update-achievements] Activity stats: maxCalories=${maxDailyCalories} (${maxCaloriesDate}), totalCalories=${totalCalories}, totalSteps=${totalSteps}, totalMinutes=${totalActiveMinutes}`);

    // Track when each threshold was first crossed (for accurate unlock dates)
    // Sort activity by date ascending to find when thresholds were crossed
    const sortedActivity = [...activityRows].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Find when cumulative thresholds were crossed
    const thresholdDates: Record<string, Record<string, string>> = {
      total_calories: {},
      total_steps: {},
      total_active_minutes: {},
    };

    let runningCalories = 0;
    let runningSteps = 0;
    let runningMinutes = 0;

    const caloriesThresholds = [10000, 50000, 250000, 1000000];
    const stepsThresholds = [100000, 500000, 2000000, 10000000];
    const minutesThresholds = [1000, 5000, 20000, 100000];
    const tierNames = ['bronze', 'silver', 'gold', 'platinum'];

    for (const row of sortedActivity) {
      runningCalories += row.move_calories || 0;
      runningSteps += row.step_count || 0;
      runningMinutes += row.exercise_minutes || 0;

      // Check each threshold for calories
      for (let i = 0; i < caloriesThresholds.length; i++) {
        if (runningCalories >= caloriesThresholds[i] && !thresholdDates.total_calories[tierNames[i]]) {
          thresholdDates.total_calories[tierNames[i]] = row.date;
        }
      }

      // Check each threshold for steps
      for (let i = 0; i < stepsThresholds.length; i++) {
        if (runningSteps >= stepsThresholds[i] && !thresholdDates.total_steps[tierNames[i]]) {
          thresholdDates.total_steps[tierNames[i]] = row.date;
        }
      }

      // Check each threshold for minutes
      for (let i = 0; i < minutesThresholds.length; i++) {
        if (runningMinutes >= minutesThresholds[i] && !thresholdDates.total_active_minutes[tierNames[i]]) {
          thresholdDates.total_active_minutes[tierNames[i]] = row.date;
        }
      }
    }

    // For daily_record_calories, track which date crossed each threshold
    const dailyRecordThresholdDates: Record<string, string> = {};
    const dailyRecordThresholds = [500, 1000, 2000, 3500];

    // Find the earliest date that crossed each threshold
    for (const row of sortedActivity) {
      const calories = row.move_calories || 0;
      for (let i = 0; i < dailyRecordThresholds.length; i++) {
        if (calories >= dailyRecordThresholds[i] && !dailyRecordThresholdDates[tierNames[i]]) {
          dailyRecordThresholdDates[tierNames[i]] = row.date;
        }
      }
    }

    // Daily streak (consecutive days with workouts)
    let currentStreak = 0;
    if (activityRows.length > 0) {
      // Build set of dates with workouts
      const datesWithActivity = new Set(
        activityRows
          .filter((d: any) => d.workouts_completed && d.workouts_completed > 0)
          .map((d: any) => d.date)
      );

      console.log(`[update-achievements] Dates with workouts: ${datesWithActivity.size}`);

      // Count consecutive days from today backwards using local date formatting
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      let checkDate = new Date(todayStr + 'T12:00:00'); // Use noon to avoid timezone issues

      for (let i = 0; i < 400; i++) {
        const year = checkDate.getFullYear();
        const month = String(checkDate.getMonth() + 1).padStart(2, '0');
        const day = String(checkDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        if (datesWithActivity.has(dateStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (i === 0) {
          // If today has no activity, check if yesterday starts the streak
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }
    progressValues.daily_streak = currentStreak;

    // Competitions won - calculate directly from competition_participants + competitions
    // (user_competition_stats is an RPC function, not a table)
    const { data: userParticipations, error: participationsError } = await supabase
      .from('competition_participants')
      .select('competition_id, total_points')
      .eq('user_id', userId);

    if (participationsError) {
      console.error('[update-achievements] Error fetching user participations:', participationsError);
    }

    let competitionsWon = 0;
    const wonCompetitionIds: string[] = [];

    if (userParticipations && userParticipations.length > 0) {
      // Get all completed competitions the user participated in
      const compIds = userParticipations.map((p: any) => p.competition_id);
      const { data: completedComps } = await supabase
        .from('competitions')
        .select('id, end_date')
        .in('id', compIds)
        .eq('status', 'completed');

      if (completedComps && completedComps.length > 0) {
        const completedIds = new Set(completedComps.map((c: any) => c.id));

        // For each completed competition, check if user has the max points
        for (const comp of completedComps) {
          const { data: allParticipants } = await supabase
            .from('competition_participants')
            .select('user_id, total_points')
            .eq('competition_id', comp.id);

          if (allParticipants && allParticipants.length > 0) {
            const maxPoints = Math.max(...allParticipants.map((p: any) => Number(p.total_points) || 0));
            const userEntry = allParticipants.find((p: any) => p.user_id === userId);
            if (userEntry && (Number(userEntry.total_points) || 0) === maxPoints && maxPoints > 0) {
              competitionsWon++;
              wonCompetitionIds.push(comp.id);
            }
          }
        }

        // Track when competitions_won thresholds were crossed (by end_date)
        if (wonCompetitionIds.length > 0) {
          const wonComps = completedComps
            .filter((c: any) => wonCompetitionIds.includes(c.id))
            .sort((a: any, b: any) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime());

          const wonThresholds = [5, 25, 100, 500];
          thresholdDates.competitions_won = {};
          for (let i = 0; i < wonThresholds.length; i++) {
            if (wonComps.length >= wonThresholds[i]) {
              thresholdDates.competitions_won[tierNames[i]] = wonComps[wonThresholds[i] - 1].end_date;
            }
          }

          // first_blood: date of first win
          thresholdDates.first_blood = {};
          thresholdDates.first_blood.platinum = wonComps[0].end_date;
        }
      }
    }

    progressValues.competitions_won = competitionsWon;
    console.log(`[update-achievements] Competitions won: ${competitionsWon}`);

    // first_blood uses same value - if > 0, they've won at least one
    progressValues.first_blood = competitionsWon > 0 ? 1 : 0;

    // 7. Competitions created (with historical dates for accurate unlock timestamps)
    const { data: createdData, error: createdError } = await supabase
      .from('competitions')
      .select('id, created_at')
      .eq('creator_id', userId)
      .order('created_at', { ascending: true });

    if (createdError) {
      console.error('[update-achievements] Error fetching competitions created:', createdError);
    }
    progressValues.competitions_created = createdData?.length || 0;
    console.log(`[update-achievements] Competitions created by user: ${progressValues.competitions_created}`);

    // Track when competitions_created thresholds were crossed
    const competitionsCreatedThresholds = [3, 10, 25, 100];
    thresholdDates.competitions_created = {};
    if (createdData && createdData.length > 0) {
      for (let i = 0; i < competitionsCreatedThresholds.length; i++) {
        const threshold = competitionsCreatedThresholds[i];
        if (createdData.length >= threshold) {
          // The Nth competition's created_at is when the threshold was crossed
          const crossingRow = createdData[threshold - 1];
          if (crossingRow?.created_at) {
            thresholdDates.competitions_created[tierNames[i]] = crossingRow.created_at.split('T')[0];
          }
        }
      }
    }

    // 8. Unique opponents
    const { data: opponentsData } = await supabase
      .from('competition_participants')
      .select('competition_id, user_id')
      .neq('user_id', userId);

    // Get competitions the user participated in
    const { data: userCompetitions } = await supabase
      .from('competition_participants')
      .select('competition_id')
      .eq('user_id', userId);

    const userCompIds = new Set((userCompetitions || []).map((c: any) => c.competition_id));
    const uniqueOpponents = new Set(
      (opponentsData || [])
        .filter((p: any) => userCompIds.has(p.competition_id))
        .map((p: any) => p.user_id)
    );
    progressValues.unique_opponents = uniqueOpponents.size;

    console.log(`[update-achievements] Progress values:`, JSON.stringify(progressValues));

    // Update each achievement
    for (const [achievementId, thresholds] of Object.entries(ACHIEVEMENTS)) {
      const currentProgress = progressValues[achievementId] || 0;
      const existing = progressMap.get(achievementId);

      // Determine which tiers should be unlocked
      const tierUnlocks: Partial<Record<Tier, string>> = {};
      const tiers: Tier[] = ['bronze', 'silver', 'gold', 'platinum'];

      for (const tier of tiers) {
        const threshold = thresholds[tier];
        // Skip tiers that don't apply (threshold -1 means tier doesn't exist)
        if (threshold < 0) continue;
        const unlockField = `${tier}_unlocked_at`;
        const alreadyUnlocked = existing?.[unlockField];

        if (currentProgress >= threshold && !alreadyUnlocked) {
          // Use historical date when available, otherwise use now
          let unlockDate = now;

          if (achievementId === 'daily_record_calories' && dailyRecordThresholdDates[tier]) {
            // Use the date when the record was first achieved
            unlockDate = new Date(dailyRecordThresholdDates[tier] + 'T12:00:00Z').toISOString();
          } else if (thresholdDates[achievementId]?.[tier]) {
            // Use the date when the cumulative threshold was crossed
            unlockDate = new Date(thresholdDates[achievementId][tier] + 'T12:00:00Z').toISOString();
          }

          tierUnlocks[tier] = unlockDate;
          newUnlocks.push({ achievementId, tier });
          console.log(`[update-achievements] New unlock: ${achievementId} ${tier} (progress: ${currentProgress}, threshold: ${threshold}, date: ${unlockDate})`);
        }
      }

      // Upsert the progress
      const upsertData: any = {
        user_id: userId,
        achievement_id: achievementId,
        current_progress: currentProgress,
        updated_at: now,
      };

      // Preserve existing unlock timestamps
      if (existing) {
        if (existing.bronze_unlocked_at) upsertData.bronze_unlocked_at = existing.bronze_unlocked_at;
        if (existing.silver_unlocked_at) upsertData.silver_unlocked_at = existing.silver_unlocked_at;
        if (existing.gold_unlocked_at) upsertData.gold_unlocked_at = existing.gold_unlocked_at;
        if (existing.platinum_unlocked_at) upsertData.platinum_unlocked_at = existing.platinum_unlocked_at;
      }

      // Add any NEW unlock timestamps (these override preserved ones)
      if (tierUnlocks.bronze) upsertData.bronze_unlocked_at = tierUnlocks.bronze;
      if (tierUnlocks.silver) upsertData.silver_unlocked_at = tierUnlocks.silver;
      if (tierUnlocks.gold) upsertData.gold_unlocked_at = tierUnlocks.gold;
      if (tierUnlocks.platinum) upsertData.platinum_unlocked_at = tierUnlocks.platinum;

      // Correct already-unlocked tiers that have wrong dates (e.g., set to "now" before historical tracking was added)
      for (const tier of tiers) {
        const unlockField = `${tier}_unlocked_at`;
        const existingDate = existing?.[unlockField];
        if (!existingDate) continue;

        let historicalDate: string | undefined;
        if (achievementId === 'daily_record_calories' && dailyRecordThresholdDates[tier]) {
          historicalDate = new Date(dailyRecordThresholdDates[tier] + 'T12:00:00Z').toISOString();
        } else if (thresholdDates[achievementId]?.[tier]) {
          historicalDate = new Date(thresholdDates[achievementId][tier] + 'T12:00:00Z').toISOString();
        }

        if (historicalDate && historicalDate < existingDate) {
          upsertData[unlockField] = historicalDate;
          console.log(`[update-achievements] Correcting ${achievementId} ${tier} date: ${existingDate} -> ${historicalDate}`);
        }
      }

      // Check if any date corrections were made
      let hasDateCorrections = false;
      for (const tier of tiers) {
        const unlockField = `${tier}_unlocked_at`;
        if (existing?.[unlockField] && upsertData[unlockField] !== existing[unlockField]) {
          hasDateCorrections = true;
          break;
        }
      }

      // Only upsert if progress changed, there are new unlocks, or dates were corrected
      const shouldUpdate =
        !existing ||
        existing.current_progress !== currentProgress ||
        Object.keys(tierUnlocks).length > 0 ||
        hasDateCorrections;

      if (shouldUpdate) {
        const { error: upsertError } = await supabase
          .from('user_achievement_progress')
          .upsert(upsertData, {
            onConflict: 'user_id,achievement_id',
            ignoreDuplicates: false
          });

        if (upsertError) {
          console.error(`[update-achievements] Error upserting ${achievementId}:`, upsertError);
        } else {
          console.log(`[update-achievements] Updated ${achievementId}: progress=${currentProgress}`);
        }
      }
    }

    console.log(`[update-achievements] Complete. New unlocks: ${newUnlocks.length}`);

    // Send friend milestone notifications for new unlocks
    if (newUnlocks.length > 0) {
      await notifyFriendsOfMilestones(supabase, userId, newUnlocks);
      // Award coins for achievement unlocks
      await awardAchievementCoins(supabase, userId, newUnlocks);
    }

    return new Response(
      JSON.stringify({
        success: true,
        newUnlocks,
        progressValues,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[update-achievements] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ============================================================================
// FRIEND MILESTONE NOTIFICATIONS
// ============================================================================

const ACHIEVEMENT_DISPLAY_NAMES: Record<string, string> = {
  daily_record_calories: 'Daily Calorie Record',
  total_calories: 'Total Calories Burned',
  total_steps: 'Total Steps',
  total_active_minutes: 'Active Minutes',
  daily_streak: 'Activity Streak',
  competitions_won: 'Competitions Won',
  first_blood: 'First Win',
  competitions_created: 'Competition Creator',
  unique_opponents: 'Social Butterfly',
};

const TIER_DISPLAY_NAMES: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

const TIER_EMOJIS: Record<string, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  platinum: '💎',
};

async function notifyFriendsOfMilestones(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  newUnlocks: NewUnlock[]
): Promise<void> {
  if (newUnlocks.length === 0) return;

  try {
    // Get user's name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', userId)
      .single();

    const userName = profile?.full_name || profile?.username || 'Someone';

    // Get user's friends who have friends_push enabled
    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .eq('status', 'accepted')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (!friendships || friendships.length === 0) {
      console.log('[update-achievements] No friends to notify');
      return;
    }

    // Get friend IDs
    const friendIds = friendships.map((f: any) =>
      f.user_id === userId ? f.friend_id : f.user_id
    );

    // Filter to friends who have notifications enabled
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('user_id, friends_push')
      .in('user_id', friendIds);

    const enabledFriendIds = friendIds.filter((fid) => {
      const pref = prefs?.find((p: any) => p.user_id === fid);
      // Default to enabled if no preference record exists
      return !pref || pref.friends_push !== false;
    });

    if (enabledFriendIds.length === 0) {
      console.log('[update-achievements] No friends with notifications enabled');
      return;
    }

    // Get the highest tier unlock to feature in the notification
    const tierPriority = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
    const sortedUnlocks = [...newUnlocks].sort(
      (a, b) => tierPriority[a.tier] - tierPriority[b.tier]
    );
    const featuredUnlock = sortedUnlocks[0];

    // Build notification message
    const achievementName = ACHIEVEMENT_DISPLAY_NAMES[featuredUnlock.achievementId] || featuredUnlock.achievementId;
    const tierName = TIER_DISPLAY_NAMES[featuredUnlock.tier] || featuredUnlock.tier;
    const tierEmoji = TIER_EMOJIS[featuredUnlock.tier] || '🏅';

    let title = `${tierEmoji} Achievement Unlocked!`;
    let body = `${userName} just earned ${tierName} ${achievementName}!`;

    // Special messages for notable achievements
    if (featuredUnlock.achievementId === 'first_blood') {
      title = '🎉 First Win!';
      body = `${userName} just won their first competition!`;
    } else if (featuredUnlock.achievementId === 'competitions_won' && featuredUnlock.tier === 'platinum') {
      title = '👑 Legendary!';
      body = `${userName} has won 500 competitions! Absolute champion!`;
    } else if (featuredUnlock.achievementId === 'daily_streak' && featuredUnlock.tier === 'platinum') {
      title = '🔥 365 Day Streak!';
      body = `${userName} has been active for an entire year straight!`;
    }

    // Include additional unlocks in the message if multiple
    if (newUnlocks.length > 1) {
      body += ` (+${newUnlocks.length - 1} more)`;
    }

    // Send via OneSignal
    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.error('[update-achievements] OneSignal credentials not configured');
      return;
    }

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_aliases: {
          external_id: enabledFriendIds,
        },
        target_channel: 'push',
        headings: { en: title },
        contents: { en: body },
        data: {
          type: 'friend_achievement',
          userId,
          achievementId: featuredUnlock.achievementId,
          tier: featuredUnlock.tier,
          deep_link: `/friend-profile?id=${userId}`,
        },
      }),
    });

    const result = await response.json();

    if (result.errors) {
      console.error('[update-achievements] OneSignal notification error:', result.errors);
    } else {
      console.log(`[update-achievements] Friend notification sent to ${enabledFriendIds.length} friends, id: ${result.id}`);
    }
  } catch (error) {
    console.error('[update-achievements] Error notifying friends:', error);
    // Don't throw - achievement update succeeded, notification is best-effort
  }
}

// ============================================================================
// COIN REWARDS FOR ACHIEVEMENT UNLOCKS
// ============================================================================

const TIER_COIN_REWARDS: Record<string, number> = {
  bronze: 10,
  silver: 25,
  gold: 50,
  platinum: 100,
};

async function awardAchievementCoins(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  newUnlocks: NewUnlock[]
): Promise<void> {
  if (newUnlocks.length === 0) return;

  try {
    // Get reward amounts from config (with defaults)
    const { data: rewardConfigs } = await supabase
      .from('coin_reward_config')
      .select('event_type, earned_coins')
      .in('event_type', [
        'achievement_unlock_bronze',
        'achievement_unlock_silver',
        'achievement_unlock_gold',
        'achievement_unlock_platinum',
      ])
      .eq('is_active', true);

    const configMap = new Map<string, number>();
    for (const cfg of rewardConfigs || []) {
      // Extract tier from event_type (e.g., 'achievement_unlock_bronze' -> 'bronze')
      const tier = cfg.event_type.replace('achievement_unlock_', '');
      configMap.set(tier, cfg.earned_coins);
    }

    let totalCoinsAwarded = 0;

    for (const unlock of newUnlocks) {
      const coinsToAward = configMap.get(unlock.tier) ?? TIER_COIN_REWARDS[unlock.tier] ?? 10;

      // Check if we already awarded coins for this specific achievement+tier (idempotency)
      const referenceId = `${unlock.achievementId}_${unlock.tier}`;
      const { data: existingReward } = await supabase
        .from('coin_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('transaction_type', 'earn_achievement')
        .eq('reference_id', referenceId)
        .maybeSingle();

      if (existingReward) {
        console.log(`[update-achievements] Coins already awarded for ${referenceId}`);
        continue;
      }

      // Award the coins
      const { error: creditError } = await supabase.rpc('credit_coins', {
        p_user_id: userId,
        p_earned_amount: coinsToAward,
        p_premium_amount: 0,
        p_transaction_type: 'earn_achievement',
        p_reference_type: 'achievement',
        p_reference_id: referenceId,
        p_metadata: {
          achievement_id: unlock.achievementId,
          achievement_name: ACHIEVEMENT_DISPLAY_NAMES[unlock.achievementId] || unlock.achievementId,
          tier: unlock.tier,
          tier_display: TIER_DISPLAY_NAMES[unlock.tier] || unlock.tier,
        },
      });

      if (creditError) {
        console.error(`[update-achievements] Failed to credit coins for ${referenceId}:`, creditError);
      } else {
        totalCoinsAwarded += coinsToAward;
        console.log(`[update-achievements] Awarded ${coinsToAward} coins for ${unlock.tier} ${unlock.achievementId}`);
      }
    }

    if (totalCoinsAwarded > 0) {
      console.log(`[update-achievements] Total coins awarded: ${totalCoinsAwarded}`);
    }
  } catch (error) {
    console.error('[update-achievements] Error awarding achievement coins:', error);
    // Don't throw - achievement update succeeded, coins are best-effort
  }
}
