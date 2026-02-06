import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExchangeTokenRequest {
  provider: string;
  code: string;
  userId: string;
}

interface ProviderConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the JWT from the Authorization header
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create a client with the user's JWT to validate it
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify user is authenticated by getting user from JWT
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { provider, code, userId }: ExchangeTokenRequest = await req.json();

    // Verify user is authorized for this operation
    if (user.id !== userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get provider configuration
    const config = getProviderConfig(provider);
    if (!config) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown provider: ${provider}` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!config.clientId || !config.clientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: `Missing credentials for ${provider}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Exchange authorization code for access token
    // Whoop requires client_secret_post (credentials in body), others use client_secret_basic (Basic Auth header)
    const usePostAuth = provider === 'whoop';
    
    const bodyParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    };
    
    if (usePostAuth) {
      // Whoop: credentials in POST body
      bodyParams.client_id = config.clientId;
      bodyParams.client_secret = config.clientSecret;
    } else {
      // Fitbit, Garmin, Oura, Strava: client_id in body, secret in Basic Auth header
      bodyParams.client_id = config.clientId;
    }
    
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(usePostAuth ? {} : { Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}` }),
      },
      body: new URLSearchParams(bodyParams),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return new Response(
        JSON.stringify({ success: false, error: `Token exchange failed: ${errorText}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tokenData = await tokenResponse.json();

    // Store tokens in database
    // First check if record exists, then update or insert
    const { data: existingToken } = await supabaseClient
      .from('provider_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();

    const tokenRecord = {
      user_id: userId,
      provider,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
      scope: tokenData.scope,
      updated_at: new Date().toISOString(),
    };

    let dbError;
    if (existingToken) {
      // Update existing record
      const { error } = await supabaseClient
        .from('provider_tokens')
        .update(tokenRecord)
        .eq('user_id', userId)
        .eq('provider', provider);
      dbError = error;
    } else {
      // Insert new record
      const { error } = await supabaseClient
        .from('provider_tokens')
        .insert(tokenRecord);
      dbError = error;
    }

    if (dbError) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to store tokens',
          details: dbError.message,
          code: dbError.code,
          hint: dbError.hint
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        provider,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function getProviderConfig(provider: string): ProviderConfig | null {
  const redirectUri = 'movetogether://oauth-callback';

  switch (provider) {
    case 'fitbit':
      return {
        tokenUrl: 'https://api.fitbit.com/oauth2/token',
        clientId: Deno.env.get('FITBIT_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('FITBIT_CLIENT_SECRET') ?? '',
        redirectUri,
      };

    case 'whoop':
      return {
        tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
        clientId: Deno.env.get('WHOOP_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('WHOOP_CLIENT_SECRET') ?? '',
        redirectUri,
      };

    case 'garmin':
      return {
        tokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/token',
        clientId: Deno.env.get('GARMIN_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('GARMIN_CLIENT_SECRET') ?? '',
        redirectUri,
      };

    case 'oura':
      return {
        tokenUrl: 'https://api.ouraring.com/oauth/token',
        clientId: Deno.env.get('OURA_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('OURA_CLIENT_SECRET') ?? '',
        redirectUri,
      };

    case 'strava':
      return {
        tokenUrl: 'https://www.strava.com/oauth/token',
        clientId: Deno.env.get('STRAVA_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('STRAVA_CLIENT_SECRET') ?? '',
        redirectUri,
      };

    default:
      return null;
  }
}
