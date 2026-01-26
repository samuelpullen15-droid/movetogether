import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LeaveCompetitionRequest {
  competitionId: string;
  transactionId?: string; // RevenueCat transaction ID for starter tier payment
}

const LEAVE_COMPETITION_PRODUCT_ID = "movetogether_leave_competition";

/**
 * Verify a RevenueCat purchase using their REST API
 */
async function verifyRevenueCatPurchase(
  userId: string,
  transactionId: string
): Promise<{ valid: boolean; error?: string }> {
  const revenueCatApiKey = Deno.env.get("REVENUECAT_API_KEY");
  
  if (!revenueCatApiKey) {
    console.error("[Leave Competition] REVENUECAT_API_KEY not configured");
    return { valid: false, error: "Payment verification not configured" };
  }

  try {
    // Get customer info from RevenueCat
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${userId}`,
      {
        headers: {
          "Authorization": `Bearer ${revenueCatApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error("[Leave Competition] RevenueCat API error:", response.status);
      return { valid: false, error: "Failed to verify payment" };
    }

    const data = await response.json();
    
    // Check if the user has purchased the leave competition product
    // RevenueCat stores non-subscription purchases in "non_subscriptions"
    const nonSubscriptions = data.subscriber?.non_subscriptions || {};
    const leaveCompetitionPurchases = nonSubscriptions[LEAVE_COMPETITION_PRODUCT_ID] || [];
    
    // Look for a purchase with matching transaction ID
    const matchingPurchase = leaveCompetitionPurchases.find(
      (purchase: any) => purchase.id === transactionId || purchase.store_transaction_id === transactionId
    );

    if (matchingPurchase) {
      console.log("[Leave Competition] Valid purchase found:", matchingPurchase.id);
      return { valid: true };
    }

    // Also check if any recent purchase exists (within last 5 minutes)
    // This handles cases where transaction ID format might differ
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const recentPurchase = leaveCompetitionPurchases.find(
      (purchase: any) => purchase.purchase_date > fiveMinutesAgo
    );

    if (recentPurchase) {
      console.log("[Leave Competition] Recent purchase found:", recentPurchase.id);
      return { valid: true };
    }

    console.log("[Leave Competition] No valid purchase found for transaction:", transactionId);
    return { valid: false, error: "Payment not found or already used" };
    
  } catch (error) {
    console.error("[Leave Competition] Error verifying purchase:", error);
    return { valid: false, error: "Payment verification failed" };
  }
}

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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { competitionId, transactionId }: LeaveCompetitionRequest = await req.json();

    if (!competitionId) {
      return new Response(
        JSON.stringify({ error: "Competition ID required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Verify user is a participant
    const { data: participant, error: participantError } = await supabaseAdmin
      .from("competition_participants")
      .select("id, competition_id, user_id")
      .eq("competition_id", competitionId)
      .eq("user_id", user.id)
      .single();

    if (participantError || !participant) {
      return new Response(
        JSON.stringify({ error: "You are not a participant in this competition" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if user is the competition creator
    const { data: competition, error: competitionError } = await supabaseAdmin
      .from("competitions")
      .select("creator_id")
      .eq("id", competitionId)
      .single();

    if (competitionError || !competition) {
      return new Response(
        JSON.stringify({ error: "Competition not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (competition.creator_id === user.id) {
      return new Response(
        JSON.stringify({ error: "Competition creators cannot leave. Please delete the competition instead." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Check subscription tier from database (server-side verification)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subscriptionTier = profile.subscription_tier || "starter";

    // 4. Handle based on subscription tier
    if (subscriptionTier === "starter") {
      // Starter tier: Require payment
      if (!transactionId) {
        // Return payment required response (using 200 for reliable client handling)
        return new Response(
          JSON.stringify({
            success: false,
            error: "Free users must pay $2.99 to leave a competition. Upgrade to Mover or Crusher for free withdrawals.",
            requiresPayment: true,
            amount: 2.99,
            currency: "USD",
            productId: LEAVE_COMPETITION_PRODUCT_ID
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify payment with RevenueCat
      console.log(`[Leave Competition] Verifying payment for user ${user.id}, transaction: ${transactionId}`);

      const verification = await verifyRevenueCatPurchase(user.id, transactionId);

      if (!verification.valid) {
        return new Response(
          JSON.stringify({
            success: false,
            error: verification.error || "Payment verification failed",
            requiresPayment: true,
            amount: 2.99,
            currency: "USD",
            productId: LEAVE_COMPETITION_PRODUCT_ID
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[Leave Competition] Payment verified for user ${user.id}`);
    }

    // 5. Remove user from competition (paid tier or payment confirmed)
    const { error: deleteError } = await supabaseAdmin
      .from("competition_participants")
      .delete()
      .eq("id", participant.id);

    if (deleteError) {
      console.error("[Leave Competition] Error removing participant:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to leave competition" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Leave Competition] User ${user.id} left competition ${competitionId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Leave Competition] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
