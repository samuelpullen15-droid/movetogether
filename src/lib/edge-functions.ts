/**
 * Edge Function Client
 *
 * Per security rules in back-end security.rtf:
 * - Frontend should NEVER use supabase-js client-side methods directly
 * - All data access must go through Edge Functions
 * - Edge Functions use service_role key for database operations
 */

import { supabase, isSupabaseConfigured } from './supabase';

// Edge Function API endpoints
type EdgeFunction =
  | 'profile-api'
  | 'competition-api'
  | 'friends-api'
  | 'activity-api'
  | 'health-api'
  | 'invitation-api'
  | 'settings-api'
  | 'search-api'
  | 'moderation-api'
  | 'achievements-api'
  | 'chat-api'
  | 'invite-api'
  | 'process-daily-streak'
  | 'log-streak-activity'
  | 'referral-api'
  | 'dm-api'
  | 'trials-api'
  | 'prize-api'
  | 'challenges-api'
  | 'cosmetics-api'
  | 'recap-api'
  | 'process-coin-reward'
  | 'send-notification'
  | 'update-achievements'
  | 'leave-competition'
  | 'create-activity'
  | 'calculate-daily-score'
  | 'backfill-historical-data'
  | 'sync-provider-data'
  | 'disconnect-oauth-provider'
  | 'export-user-data';

interface EdgeFunctionResponse<T = unknown> {
  data?: T;
  error?: string;
}

/**
 * Diagnostic function to test Edge Function authentication
 * Call this when debugging 401 errors to get detailed information
 */
