// supabase/functions/create-buy-in-payment/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.5.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { competitionId, invitationId } = await req.json();

    // Validation
    if (!competitionId) {
      return new Response(
        JSON.stringify({ error: "Missing competitionId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify competition exists and is joinable
    const { data: competition, error: compError } = await supabase
      .from("competitions")
      .select("id, name, status, creator_id, start_date, is_public")
      .eq("id", competitionId)
      .single();

    if (compError || !competition) {
      return new Response(
        JSON.stringify({ error: "Competition not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      competition.status !== "pending" &&
      competition.status !== "active" &&
      competition.status !== "draft"
    ) {
      return new Response(
        JSON.stringify({ error: "Competition is not accepting new players" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get the buy-in prize pool
    const { data: prizePool, error: poolError } = await supabase
      .from("prize_pools")
      .select("id, buy_in_amount, pool_type, total_amount, participant_count")
      .eq("competition_id", competitionId)
      .eq("status", "active")
      .eq("pool_type", "buy_in")
      .single();

    if (poolError || !prizePool) {
      return new Response(
        JSON.stringify({ error: "No buy-in prize pool found for this competition" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const buyInAmount = parseFloat(prizePool.buy_in_amount);

    // Check if user is already a participant
    const { data: existingParticipant } = await supabase
      .from("competition_participants")
      .select("id, prize_eligible")
      .eq("competition_id", competitionId)
      .eq("user_id", user.id)
      .maybeSingle();

    // Block if already prize-eligible (already paid). Allow if opted-out (paying later).
    if (existingParticipant && existingParticipant.prize_eligible) {
      return new Response(
        JSON.stringify({ error: "You are already in this competition" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check user hasn't already made a pending payment
    const { data: existingPayment } = await supabase
      .from("buy_in_payments")
      .select("id, status")
      .eq("prize_pool_id", prizePool.id)
      .eq("user_id", user.id)
      .in("status", ["pending", "paid"])
      .single();

    if (existingPayment) {
      return new Response(
        JSON.stringify({ error: "You already have a pending or completed payment" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check blocked users
    const { data: blocked } = await supabase
      .from("blocked_users")
      .select("id")
      .or(
        `and(blocker_id.eq.${competition.creator_id},blocked_id.eq.${user.id}),and(blocker_id.eq.${user.id},blocked_id.eq.${competition.creator_id})`
      )
      .limit(1);

    if (blocked && blocked.length > 0) {
      return new Response(
        JSON.stringify({ error: "Unable to join this competition" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate total with Stripe fees (2.9% + $0.30)
    const stripeFee = Math.ceil(buyInAmount * 0.029 * 100 + 30) / 100;
    const totalCharge = buyInAmount + stripeFee;
    const amountInCents = Math.round(totalCharge * 100);

    // Create pending buy_in_payments record
    const { data: buyInPayment, error: buyInError } = await supabase
      .from("buy_in_payments")
      .insert({
        prize_pool_id: prizePool.id,
        competition_id: competitionId,
        user_id: user.id,
        amount: buyInAmount,
        stripe_payment_intent_id: "pending", // Will be updated below
        status: "pending",
      })
      .select()
      .single();

    if (buyInError) {
      console.error("Error creating buy-in payment record:", buyInError);
      throw buyInError;
    }

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        type: "buy_in_join",
        competition_id: competitionId,
        user_id: user.id,
        prize_pool_id: prizePool.id,
        buy_in_amount: buyInAmount.toString(),
        buy_in_payment_id: buyInPayment.id,
        invitation_id: invitationId || "",
      },
      description: `Buy-in for "${competition.name}"`,
      receipt_email: user.email,
    });

    // Update the buy_in_payments record with the actual payment intent ID
    await supabase
      .from("buy_in_payments")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", buyInPayment.id);

    console.log("Created buy-in PaymentIntent:", paymentIntent.id);

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: totalCharge,
        buyInAmount,
        stripeFee,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error creating buy-in payment intent:", error);

    const errorMessage = error?.message || "Failed to create payment";
    const errorCode = error?.code || error?.type || "unknown";

    return new Response(
      JSON.stringify({
        error: errorMessage,
        code: errorCode,
        details:
          Deno.env.get("ENVIRONMENT") !== "production"
            ? String(error)
            : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
