import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackfillRequest {
  provider: 'fitbit' | 'whoop' | 'garmin' | 'oura';
  activityDays?: number; // How many days of activity to backfill (default 90)
  weightDays?: number; // How many days of weight to backfill (default 365)
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

    const { provider, activityDays = 90, weightDays = 365 }: BackfillRequest = await req.json();

    console.log(`[Backfill] Starting for user ${user.id}, provider ${provider}`);
    console.log(`[Backfill] Activity days: ${activityDays}, Weight days: ${weightDays}`);

    // Get OAuth token
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

    // Check if token is expired
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Token expired, please reconnect' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate date range for backfill
    const today = new Date();
    const activityStartDate = new Date(today);
    activityStartDate.setDate(today.getDate() - activityDays);
    
    const weightStartDate = new Date(today);
    weightStartDate.setDate(today.getDate() - weightDays);

    let syncedDays = 0;
    let failedDays = 0;
    const errors: string[] = [];

    // Backfill activity data (90 days)
    console.log(`[Backfill] Syncing ${activityDays} days of activity data...`);
    for (let i = 0; i < activityDays; i++) {
      const currentDate = new Date(activityStartDate);
      currentDate.setDate(activityStartDate.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];

      try {
        // Call sync-provider-data for each day
        const { error: syncError } = await supabaseAdmin.functions.invoke(
          'sync-provider-data',
          {
            body: {
              provider,
              date: dateStr,
            },
          }
        );

        if (syncError) {
          console.error(`[Backfill] Failed to sync ${dateStr}:`, syncError);
          failedDays++;
          errors.push(`${dateStr}: ${syncError.message || 'Unknown error'}`);
        } else {
          syncedDays++;
        }

        // Small delay to avoid rate limits (50ms = ~20 requests/sec)
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (e) {
        console.error(`[Backfill] Exception syncing ${dateStr}:`, e);
        failedDays++;
        errors.push(`${dateStr}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    // Backfill weight data (365 days) - provider-specific
    console.log(`[Backfill] Syncing ${weightDays} days of weight data...`);
    try {
      await backfillWeightData(
        provider,
        tokenData.access_token,
        user.id,
        weightStartDate,
        today,
        supabaseAdmin
      );
    } catch (e) {
      console.error('[Backfill] Weight sync error:', e);
      errors.push(`Weight sync: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    console.log(`[Backfill] Complete. Synced: ${syncedDays}, Failed: ${failedDays}`);

    return new Response(
      JSON.stringify({
        success: true,
        syncedDays,
        failedDays,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Backfill] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Backfill failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function backfillWeightData(
  provider: string,
  accessToken: string,
  userId: string,
  startDate: Date,
  endDate: Date,
  supabase: any
) {
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  let weightData: Array<{ date: string; weight: number }> = [];

  switch (provider) {
    case 'fitbit':
      weightData = await fetchFitbitWeightHistory(accessToken, startDateStr, endDateStr);
      break;
    case 'whoop':
      // Whoop doesn't track weight
      console.log('[Backfill] Whoop does not provide weight data');
      return;
    case 'oura':
      // Oura doesn't track weight directly
      console.log('[Backfill] Oura does not provide weight data');
      return;
    case 'garmin':
      // TODO: Implement Garmin weight history
      console.log('[Backfill] Garmin weight sync not implemented yet');
      return;
  }

  if (weightData.length === 0) {
    console.log('[Backfill] No weight data found');
    return;
  }

  // Bulk insert weight data
  const weightRecords = weightData.map((w) => ({
    user_id: userId,
    date: w.date,
    weight_kg: w.weight,
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('weight_logs')
    .upsert(weightRecords, { onConflict: 'user_id,date' });

  if (error) {
    console.error('[Backfill] Failed to insert weight data:', error);
    throw new Error('Failed to store weight data');
  }

  console.log(`[Backfill] Stored ${weightData.length} weight records`);
}

async function fetchFitbitWeightHistory(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; weight: number }>> {
  // Fitbit weight API
  const response = await fetch(
    `https://api.fitbit.com/1/user/-/body/log/weight/date/${startDate}/${endDate}.json`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Fitbit weight API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.weight || data.weight.length === 0) {
    return [];
  }

  return data.weight.map((w: any) => ({
    date: w.date,
    weight: w.weight, // Already in kg from Fitbit
  }));
}
