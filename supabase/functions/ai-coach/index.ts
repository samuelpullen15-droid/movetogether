import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check subscription
    const { data: profile } = await supabase
      .from("profiles")
      .select("*, subscription_tier, ai_messages_used, ai_messages_reset_at")
      .eq("id", user.id)
      .single();

    if (!profile || profile.subscription_tier !== "crusher") {
      return new Response(
        JSON.stringify({ error: "AI Coach requires Crusher subscription" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const { message, conversationHistory = [] } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: "No message provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== GATHER ALL USER CONTEXT =====

    // 1. Recent activity/fitness data (last 7 days)
    const { data: fitnessData } = await supabase
      .from("user_fitness")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(7);

    // 2. User's active competitions
    const { data: userCompetitions } = await supabase
      .from("competition_participants")
      .select(`
        competition_id,
        joined_at,
        competitions (
          id,
          name,
          type,
          start_date,
          end_date,
          created_by
        )
      `)
      .eq("user_id", user.id);

    // 3. Get standings for each competition
    let competitionStandings = [];
    if (userCompetitions && userCompetitions.length > 0) {
      for (const comp of userCompetitions) {
        const { data: standings } = await supabase
          .from("competition_daily_data")
          .select(`
            user_id,
            points,
            profiles!inner(username, full_name)
          `)
          .eq("competition_id", comp.competition_id)
          .order("points", { ascending: false });

        if (standings) {
          const userRank = standings.findIndex(s => s.user_id === user.id) + 1;
          const userStats = standings.find(s => s.user_id === user.id);
          const leader = standings[0];
          const personAhead = userRank > 1 ? standings[userRank - 2] : null;
          const personBehind = userRank < standings.length ? standings[userRank] : null;

          competitionStandings.push({
            competitionName: comp.competitions?.name,
            type: comp.competitions?.type,
            totalParticipants: standings.length,
            userRank,
            userPoints: userStats?.points || 0,
            leader: leader ? { 
              name: leader.profiles?.full_name || leader.profiles?.username, 
              points: leader.points 
            } : null,
            personAhead: personAhead ? { 
              name: personAhead.profiles?.full_name || personAhead.profiles?.username, 
              points: personAhead.points,
              gap: personAhead.points - (userStats?.points || 0)
            } : null,
            personBehind: personBehind ? { 
              name: personBehind.profiles?.full_name || personBehind.profiles?.username, 
              points: personBehind.points,
              gap: (userStats?.points || 0) - personBehind.points
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

    // ===== BUILD SYSTEM PROMPT =====
    const systemPrompt = `You are the AI Coach for MoveTogether, a social fitness competition app. You ONLY help with fitness, health, and competition-related questions.

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
${activityData && activityData.length > 0 ? JSON.stringify(activityData, null, 2) : "No recent activity data"}

## FITNESS METRICS
${fitnessData && fitnessData.length > 0 ? JSON.stringify(fitnessData, null, 2) : "No fitness data available"}

## ACTIVE COMPETITIONS
${competitionStandings.length > 0 ? competitionStandings.map(c => `
**${c.competitionName}** (${c.type})
- Your rank: #${c.userRank} of ${c.totalParticipants}
- Your points: ${c.userPoints}
- Leader: ${c.leader?.name} with ${c.leader?.points} points
${c.personAhead ? `- Ahead of you: ${c.personAhead.name} with ${c.personAhead.points} points (${c.personAhead.gap} point gap)` : "- You're in first place!"}
${c.personBehind ? `- Behind you: ${c.personBehind.name} with ${c.personBehind.points} points (${c.personBehind.gap} point buffer)` : ""}
`).join("\n") : "Not currently in any competitions"}

## GUIDELINES
- Be concise and actionable
- Reference their actual data when relevant
- If they're close to someone in a competition, give specific advice to close the gap
- Celebrate wins and progress
- Keep responses under 150 words unless they ask for detail`;

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

  // Clean up old rate limit records (older than 1 hour)
async function cleanupRateLimits(supabase: any) {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  await supabase
    .from("rate_limits")
    .delete()
    .lt("window_start", oneHourAgo.toISOString());
}

// Call cleanup occasionally (1 in 10 requests)
if (Math.random() < 0.1) {
  cleanupRateLimits(supabase).catch(console.error);
}

});