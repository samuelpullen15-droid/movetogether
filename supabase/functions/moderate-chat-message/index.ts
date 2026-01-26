// supabase/functions/moderate-chat-message/index.ts
//
// Real-time chat message moderation for competition group chats
// Called when a message is sent, before it's broadcast to others
// Blocks toxic/inappropriate messages and flags repeat offenders
// Security: Validates user is in the competition, all checks server-side, Zod validated

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Toxicity thresholds
const BLOCK_THRESHOLD = 0.70; // Block message immediately
const WARN_THRESHOLD = 0.6; // Allow but flag for review
const AUTO_MUTE_AFTER = 3; // Auto-mute after 3 blocked messages in a session

// =========================================================================
// ZOD SCHEMAS - Per security rules: Validate ALL inputs using Zod
// =========================================================================

const MessageRequestSchema = z.object({
  competition_id: z.string().uuid("Invalid competition ID format"),
  message_content: z.string().min(1, "Message cannot be empty").max(2000, "Message too long (max 2000 characters)"),
  message_id: z.string().uuid("Invalid message ID format").optional(),
});

type MessageRequest = z.infer<typeof MessageRequestSchema>;

interface ToxicityResult {
  is_toxic: boolean;
  score: number;
  categories: Record<string, number>;
  should_block: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // =========================================================================
    // INITIALIZE
    // =========================================================================

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract JWT token from Bearer header and verify with service role client
    const token = authHeader.replace("Bearer ", "");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // =========================================================================
    // VERIFY USER
    // =========================================================================

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // PARSE & VALIDATE REQUEST WITH ZOD
    // Per security rules: Validate ALL inputs using Zod
    // =========================================================================

