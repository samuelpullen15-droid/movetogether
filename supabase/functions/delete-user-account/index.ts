import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteAccountBody {
  confirmation: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT token from Bearer header and verify with service role client
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Parse request body
    const { confirmation }: DeleteAccountBody = await req.json();

    // Verify confirmation string
    if (confirmation !== 'DELETE') {
      return new Response(
        JSON.stringify({
          error: 'Invalid confirmation. Please type "DELETE" to confirm account deletion.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting account deletion for user ${userId}`);

    // Delete user data in order (respecting foreign keys)
    // Each deletion is wrapped in try-catch to continue even if table doesn't exist

    // 1. Delete competition daily data
    try {
      const { error } = await supabase
        .from('competition_daily_data')
        .delete()
        .eq('user_id', userId);
      if (error) console.log('Error deleting competition_daily_data:', error.message);
    } catch (e) {
      console.log('competition_daily_data table may not exist');
    }

    // 2. Delete competition chat messages
    try {
      const { error } = await supabase
        .from('competition_chat_messages')
        .delete()
        .eq('user_id', userId);
      if (error) console.log('Error deleting competition_chat_messages:', error.message);
    } catch (e) {
      console.log('competition_chat_messages table may not exist');
    }

    // 3. Delete competition participants
    try {
      const { error } = await supabase
        .from('competition_participants')
        .delete()
        .eq('user_id', userId);
      if (error) console.log('Error deleting competition_participants:', error.message);
    } catch (e) {
      console.log('competition_participants table may not exist');
    }

    // 4. Delete competition invitations (both sent and received)
    try {
      await supabase
        .from('competition_invitations')
        .delete()
        .eq('inviter_id', userId);

      await supabase
        .from('competition_invitations')
        .delete()
        .eq('invitee_id', userId);
    } catch (e) {
      console.log('Error deleting competition_invitations');
    }

    // 5. Delete competitions created by user
    // First, delete all related data for competitions this user created
    try {
      const { data: userCompetitions } = await supabase
        .from('competitions')
        .select('id')
        .eq('creator_id', userId);

      if (userCompetitions && userCompetitions.length > 0) {
        const competitionIds = userCompetitions.map(c => c.id);

        // Delete participants from these competitions
        await supabase
          .from('competition_participants')
          .delete()
          .in('competition_id', competitionIds);

        // Delete invitations for these competitions
        await supabase
          .from('competition_invitations')
          .delete()
          .in('competition_id', competitionIds);

        // Delete daily data for these competitions
        await supabase
          .from('competition_daily_data')
          .delete()
          .in('competition_id', competitionIds);

        // Delete chat messages for these competitions
        await supabase
          .from('competition_chat_messages')
          .delete()
          .in('competition_id', competitionIds);

        // Delete the competitions themselves
        await supabase
          .from('competitions')
          .delete()
          .eq('creator_id', userId);
      }
    } catch (e) {
      console.log('Error deleting user competitions:', e);
    }

    // 6. Delete user activity
    try {
      const { error } = await supabase
        .from('user_activity')
        .delete()
        .eq('user_id', userId);
      if (error) console.log('Error deleting user_activity:', error.message);
    } catch (e) {
      console.log('user_activity table may not exist');
    }

    // 7. Delete user weight history
    try {
      const { error } = await supabase
        .from('user_weight_history')
        .delete()
        .eq('user_id', userId);
      if (error) console.log('Error deleting user_weight_history:', error.message);
    } catch (e) {
      console.log('user_weight_history table may not exist');
    }

    // 8. Delete friendships (both directions)
    try {
      await supabase
        .from('friendships')
        .delete()
        .eq('user_id', userId);

      await supabase
        .from('friendships')
        .delete()
        .eq('friend_id', userId);
    } catch (e) {
      console.log('Error deleting friendships');
    }

    // 9. Delete user achievements
    try {
      const { error } = await supabase
        .from('user_achievements')
        .delete()
        .eq('user_id', userId);
      if (error) console.log('Error deleting user_achievements:', error.message);
    } catch (e) {
      console.log('user_achievements table may not exist');
    }

    // 10. Delete notification preferences
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .delete()
        .eq('user_id', userId);
      if (error) console.log('Error deleting notification_preferences:', error.message);
    } catch (e) {
      console.log('notification_preferences table may not exist');
    }

    // 11. Delete privacy settings
    try {
      const { error } = await supabase
        .from('privacy_settings')
        .delete()
        .eq('user_id', userId);
      if (error) console.log('Error deleting privacy_settings:', error.message);
    } catch (e) {
      console.log('privacy_settings table may not exist');
    }

    // 12. Delete user fitness settings
    try {
      const { error } = await supabase
        .from('user_fitness')
        .delete()
        .eq('user_id', userId);
      if (error) console.log('Error deleting user_fitness:', error.message);
    } catch (e) {
      console.log('user_fitness table may not exist');
    }

    // 13. Delete reports (both sent and received)
    try {
      await supabase
        .from('reports')
        .delete()
        .eq('reporter_id', userId);

      await supabase
        .from('reports')
        .delete()
        .eq('reported_user_id', userId);
    } catch (e) {
      console.log('Error deleting reports');
    }

    // 14. Delete user profile
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);
      if (error) {
        console.error('Error deleting profile:', error.message);
        return new Response(
          JSON.stringify({ error: 'Failed to delete user profile' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (e) {
      console.error('Error deleting profile:', e);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 15. Delete any exported data files from storage
    try {
      const { data: exportFiles } = await supabase.storage
        .from('data-exports')
        .list(userId);

      if (exportFiles && exportFiles.length > 0) {
        const filePaths = exportFiles.map(f => `${userId}/${f.name}`);
        await supabase.storage
          .from('data-exports')
          .remove(filePaths);
      }
    } catch (e) {
      console.log('Error deleting export files:', e);
    }

    // 16. Delete user avatar from storage
    try {
      const { data: avatarFiles } = await supabase.storage
        .from('avatars')
        .list(userId);

      if (avatarFiles && avatarFiles.length > 0) {
        const filePaths = avatarFiles.map(f => `${userId}/${f.name}`);
        await supabase.storage
          .from('avatars')
          .remove(filePaths);
      }
    } catch (e) {
      console.log('Error deleting avatar files:', e);
    }

    // 17. Finally, delete the auth user
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error('Error deleting auth user:', deleteAuthError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete authentication account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully deleted account for user ${userId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Your account has been permanently deleted. We\'re sorry to see you go.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in delete-user-account:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
