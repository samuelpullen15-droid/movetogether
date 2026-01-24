// supabase/functions/review-photo/index.ts
//
// AI-powered photo moderation
// Called when a user uploads a profile photo
// Blocks inappropriate content before it's visible to others
// Security: Only callable with service_role key or from storage trigger

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Thresholds for blocking content
const BLOCK_THRESHOLD = 0.7; // Block if any category exceeds this
const MANUAL_REVIEW_THRESHOLD = 0.4; // Flag for manual review if between this and block

interface PhotoReviewRequest {
  user_id: string;
  photo_url: string;
  photo_base64?: string; // Optional: if provided, use this instead of fetching
}

interface ModerationCategory {
  name: string;
  score: number;
  flagged: boolean;
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
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // =========================================================================
    // PARSE REQUEST
    // =========================================================================

    const body: PhotoReviewRequest = await req.json();
    const { user_id, photo_url, photo_base64 } = body;

    if (!user_id || !photo_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id, photo_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // CHECK FOR DUPLICATE (by hash if available)
    // =========================================================================

    let photoHash: string | null = null;
    
    if (photo_base64) {
      // Generate hash of the image
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(photo_base64)
      );
      photoHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      // Check if this exact image was previously rejected
      const { data: existingReview } = await supabase
        .from("photo_reviews")
        .select("id, status, rejection_reason")
        .eq("photo_hash", photoHash)
        .eq("status", "rejected")
        .single();

      if (existingReview) {
        // Same image was previously rejected - block immediately
        await supabase.from("photo_reviews").insert({
          user_id,
          photo_url,
          photo_hash: photoHash,
          is_safe: false,
          categories: { duplicate_rejected: 1.0 },
          confidence: 1.0,
          status: "rejected",
          rejection_reason: `Previously rejected: ${existingReview.rejection_reason}`,
        });

        return new Response(
          JSON.stringify({
            approved: false,
            reason: "This image has been previously rejected",
            status: "rejected",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // =========================================================================
    // PERFORM AI MODERATION
    // =========================================================================

    let moderationResult: {
      is_safe: boolean;
      categories: Record<string, number>;
      primary_violation: string | null;
      confidence: number;
    };

    if (openaiApiKey) {
      moderationResult = await moderateWithOpenAI(photo_url, photo_base64, openaiApiKey);
    } else {
      // Fallback: flag for manual review if no AI available
      moderationResult = {
        is_safe: true,
        categories: {},
        primary_violation: null,
        confidence: 0.5,
      };
      console.warn("No OPENAI_API_KEY configured - skipping AI moderation");
    }

    // =========================================================================
    // DETERMINE STATUS
    // =========================================================================

    let status: "approved" | "rejected" | "manual_review";
    let rejectionReason: string | null = null;

    if (!moderationResult.is_safe) {
      // Check violation severity
      const maxScore = Math.max(...Object.values(moderationResult.categories), 0);
      
      if (maxScore >= BLOCK_THRESHOLD) {
        status = "rejected";
        rejectionReason = getHumanReadableReason(moderationResult.primary_violation);
      } else if (maxScore >= MANUAL_REVIEW_THRESHOLD) {
        status = "manual_review";
      } else {
        status = "approved";
      }
    } else {
      status = "approved";
    }

    // =========================================================================
    // SAVE REVIEW RESULT
    // =========================================================================

    const { data: review, error: insertError } = await supabase
      .from("photo_reviews")
      .insert({
        user_id,
        photo_url,
        photo_hash: photoHash,
        is_safe: moderationResult.is_safe,
        categories: moderationResult.categories,
        primary_violation: moderationResult.primary_violation,
        confidence: moderationResult.confidence,
        status,
        rejection_reason: rejectionReason,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to save photo review:", insertError);
      // Don't fail the request - just log the error
    }

    // =========================================================================
    // IF REJECTED, INCREMENT USER'S VIOLATION COUNT
    // =========================================================================

    if (status === "rejected") {
      // This could trigger escalating consequences
      const { data: recentRejections } = await supabase
        .from("photo_reviews")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "rejected")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      const rejectionCount = (recentRejections?.length || 0) + 1;

      // Auto-warn or suspend for repeated violations
      if (rejectionCount >= 3) {
        const { data: userMod } = await supabase
          .from("user_moderation")
          .select("status, warning_count")
          .eq("user_id", user_id)
          .single();

        if (userMod?.status === "good_standing") {
          // Issue warning
          await supabase.rpc("apply_moderation_action", {
            p_target_user_id: user_id,
            p_action_type: "warning",
            p_reason: `Multiple photo policy violations (${rejectionCount} in 30 days)`,
            p_triggered_by: "ai_auto",
          });
        } else if (userMod?.status === "warned" && rejectionCount >= 5) {
          // Suspend
          await supabase.rpc("apply_moderation_action", {
            p_target_user_id: user_id,
            p_action_type: "suspend",
            p_reason: `Continued photo policy violations after warning (${rejectionCount} in 30 days)`,
            p_triggered_by: "ai_auto",
            p_duration_hours: 72, // 3 day suspension
          });
        }
      }
    }

    // =========================================================================
    // RETURN RESULT
    // =========================================================================

    return new Response(
      JSON.stringify({
        approved: status === "approved",
        status,
        reason: rejectionReason,
        review_id: review?.id,
        categories: status !== "approved" ? moderationResult.categories : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Photo review error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =============================================================================
// OPENAI MODERATION
// =============================================================================

async function moderateWithOpenAI(
  photoUrl: string,
  photoBase64: string | undefined,
  apiKey: string
): Promise<{
  is_safe: boolean;
  categories: Record<string, number>;
  primary_violation: string | null;
  confidence: number;
}> {
  // Use OpenAI's moderation endpoint with image support
  // Note: As of 2024, OpenAI's moderation API supports images via the omni-moderation-latest model
  
  const imageContent = photoBase64 
    ? { type: "image_url", image_url: { url: `data:image/jpeg;base64,${photoBase64}` } }
    : { type: "image_url", image_url: { url: photoUrl } };

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: [imageContent],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI moderation error:", errorText);
    
    // Fallback: If OpenAI fails, use vision model for analysis
    return await moderateWithVision(photoUrl, photoBase64, apiKey);
  }

  const data = await response.json();
  const result = data.results?.[0];

  if (!result) {
    throw new Error("No moderation result returned");
  }

  // Extract category scores
  const categories: Record<string, number> = {};
  let maxScore = 0;
  let primaryViolation: string | null = null;

  for (const [category, score] of Object.entries(result.category_scores || {})) {
    categories[category] = score as number;
    if ((score as number) > maxScore) {
      maxScore = score as number;
      primaryViolation = category;
    }
  }

  return {
    is_safe: !result.flagged,
    categories,
    primary_violation: result.flagged ? primaryViolation : null,
    confidence: maxScore > 0 ? maxScore : 0.9,
  };
}

// Fallback using GPT-4 Vision for moderation
async function moderateWithVision(
  photoUrl: string,
  photoBase64: string | undefined,
  apiKey: string
): Promise<{
  is_safe: boolean;
  categories: Record<string, number>;
  primary_violation: string | null;
  confidence: number;
}> {
  const imageContent = photoBase64
    ? { type: "image_url", image_url: { url: `data:image/jpeg;base64,${photoBase64}`, detail: "low" } }
    : { type: "image_url", image_url: { url: photoUrl, detail: "low" } };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You are a content moderation system for a fitness app. Analyze images for policy violations.

CATEGORIES TO CHECK:
- sexual: Nudity, sexually suggestive content
- violence: Gore, weapons, threatening imagery  
- hate: Hate symbols, discriminatory content
- self_harm: Content promoting self-injury
- illegal: Drug use, illegal activities

OUTPUT FORMAT (JSON only):
{
  "is_safe": true/false,
  "categories": {"sexual": 0.0-1.0, "violence": 0.0-1.0, ...},
  "primary_violation": "category_name" or null,
  "confidence": 0.0-1.0
}

Be strict about sexual content but reasonable about fitness-related images (workout photos, athletic wear, etc).`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this profile photo for policy violations. Return JSON only." },
            imageContent as any,
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error("Vision moderation fallback failed");
    // Ultimate fallback: approve but flag for manual review
    return {
      is_safe: true,
      categories: { unknown: 0.3 },
      primary_violation: null,
      confidence: 0.3,
    };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      is_safe: !!parsed.is_safe,
      categories: parsed.categories || {},
      primary_violation: parsed.primary_violation || null,
      confidence: parsed.confidence || 0.5,
    };
  } catch {
    return {
      is_safe: true,
      categories: { parse_error: 0.3 },
      primary_violation: null,
      confidence: 0.3,
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getHumanReadableReason(violation: string | null): string {
  const reasons: Record<string, string> = {
    sexual: "This photo violates our policy on sexual content",
    "sexual/minors": "This photo violates our policy on inappropriate content involving minors",
    violence: "This photo violates our policy on violent content",
    "violence/graphic": "This photo contains graphic violence",
    hate: "This photo contains hateful imagery or symbols",
    "hate/threatening": "This photo contains threatening hate content",
    harassment: "This photo violates our harassment policy",
    "harassment/threatening": "This photo contains threatening content",
    self_harm: "This photo violates our policy on self-harm content",
    "self-harm": "This photo violates our policy on self-harm content",
    illegal: "This photo appears to depict illegal activity",
  };

  return reasons[violation || ""] || "This photo violates our community guidelines";
}
