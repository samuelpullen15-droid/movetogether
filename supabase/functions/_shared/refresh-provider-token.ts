// Shared OAuth token refresh utility for health provider integrations.
// Used by sync-provider-data and backfill-historical-data edge functions.

import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

interface ProviderTokenConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** true for Whoop (credentials in POST body), false for others (HTTP Basic Auth) */
  usePostAuth: boolean;
}

type RefreshResult =
  | { success: true; accessToken: string; expiresAt: string | null }
  | { success: false; error: string; requiresReconnect: boolean };

/**
 * Attempts to refresh an OAuth token for the given provider.
 * On success, updates the provider_tokens table and returns the new access token.
 * On failure, returns an error indicating whether the user must reconnect.
 */
export async function refreshProviderToken(
  supabaseAdmin: SupabaseClient,
  userId: string,
  provider: string,
  refreshToken: string,
): Promise<RefreshResult> {
  const config = getProviderTokenConfig(provider);
  if (!config) {
    return {
      success: false,
      error: `Token refresh not supported for provider: ${provider}`,
      requiresReconnect: true,
    };
  }

  if (!refreshToken) {
    return {
      success: false,
      error: 'No refresh token available',
      requiresReconnect: true,
    };
  }

  try {
    const bodyParams: Record<string, string> = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (config.usePostAuth) {
      // Whoop: credentials in POST body
      bodyParams.client_id = config.clientId;
      bodyParams.client_secret = config.clientSecret;
    } else {
      // Fitbit, Oura, Strava: client_id in body, secret in Basic Auth header
      bodyParams.client_id = config.clientId;
      headers['Authorization'] =
        `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`;
    }

    console.log(`[Token Refresh] Refreshing ${provider} token for user ${userId}`);

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: new URLSearchParams(bodyParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Token Refresh] ${provider} refresh failed (${response.status}): ${errorText}`,
      );

      // 400/401/403 from provider means refresh token is invalid/revoked
      const requiresReconnect =
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403;

      return {
        success: false,
        error: `Token refresh failed: ${response.status}`,
        requiresReconnect,
      };
    }

    const tokenData = await response.json();

    // Calculate new expiry
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      access_token: tokenData.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    // Some providers rotate refresh tokens (Fitbit, Strava).
    // Only overwrite if a new one was returned.
    if (tokenData.refresh_token) {
      updatePayload.refresh_token = tokenData.refresh_token;
    }

    if (tokenData.token_type) {
      updatePayload.token_type = tokenData.token_type;
    }

    if (tokenData.scope) {
      updatePayload.scope = tokenData.scope;
    }

    const { error: dbError } = await supabaseAdmin
      .from('provider_tokens')
      .update(updatePayload)
      .eq('user_id', userId)
      .eq('provider', provider);

    if (dbError) {
      console.error(`[Token Refresh] Failed to update token in DB:`, dbError);
      return {
        success: false,
        error: `Failed to store refreshed token: ${dbError.message}`,
        requiresReconnect: false,
      };
    }

    console.log(`[Token Refresh] Successfully refreshed ${provider} token for user ${userId}`);

    return {
      success: true,
      accessToken: tokenData.access_token,
      expiresAt,
    };
  } catch (error) {
    console.error(`[Token Refresh] Exception during ${provider} refresh:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during refresh',
      requiresReconnect: false,
    };
  }
}

function getProviderTokenConfig(provider: string): ProviderTokenConfig | null {
  switch (provider) {
    case 'fitbit':
      return {
        tokenUrl: 'https://api.fitbit.com/oauth2/token',
        clientId: Deno.env.get('FITBIT_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('FITBIT_CLIENT_SECRET') ?? '',
        usePostAuth: false,
      };
    case 'whoop':
      return {
        tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
        clientId: Deno.env.get('WHOOP_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('WHOOP_CLIENT_SECRET') ?? '',
        usePostAuth: true,
      };
    case 'oura':
      return {
        tokenUrl: 'https://api.ouraring.com/oauth/token',
        clientId: Deno.env.get('OURA_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('OURA_CLIENT_SECRET') ?? '',
        usePostAuth: false,
      };
    case 'strava':
      return {
        tokenUrl: 'https://www.strava.com/oauth/token',
        clientId: Deno.env.get('STRAVA_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('STRAVA_CLIENT_SECRET') ?? '',
        usePostAuth: false,
      };
    case 'garmin':
      return {
        tokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/token',
        clientId: Deno.env.get('GARMIN_CLIENT_ID') ?? '',
        clientSecret: Deno.env.get('GARMIN_CLIENT_SECRET') ?? '',
        usePostAuth: false,
      };
    default:
      return null;
  }
}
