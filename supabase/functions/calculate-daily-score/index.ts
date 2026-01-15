import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
}

interface CalculatedScore {
  movePercentage: number;
  exercisePercentage: number;
  standPercentage: number;
  totalScore: number;
  ringsClosed: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for server-side operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Service role bypasses RLS
    );

    // Still verify the user is authenticated
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const input: HealthDataInput = await req.json();

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
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('move_goal, exercise_goal, stand_goal')
      .eq('id', input.userId)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // SERVER-SIDE CALCULATION - Cannot be tampered with
    const score = calculateScore(input, profile);

    // Store both raw data and calculated score
    const { error: insertError } = await supabaseAdmin
      .from('daily_health_data')
      .upsert({
        user_id: input.userId,
        date: input.date,
        move_calories: input.moveCalories,
        exercise_minutes: input.exerciseMinutes,
        stand_hours: input.standHours,
        steps: input.steps,
        move_percentage: score.movePercentage,
        exercise_percentage: score.exercisePercentage,
        stand_percentage: score.standPercentage,
        total_score: score.totalScore,
        rings_closed: score.ringsClosed,
        calculated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error storing health data:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store health data' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update competition standings (if user is in active competitions)
    await updateCompetitionStandings(supabaseAdmin, input.userId, input.date, score);

    console.log(`[Calculate Score] Success for user ${input.userId} on ${input.date}`);

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
    console.error('[Calculate Score] Error:', error);
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
  const movePercentage = Math.min((data.moveCalories / goals.move_goal) * 100, 100);
  const exercisePercentage = Math.min((data.exerciseMinutes / goals.exercise_goal) * 100, 100);
  const standPercentage = Math.min((data.standHours / goals.stand_goal) * 100, 100);

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
  // Find all active competitions this user is in
  const { data: participations, error } = await supabase
    .from('competition_participants')
    .select('competition_id, competitions!inner(start_date, end_date, status)')
    .eq('user_id', userId)
    .eq('competitions.status', 'active');

  if (error || !participations || participations.length === 0) {
    console.log('[Update Standings] User not in any active competitions');
    return;
  }

  // Check if date falls within competition period
  const competitionDate = new Date(date);
  
  for (const participation of participations) {
    const competition = participation.competitions;
    const startDate = new Date(competition.start_date);
    const endDate = new Date(competition.end_date);

    if (competitionDate >= startDate && competitionDate <= endDate) {
      // Update standings for this competition
      await supabase.rpc('update_competition_standings', {
        p_competition_id: participation.competition_id,
        p_user_id: userId,
        p_date: date,
        p_score: score.totalScore,
        p_rings_closed: score.ringsClosed,
      });
    }
  }
}
