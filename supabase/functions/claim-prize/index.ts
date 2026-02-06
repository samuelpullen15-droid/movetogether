// supabase/functions/claim-prize/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TREMENDOUS_API_KEY = Deno.env.get("TREMENDOUS_API_KEY")!;
const TREMENDOUS_BASE_URL = Deno.env.get("TREMENDOUS_BASE_URL") || "https://testflight.tremendous.com/api/v2";
const TREMENDOUS_FUNDING_SOURCE_ID = Deno.env.get("TREMENDOUS_FUNDING_SOURCE_ID")!;
const TREMENDOUS_CAMPAIGN_ID = Deno.env.get("TREMENDOUS_CAMPAIGN_ID")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create a client with the user's token to verify identity
    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Get the authenticated user
    const { data: { user }, error: userError } = await userSupabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { payoutId } = await req.json();

    if (!payoutId) {
      return new Response(
        JSON.stringify({ error: "Missing payoutId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`User ${user.id} claiming prize ${payoutId}`);

    // Get the payout and verify ownership
    const { data: payout, error: payoutError } = await supabase
      .from("prize_payouts")
      .select(`
        *,
        prize_pools (
          id,
          competition_id,
          status
        ),
        competitions (
          name
        )
      `)
      .eq("id", payoutId)
      .single();

    if (payoutError || !payout) {
      console.error("Payout not found:", payoutError);
      return new Response(
        JSON.stringify({ error: "Payout not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the payout belongs to this user
    if (payout.winner_id !== user.id) {
      console.error("Unauthorized claim attempt:", { payoutWinner: payout.winner_id, requestUser: user.id });
      return new Response(
        JSON.stringify({ error: "You are not the winner of this prize" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check claim status
    if (payout.claim_status === "claimed") {
      return new Response(
        JSON.stringify({ error: "Prize has already been claimed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (payout.claim_status === "expired") {
      return new Response(
        JSON.stringify({ error: "Claim period has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if claim has expired based on time
    if (payout.claim_expires_at && new Date(payout.claim_expires_at) < new Date()) {
      // Update status to expired
      await supabase
        .from("prize_payouts")
        .update({ claim_status: "expired" })
        .eq("id", payoutId);

      return new Response(
        JSON.stringify({ error: "Claim period has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update payout to claimed status (before calling Tremendous)
    const { error: updateError } = await supabase
      .from("prize_payouts")
      .update({
        claim_status: "claimed",
        claimed_at: new Date().toISOString(),
        status: "processing"
      })
      .eq("id", payoutId);

    if (updateError) {
      console.error("Error updating payout:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to process claim" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      // Call Tremendous API to create the reward using campaign
      // The campaign is configured in Tremendous with the available reward options
      const tremendousResponse = await fetch(`${TREMENDOUS_BASE_URL}/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${TREMENDOUS_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          external_id: `movetogether-claim-${payoutId}-${Date.now()}`,
          payment: {
            funding_source_id: TREMENDOUS_FUNDING_SOURCE_ID
          },
          rewards: [{
            campaign_id: TREMENDOUS_CAMPAIGN_ID,
            recipient: {
              email: payout.recipient_email,
              name: payout.recipient_name || "MoveTogether Winner"
            },
            deliver_at: new Date().toISOString(),
            delivery: {
              method: "EMAIL"
            },
            value: {
              denomination: payout.payout_amount,
              currency_code: "USD"
            }
          }]
        })
      });

      const orderData = await tremendousResponse.json();

      if (!tremendousResponse.ok) {
        console.error("Tremendous API error:", orderData);
        throw new Error(orderData.errors?.[0]?.message || "Failed to process reward");
      }

      console.log("Tremendous order created:", orderData.order?.id);

      // Update payout with Tremendous order details
      await supabase
        .from("prize_payouts")
        .update({
          tremendous_order_id: orderData.order?.id,
          tremendous_reward_id: orderData.order?.rewards?.[0]?.id,
          status: "executed",
          executed_at: new Date().toISOString()
        })
        .eq("id", payoutId);

      // Log audit entry
      await supabase.from("prize_audit_log").insert({
        prize_pool_id: payout.prize_pool_id,
        payout_id: payoutId,
        action: "claimed_and_sent",
        actor_id: user.id,
        details: {
          amount: payout.payout_amount,
          tremendous_order_id: orderData.order?.id,
          recipient_email: payout.recipient_email
        }
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Prize claimed successfully! Check your email for your reward.",
          orderId: orderData.order?.id
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (apiError: any) {
      console.error("Error calling Tremendous:", apiError);

      // Revert claim status on failure
      await supabase
        .from("prize_payouts")
        .update({
          claim_status: "unclaimed",
          claimed_at: null,
          status: "pending",
          error_message: apiError.message,
          retry_count: (payout.retry_count || 0) + 1
        })
        .eq("id", payoutId);

      // Log the failure
      await supabase.from("prize_audit_log").insert({
        prize_pool_id: payout.prize_pool_id,
        payout_id: payoutId,
        action: "claim_failed",
        actor_id: user.id,
        details: {
          error: apiError.message
        }
      });

      return new Response(
        JSON.stringify({ error: "Failed to process reward. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    console.error("Error in claim-prize:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
