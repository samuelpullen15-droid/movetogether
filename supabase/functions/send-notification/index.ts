import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type NotificationType =
  | 'friend_request_received'
  | 'friend_request_accepted'
  | 'competition_invite'
  | 'competition_joined'
  | 'competition_left'
  | 'competition_won'
  | 'competition_position_change'
  | 'activity_posted'
  | 'activity_reaction'
  | 'rings_closed'
  | 'achievement_unlocked';

// Map notification types to preference columns
type PreferenceKey = 'competition_push' | 'friends_push' | 'achievements_push' | 'coach_push' | 'account_push';

const NOTIFICATION_TO_PREFERENCE: Record<NotificationType, PreferenceKey> = {
  // Friend-related notifications
  friend_request_received: 'friends_push',
  friend_request_accepted: 'friends_push',
  activity_posted: 'friends_push',
  activity_reaction: 'friends_push',

  // Competition-related notifications
  competition_invite: 'competition_push',
  competition_joined: 'competition_push',
  competition_left: 'competition_push',
  competition_won: 'competition_push',
  competition_position_change: 'competition_push',

  // Achievement notifications
  achievement_unlocked: 'achievements_push',
  rings_closed: 'achievements_push',
};

interface SendNotificationRequest {
  type: NotificationType;
  recipientUserId: string;
  data: Record<string, any>;
}

const NOTIFICATION_TEMPLATES: Record<NotificationType, {
  title: (data: any) => string;
  body: (data: any) => string;
}> = {
  // Friend requests
  friend_request_received: {
    title: () => 'New Friend Request',
    body: (data) => `${data.senderName} wants to be your friend!`,
  },
  friend_request_accepted: {
    title: () => 'Friend Request Accepted',
    body: (data) => `${data.friendName} accepted your friend request!`,
  },

  // Competitions
  competition_invite: {
    title: () => 'Competition Invite 🏆',
    body: (data) => `${data.inviterName} invited you to "${data.competitionName}"!`,
  },
  competition_joined: {
    title: (data) => data.competitionName,
    body: (data) => `${data.participantName} joined the competition!`,
  },
  competition_left: {
    title: (data) => data.competitionName,
    body: (data) => `${data.participantName} left the competition.`,
  },
  competition_won: {
    title: () => '🏆 Competition Complete!',
    body: (data) => `You won "${data.competitionName}"! Congratulations!`,
  },
  competition_position_change: {
    title: (data) => data.competitionName,
    body: (data) => `${data.opponentName} just jumped ahead of you! Time to workout! 💪`,
  },
  
  // Activity feed
  activity_posted: {
    title: () => 'Friend Activity',
    body: (data) => `${data.friendName} ${data.activitySummary}`,
  },
  activity_reaction: {
    title: () => 'New Reaction',
    body: (data) => `${data.reactorName} reacted ${data.reaction} to your post!`,
  },
  
  // Health
  rings_closed: {
    title: () => '🎉 Rings Closed!',
    body: () => 'Congratulations! You closed all your rings today!',
  },
  
  // Achievements
  achievement_unlocked: {
    title: () => '🏅 Achievement Unlocked!',
    body: (data) => `You earned ${data.tier} ${data.achievementName}!`,
  },
};

// Check if user has enabled notifications for this type
async function isNotificationEnabled(
  userId: string,
  notificationType: NotificationType
): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const preferenceKey = NOTIFICATION_TO_PREFERENCE[notificationType];
  if (!preferenceKey) {
    // If no preference mapping exists, default to sending
    console.log(`No preference mapping for ${notificationType}, defaulting to enabled`);
    return true;
  }

  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select(preferenceKey)
      .eq('user_id', userId)
      .single();

    if (error) {
      // If no preferences found, default to enabled (new users)
      if (error.code === 'PGRST116') {
        console.log(`No preferences found for user ${userId}, defaulting to enabled`);
        return true;
      }
      console.error('Error checking notification preferences:', error);
      return true; // Default to sending on error
    }

    const isEnabled = data?.[preferenceKey] ?? true;
    console.log(`Notification ${notificationType} for user ${userId}: ${preferenceKey}=${isEnabled}`);
    return isEnabled;
  } catch (error) {
    console.error('Error in isNotificationEnabled:', error);
    return true; // Default to sending on error
  }
}

async function sendOneSignalNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<boolean> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error('OneSignal credentials not configured');
    return false;
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_external_user_ids: [userId],
        headings: { en: title },
        contents: { en: body },
        data: data || {},
      }),
    });

    const result = await response.json();
    
    if (result.errors) {
      console.error('OneSignal error:', result.errors);
      return false;
    }
    
    console.log('Notification sent:', result.id);
    return true;
  } catch (error) {
    console.error('Failed to send notification:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, recipientUserId, data } = (await req.json()) as SendNotificationRequest;

    if (!type || !recipientUserId) {
      throw new Error('type and recipientUserId are required');
    }

    const template = NOTIFICATION_TEMPLATES[type];
    if (!template) {
      throw new Error(`Unknown notification type: ${type}`);
    }

    // Check if user has enabled this notification type
    const isEnabled = await isNotificationEnabled(recipientUserId, type);
    if (!isEnabled) {
      console.log(`Notification ${type} disabled for user ${recipientUserId}, skipping`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'notification_disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const title = template.title(data || {});
    const body = template.body(data || {});

    const success = await sendOneSignalNotification(
      recipientUserId,
      title,
      body,
      { type, ...data }
    );

    return new Response(
      JSON.stringify({ success }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});