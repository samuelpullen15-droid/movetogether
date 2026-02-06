/**
 * OAuth Configuration for Fitness Providers
 * 
 * Setup Instructions:
 * 1. Add environment variables to .env:
 *    EXPO_PUBLIC_FITBIT_CLIENT_ID=your_client_id
 *    EXPO_PUBLIC_WHOOP_CLIENT_ID=your_client_id
 *    EXPO_PUBLIC_GARMIN_CLIENT_ID=your_client_id
 * 
 * 2. Register OAuth redirect URI with each provider:
 *    movetogether://oauth-callback
 * 
 * 3. Add to app.json:
 *    "scheme": "movetogether"
 */

export interface ProviderOAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string[];
  redirectUri: string;
  // Some providers need extra params
  extraAuthParams?: Record<string, string>;
}

export const OAUTH_REDIRECT_URI = 'movetogether://oauth-callback';

export const PROVIDER_OAUTH: Record<string, ProviderOAuthConfig> = {
  fitbit: {
    authUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    clientId: process.env.EXPO_PUBLIC_FITBIT_CLIENT_ID || '',
    scopes: [
      'activity',      // Daily activity stats
      'heartrate',     // Heart rate data
      'sleep',         // Sleep tracking
      'profile',       // User profile info
      'weight',        // Weight data
      'nutrition',     // Food/water intake
    ],
    redirectUri: OAUTH_REDIRECT_URI,
    // No extraAuthParams - PKCE removed for mobile OAuth
  },

  whoop: {
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    clientId: process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID || '',
    scopes: [
      'read:recovery',    // Recovery scores
      'read:cycles',      // Sleep/strain cycles
      'read:workout',     // Workout data
      'read:sleep',       // Sleep metrics
      'read:profile',     // User profile
      'read:body_measurement', // Body measurement data
    ],
    redirectUri: OAUTH_REDIRECT_URI,
  },

  garmin: {
    // Garmin Health API - OAuth 2.0 (verify URLs from your Garmin developer portal)
    authUrl: 'https://connect.garmin.com/oauthConfirm',
    tokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/token',
    clientId: process.env.EXPO_PUBLIC_GARMIN_CLIENT_ID || '',
    scopes: [], // Garmin permissions are set in the developer portal, not via scopes
    redirectUri: OAUTH_REDIRECT_URI,
  },

  oura: {
    authUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    clientId: process.env.EXPO_PUBLIC_OURA_CLIENT_ID || '',
    scopes: [
      'personal',        // Personal info
      'daily',           // Daily summaries
      'heartrate',       // Heart rate data
      'workout',         // Workout sessions
      'sleep',           // Sleep data
    ],
    redirectUri: OAUTH_REDIRECT_URI,
  },

  // Google Fit (if you want to support Android users)
  google_fit: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.EXPO_PUBLIC_GOOGLE_FIT_CLIENT_ID || '',
    scopes: [
      'https://www.googleapis.com/auth/fitness.activity.read',
      'https://www.googleapis.com/auth/fitness.heart_rate.read',
      'https://www.googleapis.com/auth/fitness.sleep.read',
    ],
    redirectUri: OAUTH_REDIRECT_URI,
  },

  // Strava (popular for runners/cyclists)
  strava: {
    authUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    clientId: process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID || '',
    scopes: [
      'read',
      'activity:read',
      'activity:read_all',
    ],
    redirectUri: OAUTH_REDIRECT_URI,
    extraAuthParams: {
      approval_prompt: 'auto',
    },
  },
};

/**
 * Get OAuth config for a provider
 */
export function getProviderOAuthConfig(providerId: string): ProviderOAuthConfig | null {
  return PROVIDER_OAUTH[providerId] || null;
}

/**
 * Check if provider has OAuth configured
 */
export function isProviderOAuthConfigured(providerId: string): boolean {
  const config = PROVIDER_OAUTH[providerId];
  return !!(config && config.clientId);
}

/**
 * Get all configured providers
 */
export function getConfiguredProviders(): string[] {
  return Object.keys(PROVIDER_OAUTH).filter(isProviderOAuthConfigured);
}
