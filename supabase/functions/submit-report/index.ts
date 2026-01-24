// supabase/functions/submit-report/index.ts
// 
// User-facing endpoint to submit a report against another user
// Security: Rate limited, validated, anonymous (reported user never sees reporter)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReportCategory =
  | "inappropriate_content"
  | "harassment"
  | "spam"
  | "fake_profile"
  | "bullying"
  | "hate_speech"
  | "violence"
  | "impersonation"
  | "explicit_content"
  | "misinformation"
  | "other";

type ContentType = "profile" | "photo" | "post" | "competition" | "message";

interface ReportRequest {
  reported_user_id: string;
  category: ReportCategory;
  description?: string;
  evidence_urls?: string[];
  content_type?: ContentType;
  content_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client for auth (uses user's JWT)
    const authHeader = req.headers.get("Authorization")!;
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: ReportRequest = await req.json();
    const { reported_user_id, category, description, evidence_urls, content_type, content_id } = body;

    // =========================================================================
    // VALIDATION
    // =========================================================================

    // Validate required fields
    if (!reported_user_id || !category) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: reported_user_id, category" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate category enum
    const validCategories = [
      "inappropriate_content",
      "harassment",
      "spam",
      "fake_profile",
      "bullying",
      "hate_speech",
      "violence",
      "impersonation",
      "explicit_content",
      "misinformation",
      "other",
    ];
    if (!validCategories.includes(category)) {
      return new Response(
        JSON.stringify({ error: "Invalid category" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate content_type if provided
    const validContentTypes = ["profile", "photo", "post", "competition", "message"];
    if (content_type && !validContentTypes.includes(content_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid content type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reported_user_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid user ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent self-reports
    if (user.id === reported_user_id) {
      return new Response(
        JSON.stringify({ error: "You cannot report yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate description length
    if (description && description.length > 2000) {
      return new Response(
        JSON.stringify({ error: "Description too long (max 2000 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate evidence URLs
    if (evidence_urls) {
      if (!Array.isArray(evidence_urls) || evidence_urls.length > 5) {
        return new Response(
          JSON.stringify({ error: "Maximum 5 evidence URLs allowed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Validate URL format
      for (const url of evidence_urls) {
        try {
          new URL(url);
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid evidence URL format" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // =========================================================================
    // CHECK RATE LIMIT
    // =========================================================================

    const { data: rateLimitResult, error: rateLimitError } = await supabaseAdmin.rpc(
      "check_report_rate_limit",
      { checking_user_id: user.id }
    );

    if (rateLimitError) {
      console.error("Rate limit check error:", rateLimitError);
      return new Response(
        JSON.stringify({ error: "Failed to check rate limit" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: rateLimitResult.reason,
          rate_limited: true 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // VERIFY REPORTED USER EXISTS
    // =========================================================================

    const { data: reportedUser, error: userCheckError } = await supabaseAdmin
      .from("profiles") // Assuming you have a profiles table
      .select("id")
      .eq("id", reported_user_id)
      .single();

    if (userCheckError || !reportedUser) {
      return new Response(
        JSON.stringify({ error: "Reported user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // CHECK FOR DUPLICATE RECENT REPORT
    // =========================================================================

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let duplicateQuery = supabaseAdmin
      .from("reports")
      .select("id")
      .eq("reporter_id", user.id)
      .eq("reported_user_id", reported_user_id)
      .eq("category", category)
      .gte("created_at", oneDayAgo);

    // Add content-specific filters if provided
    if (content_type) {
      duplicateQuery = duplicateQuery.eq("content_type", content_type);
    }
    if (content_id) {
      duplicateQuery = duplicateQuery.eq("content_id", content_id);
    }

    const { data: existingReport } = await duplicateQuery.single();

    if (existingReport) {
      return new Response(
        JSON.stringify({
          error: content_type
            ? "You have already reported this content recently"
            : "You have already reported this user for this reason recently",
          duplicate: true
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // CREATE THE REPORT
    // =========================================================================

    const { data: report, error: insertError } = await supabaseAdmin
      .from("reports")
      .insert({
        reporter_id: user.id,
        reported_user_id,
        category,
        description: description?.trim() || null,
        evidence_urls: evidence_urls || [],
        content_type: content_type || null,
        content_id: content_id || null,
        status: "pending",
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("Failed to create report:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to submit report" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // UPDATE RATE LIMIT COUNTER
    // =========================================================================

    await supabaseAdmin.rpc("increment_report_count", { 
      reporting_user_id: user.id 
    });

    // =========================================================================
    // INCREMENT REPORTS RECEIVED FOR TARGET USER
    // =========================================================================

    await supabaseAdmin
      .from("user_moderation")
      .update({ 
        total_reports_received: supabaseAdmin.rpc("increment", { x: 1 }),
        updated_at: new Date().toISOString()
      })
      .eq("user_id", reported_user_id);

    // Alternative if the above doesn't work:
    await supabaseAdmin.rpc("sql", {
      query: `
        UPDATE user_moderation 
        SET total_reports_received = total_reports_received + 1, 
            updated_at = NOW() 
        WHERE user_id = $1
      `,
      params: [reported_user_id]
    }).catch(() => {
      // Fallback: direct update
      supabaseAdmin
        .from("user_moderation")
        .upsert({
          user_id: reported_user_id,
          total_reports_received: 1,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });
    });

    // =========================================================================
    // TRIGGER AI PROCESSING (async - don't wait)
    // =========================================================================

    // Fire and forget - process the report with AI
    const processUrl = `${supabaseUrl}/functions/v1/process-single-report`;
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ report_id: report.id }),
    }).catch(err => console.error("Failed to trigger AI processing:", err));

    // =========================================================================
    // RETURN SUCCESS
    // =========================================================================

    return new Response(
      JSON.stringify({
        success: true,
        message: "Report submitted successfully. Thank you for helping keep our community safe.",
        report_id: report.id,
        reports_remaining: rateLimitResult.remaining - 1,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
