// supabase/functions/check-moderation-status/index.ts
//
// Called on app launch to check if user can access the app
// Returns moderation status and any ban/suspension info
// Security: Uses user's JWT, returns only their own status

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // =========================================================================
    // INITIALIZE
    // =========================================================================

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth client to verify user
    const authHeader = req.headers.get("Authorization")!;
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client for moderation queries
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // =========================================================================
    // VERIFY USER
    // =========================================================================

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // GET MODERATION STATUS
    // =========================================================================

    const { data: status, error: statusError } = await supabaseAdmin.rpc(
      "get_moderation_status",
      { checking_user_id: user.id }
    );

    if (statusError) {
      console.error("Failed to get moderation status:", statusError);
      // Default to allowing access if check fails (fail open for user experience)
      return new Response(
        JSON.stringify({
          can_use_app: true,
          status: "good_standing",
          _error: "Status check failed, defaulting to allowed",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // BUILD RESPONSE
    // =========================================================================

    const response: Record<string, any> = {
      can_use_app: status.can_use_app,
      status: status.status,
    };

    // Include additional info based on status
    if (status.status === "warned") {
      response.warning_count = status.warning_count;
      response.message = "Your account has received a warning. Please review our community guidelines.";
    } else if (status.status === "suspended") {
      response.suspension_ends_at = status.suspension_ends_at;
      response.message = "Your account has been temporarily suspended.";
      
      // Calculate time remaining
      if (status.suspension_ends_at) {
        const endsAt = new Date(status.suspension_ends_at);
        const now = new Date();
        const hoursRemaining = Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60));
        response.hours_remaining = Math.max(0, hoursRemaining);
      }
    } else if (status.status === "banned") {
      response.ban_reason = status.ban_reason || "Violation of community guidelines";
      response.message = "Your account has been permanently banned.";
      response.appeal_info = "If you believe this was a mistake, please contact support@movetogether.app";
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Check moderation status error:", error);
    // Fail open - allow access if something goes wrong
    return new Response(
      JSON.stringify({ 
        can_use_app: true, 
        status: "good_standing",
        _error: "Unexpected error, defaulting to allowed" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
