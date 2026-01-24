// supabase/functions/process-single-report/index.ts
//
// AI-powered report processing
// Analyzes reports and either auto-actions (high confidence) or queues for review
// Security: Only callable with service_role key

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Thresholds for auto-action
const AUTO_ACTION_CONFIDENCE = 0.95; // 95% confidence for automatic action
const AUTO_WARNING_THRESHOLD = 3; // Auto-warn after 3 reports
const AUTO_SUSPEND_THRESHOLD = 5; // Auto-suspend after 5 reports  
const AUTO_BAN_THRESHOLD = 10; // Auto-ban after 10 reports (only with high AI confidence)

interface ReportData {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  category: string;
  description: string | null;
  evidence_urls: string[];
  created_at: string;
}

interface UserModerationData {
  user_id: string;
  status: string;
  warning_count: number;
  suspension_count: number;
  total_reports_received: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // =========================================================================
    // VERIFY SERVICE ROLE ACCESS
    // =========================================================================
    
    const authHeader = req.headers.get("Authorization");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Only allow service role calls
    if (!authHeader?.includes(supabaseServiceKey)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - service role required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // =========================================================================
    // GET REPORT DATA
    // =========================================================================

    const { report_id } = await req.json();
    
    if (!report_id) {
      return new Response(
        JSON.stringify({ error: "Missing report_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("*")
      .eq("id", report_id)
      .single();

    if (reportError || !report) {
      return new Response(
        JSON.stringify({ error: "Report not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip if already processed
    if (report.status !== "pending") {
      return new Response(
        JSON.stringify({ message: "Report already processed", status: report.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // GET USER MODERATION HISTORY
    // =========================================================================

    const { data: moderation } = await supabase
      .from("user_moderation")
      .select("*")
      .eq("user_id", report.reported_user_id)
      .single();

    // Get recent reports against this user
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentReports } = await supabase
      .from("reports")
      .select("id, category, description, ai_recommendation")
      .eq("reported_user_id", report.reported_user_id)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });

    // Get reporter's history (to detect serial false reporters)
    const { data: reporterHistory } = await supabase
      .from("reports")
      .select("id, status")
      .eq("reporter_id", report.reporter_id)
      .eq("status", "dismissed")
      .limit(10);

    const reporterDismissedCount = reporterHistory?.length || 0;

    // =========================================================================
    // AI ANALYSIS
    // =========================================================================

    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    
    let aiAnalysis = {
      recommendation: "manual_review" as "dismiss" | "warning" | "suspend" | "ban" | "manual_review",
      confidence: 0.5,
      reasoning: "AI analysis not available",
    };

    if (anthropicApiKey) {
      try {
        aiAnalysis = await analyzeReportWithAI({
          report: report as ReportData,
          userModeration: moderation as UserModerationData | null,
          recentReports: recentReports || [],
          reporterDismissedCount,
          anthropicApiKey,
        });
      } catch (aiError) {
        console.error("AI analysis failed:", aiError);
        // Continue with manual review if AI fails
      }
    }

    // =========================================================================
    // UPDATE REPORT WITH AI ANALYSIS
    // =========================================================================

    await supabase
      .from("reports")
      .update({
        ai_recommendation: aiAnalysis.recommendation,
        ai_confidence: aiAnalysis.confidence,
        ai_reasoning: aiAnalysis.reasoning,
        status: "under_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", report_id);

    // =========================================================================
    // AUTO-ACTION IF HIGH CONFIDENCE
    // =========================================================================

    let actionTaken = null;

    if (aiAnalysis.confidence >= AUTO_ACTION_CONFIDENCE && aiAnalysis.recommendation !== "manual_review") {
      const totalReports = (moderation?.total_reports_received || 0);
      const currentStatus = moderation?.status || "good_standing";

      // Determine appropriate action based on recommendation and history
      let shouldAction = false;
      let actionType = aiAnalysis.recommendation;

      if (aiAnalysis.recommendation === "dismiss") {
        // Auto-dismiss only if reporter has history of false reports
        shouldAction = reporterDismissedCount >= 3;
      } else if (aiAnalysis.recommendation === "warning") {
        shouldAction = currentStatus === "good_standing";
      } else if (aiAnalysis.recommendation === "suspend") {
        // Only auto-suspend if user has prior warnings
        shouldAction = (moderation?.warning_count || 0) >= 1;
      } else if (aiAnalysis.recommendation === "ban") {
        // Only auto-ban for severe cases with extensive history
        shouldAction = totalReports >= AUTO_BAN_THRESHOLD && (moderation?.suspension_count || 0) >= 1;
      }

      if (shouldAction && actionType !== "dismiss") {
        // Apply the moderation action
        const { data: actionResult } = await supabase.rpc("apply_moderation_action", {
          p_target_user_id: report.reported_user_id,
          p_action_type: actionType,
          p_reason: `Auto-action: ${report.category} - ${aiAnalysis.reasoning}`,
          p_triggered_by: "ai_auto",
          p_duration_hours: actionType === "suspend" ? 168 : null, // 7 days for suspension
          p_related_report_ids: [report_id],
        });

        actionTaken = actionType;

        // Update report status
        await supabase
          .from("reports")
          .update({
            status: "actioned",
            action_taken: actionType,
            updated_at: new Date().toISOString(),
          })
          .eq("id", report_id);
      } else if (actionType === "dismiss" && shouldAction) {
        // Dismiss the report
        await supabase
          .from("reports")
          .update({
            status: "dismissed",
            review_notes: "Auto-dismissed: Reporter has history of false reports",
            updated_at: new Date().toISOString(),
          })
          .eq("id", report_id);

        actionTaken = "dismissed";
      }
    }

    // =========================================================================
    // RETURN RESULT
    // =========================================================================

    return new Response(
      JSON.stringify({
        success: true,
        report_id,
        ai_analysis: {
          recommendation: aiAnalysis.recommendation,
          confidence: aiAnalysis.confidence,
        },
        action_taken: actionTaken,
        requires_manual_review: actionTaken === null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Process report error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =============================================================================
// AI ANALYSIS FUNCTION
// =============================================================================

interface AnalyzeParams {
  report: ReportData;
  userModeration: UserModerationData | null;
  recentReports: Array<{ id: string; category: string; description: string | null; ai_recommendation: string | null }>;
  reporterDismissedCount: number;
  anthropicApiKey: string;
}

async function analyzeReportWithAI(params: AnalyzeParams): Promise<{
  recommendation: "dismiss" | "warning" | "suspend" | "ban" | "manual_review";
  confidence: number;
  reasoning: string;
}> {
  const { report, userModeration, recentReports, reporterDismissedCount, anthropicApiKey } = params;

  const systemPrompt = `You are a content moderation AI for MoveTogether, a fitness competition app. Your job is to analyze user reports and recommend appropriate actions.

GUIDELINES:
1. Be fair but prioritize community safety
2. Consider the user's history and pattern of behavior
3. Give appropriate weight to the severity of the alleged violation
4. Be skeptical of reporters with many dismissed reports
5. Escalate serious matters (threats, illegal content) for manual review

REPORT CATEGORIES:
- inappropriate_content: Offensive photos, bio, or profile content
- harassment: Bullying, threats, unwanted contact
- spam: Promotional content, scams, repetitive messages
- fake_profile: Impersonation, catfishing, bots

RECOMMENDATIONS (choose one):
- dismiss: Report appears unfounded or reporter is unreliable
- warning: First-time minor violation, educational correction needed
- suspend: Repeated violations or moderate severity
- ban: Severe violation or extensive history of abuse
- manual_review: Complex case requiring human judgment

OUTPUT FORMAT (JSON only):
{
  "recommendation": "warning|suspend|ban|dismiss|manual_review",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation (max 200 chars)"
}`;

  const userPrompt = `Analyze this report:

REPORT DETAILS:
- Category: ${report.category}
- Description: ${report.description || "No description provided"}
- Evidence URLs: ${report.evidence_urls?.length || 0} provided

REPORTED USER HISTORY:
- Current status: ${userModeration?.status || "good_standing"}
- Prior warnings: ${userModeration?.warning_count || 0}
- Prior suspensions: ${userModeration?.suspension_count || 0}
- Total reports received (30 days): ${recentReports.length}
- Recent report categories: ${[...new Set(recentReports.map(r => r.category))].join(", ") || "none"}

REPORTER CREDIBILITY:
- Previously dismissed reports: ${reporterDismissedCount}

Provide your analysis as JSON only.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [
        { role: "user", content: userPrompt }
      ],
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || "";

  // Parse JSON from response
  try {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate and sanitize response
    const validRecommendations = ["dismiss", "warning", "suspend", "ban", "manual_review"];
    const recommendation = validRecommendations.includes(parsed.recommendation) 
      ? parsed.recommendation 
      : "manual_review";
    
    const confidence = typeof parsed.confidence === "number" 
      ? Math.min(1, Math.max(0, parsed.confidence)) 
      : 0.5;
    
    const reasoning = typeof parsed.reasoning === "string" 
      ? parsed.reasoning.slice(0, 500) 
      : "AI analysis completed";

    return { recommendation, confidence, reasoning };
  } catch (parseError) {
    console.error("Failed to parse AI response:", content);
    return {
      recommendation: "manual_review",
      confidence: 0.5,
      reasoning: "AI response parsing failed - requires manual review",
    };
  }
}
