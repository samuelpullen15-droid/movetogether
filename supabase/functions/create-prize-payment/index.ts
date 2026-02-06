// supabase/functions/create-prize-payment/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.5.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      competitionId,
      prizeAmount,
      payoutStructure = { first: 100 },
      poolType = 'creator_funded',
      buyInAmount,
    } = await req.json();

    // Validation
    if (!competitionId || !prizeAmount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (poolType === 'buy_in') {
      const effectiveBuyIn = buyInAmount || prizeAmount;
      if (effectiveBuyIn < 1 || effectiveBuyIn > 100) {
        return new Response(
          JSON.stringify({ error: "Buy-in must be between $1 and $100" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (prizeAmount < 5 || prizeAmount > 500) {
      return new Response(
        JSON.stringify({ error: "Prize must be between $5 and $500" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user owns the competition
    const { data: competition, error: compError } = await supabase
      .from("competitions")
      .select("id, creator_id, status, name")
      .eq("id", competitionId)
      .single();

    if (compError || !competition) {
      return new Response(
        JSON.stringify({ error: "Competition not found" }), 
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (competition.creator_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Only competition creator can add prizes" }), 
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if competition already has a prize pool
    const { data: existingPool } = await supabase
      .from("prize_pools")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("status", "active")
      .single();

    if (existingPool) {
      return new Response(
        JSON.stringify({ error: "Competition already has an active prize pool" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate total with Stripe fees
    // Stripe fee: 2.9% + $0.30
    // For buy-in, charge is just the buy-in amount
    const effectiveCharge = poolType === 'buy_in' ? (buyInAmount || prizeAmount) : prizeAmount;
    const stripeFee = Math.ceil(effectiveCharge * 0.029 * 100 + 30) / 100;
    const totalCharge = effectiveCharge + stripeFee;
    const amountInCents = Math.round(totalCharge * 100);

    // For buy-in mode, the charge amount is the buy-in amount (not the full pool)
    const chargeAmount = poolType === 'buy_in' ? (buyInAmount || prizeAmount) : prizeAmount;

    // Create pending prize pool record
    const { data: pendingPool, error: pendingError } = await supabase
      .from("pending_prize_pools")
      .insert({
        user_id: user.id,
        competition_id: competitionId,
        prize_amount: chargeAmount,
        payout_structure: payoutStructure,
        status: "awaiting_payment",
        pool_type: poolType,
        buy_in_amount: poolType === 'buy_in' ? chargeAmount : null,
      })
      .select()
      .single();

    if (pendingError) {
      console.error("Error creating pending pool:", pendingError);
      throw pendingError;
    }

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        pending_pool_id: pendingPool.id,
        competition_id: competitionId,
        user_id: user.id,
        prize_amount: effectiveCharge.toString(),
        type: "prize_pool",
        pool_type: poolType,
        buy_in_amount: poolType === 'buy_in' ? (buyInAmount || prizeAmount).toString() : '',
      },
      description: poolType === 'buy_in'
        ? `Buy-in for "${competition.name}"`
        : `Prize pool for "${competition.name}"`,
      receipt_email: user.email,
    });

    // Update pending record with payment intent ID
    await supabase
      .from("pending_prize_pools")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", pendingPool.id);

    console.log("Created PaymentIntent:", paymentIntent.id);

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: totalCharge,
        prizeAmount: effectiveCharge,
        stripeFee: stripeFee,
        poolType,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error creating payment intent:", error);

    // Return more specific error message for debugging
    const errorMessage = error?.message || "Failed to create payment";
    const errorCode = error?.code || error?.type || "unknown";

    return new Response(
      JSON.stringify({
        error: errorMessage,
        code: errorCode,
        // Only include details in development
        details: Deno.env.get("ENVIRONMENT") !== "production" ? String(error) : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