export async function diagnoseEdgeFunctionAuth(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) {
    console.log('[DiagnoseAuth] Supabase not configured');
    return;
  }

  console.log('[DiagnoseAuth] Starting Edge Function authentication diagnosis...');

  // 1. Check current session
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData?.session;

  console.log('[DiagnoseAuth] Current session state:', {
    hasSession: !!session,
    hasAccessToken: !!session?.access_token,
    hasRefreshToken: !!session?.refresh_token,
    userId: session?.user?.id || 'none',
    tokenExpiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'none',
    isExpired: session?.expires_at ? (session.expires_at * 1000 < Date.now()) : 'unknown',
    currentTime: new Date().toISOString(),
    sessionError: sessionError?.message || 'none',
  });

  if (!session?.access_token) {
    console.log('[DiagnoseAuth] No access token available - user needs to sign in');
    return;
  }

  // 2. Test direct fetch to Edge Function
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const testUrl = `${supabaseUrl}/functions/v1/profile-api`;

  console.log('[DiagnoseAuth] Testing direct fetch to:', testUrl);

  try {
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: 'get_my_profile', params: {} }),
    });

    const responseText = await response.text();
    console.log('[DiagnoseAuth] Direct fetch response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      bodyPreview: responseText.substring(0, 500),
    });
  } catch (fetchError: any) {
    console.error('[DiagnoseAuth] Direct fetch failed:', fetchError.message);
  }

  // 3. Try refreshing session
  console.log('[DiagnoseAuth] Attempting session refresh...');
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

  console.log('[DiagnoseAuth] Session refresh result:', {
    success: !!refreshData?.session,
    error: refreshError?.message || 'none',
    newTokenExpiresAt: refreshData?.session?.expires_at ? new Date(refreshData.session.expires_at * 1000).toISOString() : 'none',
    tokenChanged: session.access_token !== refreshData?.session?.access_token,
  });

  // 4. If refresh worked, test with new token
  if (refreshData?.session?.access_token && refreshData.session.access_token !== session.access_token) {
    console.log('[DiagnoseAuth] Testing with refreshed token...');
    try {
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshData.session.access_token}`,
        },
        body: JSON.stringify({ action: 'get_my_profile', params: {} }),
      });

      const responseText = await response.text();
      console.log('[DiagnoseAuth] Refreshed token fetch response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        bodyPreview: responseText.substring(0, 500),
      });
    } catch (fetchError: any) {
      console.error('[DiagnoseAuth] Refreshed token fetch failed:', fetchError.message);
    }
  }

  console.log('[DiagnoseAuth] Diagnosis complete');
}

/**
 * Call an Edge Function with an action and parameters
 * Includes automatic retry on 401 errors after refreshing the session
 */
export async function callEdgeFunction<T = unknown>(
  functionName: EdgeFunction,
  action: string,
  params: Record<string, unknown> = {},
  retryCount = 0
): Promise<{ data: T | null; error: Error | null }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { data: null, error: new Error('Supabase not configured') };
  }

  try {
    // Get current session and token
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    const token = session?.access_token;

    // Debug logging for auth state on first call to each function
    if (retryCount === 0) {
      console.log(`[EdgeFunction] Auth state for ${functionName}/${action}:`, {
        hasSession: !!session,
        hasAccessToken: !!token,
        tokenExpiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'none',
        tokenLength: token?.length || 0,
        tokenPrefix: token?.substring(0, 20) || 'none',
        userId: session?.user?.id || 'none',
      });
    }

    if (!token) {
      return { data: null, error: new Error('No auth token available') };
    }

    // Debug logging for sync requests to diagnose serialization issues
    if (action === 'sync_my_competition_daily_data') {
      console.log('[EdgeFunction] Preparing request body for sync_my_competition_daily_data:', {
        action,
        paramsKeys: Object.keys(params),
        recordsType: typeof params.records,
        recordsIsArray: Array.isArray(params.records),
        recordsLength: Array.isArray(params.records) ? (params.records as unknown[]).length : 'N/A',
        bodySize: JSON.stringify({ action, params }).length,
      });
    }

    // Use direct fetch with explicit token to avoid Supabase client caching issues
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ action, params }),
    });

    // Parse response
    const responseText = await response.text();
    let data: EdgeFunctionResponse<T> | null = null;
    let error: Error | null = null;

    // Log the raw response for debugging
    console.log(`[EdgeFunction] Response for ${functionName}/${action}:`, {
      status: response.status,
      ok: response.ok,
      bodyPreview: responseText.substring(0, 200),
    });

    if (!response.ok) {
      // Create an error object that mimics FunctionsHttpError
      error = new Error(`Edge Function returned a non-2xx status code`);
      (error as any).name = 'FunctionsHttpError';
      (error as any).status = response.status;
      (error as any).context = { body: responseText };

      console.log(`[EdgeFunction] ERROR ${response.status} for ${functionName}/${action}:`, responseText);
    } else {
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        error = new Error(`Failed to parse response: ${responseText.substring(0, 100)}`);
      }
    }

    if (error) {
      // Try to extract response body for better error details
      let errorDetails = '';
      const funcError = error as any;

      try {
        // Method 1: Check context.body (common in Supabase SDK)
        if (funcError.context?.body) {
          errorDetails = typeof funcError.context.body === 'string' ? funcError.context.body : JSON.stringify(funcError.context.body);
        }

        // Method 2: Check context object directly
        if (!errorDetails && funcError.context) {
          errorDetails = JSON.stringify(funcError.context);
        }

        // Method 3: Check response property
        if (!errorDetails && funcError.response) {
          errorDetails = JSON.stringify(funcError.response);
        }

        // Method 4: Try to read the body blob if available (React Native)
        if (!errorDetails && funcError._bodyBlob) {
          try {
            // React Native blob - try different methods
            if (typeof funcError._bodyBlob.text === 'function') {
              errorDetails = await funcError._bodyBlob.text();
            } else if (funcError._bodyBlob._data) {
              // React Native internal blob structure
              console.log('[EdgeFunction] Blob data structure:', funcError._bodyBlob._data);
            }
          } catch (blobErr) {
            console.log('[EdgeFunction] Blob read failed:', blobErr);
          }
        }

        // Method 5: Try _bodyInit which might be more accessible
        if (!errorDetails && funcError._bodyInit) {
          try {
            if (typeof funcError._bodyInit.text === 'function') {
              errorDetails = await funcError._bodyInit.text();
            } else if (funcError._bodyInit._data) {
              console.log('[EdgeFunction] BodyInit data structure:', funcError._bodyInit._data);
            }
          } catch (initErr) {
            console.log('[EdgeFunction] BodyInit read failed:', initErr);
          }
        }

        // Method 6: Check if error has a json() method (Response-like object)
        if (!errorDetails && typeof funcError.json === 'function') {
          try {
            const jsonBody = await funcError.json();
            errorDetails = JSON.stringify(jsonBody);
          } catch (jsonErr) {
            console.log('[EdgeFunction] JSON read failed:', jsonErr);
          }
        }

        // Method 7: Check if error has a text() method (Response-like object)
        if (!errorDetails && typeof funcError.text === 'function') {
          try {
            errorDetails = await funcError.text();
          } catch (textErr) {
            console.log('[EdgeFunction] Text read failed:', textErr);
          }
        }

        // Log all available error properties for debugging
        console.log(`[EdgeFunction] Error details for ${functionName}/${action}:`, {
          message: funcError.message,
          status: funcError.status,
          errorDetails: errorDetails || 'Could not extract error body',
        });
      } catch (extractErr) {
        console.log('[EdgeFunction] Error extraction failed:', extractErr);
      }

      // Check for 401 errors and retry after refreshing session
      // Note: We check for auth-related errors that might be fixable by session refresh
      const errorMessage = error.message || '';
      const errorName = (error as any).name || '';
      const errorStatus = (error as any).status;
      const fullErrorInfo = `${errorMessage} ${errorDetails}`.toLowerCase();

      // Log 401 detection details
      console.log(`[EdgeFunction] 401 detection for ${functionName}/${action}:`, {
        errorStatus,
        errorName,
        retryCount,
        hasUnauthorized: fullErrorInfo.includes('unauthorized'),
        has401: fullErrorInfo.includes('401'),
        fullErrorInfoPreview: fullErrorInfo.substring(0, 100),
      });

      // Detect auth errors - check status code directly (most reliable) or fall back to string matching
      const is401Error = errorStatus === 401 ||
                         fullErrorInfo.includes('unauthorized') ||
                         fullErrorInfo.includes('invalid jwt');

      console.log(`[EdgeFunction] is401Error: ${is401Error}, will retry: ${is401Error && retryCount < 1}`);

      if (is401Error && retryCount < 1) {
        console.log(`[EdgeFunction] Got auth error for ${functionName}/${action}, attempting session refresh...`);

        // Log current token state before refresh
        const { data: beforeSession } = await supabase.auth.getSession();
        console.log('[EdgeFunction] Token state BEFORE refresh:', {
          hasSession: !!beforeSession?.session,
          tokenExpiresAt: beforeSession?.session?.expires_at ? new Date(beforeSession.session.expires_at * 1000).toISOString() : 'none',
          isExpired: beforeSession?.session?.expires_at ? (beforeSession.session.expires_at * 1000 < Date.now()) : 'unknown',
        });

        // Try to refresh the session
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (!refreshError && refreshData.session) {
          console.log('[EdgeFunction] Token state AFTER refresh:', {
            newTokenExpiresAt: new Date(refreshData.session.expires_at! * 1000).toISOString(),
            tokenChanged: beforeSession?.session?.access_token !== refreshData.session.access_token,
            newTokenLength: refreshData.session.access_token?.length || 0,
          });
          console.log(`[EdgeFunction] Session refreshed successfully, retrying ${functionName}/${action}...`);
          // Retry the call with the fresh session
          return callEdgeFunction<T>(functionName, action, params, retryCount + 1);
        } else {
          console.error('[EdgeFunction] Session refresh failed:', refreshError?.message);
        }
      }

      // Log non-auth errors for debugging
      if (!is401Error) {
        console.error(`[EdgeFunction] Error from ${functionName}/${action}:`, errorMessage, errorDetails);
      }

      return { data: null, error };
    }

    if (data?.error) {
      // Also check for auth errors in the response body
      const errorLower = data.error.toLowerCase();
      const is401Response = errorLower.includes('unauthorized') ||
                            errorLower.includes('invalid jwt') ||
                            errorLower.includes('401');

      if (is401Response && retryCount < 1) {
        console.log(`[EdgeFunction] Got auth error in response for ${functionName}/${action}, attempting session refresh...`);

        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (!refreshError && refreshData.session) {
          console.log(`[EdgeFunction] Session refreshed successfully, retrying ${functionName}/${action}...`);
          return callEdgeFunction<T>(functionName, action, params, retryCount + 1);
        }
      }

      // Log non-auth errors for debugging
      if (!is401Response) {
        console.error(`[EdgeFunction] API error from ${functionName}/${action}:`, data.error);
      }

      return { data: null, error: new Error(data.error) };
    }

    return { data: data?.data ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unknown error'),
    };
  }
}

// ============================================
// Profile API
// ============================================

export const profileApi = {
  getMyProfile: () =>
    callEdgeFunction<{
      id: string;
      email: string;
      full_name: string;
      avatar_url: string | null;
      username: string | null;
      phone_number: string | null;
      primary_device: string | null;
      subscription_tier: string;
      ai_messages_used: number;
      ai_messages_reset_at: string | null;
      onboarding_completed: boolean;
      terms_accepted_at: string | null;
      privacy_accepted_at: string | null;
      guidelines_accepted_at: string | null;
      legal_agreement_version: string | null;
      created_at: string;
      updated_at: string;
    }>('profile-api', 'get_my_profile'),

  getUserProfile: (userId: string) =>
    callEdgeFunction<{
      id: string;
      username: string | null;
      full_name: string | null;
      avatar_url: string | null;
      subscription_tier: string;
      last_seen_at: string | null;
    }>('profile-api', 'get_user_profile', { user_id: userId }),

  checkUsernameAvailable: (username: string) =>
    callEdgeFunction<{ available: boolean }>('profile-api', 'check_username_available', { username }),

  getUserFitnessGoals: (userId?: string) =>
    callEdgeFunction<{
      move_goal: number;
      exercise_goal: number;
      stand_goal: number;
    }>('profile-api', 'get_user_fitness_goals', userId ? { user_id: userId } : {}),

  getUserActivityForDate: (userId: string, activityDate: string) =>
    callEdgeFunction('profile-api', 'get_user_activity_for_date', {
      user_id: userId,
      activity_date: activityDate,
    }),

  getUserCompetitionDailyDataForDate: (userId: string, dataDate: string) =>
    callEdgeFunction('profile-api', 'get_user_competition_daily_data_for_date', {
      user_id: userId,
      data_date: dataDate,
    }),

  getUserCompetitionStats: (userId?: string) =>
    callEdgeFunction('profile-api', 'get_user_competition_stats', userId ? { user_id: userId } : {}),

  getUserRecentActivity: (userId: string, limit?: number) =>
    callEdgeFunction('profile-api', 'get_user_recent_activity', {
      user_id: userId,
      limit: limit || 365,
    }),

  getUserAchievementProgress: (userId?: string) =>
    callEdgeFunction('profile-api', 'get_user_achievement_progress', userId ? { user_id: userId } : {}),

  updateLastSeen: () =>
    callEdgeFunction<{ last_seen_at: string }>('profile-api', 'update_last_seen'),

  updateTimezone: (timezone: string) =>
    callEdgeFunction<{ timezone: string }>('profile-api', 'update_timezone', { timezone }),

  updatePhoneVerified: (phoneNumber: string) =>
    callEdgeFunction<{ success: boolean }>('profile-api', 'update_phone_verified', { phone_number: phoneNumber }),

  savePhoneNumber: (phoneNumber: string) =>
    callEdgeFunction<{ success: boolean }>('profile-api', 'save_phone_number', { phone_number: phoneNumber }),

  getPhoneStatus: () =>
    callEdgeFunction<{ phone_verified: boolean }>('profile-api', 'get_phone_status'),

  revokePhone: () =>
    callEdgeFunction<{ success: boolean }>('profile-api', 'revoke_phone'),

  updateSubscriptionTier: (tier: string) =>
    callEdgeFunction<{ success: boolean }>('profile-api', 'update_subscription_tier', { subscription_tier: tier }),

  completeOnboarding: () =>
    callEdgeFunction<{ success: boolean }>('profile-api', 'complete_onboarding'),

  resetOnboarding: () =>
    callEdgeFunction<{ success: boolean }>('profile-api', 'reset_onboarding'),

  getFairPlayStatus: () =>
    callEdgeFunction<{ fair_play_acknowledged: boolean }>('profile-api', 'get_fair_play_status'),

  acknowledgeFairPlay: () =>
    callEdgeFunction<{ success: boolean }>('profile-api', 'acknowledge_fair_play'),

  getCoachIntroStatus: () =>
    callEdgeFunction<{ coach_spark_intro_seen: boolean }>('profile-api', 'get_coach_intro_status'),

  updateCoachIntroSeen: () =>
    callEdgeFunction<{ success: boolean }>('profile-api', 'update_coach_intro_seen'),
};

// ============================================
// Competition API
// ============================================

export const competitionApi = {
  getCompetitionFull: (competitionId: string) =>
    callEdgeFunction('competition-api', 'get_competition_full', { competition_id: competitionId }),

  getCompetitionParticipantsWithProfiles: (competitionId: string) =>
    callEdgeFunction<Array<{
      participant_id: string;
      user_id: string;
      joined_at: string;
      last_sync_at: string | null;
      total_points: number;
      move_calories: number;
      exercise_minutes: number;
      stand_hours: number;
      step_count: number;
      move_progress: number;
      exercise_progress: number;
      stand_progress: number;
      username: string | null;
      full_name: string | null;
      avatar_url: string | null;
      team_id: string | null;
    }>>('competition-api', 'get_competition_participants_with_profiles', { competition_id: competitionId }),

  getCompetitionPendingInvitations: (competitionId: string) =>
    callEdgeFunction('competition-api', 'get_competition_pending_invitations', { competition_id: competitionId }),

  getMyCompetitionIds: () =>
    callEdgeFunction<string[]>('competition-api', 'get_my_competition_ids'),

  getMyParticipantRecord: (competitionId: string) =>
    callEdgeFunction('competition-api', 'get_my_participant_record', { competition_id: competitionId }),

  getCompetitionScoringInfo: (competitionId: string) =>
    callEdgeFunction('competition-api', 'get_competition_scoring_info', { competition_id: competitionId }),

  getMyCompetitionDailyData: (competitionId: string, startDate?: string, endDate?: string) =>
    callEdgeFunction('competition-api', 'get_my_competition_daily_data', {
      competition_id: competitionId,
      start_date: startDate,
      end_date: endDate,
    }),

  syncMyCompetitionDailyData: async (competitionId: string, records: Array<{
    competition_id: string;
    participant_id: string;
    user_id: string;
    date: string;
    move_calories: number;
    exercise_minutes: number;
    stand_hours: number;
    step_count: number;
    distance_meters?: number;
    workouts_completed?: number;
    points: number;
  }>): Promise<{ data: { success: boolean; count: number } | null; error: Error | null }> => {
    // Debug logging reduced for performance
    // console.log('[EdgeFunction] syncMyCompetitionDailyData called:', competitionId, records?.length);

    if (!isSupabaseConfigured() || !supabase) {
      return { data: null, error: new Error('Supabase not configured') };
    }

    try {
      // Get the current session for auth token
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        return { data: null, error: new Error('No auth token available') };
      }

      // Serialize records to JSON string
      const recordsJson = JSON.stringify(records);

      // Use native fetch to get proper error response body
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/competition-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'sync_my_competition_daily_data',
          params: {
            competition_id: competitionId,
            records_json: recordsJson,
          },
        }),
      });

      // Read response body as text first
      const responseText = await response.text();
      console.log('[EdgeFunction] syncMyCompetitionDailyData raw response:', {
        status: response.status,
        ok: response.ok,
        responseText: responseText.substring(0, 500),
      });

      if (!response.ok) {
        // Try to parse error response
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
          console.error('[EdgeFunction] syncMyCompetitionDailyData ERROR DETAILS:', errorJson);
        } catch {
          errorMessage = responseText || errorMessage;
        }
        return { data: null, error: new Error(errorMessage) };
      }

      // Parse successful response
      const result = JSON.parse(responseText);
      return { data: result.data, error: null };
    } catch (error) {
      console.error('[EdgeFunction] syncMyCompetitionDailyData fetch error:', error);
      return { data: null, error: error instanceof Error ? error : new Error('Unknown error') };
    }
  },

  getCompetitionCreator: (competitionId: string) =>
    callEdgeFunction<string>('competition-api', 'get_competition_creator', { competition_id: competitionId }),

  getCompetitionName: (competitionId: string) =>
    callEdgeFunction<string>('competition-api', 'get_competition_name', { competition_id: competitionId }),

  getPublicCompetitions: (limit?: number, offset?: number) =>
    callEdgeFunction('competition-api', 'get_public_competitions', { limit, offset }),

  joinPublicCompetition: (competitionId: string, skipBuyIn?: boolean) =>
    callEdgeFunction('competition-api', 'join_public_competition', { competition_id: competitionId, skip_buy_in: skipBuyIn }),

  updateCompetition: (competitionId: string, updates: {
    name?: string;
    start_date?: string;
    end_date?: string;
    scoring_type?: string;
    is_public?: boolean;
  }) =>
    callEdgeFunction<{
      id: string;
      name: string;
      description: string;
      start_date: string;
      end_date: string;
      type: string;
      status: string;
      scoring_type: string;
      is_public: boolean;
    }>('competition-api', 'update_competition', {
      competition_id: competitionId,
      updates,
    }),

  getSeasonalEvents: () =>
    callEdgeFunction<SeasonalEvent[]>('competition-api', 'get_seasonal_events'),

  joinSeasonalEvent: (competitionId: string) =>
    callEdgeFunction('competition-api', 'join_seasonal_event', {
      competition_id: competitionId,
    }),

  // Team competitions
  getCompetitionTeams: (competitionId: string) =>
    callEdgeFunction<TeamInfo[]>('competition-api', 'get_competition_teams', {
      competition_id: competitionId,
    }),

  joinTeam: (competitionId: string, teamId: string) =>
    callEdgeFunction<{ success: boolean }>('competition-api', 'join_team', {
      competition_id: competitionId,
      team_id: teamId,
    }),

  createCompetitionTeams: (competitionId: string, teams: Array<{
    team_number: number; name: string; color: string; emoji: string;
  }>) =>
    callEdgeFunction('competition-api', 'create_competition_teams', {
      competition_id: competitionId,
      teams,
    }),

  // Prize pool amounts (batch fetch for display)
  getPrizePoolAmounts: (competitionIds: string[]) =>
    callEdgeFunction<Array<{ competition_id: string; total_amount: number }>>('competition-api', 'get_prize_pool_amounts', {
      competition_ids: competitionIds,
    }),

  lockParticipantScore: (competitionId: string, participantId: string) =>
    callEdgeFunction<{ success: boolean }>('competition-api', 'lock_participant_score', {
      competition_id: competitionId,
      participant_id: participantId,
    }),

  isScoreLocked: (competitionId: string) =>
    callEdgeFunction<{ locked: boolean }>('competition-api', 'is_score_locked', {
      competition_id: competitionId,
    }),

  createCompetition: (settings: {
    name: string;
    start_date: string;
    end_date: string;
    scoring_type: string;
    scoring_config?: unknown;
    is_public: boolean;
    repeat_option: string;
    is_draft?: boolean;
    is_team_competition?: boolean;
    team_count?: number;
  }) =>
    callEdgeFunction<{ competition_id: string }>('competition-api', 'create_competition', settings),

  deleteCompetition: (competitionId: string) =>
    callEdgeFunction<{ success: boolean }>('competition-api', 'delete_competition', {
      competition_id: competitionId,
    }),

  finalizeDraft: (competitionId: string) =>
    callEdgeFunction<{ success: boolean }>('competition-api', 'finalize_draft', {
      competition_id: competitionId,
    }),

  deleteDraft: (competitionId: string) =>
    callEdgeFunction<{ success: boolean }>('competition-api', 'delete_draft', {
      competition_id: competitionId,
    }),

  getMyParticipatedCompetitions: () =>
    callEdgeFunction<Array<{
      competition_id: string;
      total_points: number;
      competitions: {
        id: string;
        name: string;
        description: string;
        start_date: string;
        end_date: string;
        type: string;
        status: string;
        scoring_type: string;
        has_prize_pool: boolean;
      };
    }>>('competition-api', 'get_my_participated_competitions'),

  getUserPrizePayouts: (competitionIds: string[]) =>
    callEdgeFunction<Array<{ competition_id: string; payout_amount: number }>>('competition-api', 'get_user_prize_payouts', {
      competition_ids: competitionIds,
    }),

  processCompetitionCompletion: (competitionId: string) =>
    callEdgeFunction<{ processed: boolean; reason?: string }>('competition-api', 'process_competition_completion', {
      competition_id: competitionId,
    }),

  leaveCompetition: (competitionId: string, transactionId?: string) =>
    callEdgeFunctionDirect<{ success?: boolean; error?: string; requiresPayment?: boolean; amount?: number }>(
      'leave-competition',
      { competitionId, transactionId },
    ),

  updateMyParticipantTotals: (competitionId: string, totals: {
    move_calories: number;
    exercise_minutes: number;
    stand_hours: number;
    step_count: number;
    total_points: number;
    move_progress: number;
    exercise_progress: number;
    stand_progress: number;
  }) =>
    callEdgeFunction<{ success: boolean }>('competition-api', 'update_my_participant_totals', {
      competition_id: competitionId,
      totals,
    }),
};

// ============================================
// Team Competition Types
// ============================================

export interface TeamInfo {
  id: string;
  team_number: number;
  name: string;
  color: string;
  emoji: string;
  member_count: number;
  avg_points: number;
}

// ============================================
// Seasonal Event Types
// ============================================

export interface SeasonalEvent {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: string;
  scoring_type: string;
  is_seasonal_event: boolean;
  event_theme: {
    color: string;
    secondaryColor: string;
    icon: string;
    emoji: string;
    tagline: string;
    rewardDescription: string;
  } | null;
  event_reward: {
    type: string;
    trial_hours: number;
    min_days_completed: number;
    source: string;
  } | null;
  participant_count: number;
  user_joined: boolean;
}

// ============================================
// Friends API
// ============================================

export interface FriendLeaderboardEntry {
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  subscription_tier: string;
  daily_score: number;
  rings_closed: number;
  move_percentage: number;
  exercise_percentage: number;
  stand_percentage: number;
  rank: number;
  is_self: boolean;
}

export const friendsApi = {
  getMyFriends: () =>
    callEdgeFunction<Array<{
      friendship_id: string;
      friend_id: string;
      username: string | null;
      full_name: string | null;
      avatar_url: string | null;
      last_seen_at: string | null;
      subscription_tier: 'starter' | 'mover' | 'crusher' | null;
      created_at: string;
    }>>('friends-api', 'get_my_friends'),

  getPendingFriendRequests: () =>
    callEdgeFunction<Array<{
      request_id: string;
      sender_id: string;
      username: string | null;
      full_name: string | null;
      avatar_url: string | null;
      created_at: string;
    }>>('friends-api', 'get_pending_friend_requests'),

  getSentFriendRequests: () =>
    callEdgeFunction<Array<{
      request_id: string;
      recipient_id: string;
      username: string | null;
      full_name: string | null;
      avatar_url: string | null;
      created_at: string;
    }>>('friends-api', 'get_sent_friend_requests'),

  checkAreFriends: (otherUserId: string) =>
    callEdgeFunction<{ are_friends: boolean }>('friends-api', 'check_are_friends', { other_user_id: otherUserId }),

  createFriendship: (recipientId: string) =>
    callEdgeFunction('friends-api', 'create_friendship', { recipient_id: recipientId }),

  acceptFriendship: (params: { requestId?: string; friendId?: string }) =>
    callEdgeFunction('friends-api', 'accept_friendship', {
      request_id: params.requestId,
      friend_id: params.friendId,
    }),

  removeFriendship: (params: { friendshipId?: string; friendId?: string }) =>
    callEdgeFunction('friends-api', 'remove_friendship', {
      friendship_id: params.friendshipId,
      friend_id: params.friendId,
    }),

  getMyBlockedFriendships: () =>
    callEdgeFunction('friends-api', 'get_my_blocked_friendships'),

  blockUser: (blockedUserId: string) =>
    callEdgeFunction<{ success: boolean }>('friends-api', 'block_user', { blocked_user_id: blockedUserId }),

  getFriendsDailyLeaderboard: (targetDate?: string) => {
    // Use LOCAL date (not UTC) to match how activity data is stored
    // This ensures the leaderboard shows today's activity correctly in all timezones
    const today = new Date();
    const localDate = targetDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return callEdgeFunction<FriendLeaderboardEntry[]>(
      'friends-api',
      'get_friends_daily_leaderboard',
      { target_date: localDate }
    );
  },

  countBlocked: () =>
    callEdgeFunction<{ count: number }>('friends-api', 'count_blocked'),
};

// ============================================
// Activity API
// ============================================

export const activityApi = {
  getActivityFeed: (limit?: number, offset?: number) =>
    callEdgeFunction('activity-api', 'get_activity_feed', { limit, offset }),

  getActivityFeedProfiles: (userIds: string[]) =>
    callEdgeFunction('activity-api', 'get_activity_feed_profiles', { user_ids: userIds }),

  getActivityFeedReactions: (activityIds: string[]) =>
    callEdgeFunction('activity-api', 'get_activity_feed_reactions', { activity_ids: activityIds }),

  getActivityOwner: (activityId: string) =>
    callEdgeFunction<string>('activity-api', 'get_activity_owner', { activity_id: activityId }),

  addReaction: (activityId: string, reactionType: string) =>
    callEdgeFunction('activity-api', 'add_reaction', {
      activity_id: activityId,
      reaction_type: reactionType,
    }),

  removeReaction: (activityId: string) =>
    callEdgeFunction('activity-api', 'remove_reaction', { activity_id: activityId }),

  addComment: (activityId: string, content: string) =>
    callEdgeFunction('activity-api', 'add_comment', {
      activity_id: activityId,
      content,
    }),

  getActivityComments: (activityId: string) =>
    callEdgeFunction('activity-api', 'get_activity_comments', { activity_id: activityId }),
};

// ============================================
// Health API
// ============================================

export const healthApi = {
  getMyFitnessGoals: () =>
    callEdgeFunction<{
      move_goal: number;
      exercise_goal: number;
      stand_goal: number;
    }>('health-api', 'get_my_fitness_goals'),

  getMyWeightSettings: () =>
    callEdgeFunction<{
      weight: number | null;
      target_weight: number | null;
      start_weight: number | null;
      height: number | null;
    }>('health-api', 'get_my_weight_settings'),

  upsertMyFitness: (data: Record<string, unknown>) =>
    callEdgeFunction('health-api', 'upsert_my_fitness', data),

  checkActivityExistsToday: (activityType: string) =>
    callEdgeFunction<{ exists: boolean }>('health-api', 'check_activity_exists_today', { activity_type: activityType }),

  checkStreakMilestoneExists: (achievementType: string, streakDays: number) =>
    callEdgeFunction<{ exists: boolean }>('health-api', 'check_streak_milestone_exists', {
      achievement_type: achievementType,
      streak_days: streakDays,
    }),
};

// ============================================
// Invitation API
// ============================================

export const invitationApi = {
  getMyInvitations: () =>
    callEdgeFunction('invitation-api', 'get_my_invitations'),

  getInvitationCompetitionId: (invitationId: string) =>
    callEdgeFunction<string>('invitation-api', 'get_invitation_competition_id', { invitation_id: invitationId }),

  acceptCompetitionInvitation: (invitationId: string, skipBuyIn?: boolean) =>
    callEdgeFunction('invitation-api', 'accept_competition_invitation', { invitation_id: invitationId, skip_buy_in: skipBuyIn }),

  declineCompetitionInvitation: (invitationId: string) =>
    callEdgeFunction('invitation-api', 'decline_competition_invitation', { invitation_id: invitationId }),

  getExistingInvitationInvitees: (competitionId: string) =>
    callEdgeFunction<string[]>('invitation-api', 'get_existing_invitation_invitees', { competition_id: competitionId }),

  getInviterInfo: (inviterId: string) =>
    callEdgeFunction('invitation-api', 'get_inviter_info', { inviter_id: inviterId }),

  getCompetitionName: (competitionId: string) =>
    callEdgeFunction<string>('invitation-api', 'get_competition_name', { competition_id: competitionId }),

  createInvitations: (competitionId: string, inviteeIds: string[]) =>
    callEdgeFunction<{ success: boolean; created: number; invitee_ids?: string[] }>('invitation-api', 'create_invitations', {
      competition_id: competitionId,
      invitee_ids: inviteeIds,
    }),
};

// ============================================
// Settings API
// ============================================

export const settingsApi = {
  getMyNotificationPreferences: () =>
    callEdgeFunction('settings-api', 'get_my_notification_preferences'),

  upsertMyNotificationPreferences: (preferences: Record<string, unknown>) =>
    callEdgeFunction('settings-api', 'upsert_my_notification_preferences', preferences),

  getMyPrivacySettings: () =>
    callEdgeFunction('settings-api', 'get_my_privacy_settings'),

  upsertMyPrivacySettings: (settings: Record<string, unknown>) =>
    callEdgeFunction('settings-api', 'upsert_my_privacy_settings', settings),
};

// ============================================
// Search API
// ============================================

export const searchApi = {
  searchUsers: (query: string, limit?: number) =>
    callEdgeFunction('search-api', 'search_users', { query, limit }),

  searchUsersByEmails: (emails: string[], limit?: number) =>
    callEdgeFunction('search-api', 'search_users_by_emails', { emails, limit }),

  searchUsersByPhones: (phones: string[], limit?: number) =>
    callEdgeFunction('search-api', 'search_users_by_phones', { phones, limit }),
};

// ============================================
// Moderation API
// ============================================

export const moderationApi = {
  getActiveSuspension: () =>
    callEdgeFunction('moderation-api', 'get_active_suspension'),

  hasActiveSuspension: (userId?: string) =>
    callEdgeFunction<boolean>('moderation-api', 'has_active_suspension', userId ? { user_id: userId } : {}),

  getUnacknowledgedWarning: () =>
    callEdgeFunction('moderation-api', 'get_unacknowledged_warning'),

  hasUnacknowledgedWarnings: (userId?: string) =>
    callEdgeFunction<boolean>('moderation-api', 'has_unacknowledged_warnings', userId ? { user_id: userId } : {}),

  acknowledgeWarning: (warningId: string) =>
    callEdgeFunction('moderation-api', 'acknowledge_warning', { warning_id: warningId }),
};

// ============================================
// Achievements API
// ============================================

export const achievementsApi = {
  getMyAchievements: () =>
    callEdgeFunction('achievements-api', 'get_my_achievements'),
};

// ============================================
// Chat API
// ============================================

export const chatApi = {
  getMyChatMessages: (competitionId: string, limit?: number, offset?: number) =>
    callEdgeFunction('chat-api', 'get_my_chat_messages', {
      competition_id: competitionId,
      limit,
      offset,
    }),

  getChatUserProfile: (userId: string) =>
    callEdgeFunction('chat-api', 'get_chat_user_profile', { user_id: userId }),

  sendMessage: (competitionId: string, messageContent: string) =>
    callEdgeFunction<{
      id: string;
      competition_id: string;
      sender_id: string;
      message_content: string;
      created_at: string;
      sender_username: string | null;
      sender_full_name: string | null;
      sender_avatar_url: string | null;
    }>('chat-api', 'send_message', {
      competition_id: competitionId,
      message_content: messageContent,
    }),

  getMessageReactions: (messageId: string) =>
    callEdgeFunction<Record<string, string[]>>('chat-api', 'get_message_reactions', {
      message_id: messageId,
    }),

  addChatReaction: (messageId: string, reactionType: string) =>
    callEdgeFunction<{
      id: string;
      message_id: string;
      user_id: string;
      reaction_type: string;
      created_at: string;
    }>('chat-api', 'add_chat_reaction', {
      message_id: messageId,
      reaction_type: reactionType,
    }),

  removeChatReaction: (messageId: string, reactionType?: string) =>
    callEdgeFunction<{ success: boolean }>('chat-api', 'remove_chat_reaction', {
      message_id: messageId,
      reaction_type: reactionType,
    }),
};

// ============================================
// DM (Direct Messages) API
// ============================================

export interface DMConversationSummary {
  id: string;
  partner: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  };
  last_message: {
    content: string;
    created_at: string;
    sender_id: string;
  } | null;
  unread_count: number;
  updated_at: string;
}

export interface DMMessageRaw {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_content: string;
  read_at: string | null;
  created_at: string;
  sender_username: string | null;
  sender_full_name: string | null;
  sender_avatar_url: string | null;
  reactions: Record<string, string[]> | null;
}

export const dmApi = {
  getConversations: () =>
    callEdgeFunction<DMConversationSummary[]>('dm-api', 'get_conversations'),

  getOrCreateConversation: (friendId: string) =>
    callEdgeFunction<{
      id: string;
      partner: {
        id: string;
        username: string | null;
        full_name: string | null;
        avatar_url: string | null;
      };
    }>('dm-api', 'get_or_create_conversation', { friend_id: friendId }),

  getMessages: (conversationId: string, limit?: number, offset?: number) =>
    callEdgeFunction<DMMessageRaw[]>('dm-api', 'get_messages', {
      conversation_id: conversationId,
      limit,
      offset,
    }),

  sendMessage: (conversationId: string, messageContent: string) =>
    callEdgeFunction<DMMessageRaw>('dm-api', 'send_message', {
      conversation_id: conversationId,
      message_content: messageContent,
    }),

  markRead: (conversationId: string) =>
    callEdgeFunction<{ success: boolean; count: number }>('dm-api', 'mark_read', {
      conversation_id: conversationId,
    }),

  addReaction: (messageId: string, reactionType: string) =>
    callEdgeFunction<{
      id: string;
      message_id: string;
      user_id: string;
      reaction_type: string;
      created_at: string;
    }>('dm-api', 'add_reaction', {
      message_id: messageId,
      reaction_type: reactionType,
    }),

  removeReaction: (messageId: string, reactionType?: string) =>
    callEdgeFunction<{ success: boolean }>('dm-api', 'remove_reaction', {
      message_id: messageId,
      reaction_type: reactionType,
    }),
};

// ============================================
// Invite API
// ============================================

export const inviteApi = {
  getInviteCode: (competitionId: string) =>
    callEdgeFunction<{ invite_code: string }>('invite-api', 'get_invite_code', {
      competition_id: competitionId,
    }),

  getCompetitionByInvite: (inviteCode: string) =>
    callEdgeFunction<{
      id: string;
      name: string;
      description: string | null;
      start_date: string;
      end_date: string;
      status: string;
      scoring_type: string;
      max_participants: number | null;
      is_public: boolean;
      participant_count: number;
      creator_name: string;
    }>('invite-api', 'get_competition_by_invite', {
      invite_code: inviteCode,
    }),

  joinByInvite: (inviteCode: string, skipBuyIn?: boolean) =>
    callEdgeFunction<{
      success: boolean;
      already_joined?: boolean;
      competition_id?: string;
      competition_name?: string;
      error?: string;
    }>('invite-api', 'join_by_invite', {
      invite_code: inviteCode,
      skip_buy_in: skipBuyIn,
    }),
};

// ============================================
// Streak API (Movement Trail)
// ============================================

export type StreakRewardType =
  | 'badge'
  | 'trial_mover'
  | 'trial_coach'
  | 'trial_crusher'
  | 'profile_frame'
  | 'leaderboard_flair'
  | 'app_icon'
  | 'points_multiplier'
  | 'custom';

export type ActivityType =
  | 'steps'
  | 'workout'
  | 'competition_goal'
  | 'active_minutes'
  | 'rings_closed'
  | 'custom';

export interface StreakMilestone {
  id: string;
  day_number: number;
  name: string;
  description: string;
  reward_type: StreakRewardType;
  reward_value: Record<string, unknown>;
  icon_name: string;
  celebration_type: string;
  is_repeatable: boolean;
  repeat_interval: number | null;
}

export interface UserStreak {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  streak_started_at: string | null;
  timezone: string;
  streak_shields_available: number;
  streak_shields_used_this_week: number;
  shield_week_start: string | null;
  total_active_days: number;
}

export interface MilestoneProgress {
  id: string;
  user_id: string;
  milestone_id: string;
  earned_at: string;
  reward_claimed: boolean;
  reward_claimed_at: string | null;
  reward_expires_at: string | null;
  milestone?: StreakMilestone;
}

export interface LogActivityResult {
  activity_logged: boolean;
  activity_date: string;
  qualifies_for_streak: boolean;
  was_new_qualifying_activity: boolean;
  streak_processed: boolean;
  streak_status: {
    current_streak: number;
    longest_streak: number;
    streak_continued: boolean;
    streak_started: boolean;
    streak_broken: boolean;
    shield_used: boolean;
    shields_remaining: number;
    milestones_earned: Array<{
      milestone_id: string;
      day_number: number;
      name: string;
      description: string;
      reward_type: StreakRewardType;
      reward_value: Record<string, unknown>;
      icon_name: string;
      celebration_type: string;
      reward_expires_at: string | null;
    }>;
    next_milestone: {
      day_number: number;
      name: string;
      days_away: number;
    } | null;
    total_active_days: number;
  } | null;
}

export interface ProcessStreakResult {
  current_streak: number;
  longest_streak: number;
  streak_continued: boolean;
  streak_started: boolean;
  streak_broken: boolean;
  shield_used: boolean;
  shields_remaining: number;
  milestones_earned: Array<{
    milestone_id: string;
    day_number: number;
    name: string;
    description: string;
    reward_type: StreakRewardType;
    reward_value: Record<string, unknown>;
    icon_name: string;
    celebration_type: string;
    reward_expires_at: string | null;
  }>;
  next_milestone: {
    day_number: number;
    name: string;
    days_away: number;
  } | null;
  total_active_days: number;
}

export const streakApi = {
  /**
   * Get the current user's streak data
   */
  getMyStreak: () =>
    callEdgeFunction<UserStreak>('health-api', 'get_my_streak'),

  /**
   * Get all available streak milestones
   */
  getAllMilestones: () =>
    callEdgeFunction<StreakMilestone[]>('health-api', 'get_all_milestones'),

  /**
   * Get the current user's milestone progress (earned milestones)
   */
  getMyMilestoneProgress: () =>
    callEdgeFunction<MilestoneProgress[]>('health-api', 'get_my_milestone_progress'),

  /**
   * Log an activity and process the streak
   * This is the main entry point for streak updates
   */
  logActivity: async (
    activityType: ActivityType,
    activityValue: number,
    source = 'manual'
  ): Promise<{ data: LogActivityResult | null; error: Error | null }> => {
    if (!isSupabaseConfigured() || !supabase) {
      return { data: null, error: new Error('Supabase not configured') };
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        return { data: null, error: new Error('No auth token available') };
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/log-streak-activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          activity_type: activityType,
          activity_value: activityValue,
          source,
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = responseText || errorMessage;
        }
        return { data: null, error: new Error(errorMessage) };
      }

      const result = JSON.parse(responseText);
      return { data: result.data, error: null };
    } catch (error) {
      console.error('[streakApi] logActivity error:', error);
      return { data: null, error: error instanceof Error ? error : new Error('Unknown error') };
    }
  },

  /**
   * Process the daily streak (can be called directly or by log-streak-activity)
   */
  processStreak: async (): Promise<{ data: ProcessStreakResult | null; error: Error | null }> => {
    if (!isSupabaseConfigured() || !supabase) {
      return { data: null, error: new Error('Supabase not configured') };
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        return { data: null, error: new Error('No auth token available') };
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/process-daily-streak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = responseText || errorMessage;
        }
        return { data: null, error: new Error(errorMessage) };
      }

      const result = JSON.parse(responseText);
      return { data: result.data, error: null };
    } catch (error) {
      console.error('[streakApi] processStreak error:', error);
      return { data: null, error: error instanceof Error ? error : new Error('Unknown error') };
    }
  },

  /**
   * Claim a milestone reward
   */
  claimReward: (milestoneProgressId: string) =>
    callEdgeFunction<{ success: boolean; reward_claimed_at: string }>(
      'health-api',
      'claim_streak_reward',
      { milestone_progress_id: milestoneProgressId }
    ),

  /**
   * Use a streak shield to protect the streak
   */
  useShield: () =>
    callEdgeFunction<{
      success: boolean;
      current_streak: number;
      shields_remaining: number;
    }>('health-api', 'use_streak_shield'),

  /**
   * Update the user's timezone
   */
  updateTimezone: (timezone: string) =>
    callEdgeFunction<{ success: boolean; timezone: string }>(
      'health-api',
      'update_streak_timezone',
      { timezone }
    ),

  /**
   * Get streak status for a specific user (for leaderboards)
   */
  getUserStreak: (userId: string) =>
    callEdgeFunction<{
      current_streak: number;
      longest_streak: number;
      total_active_days: number;
    }>('health-api', 'get_user_streak', { user_id: userId }),
};

// ============================================
// Referral API
// ============================================

export const referralApi = {
  getMyReferralCode: () =>
    callEdgeFunction<{
      referral_code: string;
      referral_link: string;
      referrer_name: string;
    }>('referral-api', 'get_my_referral_code'),

  getUserByReferralCode: (referralCode: string) =>
    callEdgeFunction<{
      referrer_name: string;
      referrer_avatar: string | null;
      reward_description: string;
    }>('referral-api', 'get_user_by_referral_code', {
      referral_code: referralCode,
    }),

  registerReferral: (referralCode: string) =>
    callEdgeFunction<{
      success: boolean;
      referral_id: string;
      message: string;
    }>('referral-api', 'register_referral', {
      referral_code: referralCode,
    }),

  processReferralRewards: () =>
    callEdgeFunction<{
      success: boolean;
      rewards_granted: {
        referee_reward: boolean;
        referrer_reward: boolean;
      };
      trial_type: string;
      trial_duration_days: number;
    }>('referral-api', 'process_referral_rewards'),

  getMyReferralStats: () =>
    callEdgeFunction<{
      total_referrals: number;
      completed_referrals: number;
    }>('referral-api', 'get_my_referral_stats'),
};

// ============================================
// Trials API
// ============================================

export const trialsApi = {
  activateTrialReward: (milestoneProgressId: string) =>
    callEdgeFunction<{
      trial: {
        id: string;
        milestoneProgressId: string;
        milestoneName: string;
        rewardType: string;
        activatedAt: string;
        expiresAt: string;
        isActive: boolean;
        hoursRemaining: number;
        minutesRemaining: number;
      };
    }>('trials-api', 'activate_trial_reward', {
      milestone_progress_id: milestoneProgressId,
    }),

  getActiveTrials: () =>
    callEdgeFunction<Array<{
      id: string;
      milestone_id: string;
      earned_at: string;
      reward_claimed: boolean;
      reward_claimed_at: string | null;
      reward_expires_at: string | null;
      milestone: {
        id: string;
        name: string;
        reward_type: string;
        reward_value: Record<string, unknown>;
      };
    }>>('trials-api', 'get_active_trials'),
};

// ============================================
// Prize API
// ============================================

export const prizeApi = {
  getMyPrizePayouts: () =>
    callEdgeFunction<Array<{
      id: string;
      competition_id: string;
      placement: number;
      payout_amount: number;
      status: string;
      claim_status: string;
      chosen_reward_type: string | null;
      claim_expires_at: string | null;
      recipient_email: string;
      seen_by_winner: boolean;
      created_at: string;
      competitions: { name: string } | null;
    }>>('prize-api', 'get_my_prize_payouts'),

  markPrizeSeen: (payoutId: string) =>
    callEdgeFunction<{ success: boolean }>('prize-api', 'mark_prize_seen', {
      payout_id: payoutId,
    }),
};

// ============================================
// Challenges API
// ============================================

export interface WeeklyChallenge {
  id: string;
  title: string;
  description: string | null;
  challenge_type: string;
  target_value: number;
  reward_type: string | null;
  reward_value: Record<string, unknown>;
  starts_at: string;
  ends_at: string;
  min_tier: string | null;
  icon: string;
  accent_color: string;
  is_active: boolean;
}

export interface ChallengeProgress {
  id: string;
  user_id: string;
  challenge_id: string;
  current_value: number;
  completed_at: string | null;
  reward_claimed: boolean;
  reward_claimed_at: string | null;
  challenge?: WeeklyChallenge;
}

export interface ChallengeWithProgress extends WeeklyChallenge {
  progress: {
    current_value: number;
    completed_at: string | null;
    reward_claimed: boolean;
  } | null;
}

export const challengesApi = {
  getActiveChallenges: () =>
    callEdgeFunction<ChallengeWithProgress[]>('challenges-api', 'get_active_challenges'),

  getChallengeProgress: (challengeId: string) =>
    callEdgeFunction<ChallengeProgress>('challenges-api', 'get_challenge_progress', {
      challenge_id: challengeId,
    }),

  getAllProgress: () =>
    callEdgeFunction<ChallengeProgress[]>('challenges-api', 'get_all_progress'),

  claimReward: (challengeId: string) =>
    callEdgeFunction<{
      success: boolean;
      reward_type: string;
      reward_value: Record<string, unknown>;
    }>('challenges-api', 'claim_reward', {
      challenge_id: challengeId,
    }),

  updateProgress: (challengeType: string, increment: number = 1) =>
    callEdgeFunction<Array<{
      challenge_id: string;
      new_value: number;
      just_completed: boolean;
    }>>('challenges-api', 'update_progress', {
      challenge_type: challengeType,
      increment,
    }),

  generateChallenges: () =>
    callEdgeFunction<{
      generated: boolean;
      challenges: ChallengeWithProgress[];
    }>('challenges-api', 'generate_challenges'),
};

// ============================================
// Weekly Recap API
// ============================================

export interface WeeklyRecapData {
  // Ring stats
  totalRingsClosed: number;
  avgMovePercent: number;
  avgExercisePercent: number;
  avgStandPercent: number;
  bestDay: string | null;
  bestDayRings: number;
  daysWithActivity: number;

  // Competition stats
  competitionsPlayed: number;
  competitionsWon: number;
  bestPlacement: number | null;

  // Streak stats
  currentStreak: number;
  streakGained: number;

  // Achievement stats
  achievementsUnlocked: number;
  achievementNames: string[];

  // Friend stats
  topFriend: {
    name: string;
    ringsClosed: number;
  } | null;
}

export const recapApi = {
  getMyWeeklyRecap: () =>
    callEdgeFunction<WeeklyRecapData>('recap-api', 'get_my_weekly_recap'),
};

// ============================================
// Direct Edge Function Caller
// For functions that use a flat body (not action/params pattern)
// ============================================

export async function callEdgeFunctionDirect<T = unknown>(
  functionName: EdgeFunction,
  body: Record<string, unknown> = {},
): Promise<{ data: T | null; error: Error | null }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { data: null, error: new Error('Supabase not configured') };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return { data: null, error: new Error('No auth token available') };
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMessage = `Edge Function returned a non-2xx status code`;
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }

      const error = new Error(errorMessage);
      (error as any).status = response.status;
      console.error(`[EdgeFunction] Error from ${functionName}:`, errorMessage);
      return { data: null, error };
    }

    try {
      const parsed = JSON.parse(responseText);
      return { data: (parsed.data ?? parsed) as T, error: null };
    } catch {
      return { data: null, error: new Error(`Failed to parse response from ${functionName}`) };
    }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unknown error'),
    };
  }
}

// ============================================
// Notification API
// ============================================

export const notificationApi = {
  send: async (
    type: string,
    recipientUserId: string,
    data: Record<string, unknown>,
    senderUserId?: string,
  ): Promise<void> => {
    try {
      await callEdgeFunctionDirect('send-notification', {
        type,
        recipientUserId,
        senderUserId,
        data,
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  },
};

// ============================================
// Achievement Update API (standalone function)
// ============================================

export const achievementUpdateApi = {
  update: (userId: string, eventType: string, eventData?: Record<string, unknown>) =>
    callEdgeFunctionDirect<{ newUnlocks: Array<{ achievementId: string; tier: string }> }>(
      'update-achievements',
      { userId, eventType, eventData },
    ),
};

// ============================================
// Create Activity API (standalone function)
// ============================================

export const createActivityApi = {
  create: (userId: string, activityType: string, metadata?: Record<string, unknown>) =>
    callEdgeFunctionDirect('create-activity', { userId, activityType, metadata }),
};

// ============================================
// Leave Competition (standalone function)
// ============================================

// Added to competitionApi below — use competitionApi.leaveCompetition(...)

// ============================================
// Standalone Function Wrappers
// ============================================

export const syncApi = {
  calculateDailyScore: (body: Record<string, unknown>) =>
    callEdgeFunctionDirect('calculate-daily-score', body),

  syncProviderData: (provider: string, date: string) =>
    callEdgeFunctionDirect('sync-provider-data', { provider, date }),

  backfillHistoricalData: (provider: string, activityDays: number, weightDays: number) =>
    callEdgeFunctionDirect('backfill-historical-data', { provider, activityDays, weightDays }),
};

export const providerApi = {
  disconnect: (provider: string) =>
    callEdgeFunctionDirect('disconnect-oauth-provider', { provider }),
};

export const dataExportApi = {
  exportUserData: () =>
    callEdgeFunctionDirect<{ download_url: string }>('export-user-data', {}),
};

// ============================================
// Cosmetics API
// ============================================

export type CosmeticType =
  | 'profile_frame'
  | 'achievement_badge'
  | 'profile_background'
  | 'app_icon'
  | 'ring_theme'
  | 'streak_freeze'
  | 'competition_boost';

export type CosmeticRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface CosmeticItem {
  id: string;
  name: string;
  description: string | null;
  cosmetic_type: CosmeticType;
  rarity: CosmeticRarity;
  earned_coin_price: number | null;
  premium_coin_price: number | null;
  unlock_condition: Record<string, unknown> | null;
  subscription_tier_required: string | null;
  asset_url: string | null;
  preview_url: string | null;
  theme_config: { move: string; exercise: string; stand: string } | null;
  is_consumable: boolean;
  consumable_duration_hours: number | null;
  consumable_effect: Record<string, unknown> | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  // Added by store query
  is_owned?: boolean;
  is_equipped?: boolean;
  owned_count?: number;
}

export interface UserCoinBalance {
  id: string;
  user_id: string;
  earned_coins: number;
  premium_coins: number;
  lifetime_earned_coins: number;
  lifetime_premium_coins: number;
  lifetime_spent_earned: number;
  lifetime_spent_premium: number;
  updated_at: string;
}

export interface CosmeticInventoryItem {
  id: string;
  user_id: string;
  cosmetic_item_id: string;
  acquired_at: string;
  acquisition_type: 'purchase' | 'unlock' | 'gift' | 'reward';
  coins_spent_earned: number;
  coins_spent_premium: number;
  is_equipped: boolean;
  is_consumed: boolean;
  consumed_at: string | null;
  expires_at: string | null;
  cosmetic_item?: CosmeticItem;
}

export interface CoinTransaction {
  id: string;
  user_id: string;
  transaction_type: string;
  earned_coin_delta: number;
  premium_coin_delta: number;
  earned_coin_balance_after: number;
  premium_coin_balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface IapCoinProduct {
  id: string;
  revenuecat_product_id: string;
  name: string;
  description: string | null;
  premium_coins: number;
  bonus_coins: number;
  price_usd: number;
  sort_order: number;
  is_featured: boolean;
  is_active: boolean;
}

export interface ActiveCosmeticEffect {
  user_id: string;
  effect_type: string;
  cosmetic_item_id: string;
  inventory_id: string;
  activated_at: string;
  expires_at: string | null;
  competition_id: string | null;
  cosmetic_item?: CosmeticItem;
}

export const cosmeticsApi = {
  /**
   * Get all active cosmetic items in the store with user ownership status
   */
  getStoreCatalog: (filters?: { cosmetic_type?: CosmeticType; rarity?: CosmeticRarity }) =>
    callEdgeFunction<CosmeticItem[]>('cosmetics-api', 'get_store_catalog', filters || {}),

  /**
   * Get user's owned cosmetics inventory
   */
  getMyInventory: (filters?: { cosmetic_type?: CosmeticType; rarity?: CosmeticRarity }) =>
    callEdgeFunction<CosmeticInventoryItem[]>('cosmetics-api', 'get_my_inventory', filters || {}),

  /**
   * Get user's current coin balances
   */
  getMyCoinBalance: () =>
    callEdgeFunction<UserCoinBalance>('cosmetics-api', 'get_my_coin_balance'),

  /**
   * Purchase a cosmetic item with earned or premium coins
   */
  purchaseCosmetic: (cosmeticItemId: string, usePremiumCoins = false) =>
    callEdgeFunction<{
      success: boolean;
      inventory_item: CosmeticInventoryItem;
      transaction: CoinTransaction;
    }>('cosmetics-api', 'purchase_cosmetic', {
      cosmetic_item_id: cosmeticItemId,
      use_premium_coins: usePremiumCoins,
    }),

  /**
   * Equip a non-consumable cosmetic from inventory
   */
  equipCosmetic: (inventoryId: string) =>
    callEdgeFunction<{ success: boolean; effect_type: string }>(
      'cosmetics-api',
      'equip_cosmetic',
      { inventory_id: inventoryId }
    ),

  /**
   * Unequip a cosmetic
   */
  unequipCosmetic: (inventoryId: string) =>
    callEdgeFunction<{ success: boolean }>(
      'cosmetics-api',
      'unequip_cosmetic',
      { inventory_id: inventoryId }
    ),

  /**
   * Use a consumable (streak freeze or competition boost)
   */
  useConsumable: (inventoryId: string, competitionId?: string) =>
    callEdgeFunction<{
      success: boolean;
      effect_type: string;
      expires_at: string | null;
      effect: Record<string, unknown>;
    }>('cosmetics-api', 'use_consumable', {
      inventory_id: inventoryId,
      competition_id: competitionId,
    }),

  /**
   * Get currently active cosmetic effects (equipped items, active consumables)
   */
  getActiveEffects: () =>
    callEdgeFunction<ActiveCosmeticEffect[]>('cosmetics-api', 'get_active_effects'),

  /**
   * Get available IAP coin bundles
   */
  getCoinBundles: () =>
    callEdgeFunction<IapCoinProduct[]>('cosmetics-api', 'get_coin_bundles'),

  /**
   * Get coin transaction history
   */
  getTransactionHistory: (limit = 50, offset = 0) =>
    callEdgeFunction<{
      transactions: CoinTransaction[];
      total_count: number;
      limit: number;
      offset: number;
    }>('cosmetics-api', 'get_transaction_history', { limit, offset }),

  /**
   * Get coin reward configuration (for displaying how many coins activities give)
   */
  getRewardConfig: () =>
    callEdgeFunction<Record<string, number>>('cosmetics-api', 'get_reward_config'),

  /**
   * Unlock a cosmetic via achievement (internal use)
   */
  unlockCosmetic: (cosmeticItemId: string) =>
    callEdgeFunction<{
      success: boolean;
      already_owned?: boolean;
      inventory_item?: CosmeticInventoryItem;
    }>('cosmetics-api', 'unlock_cosmetic', { cosmetic_item_id: cosmeticItemId }),
};

// ============================================
// Process Coin Reward API (internal use)
// ============================================

export const coinRewardApi = {
  /**
   * Process a coin reward for a user (called by other edge functions)
   */
  processReward: (
    userId: string,
    rewardType: string,
    options?: {
      referenceType?: string;
      referenceId?: string;
      metadata?: Record<string, unknown>;
      overrideAmount?: number;
    }
  ) =>
    callEdgeFunction<{
      success: boolean;
      coins_awarded: number;
      reason?: string;
      transaction?: CoinTransaction;
    }>('process-coin-reward', 'process_reward', {
      user_id: userId,
      reward_type: rewardType,
      reference_type: options?.referenceType,
      reference_id: options?.referenceId,
      metadata: options?.metadata,
      override_amount: options?.overrideAmount,
    }),

  /**
   * Credit coins from an IAP purchase
   */
  creditIapPurchase: (userId: string, productId: string, transactionId: string) =>
    callEdgeFunction<{
      success: boolean;
      premium_coins_credited: number;
      product: IapCoinProduct;
      transaction: CoinTransaction;
    }>('process-coin-reward', 'credit_iap_purchase', {
      user_id: userId,
      product_id: productId,
      transaction_id: transactionId,
    }),

  /**
   * Get user's coin balance
   */
  getUserBalance: (userId: string) =>
    callEdgeFunction<UserCoinBalance>('process-coin-reward', 'get_user_balance', {
      user_id: userId,
    }),
};
