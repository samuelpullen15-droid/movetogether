import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z, validateParams, validationErrorResponse } from '../_shared/validation.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';

// Zod schemas for action params
const competitionIdSchema = z.object({
  competition_id: z.string().uuid(),
});

const joinPublicCompetitionSchema = z.object({
  competition_id: z.string().uuid(),
  skip_buy_in: z.boolean().optional().default(false),
});

const competitionDailyDataSchema = z.object({
  competition_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const publicCompetitionsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const updateCompetitionSchema = z.object({
  competition_id: z.string().uuid(),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    scoring_type: z.string().optional(),
    is_public: z.boolean().optional(),
  }),
});

const joinTeamSchema = z.object({
  competition_id: z.string().uuid(),
  team_id: z.string().uuid(),
});

const createTeamsSchema = z.object({
  competition_id: z.string().uuid(),
  teams: z.array(z.object({
    team_number: z.number().int().min(1),
    name: z.string().min(1).max(50),
    color: z.string().min(1).max(20),
    emoji: z.string().min(1).max(10),
  })).min(2).max(10),
});

const prizePoolIdsSchema = z.object({
  competition_ids: z.array(z.string().uuid()).min(1).max(50),
});

const lockScoreSchema = z.object({
  competition_id: z.string().uuid(),
  participant_id: z.string().uuid(),
});

const createCompetitionSchema = z.object({
  name: z.string().min(1).max(100).transform((s) => s.trim()),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  scoring_type: z.string().min(1).max(50).optional().default('ring_close'),
  scoring_config: z.unknown().optional(),
  is_public: z.boolean().optional().default(false),
  repeat_option: z.string().max(50).optional().default('none'),
  is_draft: z.boolean().optional().default(false),
  is_team_competition: z.boolean().optional().default(false),
  team_count: z.number().int().min(2).max(10).optional(),
});

const syncDailyDataSchema = z.object({
  competition_id: z.string().uuid(),
  records_json: z.string().min(1),
});

const updateTotalsSchema = z.object({
  competition_id: z.string().uuid(),
  totals: z.object({
    move_calories: z.number().min(0),
    exercise_minutes: z.number().min(0),
    stand_hours: z.number().min(0),
    step_count: z.number().min(0),
    total_points: z.number().min(0),
    move_progress: z.number().min(0),
    exercise_progress: z.number().min(0),
    stand_progress: z.number().min(0),
  }),
});

