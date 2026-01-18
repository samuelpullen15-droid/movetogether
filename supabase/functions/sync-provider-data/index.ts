import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncRequest {
  provider: 'fitbit' | 'whoop' | 'garmin' | 'oura';
  date: string; // YYYY-MM-DD
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit: 20 health syncs per hour
    const now = new Date();
    const windowStartRounded = new Date(now);
    windowStartRounded.setMinutes(0, 0, 0); // Round to start of current hour

    const { data: existing } = await supabaseAdmin
      .from('rate_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('endpoint', 'health-sync')
      .eq('window_start', windowStartRounded.toISOString())
      .maybeSingle();

    if (existing && existing.request_count >= 20) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Increment or create rate limit record
    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('rate_limits')
        .update({ 
          request_count: existing.request_count + 1,
          updated_at: now.toISOString()
        })
        .eq('id', existing.id);
      
      if (updateError) {
        console.error('[Sync Provider Data] Error updating rate limit:', updateError);
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('rate_limits')
        .insert({
          user_id: user.id,
          endpoint: 'health-sync',
          request_count: 1,
          window_start: windowStartRounded.toISOString(),
        });
      
      if (insertError) {
        console.error('[Sync Provider Data] Error creating rate limit:', insertError);
      }
    }

    const { provider, date }: SyncRequest = await req.json();

    // Get the user's OAuth token for this provider
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('provider_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: `No ${provider} token found` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is expired and refresh if needed
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      console.log(`[Sync Provider Data] Token expired, refreshing...`);
      // TODO: Implement token refresh
      return new Response(
        JSON.stringify({ error: 'Token expired, please reconnect' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch data directly from provider API (SERVER-SIDE)
    // This prevents client from manipulating the API response
    const healthData = await fetchProviderData(provider, tokenData.access_token, date);

    if (!healthData) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch data from provider' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate the data (detect impossible values)
    if (!validateProviderData(healthData)) {
      console.error('[Sync Provider Data] Invalid data from provider:', healthData);
      return new Response(
        JSON.stringify({ error: 'Provider returned invalid data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call the calculate-daily-score function to store and calculate
    const { error: calculateError } = await supabaseAdmin.functions.invoke(
      'calculate-daily-score',
      {
        body: {
          userId: user.id,
          date,
          moveCalories: healthData.moveCalories,
          exerciseMinutes: healthData.exerciseMinutes,
          standHours: healthData.standHours,
          steps: healthData.steps,
        },
      }
    );

    if (calculateError) {
      console.error('[Sync Provider Data] Error calculating score:', calculateError);
      return new Response(
        JSON.stringify({ error: 'Failed to calculate score' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Sync Provider Data] Successfully synced ${provider} data for ${date}`);

    return new Response(
      JSON.stringify({ success: true, data: healthData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Sync Provider Data] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchProviderData(
  provider: string,
  accessToken: string,
  date: string
): Promise<{
  moveCalories: number;
  exerciseMinutes: number;
  standHours: number;
  steps: number;
} | null> {
  try {
    switch (provider) {
      case 'fitbit':
        return await fetchFitbitData(accessToken, date);
      case 'whoop':
        return await fetchWhoopData(accessToken, date);
      case 'garmin':
        return await fetchGarminData(accessToken, date);
      case 'oura':
        return await fetchOuraData(accessToken, date);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (error) {
    console.error(`[Fetch ${provider} Data] Error:`, error);
    return null;
  }
}

async function fetchFitbitData(accessToken: string, date: string) {
  // Fetch activities summary for the date
  const response = await fetch(
    `https://api.fitbit.com/1/user/-/activities/date/${date}.json`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Fitbit API error: ${response.status}`);
  }

  const data = await response.json();
  const summary = data.summary;

  return {
    moveCalories: summary.caloriesOut || 0,
    exerciseMinutes: summary.veryActiveMinutes + summary.fairlyActiveMinutes || 0,
    standHours: Math.floor((summary.sedentaryMinutes / 60) || 0),
    steps: summary.steps || 0,
  };
}

async function fetchWhoopData(accessToken: string, date: string) {
  // Fetch cycle data for the date
  const startDate = `${date}T00:00:00.000Z`;
  const endDate = `${date}T23:59:59.999Z`;

  const response = await fetch(
    `https://api.prod.whoop.com/developer/v1/cycle?start=${startDate}&end=${endDate}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Whoop API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.records || data.records.length === 0) {
    // No data for this date
    return {
      moveCalories: 0,
      exerciseMinutes: 0,
      standHours: 0,
      steps: 0,
    };
  }

  const cycle = data.records[0];
  const strain = cycle.score?.strain || 0;

  // Convert Whoop strain (0-21) to approximate calories/minutes
  // This is an approximation - adjust based on your needs
  const estimatedCalories = Math.round(strain * 200);
  const estimatedMinutes = Math.round(strain * 10);

  return {
    moveCalories: estimatedCalories,
    exerciseMinutes: estimatedMinutes,
    standHours: Math.floor(estimatedMinutes / 60),
    steps: 0, // Whoop doesn't track steps
  };
}

async function fetchGarminData(accessToken: string, date: string) {
  // Garmin Health API implementation
  // Note: Garmin uses OAuth 1.0, implementation is more complex
  // This is a placeholder - implement according to Garmin documentation
  throw new Error('Garmin sync not implemented yet');
}

async function fetchOuraData(accessToken: string, date: string) {
  // Fetch daily activity for the date
  const response = await fetch(
    `https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${date}&end_date=${date}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Oura API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.data || data.data.length === 0) {
    return {
      moveCalories: 0,
      exerciseMinutes: 0,
      standHours: 0,
      steps: 0,
    };
  }

  const activity = data.data[0];

  return {
    moveCalories: activity.active_calories || 0,
    exerciseMinutes: Math.round((activity.high_activity_time + activity.medium_activity_time) / 60) || 0,
    standHours: Math.floor((activity.total_calories / 100) || 0), // Approximation
    steps: activity.steps || 0,
  };
}

function validateProviderData(data: {
  moveCalories: number;
  exerciseMinutes: number;
  standHours: number;
  steps: number;
}): boolean {
  // Same validation as in calculate-daily-score
  if (data.moveCalories < 0 || data.moveCalories > 10000) return false;
  if (data.exerciseMinutes < 0 || data.exerciseMinutes > 1440) return false;
  if (data.standHours < 0 || data.standHours > 24) return false;
  if (data.steps < 0 || data.steps > 100000) return false;

  return true;
}