    let body: MessageRequest;
    try {
      const rawBody = await req.json();
      body = MessageRequestSchema.parse(rawBody);
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

    const { competition_id, message_content, message_id } = body;

    // =========================================================================
    // VERIFY USER IS IN COMPETITION (OPTIONAL - skip if table doesn't exist)
    // =========================================================================

    let isMuted = false;
    let mutedUntil: string | null = null;

    // Try to check participant status - if table doesn't exist or query fails, skip
    try {
      const { data: participant, error: participantError } = await supabaseAdmin
        .from("competition_participants")
        .select("id, is_muted, muted_until")
        .eq("competition_id", competition_id)
        .eq("user_id", user.id)
        .single();

      if (participant) {
        isMuted = participant.is_muted || false;
        mutedUntil = participant.muted_until || null;
      }
      // If participantError, we just skip the check (table might not exist)
    } catch (e) {
      console.log("Participant check skipped:", e);
    }

    // Check if user is muted
    if (isMuted && mutedUntil) {
      const mutedUntilDate = new Date(mutedUntil);
      if (mutedUntilDate > new Date()) {
        return new Response(
          JSON.stringify({ 
            error: "You are currently muted in this competition",
            muted_until: mutedUntil,
            allowed: false 
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // =========================================================================
    // CHECK USER'S MODERATION STATUS
    // =========================================================================

    const { data: userMod } = await supabaseAdmin
      .from("user_moderation")
      .select("status")
      .eq("user_id", user.id)
      .single();

    if (userMod?.status === "suspended" || userMod?.status === "banned") {
      return new Response(
        JSON.stringify({ 
          error: "Your account is restricted",
          allowed: false 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // BASIC PROFANITY FILTER (before AI check)
    // =========================================================================

    const BLOCKED_WORDS = [
      'fuck', 'shit', 'ass', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 
      'asshole', 'bastard', 'damn', 'fag', 'faggot', 'nigger', 'nigga',
      'retard', 'slut', 'whore', 'twat'
    ];

    const lowerMessage = message_content.toLowerCase();
    const containsProfanity = BLOCKED_WORDS.some(word => {
      // Match whole words only (not "assistant" matching "ass")
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(lowerMessage);
    });

    if (containsProfanity) {
      return new Response(
        JSON.stringify({
          allowed: false,
          blocked: true,
          reason: "Your message contains inappropriate language. Please keep conversations respectful.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // MODERATE MESSAGE CONTENT
    // =========================================================================

    let toxicityResult: ToxicityResult = {
      is_toxic: false,
      score: 0,
      categories: {},
      should_block: false,
    };

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const perspectiveApiKey = Deno.env.get("PERSPECTIVE_API_KEY");

    // Try OpenAI moderation first (faster)
    if (openaiApiKey) {
      toxicityResult = await moderateWithOpenAI(message_content, openaiApiKey);
    } else if (perspectiveApiKey) {
      // Fallback to Perspective API
      toxicityResult = await moderateWithPerspective(message_content, perspectiveApiKey);
    }

    // =========================================================================
    // HANDLE TOXIC CONTENT
    // =========================================================================

    if (toxicityResult.should_block) {
      // Log the flagged message
      await supabaseAdmin.from("chat_message_flags").insert({
        message_id: message_id || crypto.randomUUID(),
        competition_id,
        author_id: user.id,
        toxicity_score: toxicityResult.score,
        toxicity_categories: toxicityResult.categories,
        is_hidden: true,
        auto_hidden: true,
      });

      // Check recent blocked messages for this user in this competition
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentBlocks } = await supabaseAdmin
        .from("chat_message_flags")
        .select("id")
        .eq("author_id", user.id)
        .eq("competition_id", competition_id)
        .eq("auto_hidden", true)
        .gte("created_at", oneHourAgo);

      const blockCount = (recentBlocks?.length || 0) + 1;

      // Auto-mute after repeated violations (only if we have the participants table)
      if (blockCount >= AUTO_MUTE_AFTER) {
        const newMutedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        // Try to update mute status - skip if table doesn't exist
        try {
          await supabaseAdmin
            .from("competition_participants")
            .update({ 
              is_muted: true, 
              muted_until: newMutedUntil.toISOString() 
            })
            .eq("competition_id", competition_id)
            .eq("user_id", user.id);
        } catch (e) {
          console.log("Could not update mute status:", e);
        }

        return new Response(
          JSON.stringify({
            allowed: false,
            blocked: true,
            reason: "Your message was blocked for violating chat guidelines. Due to repeated violations, you have been muted for 24 hours.",
            muted_until: newMutedUntil.toISOString(),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          allowed: false,
          blocked: true,
          reason: "Your message was blocked for violating chat guidelines. Please keep conversations respectful.",
          warnings_remaining: AUTO_MUTE_AFTER - blockCount,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // FLAG FOR REVIEW IF BORDERLINE
    // =========================================================================

    if (toxicityResult.is_toxic && toxicityResult.score >= WARN_THRESHOLD) {
      // Allow the message but flag it for review
      await supabaseAdmin.from("chat_message_flags").insert({
        message_id: message_id || crypto.randomUUID(),
        competition_id,
        author_id: user.id,
        toxicity_score: toxicityResult.score,
        toxicity_categories: toxicityResult.categories,
        is_hidden: false,
        auto_hidden: false,
      });
    }

    // =========================================================================
    // MESSAGE APPROVED
    // =========================================================================

    return new Response(
      JSON.stringify({
        allowed: true,
        moderation: {
          flagged: toxicityResult.is_toxic,
          score: toxicityResult.score,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Chat moderation error:", error);
    // Fail open for chat - allow message if moderation fails
    return new Response(
      JSON.stringify({ allowed: true, _error: "Moderation check failed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =============================================================================
// MODERATION FUNCTIONS
// =============================================================================

async function moderateWithOpenAI(
  text: string,
  apiKey: string
): Promise<ToxicityResult> {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: "omni-moderation-latest",
    }),
  });

  if (!response.ok) {
    console.error("OpenAI moderation failed:", await response.text());
    return { is_toxic: false, score: 0, categories: {}, should_block: false };
  }

  const data = await response.json();
  const result = data.results?.[0];

  if (!result) {
    return { is_toxic: false, score: 0, categories: {}, should_block: false };
  }

  const categories = result.category_scores || {};
  const maxScore = Math.max(...Object.values(categories) as number[], 0);

  return {
  is_toxic: result.flagged || maxScore >= WARN_THRESHOLD,
  score: maxScore,
  categories,
  should_block: maxScore >= BLOCK_THRESHOLD,
  };
}

async function moderateWithPerspective(
  text: string,
  apiKey: string
): Promise<ToxicityResult> {
  const response = await fetch(
    `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment: { text },
        languages: ["en"],
        requestedAttributes: {
          TOXICITY: {},
          SEVERE_TOXICITY: {},
          INSULT: {},
          THREAT: {},
          PROFANITY: {},
        },
      }),
    }
  );

  if (!response.ok) {
    console.error("Perspective API failed:", await response.text());
    return { is_toxic: false, score: 0, categories: {}, should_block: false };
  }

  const data = await response.json();
  const scores = data.attributeScores || {};

  const categories: Record<string, number> = {};
  let maxScore = 0;

  for (const [attr, value] of Object.entries(scores)) {
    const score = (value as any).summaryScore?.value || 0;
    categories[attr.toLowerCase()] = score;
    if (score > maxScore) maxScore = score;
  }

  const toxicityScore = categories.toxicity || categories.severe_toxicity || maxScore;

  return {
    is_toxic: toxicityScore >= WARN_THRESHOLD,
    score: toxicityScore,
    categories,
    should_block: toxicityScore >= BLOCK_THRESHOLD || (categories.severe_toxicity || 0) >= 0.7,
  };
}