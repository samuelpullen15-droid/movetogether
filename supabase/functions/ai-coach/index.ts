import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// =========================================================================
// ZOD SCHEMAS - Per security rules: Validate ALL inputs using Zod
// =========================================================================

const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(10000, "Message content too long"),
});

const AICoachRequestSchema = z.object({
  message: z.string().min(1, "Message is required").max(2000, "Message too long (max 2000 characters)"),
  conversationHistory: z.array(ConversationMessageSchema).max(20, "Too many messages in history").optional().default([]),
});

type AICoachRequest = z.infer<typeof AICoachRequestSchema>;

async function checkRateLimit(
  supabase: any,
  userId: string,
  endpoint: string,
  limit: number,
  windowMinutes: number
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date();
  windowStart.setMinutes(windowStart.getMinutes() - windowMinutes);

  // Get or create rate limit record
  const { data: existing } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .gte("window_start", windowStart.toISOString())
    .single();

  if (existing) {
    if (existing.request_count >= limit) {
      return { allowed: false, remaining: 0 };
    }

    // Increment count
    await supabase
      .from("rate_limits")
      .update({ request_count: existing.request_count + 1 })
      .eq("id", existing.id);

    return { allowed: true, remaining: limit - existing.request_count - 1 };
  }

  // Create new rate limit record
  await supabase
    .from("rate_limits")
    .insert({
      user_id: userId,
      endpoint,
      request_count: 1,
      window_start: new Date().toISOString(),
    });

  return { allowed: true, remaining: limit - 1 };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract JWT token from Bearer header and verify with service role client
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check subscription tier from database (server-side verification)
    // NOTE: Client already gates access via RevenueCat, but we still fetch profile for user data
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_tier, ai_messages_used, ai_messages_reset_at, full_name, username")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Subscription check removed - RevenueCat handles this on client-side
    // The coach screen is only accessible to Crusher subscribers via ProPaywall

    // Check rate limit (10 requests per minute)
    const rateLimit = await checkRateLimit(supabase, user.id, "ai-coach", 10, 1);

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded. Please wait a moment before trying again." 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check message limit
    const now = new Date();
    const resetAt = profile.ai_messages_reset_at ? new Date(profile.ai_messages_reset_at) : null;
    let messagesUsed = profile.ai_messages_used || 0;

    if (!resetAt || now.getMonth() !== resetAt.getMonth() || now.getFullYear() !== resetAt.getFullYear()) {
      messagesUsed = 0;
      await supabase
        .from("profiles")
        .update({ ai_messages_used: 0, ai_messages_reset_at: now.toISOString() })
        .eq("id", user.id);
    }

    if (messagesUsed >= 200) {
      return new Response(
        JSON.stringify({ error: "Monthly message limit reached. Resets next month." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // PARSE & VALIDATE REQUEST BODY WITH ZOD
    // Per security rules: Validate ALL inputs using Zod
    // =========================================================================

    let requestBody: AICoachRequest;
    try {
      const rawBody = await req.json();
      requestBody = AICoachRequestSchema.parse(rawBody);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        const firstError = zodError.errors[0];
        return new Response(
          JSON.stringify({ error: firstError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { message, conversationHistory } = requestBody;

    // ===== GATHER ALL USER CONTEXT =====

    // 1. Recent activity/fitness data (last 7 days)
    const { data: fitnessData } = await supabase
      .from("user_fitness")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(7);

    // 2. User's active competitions (with status filter)
    const { data: userCompetitions, error: compError } = await supabase
      .from("competition_participants")
      .select(`
        competition_id,
        joined_at,
        competitions (
          id,
          name,
          type,
          status,
          start_date,
          end_date
        )
      `)
      .eq("user_id", user.id);

    // DEBUG LOGGING
    console.log("=== DEBUG: Competition Query ===");
    console.log("User ID:", user.id);
    console.log("userCompetitions:", JSON.stringify(userCompetitions, null, 2));
    console.log("compError:", compError);

    // Filter to only active/ongoing competitions
    const activeCompetitions = userCompetitions?.filter(
      comp => comp.competitions?.status === 'active' || 
              comp.competitions?.status === 'ongoing' ||
              comp.competitions?.status === 'in_progress'
    ) || [];

    console.log("activeCompetitions after filter:", JSON.stringify(activeCompetitions, null, 2));

    // 3. Get standings for each competition
    let competitionStandings: any[] = [];
    if (activeCompetitions.length > 0) {
      for (const comp of activeCompetitions) {
        // Try competition_standings table first (if it exists and has data)
        let { data: standings } = await supabase
          .from("competition_standings")
          .select(`
            user_id,
            total_points,
            rank,
            profiles!inner(username, full_name)
          `)
          .eq("competition_id", comp.competition_id)
          .order("rank", { ascending: true });

        // If no data in competition_standings, try competition_daily_data
        if (!standings || standings.length === 0) {
          const { data: dailyData } = await supabase
            .from("competition_daily_data")
            .select(`
              user_id,
              points,
              profiles!inner(username, full_name)
            `)
            .eq("competition_id", comp.competition_id)
            .order("points", { ascending: false });
          
          standings = dailyData?.map((d, index) => ({
            user_id: d.user_id,
            total_points: d.points,
            rank: index + 1,
            profiles: d.profiles
          })) || [];
        }

        if (standings && standings.length > 0) {
          const userRank = standings.findIndex(s => s.user_id === user.id) + 1;
          const userStats = standings.find(s => s.user_id === user.id);
          const leader = standings[0];
          const personAhead = userRank > 1 ? standings[userRank - 2] : null;
          const personBehind = userRank < standings.length ? standings[userRank] : null;

          competitionStandings.push({
            competitionId: comp.competition_id,
            competitionName: comp.competitions?.name,
            type: comp.competitions?.type,
            status: comp.competitions?.status,
            startDate: comp.competitions?.start_date,
            endDate: comp.competitions?.end_date,
            totalParticipants: standings.length,
            userRank,
            userPoints: userStats?.total_points || 0,
            leader: leader ? { 
              name: leader.profiles?.full_name || leader.profiles?.username, 
              points: leader.total_points 
            } : null,
            personAhead: personAhead ? { 
              name: personAhead.profiles?.full_name || personAhead.profiles?.username, 
              points: personAhead.total_points,
              gap: personAhead.total_points - (userStats?.total_points || 0)
            } : null,
            personBehind: personBehind ? { 
              name: personBehind.profiles?.full_name || personBehind.profiles?.username, 
              points: personBehind.total_points,
              gap: (userStats?.total_points || 0) - personBehind.total_points
            } : null,
          });
        }
      }
    }

    // 4. User's activity data (rings, steps, etc.)
    const { data: activityData } = await supabase
      .from("user_activity")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(7);

    // ===== BUILD COMPETITION INFO =====
    // Show competitions even if no standings data yet
    let competitionInfo = "";
    if (activeCompetitions.length > 0) {
      competitionInfo = activeCompetitions.map(comp => {
        const standing = competitionStandings.find(
          s => s.competitionId === comp.competition_id
        );
        
        if (standing && standing.userRank > 0) {
          // We have standings data
          return `
**${standing.competitionName}** (${standing.type})
- Status: ${standing.status}
- Dates: ${standing.startDate} to ${standing.endDate}
- Your rank: #${standing.userRank} of ${standing.totalParticipants}
- Your points: ${standing.userPoints}
- Leader: ${standing.leader?.name} with ${standing.leader?.points} points
${standing.personAhead ? `- Ahead of you: ${standing.personAhead.name} with ${standing.personAhead.points} points (${standing.personAhead.gap} point gap to close)` : "- You're in first place!"}
${standing.personBehind ? `- Behind you: ${standing.personBehind.name} with ${standing.personBehind.points} points (${standing.personBehind.gap} point buffer)` : "- No one behind you yet"}`;
        } else {
          // Competition exists but no standings data yet
          return `
**${comp.competitions?.name}** (${comp.competitions?.type})
- Status: ${comp.competitions?.status}
- Dates: ${comp.competitions?.start_date} to ${comp.competitions?.end_date}
- Joined: ${comp.joined_at}
- Standings: Not yet available (waiting for activity data to be recorded)`;
        }
      }).join("\n");
    } else if (userCompetitions && userCompetitions.length > 0) {
      // User has competitions but none are active
      competitionInfo = `You have ${userCompetitions.length} competition(s) but none are currently active. They may have ended or not started yet.`;
    } else {
      competitionInfo = "Not currently in any competitions.";
    }

    // ===== BUILD SYSTEM PROMPT =====
    const systemPrompt = `You are Coach Spark, the AI Coach for MoveTogether, a social fitness competition app. You ONLY help with fitness, health, and competition-related questions.

## YOUR ROLE
- Help users improve their fitness and win competitions
- Give actionable advice on workouts, nutrition, and recovery
- Analyze their competition standings and suggest strategies
- Motivate and encourage them
- Answer health and fitness questions

## OFF-LIMITS (politely decline these)
- Non-fitness topics (politics, coding, general knowledge, etc.)
- Medical diagnoses (suggest they see a doctor)
- Dangerous weight loss advice
- Anything unrelated to health, fitness, or their competitions

## USER PROFILE
Name: ${profile.full_name || profile.username || "User"}

## RECENT ACTIVITY (Last 7 days)
${activityData && activityData.length > 0 ? JSON.stringify(activityData, null, 2) : "No recent activity data available"}

## FITNESS METRICS
${fitnessData && fitnessData.length > 0 ? JSON.stringify(fitnessData, null, 2) : "No fitness data available"}

## ACTIVE COMPETITIONS
${competitionInfo}

## GUIDELINES
- Be concise and actionable
- Reference their actual data when relevant
- If they're close to someone in a competition, give specific advice to close the gap
- Celebrate wins and progress
- Keep responses under 150 words unless they ask for detail
- If user asks about competitions and they have some, always reference their actual competition data above`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10),
      { role: "user", content: message }
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error("OpenAI error:", error);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const assistantMessage = openaiData.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";

    // Increment message count
    await supabase
      .from("profiles")
      .update({ ai_messages_used: messagesUsed + 1 })
      .eq("id", user.id);

    // Clean up old rate limit records occasionally (1 in 10 requests)
    if (Math.random() < 0.1) {
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      supabase
        .from("rate_limits")
        .delete()
        .lt("window_start", oneHourAgo.toISOString())
        .then(() => {})
        .catch(console.error);
    }

    return new Response(
      JSON.stringify({ 
        message: assistantMessage,
        messagesRemaining: 199 - messagesUsed 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});