import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateActivityRequest {
  userId: string;
  activityType: 'rings_closed' | 'workout_completed' | 'streak_milestone' | 'achievement_unlocked' | 'competition_won' | 'competition_joined' | 'personal_record';
  metadata?: Record<string, any>;
}

const ACTIVITY_TEMPLATES: Record<string, any> = {
  rings_closed: {
    title: 'Closed all rings! 🎉',
    subtitle: 'Move, Exercise, and Stand goals completed',
  },
  workout_completed: {
    title: (meta: any) => `Completed a ${meta.workoutType || 'workout'}`,
    subtitle: (meta: any) => meta.duration ? `${meta.duration} minutes` : null,
  },
  streak_milestone: {
    title: (meta: any) => `${meta.streakDays} day streak! 🔥`,
    subtitle: 'Consistency is key',
  },
  achievement_unlocked: {
    title: (meta: any) => `Earned ${meta.tier} ${meta.achievementName}`,
    subtitle: (meta: any) => meta.achievementDescription,
  },
  competition_won: {
    title: (meta: any) => `Won "${meta.competitionName}"! 🏆`,
    subtitle: (meta: any) => meta.participantCount ? `Beat ${meta.participantCount - 1} competitors` : null,
  },
  competition_joined: {
    title: (meta: any) => `Joined "${meta.competitionName}"`,
    subtitle: 'Let the games begin',
  },
  personal_record: {
    title: (meta: any) => `New personal record! 💪`,
    subtitle: (meta: any) => `${meta.value.toLocaleString()} ${meta.metric}`,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Verify JWT to authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { activityType, metadata = {} } = (await req.json()) as CreateActivityRequest;
    // Use verified user ID from JWT, not from request body
    const userId = user.id;

    if (!activityType) {
      throw new Error('activityType is required');
    }

    const template = ACTIVITY_TEMPLATES[activityType];
    if (!template) {
      throw new Error(`Unknown activity type: ${activityType}`);
    }

    const title = typeof template.title === 'function' ? template.title(metadata) : template.title;
    const subtitle = typeof template.subtitle === 'function' ? template.subtitle(metadata) : template.subtitle;

    const { data, error } = await supabase
      .from('activity_feed')
      .insert({
        user_id: userId,
        activity_type: activityType,
        title,
        subtitle,
        metadata,
      })
      .select()
      .single();

    if (error) throw error;

    // Notify friends about the new activity
    try {
      // Get user's friends
      const { data: friendships } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq('status', 'accepted');
      
      if (friendships && friendships.length > 0) {
        // Get the user's name for the notification
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', userId)
          .single();
        
        const friendName = userProfile?.full_name || userProfile?.username || 'A friend';
        
        // Create activity summary based on type
        const activitySummaries: Record<string, string> = {
          rings_closed: 'closed all their rings! 🎯',
          workout_completed: `completed a ${metadata?.workoutType || 'workout'} 💪`,
          streak_milestone: `hit a ${metadata?.streakDays} day streak! 🔥`,
          achievement_unlocked: `earned ${metadata?.tier} ${metadata?.achievementName} 🏅`,
          competition_won: `won "${metadata?.competitionName}"! 🏆`,
          competition_joined: `joined "${metadata?.competitionName}"`,
          personal_record: `set a new ${metadata?.metric} record! 💪`,
        };
        
        const activitySummary = activitySummaries[activityType] || 'posted an update';
        
        // Get friend IDs (excluding the user)
        const friendIds = friendships.map(f => 
          f.user_id === userId ? f.friend_id : f.user_id
        );
        
        // Send notifications to all friends
        for (const friendId of friendIds) {
          try {
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                type: 'activity_posted',
                recipientUserId: friendId,
                senderUserId: userId,
                data: {
                  activityId: data.id,
                  friendId: userId,
                  friendName,
                  activitySummary,
                  activityType,
                },
              }),
            });
          } catch (e) {
            console.error(`Failed to notify friend ${friendId}:`, e);
          }
        }
      }
    } catch (e) {
      console.error('Failed to send activity notifications:', e);
    }

    return new Response(JSON.stringify({ success: true, activity: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});