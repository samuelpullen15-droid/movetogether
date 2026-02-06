import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthDataInput {
  userId: string;
  date: string; // YYYY-MM-DD format
  moveCalories: number;
  exerciseMinutes: number;
  standHours: number;
  steps: number;
  distanceMeters?: number;
  workoutsCompleted?: number;
}

interface CalculatedScore {
  movePercentage: number;
  exercisePercentage: number;
  standPercentage: number;
  totalScore: number;
  ringsClosed: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for server-side operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Service role bypasses RLS
    );

    // Extract Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify the user is authenticated using the JWT
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error('[calculate-daily-score] Auth failed:', authError?.message || 'No user');
      console.error('[calculate-daily-score] Auth header present:', !!authHeader);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let input: HealthDataInput;
    try {
      input = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Security: Verify user can only submit their own data
    if (input.userId !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot submit data for another user' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate data ranges (detect impossible values)
    if (!validateHealthData(input)) {
      return new Response(
        JSON.stringify({ error: 'Invalid health data values' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user's goals from database (server is source of truth)
    // Use maybeSingle() to handle case where user has no fitness goals set yet
    const { data: fitnessData, error: fitnessError } = await supabaseAdmin
      .from('user_fitness')
      .select('move_goal, exercise_goal, stand_goal')
      .eq('user_id', input.userId)
      .maybeSingle();

    // Use default goals if not found (user may not have set goals yet)
    const goals = fitnessData || {
      move_goal: 500,
      exercise_goal: 30,
      stand_goal: 12,
    };

    // Use default goals if not found (user may not have set goals yet)

    // SERVER-SIDE CALCULATION - Cannot be tampered with
    const score = calculateScore(input, goals);

    // Store raw data in user_activity table using raw SQL for reliable upsert
    const { error: insertError } = await supabaseAdmin.rpc('upsert_user_activity', {
      p_user_id: input.userId,
      p_date: input.date,
      p_move_calories: Math.round(input.moveCalories),
      p_exercise_minutes: Math.round(input.exerciseMinutes),
      p_stand_hours: Math.round(input.standHours),
      p_step_count: Math.round(input.steps),
      p_distance_meters: input.distanceMeters ? Math.round((input.distanceMeters || 0) * 100) / 100 : 0,
      p_workouts_completed: input.workoutsCompleted || 0,
    });

    if (insertError) {
      console.error('[calculate-daily-score] upsert_user_activity failed:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store health data', details: insertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update competition standings (if user is in active competitions)
    await updateCompetitionStandings(supabaseAdmin, input.userId, input.date, score);

    // Send rings_closed notification if all 3 rings are closed (self-notification)
    // Check if this is the first time today (avoid duplicate notifications)
    if (score.ringsClosed === 3) {
      await sendRingsClosedNotification(supabaseAdmin, input.userId, input.date);
      // Award coins for closing all rings (fire and forget)
      awardRingClosureCoins(supabaseAdmin, input.userId, input.date).catch(e =>
        console.error('[calculate-daily-score] Failed to award ring closure coins:', e)
      );
    }

    // Check for ring closures and notify competition members (fire and forget)
    if (score.ringsClosed > 0) {
      try {
        fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/check-ring-closure`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              userId: input.userId,
              date: input.date,
              moveCalories: input.moveCalories,
              exerciseMinutes: input.exerciseMinutes,
              standHours: input.standHours,
              moveGoal: goals.move_goal,
              exerciseGoal: goals.exercise_goal,
              standGoal: goals.stand_goal,
            }),
          }
        ).catch(err => console.error('[Ring Closure] Failed:', err));
      } catch (err) {
        console.error('[Ring Closure] Error:', err);
        // Don't throw — ring closure notifications are non-critical
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        score,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
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

function validateHealthData(data: HealthDataInput): boolean {
  // Detect impossible values
  if (data.moveCalories < 0 || data.moveCalories > 10000) return false; // Max 10,000 cal/day
  if (data.exerciseMinutes < 0 || data.exerciseMinutes > 1440) return false; // Max 24 hours
  if (data.standHours < 0 || data.standHours > 24) return false; // Max 24 hours
  if (data.steps < 0 || data.steps > 100000) return false; // Max 100k steps/day

  // Validate date format and reasonable range
  const date = new Date(data.date);
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  
  if (isNaN(date.getTime())) return false;
  if (date > now) return false; // Can't submit future data
  if (date < oneYearAgo) return false; // Can't submit data older than 1 year

  return true;
}

function calculateScore(
  data: HealthDataInput,
  goals: { move_goal: number; exercise_goal: number; stand_goal: number }
): CalculatedScore {
  // SERVER-SIDE CALCULATION - Source of truth
  // Prevent division by zero
  const moveGoal = goals.move_goal > 0 ? goals.move_goal : 500;
  const exerciseGoal = goals.exercise_goal > 0 ? goals.exercise_goal : 30;
  const standGoal = goals.stand_goal > 0 ? goals.stand_goal : 12;
  
  const movePercentage = Math.min((data.moveCalories / moveGoal) * 100, 100);
  const exercisePercentage = Math.min((data.exerciseMinutes / exerciseGoal) * 100, 100);
  const standPercentage = Math.min((data.standHours / standGoal) * 100, 100);

  // Count rings closed (>= 100%)
  let ringsClosed = 0;
  if (movePercentage >= 100) ringsClosed++;
  if (exercisePercentage >= 100) ringsClosed++;
  if (standPercentage >= 100) ringsClosed++;

  // Total score: average of the three percentages
  const totalScore = (movePercentage + exercisePercentage + standPercentage) / 3;

  return {
    movePercentage: Math.round(movePercentage * 100) / 100,
    exercisePercentage: Math.round(exercisePercentage * 100) / 100,
    standPercentage: Math.round(standPercentage * 100) / 100,
    totalScore: Math.round(totalScore * 100) / 100,
    ringsClosed,
  };
}

async function updateCompetitionStandings(
  supabase: any,
  userId: string,
  date: string,
  score: CalculatedScore
) {
  try {
    // Find all active competitions this user is in where their score is NOT locked
    const { data: participations, error } = await supabase
      .from('competition_participants')
      .select('competition_id, score_locked_at, competitions!inner(id, name, start_date, end_date, status)')
      .eq('user_id', userId)
      .eq('competitions.status', 'active')
      .is('score_locked_at', null); // Only get participations where score is not locked

    if (error || !participations || participations.length === 0) {
      return;
    }

    // Check if date falls within competition period
    const competitionDate = new Date(date);
    const now = new Date();

    for (const participation of participations) {
      const competition = participation.competitions;
      if (!competition) continue;

      const startDate = new Date(competition.start_date);
      const endDate = new Date(competition.end_date);

      // Get the latest (westernmost) timezone offset among competition participants
      // This allows us to lock scores based on the actual participants, not always Hawaii
      let latestOffset = -10; // Default to Hawaii (UTC-10) as fallback
      try {
        const { data: offsetData } = await supabase.rpc('get_competition_latest_timezone_offset', {
          comp_id: participation.competition_id,
        });
        if (offsetData !== null && offsetData !== undefined) {
          latestOffset = offsetData;
        }
      } catch (e) {
        console.log(`[calculate-daily-score] Could not get timezone offset, using default: ${e}`);
      }

      // Calculate when ALL participants would have passed midnight on the end date
      // offset is negative for west of UTC (e.g., -5 for EST, -10 for Hawaii)
      // Midnight in that timezone = -offset hours in UTC the next day
      const endDateWithBuffer = new Date(endDate);
      endDateWithBuffer.setDate(endDateWithBuffer.getDate() + 1); // Move to day after end_date
      endDateWithBuffer.setHours(-latestOffset, 0, 0, 0); // Convert offset to UTC hours

      // If competition end date has passed (with timezone buffer), lock the score
      if (now > endDateWithBuffer) {
        console.log(`[calculate-daily-score] Competition ${competition.id} has ended (offset: ${latestOffset}), locking score for user`);
        await supabase
          .from('competition_participants')
          .update({ score_locked_at: now.toISOString() })
          .eq('competition_id', participation.competition_id)
          .eq('user_id', userId)
          .is('score_locked_at', null);
        continue; // Skip to next competition
      }

      if (competitionDate >= startDate && competitionDate <= endDate) {
        // Get standings BEFORE update
        const { data: standingsBefore } = await supabase
          .from('competition_standings')
          .select('user_id, rank, total_points')
          .eq('competition_id', participation.competition_id)
          .order('rank', { ascending: true });
        
        // Store previous rankings
        const previousRankings = new Map<string, number>();
        if (standingsBefore) {
          for (const s of standingsBefore) {
            previousRankings.set(s.user_id, s.rank);
          }
        }
        
        const userPreviousRank = previousRankings.get(userId) || 999;

        // Update standings for this competition
        await supabase.rpc('update_competition_standings', {
          p_competition_id: participation.competition_id,
          p_user_id: userId,
          p_date: date,
          p_score: score.totalScore,
          p_rings_closed: score.ringsClosed,
        });

        // Get standings AFTER update
        const { data: standingsAfter } = await supabase
          .from('competition_standings')
          .select('user_id, rank, total_points')
          .eq('competition_id', participation.competition_id)
          .order('rank', { ascending: true });

        if (standingsAfter) {
          const userNewRank = standingsAfter.find(s => s.user_id === userId)?.rank || 999;
          
          // Check if user moved up in rank
          if (userNewRank < userPreviousRank) {
            // Find users who got passed (their rank went down)
            for (const standing of standingsAfter) {
              if (standing.user_id === userId) continue;
              
              const theirPreviousRank = previousRankings.get(standing.user_id) || 999;
              const theirNewRank = standing.rank;
              
              // If this user's rank went down and they're now below the current user
              if (theirNewRank > theirPreviousRank && theirNewRank > userNewRank) {
                // Get the user's name who passed them
                const { data: passerProfile } = await supabase
                  .from('profiles')
                  .select('full_name, username')
                  .eq('id', userId)
                  .single();
                
                const opponentName = passerProfile?.full_name || passerProfile?.username || 'Someone';
                
                // Send notification to the passed user
                try {
                  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                    },
                    body: JSON.stringify({
                      type: 'competition_position_change',
                      recipientUserId: standing.user_id,
                      senderUserId: userId,
                      data: {
                        competitionId: competition.id,
                        competitionName: competition.name,
                        opponentId: userId,
                        opponentName,
                        newRank: theirNewRank,
                        previousRank: theirPreviousRank,
                      },
                    }),
                  });
                } catch (e) {
                  console.error('Failed to send position change notification:', e);
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in updateCompetitionStandings:', error);
    // Don't fail the entire request if standings update fails
  }
}

// Send notification when user closes all 3 rings
async function sendRingsClosedNotification(
  supabase: any,
  userId: string,
  date: string
) {
  try {
    // Check if we already sent a rings_closed notification for this date
    // Use a simple tracking table or just check user_activity for existing closed rings
    const { data: existingActivity } = await supabase
      .from('user_activity')
      .select('rings_closed_notified')
      .eq('user_id', userId)
      .eq('date', date)
      .single();

    // Skip if already notified (column may not exist, so default to false)
    if (existingActivity?.rings_closed_notified === true) {
      console.log(`Rings closed notification already sent for user ${userId} on ${date}`);
      return;
    }

    // Send the notification
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          type: 'rings_closed',
          recipientUserId: userId,
          data: {
            date,
          },
        }),
      });
      console.log(`Rings closed notification sent to user ${userId} for ${date}`);

      // Mark as notified (try to update, ignore if column doesn't exist)
      await supabase
        .from('user_activity')
        .update({ rings_closed_notified: true })
        .eq('user_id', userId)
        .eq('date', date);
    } catch (e) {
      console.error('Failed to send rings closed notification:', e);
    }
  } catch (error) {
    console.error('Error in sendRingsClosedNotification:', error);
  }
}

// Award coins for closing all 3 rings (10 earned coins per day)
async function awardRingClosureCoins(
  supabase: any,
  userId: string,
  date: string
) {
  try {
    // Check if we already awarded coins for ring closure on this date
    const { data: existingTransaction } = await supabase
      .from('coin_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('transaction_type', 'earn_ring_closure')
      .eq('reference_id', date)
      .maybeSingle();

    if (existingTransaction) {
      console.log(`[calculate-daily-score] Ring closure coins already awarded for ${userId} on ${date}`);
      return;
    }

    // Get the reward amount from config (default 10)
    const { data: rewardConfig } = await supabase
      .from('coin_reward_config')
      .select('earned_coins')
      .eq('event_type', 'ring_closure_all')
      .eq('is_active', true)
      .maybeSingle();

    const coinsToAward = rewardConfig?.earned_coins ?? 10;

    // Award the coins using the credit_coins function
    const { error: creditError } = await supabase.rpc('credit_coins', {
      p_user_id: userId,
      p_earned_amount: coinsToAward,
      p_premium_amount: 0,
      p_transaction_type: 'earn_ring_closure',
      p_reference_type: 'activity_date',
      p_reference_id: date,
      p_metadata: { rings_closed: 3 },
    });

    if (creditError) {
      console.error('[calculate-daily-score] Failed to credit ring closure coins:', creditError);
      return;
    }

    console.log(`[calculate-daily-score] Awarded ${coinsToAward} coins to ${userId} for ring closure on ${date}`);
  } catch (error) {
    console.error('[calculate-daily-score] Error awarding ring closure coins:', error);
  }
}
