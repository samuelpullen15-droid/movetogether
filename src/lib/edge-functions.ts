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
  | 'invite-api';

interface EdgeFunctionResponse<T = unknown> {
  data?: T;
  error?: string;
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

    const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse<T>>(
      functionName,
      {
        body: { action, params },
      }
    );

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
      // Note: We specifically check for 401/Unauthorized/Invalid JWT
      // Other errors (403 Forbidden, 400 Bad Request, etc.) should not trigger session refresh
      const errorMessage = error.message || '';
      const fullErrorInfo = `${errorMessage} ${errorDetails}`.toLowerCase();
      const is401Error = fullErrorInfo.includes('401') ||
                         fullErrorInfo.includes('unauthorized') ||
                         fullErrorInfo.includes('invalid jwt');

      if (is401Error && retryCount < 1) {
        console.log(`[EdgeFunction] Got auth error for ${functionName}/${action}, attempting session refresh...`);

        // Try to refresh the session
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (!refreshError && refreshData.session) {
          console.log(`[EdgeFunction] Session refreshed successfully, retrying ${functionName}/${action}...`);
          // Retry the call with the fresh session
          return callEdgeFunction<T>(functionName, action, params, retryCount + 1);
        } else {
          console.error('[EdgeFunction] Session refresh failed:', refreshError);
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

  joinPublicCompetition: (competitionId: string) =>
    callEdgeFunction('competition-api', 'join_public_competition', { competition_id: competitionId }),

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
};

// ============================================
// Friends API
// ============================================

export const friendsApi = {
  getMyFriends: () =>
    callEdgeFunction<Array<{
      friendship_id: string;
      friend_id: string;
      username: string | null;
      full_name: string | null;
      avatar_url: string | null;
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

  acceptCompetitionInvitation: (invitationId: string) =>
    callEdgeFunction('invitation-api', 'accept_competition_invitation', { invitation_id: invitationId }),

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

  joinByInvite: (inviteCode: string) =>
    callEdgeFunction<{
      success: boolean;
      already_joined?: boolean;
      competition_id?: string;
      competition_name?: string;
      error?: string;
    }>('invite-api', 'join_by_invite', {
      invite_code: inviteCode,
    }),
};
