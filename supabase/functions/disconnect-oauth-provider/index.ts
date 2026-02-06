import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RevokeConfig {
  revokeUrl: string;
  /** How to pass the token — 'form_body' or 'query_param' */
  tokenMethod: 'form_body' | 'query_param';
  /** HTTP Basic Auth with client_id:client_secret */
  useBasicAuth: boolean;
  clientId: string;
  clientSecret: string;
}

function getRevokeConfig(provider: string): RevokeConfig | null {
  switch (provider) {
    case 'fitbit':
      return {
        revokeUrl: 'https://api.fitbit.com/oauth2/revoke',
        tokenMethod: 'form_body',
        useBasicAuth: true,
        clientId: Deno.env.get('FITBIT_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('FITBIT_CLIENT_SECRET') ?? '',
      };
    case 'whoop':
      return {
        revokeUrl: 'https://api.prod.whoop.com/oauth/oauth2/revoke',
        tokenMethod: 'form_body',
        useBasicAuth: true,
        clientId: Deno.env.get('WHOOP_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('WHOOP_CLIENT_SECRET') ?? '',
      };
    case 'oura':
      return {
        revokeUrl: 'https://api.ouraring.com/oauth/revoke',
        tokenMethod: 'form_body',
        useBasicAuth: true,
        clientId: Deno.env.get('OURA_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('OURA_CLIENT_SECRET') ?? '',
      };
    case 'strava':
      return {
        revokeUrl: 'https://www.strava.com/oauth/deauthorize',
        tokenMethod: 'query_param',
        useBasicAuth: false,
        clientId: Deno.env.get('STRAVA_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('STRAVA_CLIENT_SECRET') ?? '',
      };
    default:
      // Garmin (OAuth 1.0a) and others — no standard revoke endpoint
      return null;
  }
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
      },
    );

    // Authenticate via JWT
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { provider } = await req.json();

    if (!provider || typeof provider !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid provider' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = user.id;
    console.log(`[disconnect-oauth-provider] Disconnecting ${provider} for user ${userId}`);

    // 1. Fetch the existing token so we can attempt revocation
    const { data: tokenRow } = await supabaseAdmin
      .from('provider_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();

    // 2. Attempt provider-side token revocation (best-effort)
    if (tokenRow?.access_token) {
      const revokeConfig = getRevokeConfig(provider);

      if (revokeConfig) {
        try {
          const headers: Record<string, string> = {};
          let url = revokeConfig.revokeUrl;
          let body: string | undefined;

          if (revokeConfig.useBasicAuth) {
            headers['Authorization'] =
              `Basic ${btoa(`${revokeConfig.clientId}:${revokeConfig.clientSecret}`)}`;
          }

          if (revokeConfig.tokenMethod === 'form_body') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            body = new URLSearchParams({ token: tokenRow.access_token }).toString();
          } else {
            // query_param (Strava style)
            url += `?access_token=${encodeURIComponent(tokenRow.access_token)}`;
          }

          const revokeResp = await fetch(url, {
            method: 'POST',
            headers,
            body,
          });

          console.log(
            `[disconnect-oauth-provider] ${provider} revoke response: ${revokeResp.status}`,
          );
        } catch (revokeErr) {
          // Best-effort — log but don't block
          console.warn(`[disconnect-oauth-provider] ${provider} revoke failed (non-blocking):`, revokeErr);
        }
      } else {
        console.log(`[disconnect-oauth-provider] No revoke endpoint for ${provider}, skipping`);
      }
    }

    // 3. Delete the token from provider_tokens (service_role required — RLS locked)
    const { error: deleteError } = await supabaseAdmin
      .from('provider_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    if (deleteError) {
      console.error(`[disconnect-oauth-provider] Error deleting token:`, deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to remove provider token', details: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Clear primary_device if it matches the disconnected provider
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ primary_device: null })
      .eq('id', userId)
      .eq('primary_device', provider);

    if (profileError) {
      // Non-blocking — token is already deleted
      console.warn(`[disconnect-oauth-provider] Error clearing primary_device:`, profileError);
    }

    console.log(`[disconnect-oauth-provider] Successfully disconnected ${provider} for user ${userId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('[disconnect-oauth-provider] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
