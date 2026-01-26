import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserDataExport {
  exported_at: string;
  user_id: string;
  profile: any;
  privacy_settings: any;
  notification_preferences: any;
  fitness_settings: any;
  competitions: any[];
  competition_participations: any[];
  achievements: any[];
  activity_history: any[];
  friends: any[];
  weight_history: any[];
}

async function sendExportEmail(email: string, downloadUrl: string, expiresAt: string, resendApiKey: string | undefined) {
  if (!resendApiKey) {
    console.log('Resend API key not configured, skipping email');
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: 'MoveTogether <hello@notifications.movetogetherfitness.com>',
      to: [email],
      subject: 'Your MoveTogether Data Export is Ready',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #FA114F; font-size: 24px; margin-bottom: 20px;">Your Data Export is Ready</h1>

          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Hi there! Your MoveTogether data export has been generated and is ready for download.
          </p>

          <div style="margin: 30px 0;">
            <a href="${downloadUrl}"
               style="background-color: #FA114F; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
              Download Your Data
            </a>
          </div>

          <p style="color: #6B7280; font-size: 14px;">
            This download link will expire on ${new Date(expiresAt).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}.
          </p>

          <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
            Your export includes:
          </p>
          <ul style="color: #6B7280; font-size: 14px;">
            <li>Profile information</li>
            <li>Privacy and notification settings</li>
            <li>Competition history and scores</li>
            <li>Achievement records</li>
            <li>Activity history (last 1 year)</li>
            <li>Friends list</li>
          </ul>

          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

          <p style="color: #9CA3AF; font-size: 12px;">
            If you didn't request this export, please contact support immediately.
          </p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to send email:', error);
    throw new Error('Failed to send export email');
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[export-user-data] Function started');

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[export-user-data] Missing auth header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[export-user-data] Auth header present, validating user...');

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '');

    // Create service role client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the authenticated user from the token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.log('[export-user-data] Auth failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const userEmail = user.email;

    console.log(`[export-user-data] Starting data export for user ${userId}`);

    // Calculate date range (last 1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

    console.log('[export-user-data] Fetching user data...');

    // Fetch data individually with error handling for each
    const fetchWithLog = async (name: string, query: Promise<any>) => {
      try {
        console.log(`[export-user-data] Fetching ${name}...`);
        const result = await query;
        console.log(`[export-user-data] ${name} complete:`, result.error ? `ERROR: ${result.error.message}` : 'OK');
        return result;
      } catch (err) {
        console.error(`[export-user-data] ${name} threw:`, err);
        return { data: null, error: err };
      }
    };

    const profileResult = await fetchWithLog('profile',
      supabase.from('profiles').select('*').eq('id', userId).single()
    );

    const privacyResult = await fetchWithLog('privacy_settings',
      supabase.from('privacy_settings').select('*').eq('user_id', userId).maybeSingle()
    );

    const notificationResult = await fetchWithLog('notification_preferences',
      supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle()
    );

    const fitnessResult = await fetchWithLog('user_fitness',
      supabase.from('user_fitness').select('*').eq('user_id', userId).maybeSingle()
    );

    const competitionsResult = await fetchWithLog('competitions',
      supabase.from('competitions').select('*').eq('creator_id', userId)
    );

    const participationsResult = await fetchWithLog('competition_participants',
      supabase.from('competition_participants').select('*, competition:competitions(name, type, status, start_date, end_date)').eq('user_id', userId)
    );

    const achievementsResult = await fetchWithLog('user_achievements',
      supabase.from('user_achievements').select('*').eq('user_id', userId)
    );

    const activityResult = await fetchWithLog('user_activity',
      supabase.from('user_activity').select('*').eq('user_id', userId).gte('date', oneYearAgoStr).order('date', { ascending: false })
    );

    const friendsResult = await fetchWithLog('friendships',
      supabase.from('friendships').select('id, status, created_at, user:profiles!friendships_friend_id_fkey(id, username, full_name)').eq('user_id', userId).eq('status', 'accepted')
    );

    const weightResult = await fetchWithLog('user_weight_history',
      supabase.from('user_weight_history').select('*').eq('user_id', userId).gte('recorded_at', oneYearAgoStr).order('recorded_at', { ascending: false })
    );

    console.log('[export-user-data] Main queries complete, fetching reciprocal friends...');

    const friendsAsRecipientResult = await fetchWithLog('friendships_recipient',
      supabase.from('friendships').select('id, status, created_at, user:profiles!friendships_user_id_fkey(id, username, full_name)').eq('friend_id', userId).eq('status', 'accepted')
    );

    console.log('[export-user-data] All queries complete, compiling export data...');

    // Compile the export data
    const exportData: UserDataExport = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      profile: profileResult.data || null,
      privacy_settings: privacyResult.data || null,
      notification_preferences: notificationResult.data || null,
      fitness_settings: fitnessResult.data || null,
      competitions: competitionsResult.data || [],
      competition_participations: participationsResult.data || [],
      achievements: achievementsResult.data || [],
      activity_history: activityResult.data || [],
      friends: [
        ...(friendsResult.data || []),
        ...(friendsAsRecipientResult.data || []),
      ],
      weight_history: weightResult.data || [],
    };

    // Create JSON file content
    const jsonContent = JSON.stringify(exportData, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${userId}/${timestamp}_export.json`;

    console.log(`[export-user-data] Uploading to storage: ${fileName} (${jsonContent.length} bytes)`);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('data-exports')
      .upload(fileName, jsonContent, {
        contentType: 'application/json',
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[export-user-data] Failed to upload export file:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to create export file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[export-user-data] Upload complete, generating signed URL...');

    // Generate signed URL (expires in 7 days)
    const expiresIn = 7 * 24 * 60 * 60; // 7 days in seconds
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('data-exports')
      .createSignedUrl(fileName, expiresIn);

    if (signedUrlError || !signedUrlData) {
      console.error('Failed to create signed URL:', signedUrlError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate download link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Replace default Supabase URL with custom domain for better email deliverability
    const customDomain = 'https://api.movetogetherfitness.com';
    const downloadUrl = signedUrlData.signedUrl.replace(SUPABASE_URL, customDomain);

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log('[export-user-data] Signed URL generated successfully');

    // Send email with download link
    if (userEmail) {
      try {
        console.log(`[export-user-data] Sending email to ${userEmail}...`);
        await sendExportEmail(userEmail, downloadUrl, expiresAt, RESEND_API_KEY);
        console.log(`[export-user-data] Export email sent to ${userEmail}`);
      } catch (emailError) {
        console.error('[export-user-data] Failed to send export email:', emailError);
        // Don't fail the request, just log the error
      }
    }

    console.log('[export-user-data] Export complete, returning response');

    return new Response(
      JSON.stringify({
        success: true,
        message: userEmail
          ? 'Your data export is being prepared. You will receive an email with the download link shortly.'
          : 'Your data export is ready.',
        download_url: downloadUrl,
        expires_at: expiresAt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in export-user-data:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
