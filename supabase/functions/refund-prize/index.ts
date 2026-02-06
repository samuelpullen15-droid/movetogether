// supabase/functions/refund-prize/index.ts
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

    const { competitionId } = await req.json();

    if (!competitionId) {
      return new Response(
        JSON.stringify({ error: "Missing competitionId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get competition details
    const { data: competition, error: compError } = await supabase
      .from("competitions")
      .select("id, creator_id, start_date, status, name")
      .eq("id", competitionId)
      .single();

    if (compError || !competition) {
      return new Response(
        JSON.stringify({ error: "Competition not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only creator can request refund
    if (competition.creator_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Only competition creator can request refund" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if competition has started
    const now = new Date();
    const startDate = new Date(competition.start_date);

    if (now >= startDate) {
      return new Response(
        JSON.stringify({
          error: "Cannot delete competition after it has started",
          message: "Competitions with prize pools cannot be deleted once they begin to protect participants."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for prize pool (either pending or active)
    const { data: prizePool } = await supabase
      .from("prize_pools")
      .select("id, stripe_payment_intent_id, total_amount, status, pool_type")
      .eq("competition_id", competitionId)
      .in("status", ["active", "funded"])
      .single();

    const { data: pendingPool } = await supabase
      .from("pending_prize_pools")
      .select("id, stripe_payment_intent_id, prize_amount, status")
      .eq("competition_id", competitionId)
      .eq("status", "awaiting_payment")
      .single();

    // If no prize pools, nothing to refund
    if (!prizePool && !pendingPool) {
      return new Response(
        JSON.stringify({
          success: true,
          refunded: false,
          message: "No prize pool to refund"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Refund the active prize pool if it exists
    if (prizePool) {
      const isBuyIn = prizePool.pool_type === "buy_in";

      if (isBuyIn) {
        // BUY-IN: Refund each participant's individual payment
        console.log("Refunding buy-in prize pool:", prizePool.id);

        const { data: buyInPayments } = await supabase
          .from("buy_in_payments")
          .select("id, stripe_payment_intent_id, user_id, amount")
          .eq("prize_pool_id", prizePool.id)
          .eq("status", "paid");

        const refundResults: { userId: string; refundId: string; amount: number }[] = [];

        if (buyInPayments && buyInPayments.length > 0) {
          for (const payment of buyInPayments) {
            try {
              const refund = await stripe.refunds.create({
                payment_intent: payment.stripe_payment_intent_id,
                reason: "requested_by_customer",
              });

              await supabase
                .from("buy_in_payments")
                .update({
                  status: "refunded",
                  stripe_refund_id: refund.id,
                  refunded_at: new Date().toISOString(),
                })
                .eq("id", payment.id);

              refundResults.push({
                userId: payment.user_id,
                refundId: refund.id,
                amount: payment.amount,
              });

              console.log("Refunded buy-in payment:", payment.id, "refund:", refund.id);
            } catch (refundErr) {
              console.error("Failed to refund buy-in payment:", payment.id, refundErr);
            }
          }
        }

        // Also refund the creator's original payment (stored on prize_pools)
        if (prizePool.stripe_payment_intent_id) {
          // Check if creator's payment was already refunded via buy_in_payments
          const creatorAlreadyRefunded = refundResults.some(
            (r) => r.userId === user.id
          );
          if (!creatorAlreadyRefunded) {
            try {
              const creatorRefund = await stripe.refunds.create({
                payment_intent: prizePool.stripe_payment_intent_id,
                reason: "requested_by_customer",
              });
              console.log("Refunded creator payment:", creatorRefund.id);
            } catch (e) {
              console.log("Creator payment may already be refunded via buy_in_payments");
            }
          }
        }

        // Update prize pool status
        await supabase
          .from("prize_pools")
          .update({
            status: "refunded",
            refunded_at: new Date().toISOString(),
          })
          .eq("id", prizePool.id);

        // Audit log
        await supabase.from("prize_audit_log").insert({
          prize_pool_id: prizePool.id,
          action: "refunded",
          actor_id: user.id,
          details: {
            pool_type: "buy_in",
            refund_count: refundResults.length,
            total_refunded: refundResults.reduce((sum, r) => sum + r.amount, 0),
            reason: "competition_deleted_before_start",
          },
        });
      } else if (prizePool.stripe_payment_intent_id) {
        // CREATOR-FUNDED: Single refund (existing behavior)
        console.log("Refunding prize pool:", prizePool.id);

        const refund = await stripe.refunds.create({
          payment_intent: prizePool.stripe_payment_intent_id,
          reason: "requested_by_customer",
        });

        console.log("Stripe refund created:", refund.id);

        // Update prize pool status
        await supabase
          .from("prize_pools")
          .update({
            status: "refunded",
            refunded_at: new Date().toISOString(),
            stripe_refund_id: refund.id,
          })
          .eq("id", prizePool.id);

        // Audit log
        await supabase.from("prize_audit_log").insert({
          prize_pool_id: prizePool.id,
          action: "refunded",
          actor_id: user.id,
          details: {
            stripe_refund_id: refund.id,
            refund_amount: prizePool.total_amount,
            reason: "competition_deleted_before_start",
          },
        });
      }

      // Update competition
      await supabase
        .from("competitions")
        .update({
          has_prize_pool: false,
          prize_pool_id: null,
          buy_in_amount: null,
        })
        .eq("id", competitionId);
    }

    // Clean up pending pool if exists
    if (pendingPool) {
      // If pending pool has a payment intent, try to cancel/refund it
      if (pendingPool.stripe_payment_intent_id) {
        try {
          // Try to cancel if not yet captured
          await stripe.paymentIntents.cancel(pendingPool.stripe_payment_intent_id);
        } catch (e) {
          // If can't cancel, it might already be captured - try refund
          try {
            await stripe.refunds.create({
              payment_intent: pendingPool.stripe_payment_intent_id,
              reason: "requested_by_customer",
            });
          } catch (refundError) {
            console.log("Could not refund pending payment:", refundError);
          }
        }
      }

      await supabase
        .from("pending_prize_pools")
        .update({ status: "cancelled" })
        .eq("id", pendingPool.id);
    }

    console.log("Prize pool refund completed for competition:", competitionId);

    return new Response(
      JSON.stringify({
        success: true,
        refunded: true,
        message: "Prize pool has been refunded"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error processing refund:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to process refund",
        code: error.code || "unknown",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