const userPrizePayoutsSchema = z.object({
  competition_ids: z.array(z.string().uuid()).min(1).max(50),
});

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
  | 'update_competition'
  | 'get_seasonal_events'
  | 'join_seasonal_event'
  | 'get_competition_teams'
  | 'join_team'
  | 'create_competition_teams'
  | 'get_prize_pool_amounts'
  | 'lock_participant_score'
  | 'is_score_locked'
  | 'create_competition'
  | 'delete_competition'
  | 'finalize_draft'
  | 'delete_draft'
  | 'get_my_participated_competitions'
  | 'get_user_prize_payouts'
  | 'update_my_participant_totals'
  | 'process_competition_completion';

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
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;
        console.log('[competition-api] get_competition_full for user:', userId, 'competition:', competitionId);

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
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

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
            score_locked_at,
            total_points,
            move_calories,
            exercise_minutes,
            stand_hours,
            step_count,
            move_progress,
            exercise_progress,
            stand_progress,
            team_id,
            prize_eligible
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

        // Get bidirectional block list for the current user
        const { data: blocks } = await supabase
          .from('friendships')
          .select('user_id, friend_id')
          .eq('status', 'blocked')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        const blockedUserIds = new Set<string>();
        (blocks || []).forEach((b: any) => {
          if (b.user_id === userId) blockedUserIds.add(b.friend_id);
          if (b.friend_id === userId) blockedUserIds.add(b.user_id);
        });

        result = participants?.map((p: any) => ({
          participant_id: p.id,
          user_id: p.user_id,
          joined_at: p.joined_at,
          last_sync_at: p.last_sync_at,
          score_locked_at: p.score_locked_at,
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
          is_blocked: blockedUserIds.has(p.user_id),
          team_id: p.team_id || null,
          prize_eligible: p.prize_eligible ?? true,
        }));
        break;
      }

      case 'get_competition_pending_invitations': {
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

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
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

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
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

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
        const v = validateParams(competitionDailyDataSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;
        const startDate = v.data.start_date;
        const endDate = v.data.end_date;

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
        const v = validateParams(syncDailyDataSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;
        const recordsJson = v.data.records_json;

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

        // Parse records_json string into array
        try {
          records = JSON.parse(recordsJson);
          console.log('[competition-api] Parsed records_json successfully, count:', records?.length);
        } catch (parseErr) {
          console.error('[competition-api] Failed to parse records_json:', parseErr);
          return new Response(
            JSON.stringify({ error: 'Invalid records_json format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!records || !Array.isArray(records) || records.length === 0) {
          return new Response(
            JSON.stringify({ error: 'records array is required and must not be empty' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify user is a participant in this competition and get competition info
        const { data: participant } = await supabase
          .from('competition_participants')
          .select('id, competitions!inner(start_date, status)')
          .eq('competition_id', competitionId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!participant) {
          return new Response(
            JSON.stringify({ error: 'Not a participant in this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if competition has started
        const competition = (participant as any).competitions;
        if (competition?.start_date) {
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          const startDateStr = competition.start_date.split('T')[0];
          if (startDateStr > todayStr) {
            console.log('[competition-api] Competition has not started yet:', {
              competitionId,
              startDate: startDateStr,
              today: todayStr,
            });
            return new Response(
              JSON.stringify({ error: 'Competition has not started yet' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
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
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

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
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

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
        const v = validateParams(publicCompetitionsSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const limit = v.data.limit ?? 50;
        const offset = v.data.offset ?? 0;

        // Get bidirectional block list to filter out blocked users' competitions
        const { data: blockData } = await supabase
          .from('friendships')
          .select('user_id, friend_id')
          .eq('status', 'blocked')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        const blockedCreatorIds: string[] = [];
        (blockData || []).forEach((b: any) => {
          if (b.user_id === userId) blockedCreatorIds.push(b.friend_id);
          if (b.friend_id === userId) blockedCreatorIds.push(b.user_id);
        });

        let query = supabase
          .from('competitions')
          .select('*')
          .eq('is_public', true)
          .eq('is_seasonal_event', false)
          .in('status', ['upcoming', 'active'])
          .order('start_date', { ascending: true });

        // Filter out competitions created by blocked users
        if (blockedCreatorIds.length > 0) {
          query = query.not('creator_id', 'in', `(${blockedCreatorIds.join(',')})`);
        }

        const { data, error } = await query.range(offset, offset + limit - 1);

        if (error) throw error;
        result = data;
        break;
      }

      case 'join_public_competition': {
        const v = validateParams(joinPublicCompetitionSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;
        const skipBuyIn = v.data.skip_buy_in;

        // Verify it's a public competition
        const { data: competition } = await supabase
          .from('competitions')
          .select('id, is_public, status, creator_id, is_team_competition')
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

        // Check if the user and creator have blocked each other
        const { data: joinBlock } = await supabase
          .from('friendships')
          .select('id')
          .eq('status', 'blocked')
          .or(`and(user_id.eq.${userId},friend_id.eq.${competition.creator_id}),and(user_id.eq.${competition.creator_id},friend_id.eq.${userId})`)
          .limit(1);

        if (joinBlock && joinBlock.length > 0) {
          return new Response(
            JSON.stringify({ error: 'Competition is not joinable' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

        // Check for buy-in prize pool
        const { data: buyInPool } = await supabase
          .from('prize_pools')
          .select('id, buy_in_amount')
          .eq('competition_id', competitionId)
          .eq('status', 'active')
          .eq('pool_type', 'buy_in')
          .maybeSingle();

        if (buyInPool) {
          if (skipBuyIn) {
            // Join without paying — not prize eligible
            const { data: skipData, error: skipError } = await supabase
              .from('competition_participants')
              .insert({
                competition_id: competitionId,
                user_id: userId,
                prize_eligible: false,
              })
              .select()
              .single();

            if (skipError) throw skipError;
            result = { ...skipData, is_team_competition: competition.is_team_competition };
            break;
          }

          result = {
            requires_buy_in: true,
            buy_in_amount: parseFloat(buyInPool.buy_in_amount),
            competition_id: competitionId,
          };
          break;
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
        result = { ...data, is_team_competition: competition.is_team_competition };
        break;
      }

      case 'update_competition': {
        const v = validateParams(updateCompetitionSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;
        const updates = v.data.updates;

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

      // ================================================================
      // GET SEASONAL EVENTS
      // ================================================================
      case 'get_seasonal_events': {
        const { data: events, error } = await supabase
          .from('competitions')
          .select('*')
          .eq('is_seasonal_event', true)
          .in('status', ['upcoming', 'active'])
          .order('start_date', { ascending: true });

        if (error) throw error;

        const eventIds = (events || []).map((e: any) => e.id);
        let joinedEventIds: string[] = [];

        if (eventIds.length > 0 && userId) {
          const { data: participations } = await supabase
            .from('competition_participants')
            .select('competition_id')
            .eq('user_id', userId)
            .in('competition_id', eventIds);

          joinedEventIds = (participations || []).map((p: any) => p.competition_id);
        }

        // Get participant counts in parallel
        result = await Promise.all(
          (events || []).map(async (e: any) => {
            const { count } = await supabase
              .from('competition_participants')
              .select('*', { count: 'exact', head: true })
              .eq('competition_id', e.id);

            return {
              ...e,
              participant_count: count || 0,
              user_joined: joinedEventIds.includes(e.id),
            };
          })
        );
        break;
      }

      // ================================================================
      // JOIN SEASONAL EVENT
      // ================================================================
      case 'join_seasonal_event': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

        // Verify it's a seasonal event
        const { data: competition } = await supabase
          .from('competitions')
          .select('id, is_seasonal_event, status')
          .eq('id', competitionId)
          .single();

        if (!competition?.is_seasonal_event) {
          return new Response(
            JSON.stringify({ error: 'Not a seasonal event' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!['upcoming', 'active'].includes(competition.status)) {
          return new Response(
            JSON.stringify({ error: 'Event is not joinable' }),
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
            JSON.stringify({ error: 'Already joined this event' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // NO tier limit check — seasonal events bypass Starter's 2-competition limit

        const { data, error: joinError } = await supabase
          .from('competition_participants')
          .insert({ competition_id: competitionId, user_id: userId })
          .select()
          .single();

        if (joinError) throw joinError;
        result = { success: true, participant: data };
        break;
      }

      // ============================================================
      // Team competition actions
      // ============================================================

      case 'get_competition_teams': {
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

        // Fetch teams
        const { data: teams, error: teamsError } = await supabase
          .from('competition_teams')
          .select('id, competition_id, team_number, name, color, emoji')
          .eq('competition_id', competitionId)
          .order('team_number', { ascending: true });

        if (teamsError) throw teamsError;

        // Fetch participant stats grouped by team
        const { data: participants } = await supabase
          .from('competition_participants')
          .select('team_id, total_points')
          .eq('competition_id', competitionId)
          .not('team_id', 'is', null);

        // Compute member_count and avg_points per team
        const teamStats = new Map<string, { count: number; totalPoints: number }>();
        (participants || []).forEach((p: any) => {
          if (!p.team_id) return;
          const stats = teamStats.get(p.team_id) || { count: 0, totalPoints: 0 };
          stats.count++;
          stats.totalPoints += (p.total_points || 0);
          teamStats.set(p.team_id, stats);
        });

        result = (teams || []).map((t: any) => {
          const stats = teamStats.get(t.id) || { count: 0, totalPoints: 0 };
          return {
            id: t.id,
            team_number: t.team_number,
            name: t.name,
            color: t.color,
            emoji: t.emoji,
            member_count: stats.count,
            avg_points: stats.count > 0 ? stats.totalPoints / stats.count : 0,
          };
        });
        break;
      }

      case 'join_team': {
        const v = validateParams(joinTeamSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;
        const teamId = v.data.team_id;

        // Verify competition is a team competition
        const { data: comp } = await supabase
          .from('competitions')
          .select('is_team_competition, status')
          .eq('id', competitionId)
          .single();

        if (!comp?.is_team_competition) {
          return new Response(
            JSON.stringify({ error: 'Not a team competition' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify team belongs to this competition
        const { data: team } = await supabase
          .from('competition_teams')
          .select('id')
          .eq('id', teamId)
          .eq('competition_id', competitionId)
          .single();

        if (!team) {
          return new Response(
            JSON.stringify({ error: 'Team not found in this competition' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify user is a participant
        const { data: participant } = await supabase
          .from('competition_participants')
          .select('id, team_id')
          .eq('competition_id', competitionId)
          .eq('user_id', userId)
          .single();

        if (!participant) {
          return new Response(
            JSON.stringify({ error: 'Not a participant in this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Don't allow switching teams if already assigned
        if (participant.team_id) {
          return new Response(
            JSON.stringify({ error: 'Already assigned to a team' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Assign team
        const { error: updateError } = await supabase
          .from('competition_participants')
          .update({ team_id: teamId })
          .eq('id', participant.id);

        if (updateError) throw updateError;
        result = { success: true };
        break;
      }

      case 'create_competition_teams': {
        const v = validateParams(createTeamsSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;
        const teams = v.data.teams;

        // Verify user is the creator
        const { data: comp } = await supabase
          .from('competitions')
          .select('creator_id, is_team_competition, status')
          .eq('id', competitionId)
          .single();

        if (!comp || comp.creator_id !== userId) {
          return new Response(
            JSON.stringify({ error: 'Only the creator can set up teams' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!['draft', 'upcoming'].includes(comp.status)) {
          return new Response(
            JSON.stringify({ error: 'Teams can only be configured before the competition starts' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete existing teams (idempotent for draft edits)
        await supabase
          .from('competition_teams')
          .delete()
          .eq('competition_id', competitionId);

        // Insert new teams
        const teamRows = teams.map((t) => ({
          competition_id: competitionId,
          team_number: t.team_number,
          name: t.name,
          color: t.color,
          emoji: t.emoji,
        }));

        const { data: created, error: insertError } = await supabase
          .from('competition_teams')
          .insert(teamRows)
          .select();

        if (insertError) throw insertError;
        result = created;
        break;
      }

      case 'get_prize_pool_amounts': {
        const v = validateParams(prizePoolIdsSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionIds = v.data.competition_ids;

        const { data, error } = await supabase
          .from('prize_pools')
          .select('competition_id, total_amount, pool_type, buy_in_amount, participant_count')
          .in('competition_id', competitionIds)
          .in('status', ['active', 'distributing', 'distributed']);

        if (error) throw error;
        result = data || [];
        break;
      }

      case 'lock_participant_score': {
        const v = validateParams(lockScoreSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;
        const participantId = v.data.participant_id;

        // Only lock if the participant belongs to the authenticated user
        const { data: participant } = await supabase
          .from('competition_participants')
          .select('user_id')
          .eq('id', participantId)
          .eq('competition_id', competitionId)
          .single();

        if (!participant || participant.user_id !== userId) {
          return new Response(
            JSON.stringify({ error: 'Not authorized to lock this score' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('competition_participants')
          .update({ score_locked_at: new Date().toISOString() })
          .eq('id', participantId)
          .eq('competition_id', competitionId)
          .is('score_locked_at', null);

        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'is_score_locked': {
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

        const { data, error } = await supabase
          .from('competition_participants')
          .select('score_locked_at')
          .eq('competition_id', competitionId)
          .eq('user_id', userId)
          .single();

        if (error) throw error;
        result = { locked: data?.score_locked_at !== null };
        break;
      }

      // ============================================================
      // Competition CRUD actions
      // ============================================================

      case 'create_competition': {
        const v = validateParams(createCompetitionSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        if (!checkRateLimit(userId, 'create_competition', RATE_LIMITS.CREATE_COMPETITION.maxRequests, RATE_LIMITS.CREATE_COMPETITION.windowMs)) {
          return rateLimitResponse(corsHeaders);
        }

        const name = v.data.name;
        const startDateStr = v.data.start_date;
        const endDateStr = v.data.end_date;
        const scoringType = v.data.scoring_type;
        const scoringConfig = v.data.scoring_config || null;
        const isPublic = v.data.is_public;
        const repeatOption = v.data.repeat_option;
        const isDraft = v.data.is_draft;
        const isTeamCompetition = v.data.is_team_competition;
        const teamCount = v.data.team_count || null;

        // Parse dates and calculate duration
        const start = new Date(startDateStr + 'T00:00:00');
        const end = new Date(endDateStr + 'T00:00:00');
        const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // Determine competition type
        let type: string = 'custom';
        const startDay = start.getDay();
        if (durationDays === 2 && startDay === 6) {
          type = 'weekend';
        } else if (durationDays === 7) {
          type = 'weekly';
        } else if (durationDays >= 28 && durationDays <= 31) {
          type = 'monthly';
        }

        // Generate description
        let description: string;
        if (type === 'weekend') {
          description = 'Close your rings all weekend!';
        } else if (type === 'weekly') {
          description = 'A full week of competition!';
        } else if (type === 'monthly') {
          description = 'A month-long challenge!';
        } else {
          description = `${durationDays}-day challenge`;
        }

        // Determine status
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const status = isDraft
          ? 'draft'
          : (startDateStr <= todayStr ? 'active' : 'upcoming');

        // Create competition - creator_id comes from verified JWT
        const { data: competition, error: compError } = await supabase
          .from('competitions')
          .insert({
            creator_id: userId,
            name,
            description,
            start_date: startDateStr,
            end_date: endDateStr,
            type,
            status,
            scoring_type: scoringType,
            scoring_config: scoringConfig,
            is_public: isPublic,
            repeat_option: repeatOption,
            is_team_competition: isTeamCompetition,
            team_count: isTeamCompetition ? teamCount : null,
          })
          .select('id')
          .single();

        if (compError || !competition) {
          console.error('[competition-api] Error creating competition:', compError);
          return new Response(
            JSON.stringify({ error: compError?.message || 'Failed to create competition' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Add creator as participant
        const { error: participantError } = await supabase
          .from('competition_participants')
          .insert({
            competition_id: competition.id,
            user_id: userId,
          });

        if (participantError) {
          console.error('[competition-api] Error adding creator as participant:', participantError);
          // Continue - competition is created
        }

        console.log('[competition-api] Created competition:', competition.id, 'for user:', userId);
        result = { competition_id: competition.id };
        break;
      }

      case 'delete_competition': {
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

        // Get competition details
        const { data: competition, error: fetchError } = await supabase
          .from('competitions')
          .select('id, creator_id, start_date, has_prize_pool, status')
          .eq('id', competitionId)
          .single();

        if (fetchError || !competition) {
          return new Response(
            JSON.stringify({ error: 'Competition not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify user is creator
        if (competition.creator_id !== userId) {
          return new Response(
            JSON.stringify({ error: 'Only the creator can delete this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if competition has started
        const now = new Date();
        const compStartDate = new Date(competition.start_date);
        const hasStarted = now >= compStartDate;

        // If started AND has prize pool, block deletion
        if (hasStarted && competition.has_prize_pool) {
          return new Response(
            JSON.stringify({ error: 'Cannot delete a competition with a prize pool after it has started. This protects participants who are competing for the prize.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // If has prize pool but hasn't started, refund first
        if (competition.has_prize_pool && !hasStarted) {
          const SUPABASE_URL_INTERNAL = Deno.env.get('SUPABASE_URL');
          const authHeader = req.headers.get('Authorization');

          if (authHeader && SUPABASE_URL_INTERNAL) {
            try {
              const refundResponse = await fetch(
                `${SUPABASE_URL_INTERNAL}/functions/v1/refund-prize`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ competitionId }),
                }
              );

              if (!refundResponse.ok) {
                const refundResult = await refundResponse.json();
                console.error('[competition-api] Error refunding prize pool:', refundResult);
                return new Response(
                  JSON.stringify({ error: refundResult.error || 'Failed to refund prize pool' }),
                  { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }

              console.log('[competition-api] Prize pool refunded successfully');
            } catch (refundErr) {
              console.error('[competition-api] Exception refunding prize pool:', refundErr);
              return new Response(
                JSON.stringify({ error: 'Failed to refund prize pool' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        }

        // Delete related prize pool records
        await supabase
          .from('pending_prize_pools')
          .delete()
          .eq('competition_id', competitionId);

        await supabase
          .from('prize_pools')
          .delete()
          .eq('competition_id', competitionId);

        // Delete competition (cascade will delete participants and daily data)
        const { error: deleteError } = await supabase
          .from('competitions')
          .delete()
          .eq('id', competitionId);

        if (deleteError) {
          console.error('[competition-api] Error deleting competition:', deleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to delete competition' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[competition-api] Deleted competition:', competitionId);
        result = { success: true };
        break;
      }

      case 'finalize_draft': {
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

        const { data: competition, error: fetchError } = await supabase
          .from('competitions')
          .select('id, creator_id, status, start_date')
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
            JSON.stringify({ error: 'Only the creator can finalize this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (competition.status !== 'draft') {
          // Already finalized
          result = { success: true };
          break;
        }

        // Determine correct status based on start date
        const todayForDraft = new Date().toISOString().split('T')[0];
        const startDateForDraft = competition.start_date.split('T')[0];
        const newStatus = startDateForDraft <= todayForDraft ? 'active' : 'upcoming';

        const { error: updateError } = await supabase
          .from('competitions')
          .update({ status: newStatus })
          .eq('id', competitionId);

        if (updateError) {
          console.error('[competition-api] Error finalizing competition:', updateError);
          return new Response(
            JSON.stringify({ error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[competition-api] Finalized competition:', competitionId, 'to status:', newStatus);
        result = { success: true };
        break;
      }

      case 'delete_draft': {
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

        const { data: competition, error: fetchError } = await supabase
          .from('competitions')
          .select('id, creator_id, status')
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
            JSON.stringify({ error: 'Only the creator can delete this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (competition.status !== 'draft') {
          return new Response(
            JSON.stringify({ error: 'Can only delete draft competitions' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete participants
        await supabase
          .from('competition_participants')
          .delete()
          .eq('competition_id', competitionId);

        // Delete pending invitations
        await supabase
          .from('competition_invitations')
          .delete()
          .eq('competition_id', competitionId);

        // Delete pending prize pools
        await supabase
          .from('pending_prize_pools')
          .delete()
          .eq('competition_id', competitionId);

        // Delete the competition
        const { error: deleteError } = await supabase
          .from('competitions')
          .delete()
          .eq('id', competitionId);

        if (deleteError) {
          console.error('[competition-api] Error deleting draft competition:', deleteError);
          return new Response(
            JSON.stringify({ error: deleteError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[competition-api] Deleted draft competition:', competitionId);
        result = { success: true };
        break;
      }

      // ============================================================
      // Read actions for completed competitions
      // ============================================================

      case 'get_my_participated_competitions': {
        // Returns all competitions where user is a participant, with competition details
        // Client uses this for fetchCompletedCompetitions
        const { data: participantData, error: participantError } = await supabase
          .from('competition_participants')
          .select(`
            competition_id,
            total_points,
            competitions!inner (
              id,
              name,
              description,
              start_date,
              end_date,
              type,
              status,
              scoring_type,
              has_prize_pool
            )
          `)
          .eq('user_id', userId)
          .order('competitions(end_date)', { ascending: false });

        if (participantError) {
          console.error('[competition-api] Error fetching participated competitions:', participantError);
          throw participantError;
        }

        result = participantData || [];
        break;
      }

      case 'get_user_prize_payouts': {
        // Returns prize payouts for the authenticated user for specific competition IDs
        const v = validateParams(userPrizePayoutsSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionIds = v.data.competition_ids;

        const { data, error } = await supabase
          .from('prize_payouts')
          .select('competition_id, payout_amount')
          .eq('winner_id', userId)
          .in('competition_id', competitionIds);

        if (error) throw error;
        result = data || [];
        break;
      }

      case 'update_my_participant_totals': {
        const v = validateParams(updateTotalsSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;
        const totals = v.data.totals;

        // Verify user is a participant and get their participant ID
        const { data: participant } = await supabase
          .from('competition_participants')
          .select('id')
          .eq('competition_id', competitionId)
          .eq('user_id', userId)
          .single();

        if (!participant) {
          return new Response(
            JSON.stringify({ error: 'Not a participant in this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateError } = await supabase
          .from('competition_participants')
          .update({
            move_calories: totals.move_calories,
            exercise_minutes: totals.exercise_minutes,
            stand_hours: totals.stand_hours,
            step_count: totals.step_count,
            total_points: totals.total_points,
            move_progress: totals.move_progress,
            exercise_progress: totals.exercise_progress,
            stand_progress: totals.stand_progress,
            last_sync_at: new Date().toISOString(),
          })
          .eq('id', participant.id);

        if (updateError) throw updateError;
        result = { success: true };
        break;
      }

      case 'process_competition_completion': {
        // Server-side handling of competition completion:
        // - Check/create winner activity feed entries
        // - Trigger prize distribution if applicable
        const v = validateParams(competitionIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const competitionId = v.data.competition_id;

        // Fetch competition details
        const { data: competition, error: compError } = await supabase
          .from('competitions')
          .select('id, name, status, is_team_competition, has_prize_pool')
          .eq('id', competitionId)
          .single();

        if (compError || !competition) {
          result = { processed: false, reason: 'Competition not found' };
          break;
        }

        if (competition.status !== 'completed') {
          result = { processed: false, reason: 'Competition not completed' };
          break;
        }

        // Fetch participants with points
        const { data: participants } = await supabase
          .from('competition_participants')
          .select('id, user_id, total_points, team_id, prize_eligible')
          .eq('competition_id', competitionId)
          .order('total_points', { ascending: false, nullsFirst: false });

        if (!participants || participants.length === 0) {
          result = { processed: false, reason: 'No participants' };
          break;
        }

        const sortedParticipants = participants;

        try {
          if (competition.is_team_competition) {
            // Team competition: group by team, find winning team
            const teamMap = new Map<string, { totalPoints: number; members: any[] }>();
            for (const p of participants) {
              if (!p.team_id) continue;
              const existing = teamMap.get(p.team_id) || { totalPoints: 0, members: [] };
              existing.totalPoints += Number(p.total_points) || 0;
              existing.members.push(p);
              teamMap.set(p.team_id, existing);
            }

            const rankedTeams = [...teamMap.entries()]
              .map(([teamId, data]) => ({
                teamId,
                avgPoints: data.members.length > 0 ? data.totalPoints / data.members.length : 0,
                members: data.members,
              }))
              .sort((a, b) => b.avgPoints - a.avgPoints);

            if (rankedTeams.length > 0) {
              const winningTeam = rankedTeams[0];
              for (const member of winningTeam.members) {
                if (!member.user_id) continue;

                // Check if winner activity already exists
                const { data: existing } = await supabase
                  .from('activity_feed')
                  .select('id')
                  .eq('user_id', member.user_id)
                  .eq('activity_type', 'competition_won')
                  .eq('metadata->>competitionId', competition.id)
                  .limit(1);

                if (existing && existing.length > 0) continue;

                // Create winner activity
                await supabase
                  .from('activity_feed')
                  .insert({
                    user_id: member.user_id,
                    activity_type: 'competition_won',
                    metadata: {
                      competitionId: competition.id,
                      competitionName: competition.name,
                      participantCount: participants.length,
                      isTeamWin: true,
                      teamId: winningTeam.teamId,
                    },
                  });

                // Send notification
                try {
                  const SUPABASE_URL_INTERNAL = Deno.env.get('SUPABASE_URL');
                  await fetch(`${SUPABASE_URL_INTERNAL}/functions/v1/send-notification`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    },
                    body: JSON.stringify({
                      type: 'competition_won',
                      recipientUserId: member.user_id,
                      data: { competitionId: competition.id, competitionName: competition.name, isTeamWin: true },
                    }),
                  });
                } catch (notifErr) {
                  console.error('[competition-api] Failed to send winner notification:', notifErr);
                }
              }
            }
          } else {
            // Individual competition
            const winner = sortedParticipants[0];
            if (winner?.user_id) {
              // Check if winner activity already exists
              const { data: existing } = await supabase
                .from('activity_feed')
                .select('id')
                .eq('user_id', winner.user_id)
                .eq('activity_type', 'competition_won')
                .eq('metadata->>competitionId', competition.id)
                .limit(1);

              if (!existing || existing.length === 0) {
                // Create winner activity
                await supabase
                  .from('activity_feed')
                  .insert({
                    user_id: winner.user_id,
                    activity_type: 'competition_won',
                    metadata: {
                      competitionId: competition.id,
                      competitionName: competition.name,
                      participantCount: participants.length,
                    },
                  });

                // Send notification
                try {
                  const SUPABASE_URL_INTERNAL = Deno.env.get('SUPABASE_URL');
                  await fetch(`${SUPABASE_URL_INTERNAL}/functions/v1/send-notification`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    },
                    body: JSON.stringify({
                      type: 'competition_won',
                      recipientUserId: winner.user_id,
                      data: { competitionId: competition.id, competitionName: competition.name },
                    }),
                  });
                } catch (notifErr) {
                  console.error('[competition-api] Failed to send winner notification:', notifErr);
                }
              }
            }
          }

          // Check and trigger prize distribution
          if (competition.has_prize_pool) {
            const { data: prizePool } = await supabase
              .from('prize_pools')
              .select('id, status')
              .eq('competition_id', competitionId)
              .eq('status', 'active')
              .single();

            if (prizePool) {
              // Check if payouts already exist
              const { data: existingPayouts } = await supabase
                .from('prize_payouts')
                .select('id')
                .eq('competition_id', competitionId)
                .limit(1);

              if (!existingPayouts || existingPayouts.length === 0) {
                // Build placements and trigger distribution
                let placements: { userId: string; placement: number; teamId?: string }[];

                if (competition.is_team_competition) {
                  // Teams ranked by avg points (all members count toward average)
                  const teamMap = new Map<string, { totalPoints: number; members: any[] }>();
                  for (const p of participants) {
                    if (!p.team_id) continue;
                    const existing = teamMap.get(p.team_id) || { totalPoints: 0, members: [] };
                    existing.totalPoints += Number(p.total_points) || 0;
                    existing.members.push(p);
                    teamMap.set(p.team_id, existing);
                  }
                  const rankedTeams = [...teamMap.entries()]
                    .map(([teamId, data]) => ({
                      teamId,
                      avgPoints: data.members.length > 0 ? data.totalPoints / data.members.length : 0,
                      members: data.members,
                    }))
                    .sort((a, b) => b.avgPoints - a.avgPoints);

                  // Prize cascade: only prize-eligible members get placements
                  placements = [];
                  rankedTeams.slice(0, 5).forEach((team, index) => {
                    for (const member of team.members) {
                      if (member.prize_eligible !== false) {
                        placements.push({ userId: member.user_id, placement: index + 1, teamId: team.teamId });
                      }
                    }
                  });
                } else {
                  // Prize cascade: filter to only prize-eligible participants, then assign placements
                  const eligibleParticipants = sortedParticipants.filter((p: any) => p.prize_eligible !== false);
                  placements = eligibleParticipants.slice(0, 5).map((p: any, index: number) => ({
                    userId: p.user_id,
                    placement: index + 1,
                  }));
                }

                // Call distribute-prize edge function
                try {
                  const SUPABASE_URL_INTERNAL = Deno.env.get('SUPABASE_URL');
                  const authHeader = req.headers.get('Authorization');
                  await fetch(`${SUPABASE_URL_INTERNAL}/functions/v1/distribute-prize`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': authHeader || `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    },
                    body: JSON.stringify({
                      competitionId,
                      placements,
                      isTeamCompetition: competition.is_team_competition,
                    }),
                  });
                  console.log('[competition-api] Prize distribution triggered for:', competitionId);
                } catch (distErr) {
                  console.error('[competition-api] Failed to trigger prize distribution:', distErr);
                }
              }
            }
          }
        } catch (completionErr) {
          console.error('[competition-api] Error processing competition completion:', completionErr);
        }

        result = { processed: true };
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
