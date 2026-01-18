// supabase/functions/update-achievements/index.ts
// Edge Function to calculate and update achievement progress after relevant events

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Achievement definitions with thresholds
const ACHIEVEMENT_THRESHOLDS = {
  competitions_won: { bronze: 5, silver: 25, gold: 100, platinum: 500 },
  win_streak: { bronze: 2, silver: 5, gold: 10, platinum: 25 },
  first_blood: { bronze: 1, silver: 1, gold: 1, platinum: 1 },
  underdog: { bronze: 1, silver: 5, gold: 15, platinum: 50 },
  photo_finish: { bronze: 1, silver: 5, gold: 15, platinum: 50 },
  dominant_victory: { bronze: 1, silver: 10, gold: 25, platinum: 100 },
  comeback_king: { bronze: 1, silver: 5, gold: 20, platinum: 50 },
  daily_streak: { bronze: 7, silver: 30, gold: 100, platinum: 365 },
  early_bird: { bronze: 7, silver: 30, gold: 100, platinum: 365 },
  night_owl: { bronze: 7, silver: 30, gold: 100, platinum: 365 },
  weekend_warrior: { bronze: 4, silver: 12, gold: 52, platinum: 104 },
  perfect_week: { bronze: 1, silver: 10, gold: 52, platinum: 100 },
  total_calories: { bronze: 10000, silver: 50000, gold: 250000, platinum: 1000000 },
  total_steps: { bronze: 100000, silver: 500000, gold: 2000000, platinum: 10000000 },
  total_active_minutes: { bronze: 1000, silver: 5000, gold: 20000, platinum: 100000 },
  total_workouts: { bronze: 25, silver: 100, gold: 500, platinum: 2000 },
  daily_record_calories: { bronze: 500, silver: 1000, gold: 2000, platinum: 3500 },
  unique_opponents: { bronze: 5, silver: 15, gold: 50, platinum: 100 },
  rivalry: { bronze: 3, silver: 5, gold: 10, platinum: 25 },
  competitions_created: { bronze: 3, silver: 10, gold: 25, platinum: 100 },
  invites_sent: { bronze: 3, silver: 10, gold: 25, platinum: 50 },
  group_competitions: { bronze: 5, silver: 20, gold: 50, platinum: 100 },
  dynasty: { bronze: 1, silver: 3, gold: 10, platinum: 25 },
};

const ACHIEVEMENT_NAMES: Record<string, string> = {
  competitions_won: 'Champion',
  win_streak: 'Unstoppable',
  first_blood: 'First Blood',
  underdog: 'Underdog',
  photo_finish: 'Photo Finish',
  dominant_victory: 'Dominant',
  daily_streak: 'Iron Will',
  early_bird: 'Early Bird',
  night_owl: 'Night Owl',
  weekend_warrior: 'Weekend Warrior',
  total_calories: 'Furnace',
  total_steps: 'Wanderer',
  total_active_minutes: 'Time Lord',
  daily_record_calories: 'Inferno',
  unique_opponents: 'Social Butterfly',
  rivalry: 'Rival',
  competitions_created: 'Organizer',
  invites_sent: 'Recruiter',
  group_competitions: 'Party Animal',
};

function getAchievementName(id: string): string {
  return ACHIEVEMENT_NAMES[id] || id;
}

interface UpdateRequest {
  userId: string;
  eventType: 'competition_completed' | 'activity_logged' | 'daily_sync' | 'manual';
  eventData?: Record<string, any>;
}

interface AchievementUpdate {
  achievementId: string;
  newProgress: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'No authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Extract token
  const token = authHeader.replace('Bearer ', '');

  // Check if it's the service role key by decoding the JWT
  let isServiceRole = false;
  let jwtRole = 'unknown';
  try {
    // Decode JWT payload (base64)
    const payloadBase64 = token.split('.')[1];
    if (payloadBase64) {
      const payload = JSON.parse(atob(payloadBase64));
      jwtRole = payload.role || 'no-role';
      isServiceRole = payload.role === 'service_role';
      console.log('Auth check:', { isServiceRole, role: payload.role, sub: payload.sub });
    }
  } catch (e) {
    console.log('JWT decode failed:', e);
  }

  // If not service role, we need to verify the user JWT is valid
  if (!isServiceRole) {
    console.log('User JWT detected, verifying...', { jwtRole });
  }

  let userId: string | null = null;

