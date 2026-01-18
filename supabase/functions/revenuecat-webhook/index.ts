import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * RevenueCat Webhook Handler
 * 
 * This Edge Function receives webhooks from RevenueCat when subscription events occur
 * (purchase, renewal, cancellation, etc.) and updates the subscription_tier in Supabase.
 * 
 * Configure this URL in RevenueCat Dashboard:
 * https://<your-project>.supabase.co/functions/v1/revenuecat-webhook
 * 
 * Set REVENUECAT_WEBHOOK_SECRET in Supabase Edge Function secrets for verification.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify webhook secret (optional but recommended)
    const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
    if (webhookSecret) {
      const signature = req.headers.get("authorization");
      if (signature !== `Bearer ${webhookSecret}`) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const event = await req.json();

    // RevenueCat webhook event structure
    // See: https://docs.revenuecat.com/docs/webhooks
    const { event: eventType, app_user_id: userId, product_id, entitlement_ids } = event;

    if (!userId) {
      console.error("No user_id in webhook event");
      return new Response(
        JSON.stringify({ error: "Missing user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine subscription tier based on active entitlements
    let subscriptionTier: "starter" | "mover" | "crusher" = "starter";

    if (entitlement_ids && Array.isArray(entitlement_ids)) {
      if (entitlement_ids.includes("crusher")) {
        subscriptionTier = "crusher";
      } else if (entitlement_ids.includes("mover")) {
        subscriptionTier = "mover";
      }
    }

    // Update subscription tier in profiles table
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ subscription_tier: subscriptionTier })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating subscription tier:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update subscription tier" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Updated subscription tier for user ${userId}: ${subscriptionTier} (event: ${eventType})`);

    return new Response(
      JSON.stringify({ success: true, tier: subscriptionTier }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing RevenueCat webhook:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
