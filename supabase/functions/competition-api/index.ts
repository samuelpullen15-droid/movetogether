import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_competition_full'
  | 'get_competition_participants_with_profiles'
  | 'get_competition_pending_invitations'
  | 'get_my_competition_ids'
  | 'get_my_participant_record'
  | 'get_competition_scoring_info'
  | 'get_my_competition_daily_data'
  | 'sync_my_competition_daily_data'
  | 'get_competition_creator'
  | 'get_competition_name'
  | 'get_public_competitions'
  | 'join_public_competition'
  | 'update_competition';

interface RequestBody {
  action: Action;
  params?: Record<string, unknown>;
}

serve(async (req) => {
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT token from Bearer header
    const token = authHeader.replace('Bearer ', '');

    // Create admin client and verify JWT
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const { action, params = {} }: RequestBody = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    let result: unknown;

    // Helper to check competition access
    const checkCompetitionAccess = async (competitionId: string): Promise<boolean> => {
      const { data: competition } = await supabase
        .from('competitions')
        .select('id, is_public, creator_id')
        .eq('id', competitionId)
        .single();

      if (!competition) return false;
      if (competition.is_public) return true;
      if (competition.creator_id === userId) return true;

      const { data: participant } = await supabase
        .from('competition_participants')
        .select('id')
        .eq('competition_id', competitionId)
        .eq('user_id', userId)
        .maybeSingle();

      return !!participant;
    };

    switch (action) {
      case 'get_competition_full': {
        const competitionId = params.competition_id as string;
        console.log('[competition-api] get_competition_full for user:', userId, 'competition:', competitionId);
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const hasAccess = await checkCompetitionAccess(competitionId);
        console.log('[competition-api] get_competition_full access check:', hasAccess);
        if (!hasAccess) {
          console.log('[competition-api] get_competition_full access denied for user:', userId, 'competition:', competitionId);
          return new Response(
            JSON.stringify({ error: 'Competition not accessible' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('competitions')
          .select('*')
          .eq('id', competitionId)
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_competition_participants_with_profiles': {
        const competitionId = params.competition_id as string;
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const hasAccess = await checkCompetitionAccess(competitionId);
        if (!hasAccess) {
          return new Response(
            JSON.stringify({ error: 'Competition not accessible' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: participants, error } = await supabase
          .from('competition_participants')
          .select(`
            id,
            user_id,
            joined_at,
            last_sync_at,
            total_points,
            move_calories,
            exercise_minutes,
            stand_hours,
            step_count,
            move_progress,
            exercise_progress,
            stand_progress
          `)
          .eq('competition_id', competitionId)
          .order('total_points', { ascending: false, nullsFirst: false });

        if (error) throw error;

        // Get profiles for participants
        const userIds = participants?.map((p: any) => p.user_id) || [];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

        result = participants?.map((p: any) => ({
          participant_id: p.id,
          user_id: p.user_id,
          joined_at: p.joined_at,
          last_sync_at: p.last_sync_at,
          total_points: p.total_points,
          move_calories: p.move_calories,
          exercise_minutes: p.exercise_minutes,
          stand_hours: p.stand_hours,
          step_count: p.step_count,
          move_progress: p.move_progress,
          exercise_progress: p.exercise_progress,
          stand_progress: p.stand_progress,
          username: profileMap.get(p.user_id)?.username,
          full_name: profileMap.get(p.user_id)?.full_name,
          avatar_url: profileMap.get(p.user_id)?.avatar_url,
        }));
        break;
      }

      case 'get_competition_pending_invitations': {
        const competitionId = params.competition_id as string;
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Only creator can see pending invitations
        const { data: competition } = await supabase
          .from('competitions')
          .select('creator_id')
          .eq('id', competitionId)
          .single();

        if (competition?.creator_id !== userId) {
          return new Response(
            JSON.stringify({ error: 'Only creator can view invitations' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get invitations without foreign key join (more robust)
        const { data: invitations, error: invError } = await supabase
          .from('competition_invitations')
          .select('*')
          .eq('competition_id', competitionId)
          .eq('status', 'pending');

        if (invError) throw invError;

        // Get profiles for invitees separately
        const inviteeIds = invitations?.map((i: any) => i.invitee_id) || [];
        if (inviteeIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', inviteeIds);

          const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

          result = invitations?.map((inv: any) => ({
            ...inv,
            profiles: profileMap.get(inv.invitee_id) || null,
          }));
        } else {
          result = invitations;
        }
        break;
      }

      case 'get_my_competition_ids': {
        console.log('[competition-api] get_my_competition_ids for user:', userId);

        // Get competitions where user is a participant
        const { data: participantData, error: participantError } = await supabase
          .from('competition_participants')
          .select('competition_id')
          .eq('user_id', userId);

        if (participantError) {
          console.error('[competition-api] get_my_competition_ids participant error:', participantError);
          throw participantError;
        }

        // Also get competitions where user is the creator (may not be in participants table)
        const { data: creatorData, error: creatorError } = await supabase
          .from('competitions')
          .select('id')
          .eq('creator_id', userId);

        if (creatorError) {
          console.error('[competition-api] get_my_competition_ids creator error:', creatorError);
          throw creatorError;
        }

        // Combine and deduplicate
        const participantIds = participantData?.map((p: any) => p.competition_id) || [];
        const creatorIds = creatorData?.map((c: any) => c.id) || [];
        const allIds = [...new Set([...participantIds, ...creatorIds])];

        console.log('[competition-api] get_my_competition_ids found:', participantIds.length, 'as participant,', creatorIds.length, 'as creator, total unique:', allIds.length);
        result = allIds;
        break;
      }

      case 'get_my_participant_record': {
        const competitionId = params.competition_id as string;
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('competition_participants')
          .select('*')
          .eq('competition_id', competitionId)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_competition_scoring_info': {
        const competitionId = params.competition_id as string;
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('competitions')
          .select('scoring_type, scoring_config')
          .eq('id', competitionId)
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_my_competition_daily_data': {
        const competitionId = params.competition_id as string;
        const startDate = params.start_date as string;
        const endDate = params.end_date as string;

        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let query = supabase
          .from('competition_daily_data')
          .select('*')
          .eq('competition_id', competitionId)
          .eq('user_id', userId);

        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);

        const { data, error } = await query.order('date', { ascending: true });

        if (error) throw error;
        result = data;
        break;
      }

      case 'sync_my_competition_daily_data': {
        const competitionId = params.competition_id as string;

        // Support both records (direct array) and records_json (stringified array)
        // The client may send records_json to work around React Native serialization issues
        // Table columns: id, competition_id, participant_id, user_id, date, move_calories, exercise_minutes,
        //                stand_hours, step_count, distance_meters, workouts_completed, points, synced_at
        let records: Array<{
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
        }>;

        // Debug logging
        console.log('[competition-api] sync_my_competition_daily_data received:', {
          userId,
          competitionId,
          paramsKeys: Object.keys(params),
          hasRecords: 'records' in params,
          hasRecordsJson: 'records_json' in params,
          recordsType: typeof params.records,
          recordsJsonType: typeof params.records_json,
        });

        // Try to get records from records_json first (JSON string), then fall back to records (array)
        if (params.records_json && typeof params.records_json === 'string') {
          try {
            records = JSON.parse(params.records_json);
            console.log('[competition-api] Parsed records_json successfully, count:', records?.length);
          } catch (parseErr) {
            console.error('[competition-api] Failed to parse records_json:', parseErr);
            return new Response(
              JSON.stringify({ error: 'Invalid records_json format' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else if (Array.isArray(params.records)) {
          records = params.records;
          console.log('[competition-api] Using records array directly, count:', records.length);
        } else {
          console.error('[competition-api] No valid records found:', {
            records: params.records,
            records_json: params.records_json,
          });
          return new Response(
            JSON.stringify({ error: 'records array or records_json is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!records || !Array.isArray(records) || records.length === 0) {
          console.error('[competition-api] Records validation failed after parsing:', {
            recordsType: typeof records,
            isArray: Array.isArray(records),
            length: records?.length,
          });
          return new Response(
            JSON.stringify({ error: 'records array is required and must not be empty' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify user is a participant in this competition
        const { data: participant } = await supabase
          .from('competition_participants')
          .select('id')
          .eq('competition_id', competitionId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!participant) {
          return new Response(
            JSON.stringify({ error: 'Not a participant in this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const correctParticipantId = participant.id;
        console.log('[competition-api] Found participant:', {
          correctParticipantId,
          userId,
          competitionId,
        });

        // Validate all records and create new sanitized records with correct participant_id
        const sanitizedRecords = [];
        for (const record of records) {
          if (record.user_id !== userId || record.competition_id !== competitionId) {
            console.error('[competition-api] Record validation failed:', {
              recordUserId: record.user_id,
              expectedUserId: userId,
              recordCompId: record.competition_id,
              expectedCompId: competitionId,
            });
            return new Response(
              JSON.stringify({ error: 'Invalid record: user_id or competition_id mismatch' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Create a new sanitized record with correct values
          sanitizedRecords.push({
            competition_id: competitionId,
            participant_id: correctParticipantId, // Use the verified participant ID
            user_id: userId,
            date: record.date,
            move_calories: record.move_calories ?? 0,
            exercise_minutes: record.exercise_minutes ?? 0,
            stand_hours: record.stand_hours ?? 0,
            step_count: record.step_count ?? 0,
            distance_meters: record.distance_meters ?? 0,
            workouts_completed: record.workouts_completed ?? 0,
            points: record.points ?? 0,
            synced_at: new Date().toISOString(),
          });
        }

        console.log('[competition-api] Sanitized records:', {
          count: sanitizedRecords.length,
          firstRecordParticipantId: sanitizedRecords[0]?.participant_id,
          correctParticipantId,
          firstRecord: sanitizedRecords[0],
        });

        // Replace records with sanitized version
        records = sanitizedRecords;

        // Upsert daily data records (service_role has write access)
        console.log('[competition-api] Upserting records:', {
          count: records.length,
          firstRecord: records[0],
          lastRecord: records[records.length - 1],
        });

        const { error: upsertError } = await supabase
          .from('competition_daily_data')
          .upsert(records, {
            onConflict: 'competition_id,user_id,date',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error('[competition-api] Failed to upsert daily data:', {
            message: upsertError.message,
            details: upsertError.details,
            hint: upsertError.hint,
            code: upsertError.code,
          });
          // Return specific error instead of throwing to avoid generic "Internal server error"
          return new Response(
            JSON.stringify({
              error: `Failed to sync daily data: ${upsertError.message}`,
              details: upsertError.details,
              hint: upsertError.hint,
              code: upsertError.code,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[competition-api] Successfully synced', records.length, 'daily data records for user', userId);
        result = { success: true, count: records.length };
        break;
      }

      case 'get_competition_creator': {
        const competitionId = params.competition_id as string;
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('competitions')
          .select('creator_id')
          .eq('id', competitionId)
          .single();

        if (error) throw error;
        result = data?.creator_id;
        break;
      }

      case 'get_competition_name': {
        const competitionId = params.competition_id as string;
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('competitions')
          .select('name')
          .eq('id', competitionId)
          .single();

        if (error) throw error;
        result = data?.name;
        break;
      }

      case 'get_public_competitions': {
        const limit = (params.limit as number) || 50;
        const offset = (params.offset as number) || 0;

        const { data, error } = await supabase
          .from('competitions')
          .select('*')
          .eq('is_public', true)
          .in('status', ['upcoming', 'active'])
          .order('start_date', { ascending: true })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        result = data;
        break;
      }

      case 'join_public_competition': {
        const competitionId = params.competition_id as string;
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify it's a public competition
        const { data: competition } = await supabase
          .from('competitions')
          .select('id, is_public, status')
          .eq('id', competitionId)
          .single();

        if (!competition?.is_public) {
          return new Response(
            JSON.stringify({ error: 'Competition is not public' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!['upcoming', 'active'].includes(competition.status)) {
          return new Response(
            JSON.stringify({ error: 'Competition is not joinable' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if already a participant
        const { data: existing } = await supabase
          .from('competition_participants')
          .select('id')
          .eq('competition_id', competitionId)
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          return new Response(
            JSON.stringify({ error: 'Already a participant' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Join the competition
        const { data, error } = await supabase
          .from('competition_participants')
          .insert({
            competition_id: competitionId,
            user_id: userId,
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'update_competition': {
        const competitionId = params.competition_id as string;
        const updates = params.updates as {
          name?: string;
          start_date?: string;
          end_date?: string;
          scoring_type?: string;
          is_public?: boolean;
        };

        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify user is the creator and get current status
        const { data: competition, error: fetchError } = await supabase
          .from('competitions')
          .select('creator_id, status, start_date, end_date')
          .eq('id', competitionId)
          .single();

        if (fetchError || !competition) {
          return new Response(
            JSON.stringify({ error: 'Competition not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (competition.creator_id !== userId) {
          return new Response(
            JSON.stringify({ error: 'Only the creator can update this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Cannot edit completed competitions
        if (competition.status === 'completed') {
          return new Response(
            JSON.stringify({ error: 'Cannot edit a completed competition' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Build update object (only include provided fields)
        const updateData: Record<string, unknown> = {};

        // Name can always be updated (for non-completed)
        if (updates.name !== undefined) updateData.name = updates.name;

        // End date can be updated for upcoming and active
        if (updates.end_date !== undefined) updateData.end_date = updates.end_date;

        // Visibility can always be updated (for non-completed)
        if (updates.is_public !== undefined) updateData.is_public = updates.is_public;

        // Only allow start_date and scoring_type changes for upcoming competitions
        if (competition.status === 'upcoming') {
          if (updates.start_date !== undefined) updateData.start_date = updates.start_date;
          if (updates.scoring_type !== undefined) updateData.scoring_type = updates.scoring_type;
        } else if (competition.status === 'active') {
          // For active competitions, reject attempts to change restricted fields
          if (updates.start_date !== undefined) {
            return new Response(
              JSON.stringify({ error: 'Cannot change start date for an active competition' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          if (updates.scoring_type !== undefined) {
            return new Response(
              JSON.stringify({ error: 'Cannot change scoring type for an active competition' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Recalculate competition type if dates changed
        const finalStartDate = updateData.start_date || competition.start_date;
        const finalEndDate = updateData.end_date || competition.end_date;

        const start = new Date(finalStartDate as string);
        const end = new Date(finalEndDate as string);
        const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const startDay = start.getDay(); // 0 = Sunday, 6 = Saturday

        let type: string;
        if (durationDays === 2 && startDay === 6) {
          type = 'weekend';
        } else if (durationDays === 7) {
          type = 'weekly';
        } else if (durationDays >= 28 && durationDays <= 31) {
          type = 'monthly';
        } else {
          type = 'custom';
        }
        updateData.type = type;

        // Auto-generate description based on type
        if (type === 'weekend') {
          updateData.description = 'Close your rings all weekend!';
        } else if (type === 'weekly') {
          updateData.description = 'A full week of competition!';
        } else if (type === 'monthly') {
          updateData.description = 'A month-long challenge!';
        } else {
          updateData.description = `${durationDays}-day challenge`;
        }

        const { data, error } = await supabase
          .from('competitions')
          .update(updateData)
          .eq('id', competitionId)
          .select()
          .single();

        if (error) throw error;

        console.log('[competition-api] Updated competition:', competitionId, 'with:', updateData);
        result = data;
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in competition-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
