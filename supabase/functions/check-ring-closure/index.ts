import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RingClosureInput {
  userId: string;
  date: string; // YYYY-MM-DD
  moveCalories: number;
  exerciseMinutes: number;
  standHours: number;
  moveGoal: number;
  exerciseGoal: number;
  standGoal: number;
}

// Ring progress thresholds
const NUDGE_THRESHOLD = 0.80; // 80%
const CLOSE_THRESHOLD = 1.0;  // 100%

interface RingProgress {
  ring: 'move' | 'exercise' | 'stand';
  progress: number;
  current: number;
  goal: number;
  remaining: number;
  unit: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // This function is called server-to-server from calculate-daily-score
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let input: RingClosureInput;
    try {
      input = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { userId, date, moveCalories, exerciseMinutes, standHours, moveGoal, exerciseGoal, standGoal } = input;

    if (!userId || !date) {
      return new Response(
        JSON.stringify({ error: 'userId and date are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. Determine which rings are closed
    const moveClosed = moveGoal > 0 && moveCalories >= moveGoal;
    const exerciseClosed = exerciseGoal > 0 && exerciseMinutes >= exerciseGoal;
    const standClosed = standGoal > 0 && standHours >= standGoal;

    if (!moveClosed && !exerciseClosed && !standClosed) {
      // No rings closed, but still check for progress nudges
      const progressNudgeSent = await checkAndSendProgressNudges(
        supabaseAdmin,
        userId,
        date,
        { moveCalories, exerciseMinutes, standHours, moveGoal, exerciseGoal, standGoal }
      );

      return new Response(
        JSON.stringify({
          notified: false,
          reason: 'no_rings_closed',
          progressNudges: progressNudgeSent,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Build list of closed ring types
    const closedRings: string[] = [];
    if (moveClosed) closedRings.push('move');
    if (exerciseClosed) closedRings.push('exercise');
    if (standClosed) closedRings.push('stand');
    if (moveClosed && exerciseClosed && standClosed) closedRings.push('all');

    console.log(`[check-ring-closure] User ${userId} on ${date}: closed rings = ${closedRings.join(', ')}`);

    // 3. Check which ring notifications have already been sent for this user+date
    const { data: alreadySent } = await supabaseAdmin
      .from('ring_notifications_sent')
      .select('ring_type')
      .eq('user_id', userId)
      .eq('date', date);

    const sentSet = new Set((alreadySent || []).map((r: { ring_type: string }) => r.ring_type));

    // 4. Filter to only new rings
    const newRings = closedRings.filter((ring) => !sentSet.has(ring));

    if (newRings.length === 0) {
      console.log(`[check-ring-closure] All notifications already sent for user ${userId} on ${date}`);
      return new Response(
        JSON.stringify({ notified: false, reason: 'already_sent' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 5. Get the user's display name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, username')
      .eq('id', userId)
      .single();

    const userName = profile?.full_name || profile?.username || 'Someone';

    // 6. Get all active competitions the user is in where the date falls within the range
    const { data: participations } = await supabaseAdmin
      .from('competition_participants')
      .select('competition_id, competitions!inner(id, status, start_date, end_date)')
      .eq('user_id', userId)
      .eq('competitions.status', 'active')
      .lte('competitions.start_date', date)
      .gte('competitions.end_date', date);

    if (!participations || participations.length === 0) {
      console.log(`[check-ring-closure] User ${userId} has no active competitions for ${date}`);
      // Still record notifications to prevent retries
      await recordNotifications(supabaseAdmin, userId, date, newRings);
      return new Response(
        JSON.stringify({ notified: false, reason: 'no_recipients' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 7. Get all OTHER participants in those competitions
    const competitionIds = participations.map((p) => p.competition_id);
    const { data: competitors } = await supabaseAdmin
      .from('competition_participants')
      .select('user_id')
      .in('competition_id', competitionIds)
      .neq('user_id', userId);

    const recipientIds = [...new Set((competitors || []).map((c) => c.user_id))];

    if (recipientIds.length === 0) {
      console.log(`[check-ring-closure] No other participants to notify`);
      await recordNotifications(supabaseAdmin, userId, date, newRings);
      return new Response(
        JSON.stringify({ notified: false, reason: 'no_recipients' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[check-ring-closure] Found ${recipientIds.length} competition member(s) to notify`);

    // 8. Build notification message
    const notificationMessage = buildNotificationMessage(userName, newRings);

    // 9. Send via OneSignal REST API (single batch call)
    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

    let notificationSent = false;

    if (ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY) {
      try {
        const response = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_aliases: {
              external_id: recipientIds,
            },
            target_channel: 'push',
            headings: { en: 'Ring Closed! 🎯' },
            contents: { en: notificationMessage },
            data: {
              type: 'ring_closure',
              userId,
              date,
            },
          }),
        });

        const result = await response.json();

        if (result.errors) {
          console.error('[check-ring-closure] OneSignal error:', result.errors);
        } else {
          console.log(`[check-ring-closure] OneSignal notification sent, id: ${result.id}`);
          notificationSent = true;
        }
      } catch (e) {
        console.error('[check-ring-closure] OneSignal request failed:', e);
      }
    } else {
      console.error('[check-ring-closure] OneSignal credentials not configured');
    }

    // 10. Record all new ring notifications as sent (even if OneSignal failed, to prevent retry spam)
    await recordNotifications(supabaseAdmin, userId, date, newRings);

    console.log(`[check-ring-closure] Done for user ${userId} on ${date}: rings=${newRings.join(',')}, recipients=${recipientIds.length}`);

    // 11. Check for ring progress nudges (80-99% complete)
    const progressNudgeSent = await checkAndSendProgressNudges(
      supabaseAdmin,
      userId,
      date,
      { moveCalories, exerciseMinutes, standHours, moveGoal, exerciseGoal, standGoal }
    );

    return new Response(
      JSON.stringify({
        notified: notificationSent,
        rings: newRings,
        recipientCount: recipientIds.length,
        progressNudges: progressNudgeSent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[check-ring-closure] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

async function recordNotifications(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: string,
  rings: string[],
) {
  for (const ring of rings) {
    const { error } = await supabase
      .from('ring_notifications_sent')
      .upsert(
        { user_id: userId, date, ring_type: ring },
        { onConflict: 'user_id,date,ring_type' },
      );

    if (error) {
      console.error(`[check-ring-closure] Failed to record notification for ring ${ring}:`, error);
    }
  }
}

function buildNotificationMessage(userName: string, newRings: string[]): string {
  // If "all" is in the list, use the all-rings message
  if (newRings.includes('all')) {
    return `🔥 ${userName} just closed all 3 rings!`;
  }

  // Filter to individual ring types only
  const individualRings = newRings.filter((r) => r !== 'all');

  if (individualRings.length === 0) {
    return `${userName} closed a ring!`;
  }

  // Build combined message for multiple rings
  if (individualRings.length > 1) {
    const ringNames = individualRings.map(ringDisplayName);
    const last = ringNames.pop()!;
    return `💪 ${userName} just closed their ${ringNames.join(', ')} and ${last} rings!`;
  }

  // Single ring
  const ring = individualRings[0];
  switch (ring) {
    case 'move':
      return `💪 ${userName} just closed their Move ring!`;
    case 'exercise':
      return `🏃 ${userName} just closed their Exercise ring!`;
    case 'stand':
      return `🧍 ${userName} just closed their Stand ring!`;
    default:
      return `${userName} closed a ring!`;
  }
}

function ringDisplayName(ring: string): string {
  switch (ring) {
    case 'move': return 'Move';
    case 'exercise': return 'Exercise';
    case 'stand': return 'Stand';
    default: return ring;
  }
}

// ============================================================================
// RING PROGRESS NUDGES (80-99% complete)
// ============================================================================

async function checkAndSendProgressNudges(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: string,
  metrics: {
    moveCalories: number;
    exerciseMinutes: number;
    standHours: number;
    moveGoal: number;
    exerciseGoal: number;
    standGoal: number;
  }
): Promise<string[]> {
  const { moveCalories, exerciseMinutes, standHours, moveGoal, exerciseGoal, standGoal } = metrics;

  // Calculate progress for each ring
  const ringProgresses: RingProgress[] = [];

  if (moveGoal > 0) {
    const progress = moveCalories / moveGoal;
    if (progress >= NUDGE_THRESHOLD && progress < CLOSE_THRESHOLD) {
      ringProgresses.push({
        ring: 'move',
        progress,
        current: moveCalories,
        goal: moveGoal,
        remaining: Math.ceil(moveGoal - moveCalories),
        unit: 'calories',
      });
    }
  }

  if (exerciseGoal > 0) {
    const progress = exerciseMinutes / exerciseGoal;
    if (progress >= NUDGE_THRESHOLD && progress < CLOSE_THRESHOLD) {
      ringProgresses.push({
        ring: 'exercise',
        progress,
        current: exerciseMinutes,
        goal: exerciseGoal,
        remaining: Math.ceil(exerciseGoal - exerciseMinutes),
        unit: 'minutes',
      });
    }
  }

  if (standGoal > 0) {
    const progress = standHours / standGoal;
    if (progress >= NUDGE_THRESHOLD && progress < CLOSE_THRESHOLD) {
      ringProgresses.push({
        ring: 'stand',
        progress,
        current: standHours,
        goal: standGoal,
        remaining: Math.ceil(standGoal - standHours),
        unit: 'hours',
      });
    }
  }

  if (ringProgresses.length === 0) {
    return [];
  }

  console.log(`[check-ring-closure] User ${userId} has ${ringProgresses.length} ring(s) at 80-99%`);

  // Check which nudges have already been sent today
  const { data: alreadySent } = await supabase
    .from('ring_notifications_sent')
    .select('ring_type')
    .eq('user_id', userId)
    .eq('date', date)
    .like('ring_type', '%_nudge');

  const sentSet = new Set((alreadySent || []).map((r: { ring_type: string }) => r.ring_type));

  // Filter to only unsent nudges
  const newNudges = ringProgresses.filter((rp) => !sentSet.has(`${rp.ring}_nudge`));

  if (newNudges.length === 0) {
    console.log(`[check-ring-closure] All nudges already sent for user ${userId} on ${date}`);
    return [];
  }

  // Check if user has notifications enabled
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('achievements_push')
    .eq('user_id', userId)
    .maybeSingle();

  if (prefs && prefs.achievements_push === false) {
    console.log(`[check-ring-closure] User ${userId} has achievements_push disabled, skipping nudge`);
    return [];
  }

  // Send nudge notification to the user (not competitors)
  const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
  const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

  const sentNudges: string[] = [];

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error('[check-ring-closure] OneSignal credentials not configured for nudges');
    return [];
  }

  // Send individual nudge for each ring (more personalized)
  for (const nudge of newNudges) {
    const message = buildNudgeMessage(nudge);

    try {
      const response = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          include_aliases: {
            external_id: [userId],
          },
          target_channel: 'push',
          headings: { en: message.title },
          contents: { en: message.body },
          data: {
            type: 'ring_progress_nudge',
            ring: nudge.ring,
            progress: nudge.progress,
            remaining: nudge.remaining,
            deep_link: '/(tabs)',
          },
          // TTL - expire after 2 hours (time-sensitive)
          ttl: 7200,
        }),
      });

      const result = await response.json();

      if (result.errors) {
        console.error(`[check-ring-closure] OneSignal nudge error for ${nudge.ring}:`, result.errors);
      } else {
        console.log(`[check-ring-closure] Nudge sent for ${nudge.ring} ring, id: ${result.id}`);
        sentNudges.push(nudge.ring);

        // Record the nudge as sent
        await supabase
          .from('ring_notifications_sent')
          .upsert(
            { user_id: userId, date, ring_type: `${nudge.ring}_nudge` },
            { onConflict: 'user_id,date,ring_type' }
          );
      }
    } catch (e) {
      console.error(`[check-ring-closure] OneSignal nudge request failed for ${nudge.ring}:`, e);
    }
  }

  return sentNudges;
}

function buildNudgeMessage(nudge: RingProgress): { title: string; body: string } {
  const progressPercent = Math.round(nudge.progress * 100);

  switch (nudge.ring) {
    case 'move':
      return {
        title: '🔥 Almost there!',
        body: `Just ${nudge.remaining} calories to close your Move ring! You're at ${progressPercent}%.`,
      };
    case 'exercise':
      return {
        title: '💪 So close!',
        body: `Only ${nudge.remaining} minutes to close your Exercise ring! Keep moving!`,
      };
    case 'stand':
      return {
        title: '🧍 One more push!',
        body: `Just ${nudge.remaining} more stand hour${nudge.remaining !== 1 ? 's' : ''} to close your Stand ring!`,
      };
    default:
      return {
        title: '🎯 Almost done!',
        body: `You're ${progressPercent}% of the way there!`,
      };
  }
}