  if (!isServiceRole) {
    // Verify user JWT
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    userId = user.id;
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { userId: inputUserId, eventType, eventData } = (await req.json()) as UpdateRequest;

    if (!inputUserId) {
      throw new Error('userId is required');
    }

    // If authenticated via user JWT, verify they can only update their own achievements
    if (userId && inputUserId !== userId) {
      return new Response(
        JSON.stringify({ error: 'Cannot update achievements for another user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const updates: AchievementUpdate[] = [];
    const newUnlocks: { achievementId: string; tier: string }[] = [];

    // Calculate progress based on event type
    switch (eventType) {
      case 'competition_completed':
        await calculateCompetitionAchievements(supabaseClient, inputUserId, eventData, updates);
        break;

      case 'activity_logged':
        await calculateActivityAchievements(supabaseClient, inputUserId, eventData, updates);
        break;

      case 'daily_sync':
        await calculateAllAchievements(supabaseClient, inputUserId, updates);
        break;

      case 'manual':
        // Allow specific achievement updates for testing/admin
        if (eventData?.achievementId && eventData?.progress !== undefined) {
          updates.push({
            achievementId: eventData.achievementId,
            newProgress: eventData.progress,
          });
        }
        break;
    }

    // Apply all updates
    for (const update of updates) {
      const thresholds = ACHIEVEMENT_THRESHOLDS[update.achievementId as keyof typeof ACHIEVEMENT_THRESHOLDS];
      if (!thresholds) continue;

      const { data, error } = await supabaseClient.rpc('update_achievement_progress', {
        p_user_id: inputUserId,
        p_achievement_id: update.achievementId,
        p_new_progress: update.newProgress,
        p_bronze_threshold: thresholds.bronze,
        p_silver_threshold: thresholds.silver,
        p_gold_threshold: thresholds.gold,
        p_platinum_threshold: thresholds.platinum,
      });

      if (error) {
        console.error(`Error updating ${update.achievementId}:`, error);
        continue;
      }

      // Check for new unlocks
      if (data?.[0]?.newly_unlocked_tier) {
        newUnlocks.push({
          achievementId: update.achievementId,
          tier: data[0].newly_unlocked_tier,
        });

        // Create activity for achievement unlock
        try {
          const achievementName = getAchievementName(update.achievementId);
          
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/create-activity`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              userId: inputUserId,
              activityType: 'achievement_unlocked',
              metadata: {
                achievementId: update.achievementId,
                achievementName,
                tier: data[0].newly_unlocked_tier,
              },
            }),
          });

          // Send push notification for achievement unlock
          try {
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                type: 'achievement_unlocked',
                recipientUserId: inputUserId,
                data: {
                  achievementId: update.achievementId,
                  achievementName,
                  tier: data[0].newly_unlocked_tier,
                },
              }),
            });
          } catch (e) {
            console.error('Failed to send achievement notification:', e);
          }
        } catch (e) {
          console.error('Failed to create achievement activity:', e);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        updatesApplied: updates.length,
        newUnlocks,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in update-achievements:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENT CALCULATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function calculateCompetitionAchievements(
  supabase: any,
  userId: string,
  eventData: any,
  updates: AchievementUpdate[]
) {
  // Get competition stats
  const { data: stats } = await supabase
    .from('competition_results')
    .select('*')
    .eq('user_id', userId);

  if (!stats) return;

  const wins = stats.filter((s: any) => s.rank === 1);
  const totalWins = wins.length;

  // competitions_won
  updates.push({ achievementId: 'competitions_won', newProgress: totalWins });

  // first_blood (first win)
  if (totalWins >= 1) {
    updates.push({ achievementId: 'first_blood', newProgress: 1 });
  }

  // Calculate win streak
  const sortedResults = stats.sort(
    (a: any, b: any) => new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime()
  );
  
  let currentStreak = 0;
  let maxStreak = 0;
  
  for (const result of sortedResults) {
    if (result.rank === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  updates.push({ achievementId: 'win_streak', newProgress: maxStreak });

  // Check for special wins in event data
  if (eventData) {
    if (eventData.wasUnderdog) {
      const { data: underdogCount } = await supabase
        .from('competition_results')
        .select('id')
        .eq('user_id', userId)
        .eq('was_underdog_win', true);
      
      updates.push({ 
        achievementId: 'underdog', 
        newProgress: underdogCount?.length || 1 
      });
    }

    if (eventData.marginPercent !== undefined && eventData.marginPercent < 1) {
      const { data: photoFinishCount } = await supabase
        .from('competition_results')
        .select('id')
        .eq('user_id', userId)
        .lt('win_margin_percent', 1);
      
      updates.push({ 
        achievementId: 'photo_finish', 
        newProgress: photoFinishCount?.length || 1 
      });
    }

    if (eventData.marginPercent !== undefined && eventData.marginPercent > 50) {
      const { data: dominantCount } = await supabase
        .from('competition_results')
        .select('id')
        .eq('user_id', userId)
        .gt('win_margin_percent', 50);
      
      updates.push({ 
        achievementId: 'dominant_victory', 
        newProgress: dominantCount?.length || 1 
      });
    }
  }

  // unique_opponents
  const { data: opponents } = await supabase
    .from('competition_participants')
    .select('opponent_id')
    .eq('user_id', userId);
  
  const uniqueOpponents = new Set(opponents?.map((o: any) => o.opponent_id) || []);
  updates.push({ achievementId: 'unique_opponents', newProgress: uniqueOpponents.size });

  // group_competitions (4+ participants)
  const { data: groupComps } = await supabase
    .from('competition_results')
    .select('competition_id')
    .eq('user_id', userId)
    .gte('participant_count', 4);
  
  updates.push({ achievementId: 'group_competitions', newProgress: groupComps?.length || 0 });

  // competitions_created
  const { data: created } = await supabase
    .from('competitions')
    .select('id')
    .eq('created_by', userId);
  
  updates.push({ achievementId: 'competitions_created', newProgress: created?.length || 0 });
}

async function calculateActivityAchievements(
  supabase: any,
  userId: string,
  eventData: any,
  updates: AchievementUpdate[]
) {
  // Get activity aggregates
  const { data: aggregates } = await supabase
    .from('user_activity_aggregates')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (aggregates) {
    updates.push({ achievementId: 'total_calories', newProgress: aggregates.total_calories || 0 });
    updates.push({ achievementId: 'total_steps', newProgress: aggregates.total_steps || 0 });
    updates.push({ achievementId: 'total_active_minutes', newProgress: aggregates.total_active_minutes || 0 });
    updates.push({ achievementId: 'total_workouts', newProgress: aggregates.total_workouts || 0 });
    updates.push({ achievementId: 'daily_record_calories', newProgress: aggregates.max_daily_calories || 0 });
  }

  // Calculate streaks
  const { data: activityDays } = await supabase
    .from('daily_activity')
    .select('date, has_activity, activity_time')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (activityDays) {
    // Daily streak
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    
    for (const day of activityDays) {
      if (day.has_activity) {
        streak++;
      } else {
        break;
      }
    }
    
    updates.push({ achievementId: 'daily_streak', newProgress: streak });

    // Early bird (before 6am)
    const earlyBirdDays = activityDays.filter((d: any) => {
      if (!d.activity_time) return false;
      const hour = parseInt(d.activity_time.split(':')[0]);
      return hour < 6;
    });
    updates.push({ achievementId: 'early_bird', newProgress: earlyBirdDays.length });

    // Night owl (after 10pm)
    const nightOwlDays = activityDays.filter((d: any) => {
      if (!d.activity_time) return false;
      const hour = parseInt(d.activity_time.split(':')[0]);
      return hour >= 22;
    });
    updates.push({ achievementId: 'night_owl', newProgress: nightOwlDays.length });

    // Weekend warrior
    const weekendDays = activityDays.filter((d: any) => {
      const date = new Date(d.date);
      const day = date.getDay();
      return (day === 0 || day === 6) && d.has_activity;
    });
    // Count complete weekends (both Sat and Sun active)
    const weekends = new Set<string>();
    weekendDays.forEach((d: any) => {
      const date = new Date(d.date);
      // Get the Sunday of that week as identifier
      const sunday = new Date(date);
      sunday.setDate(date.getDate() - date.getDay());
      weekends.add(sunday.toISOString().split('T')[0]);
    });
    updates.push({ achievementId: 'weekend_warrior', newProgress: weekends.size });
  }
}

async function calculateAllAchievements(
  supabase: any,
  userId: string,
  updates: AchievementUpdate[]
) {
  // Run all calculations for daily sync
  await calculateCompetitionAchievements(supabase, userId, null, updates);
  await calculateActivityAchievements(supabase, userId, null, updates);

  // invites_sent
  const { data: invites } = await supabase
    .from('invitations')
    .select('id')
    .eq('inviter_id', userId);
  
  updates.push({ achievementId: 'invites_sent', newProgress: invites?.length || 0 });
}
