// supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.5.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

serve(async (req) => {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature")!;

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("Received Stripe event:", event.type);

    // Handle successful payment
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metadata = paymentIntent.metadata;

      // Skip unrelated payment types
      if (metadata.type !== "prize_pool" && metadata.type !== "buy_in_join") {
        console.log("Not a prize pool payment, skipping");
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      // ── CREATOR PRIZE POOL PAYMENT ──
      if (metadata.type === "prize_pool") {
        const {
          pending_pool_id: pendingPoolId,
          competition_id: competitionId,
          user_id: userId,
          prize_amount: prizeAmountStr,
          pool_type: poolType = "creator_funded",
          buy_in_amount: buyInAmountStr,
        } = metadata;

        const prizeAmount = parseFloat(prizeAmountStr);
        const buyInAmount = buyInAmountStr ? parseFloat(buyInAmountStr) : null;

        console.log("Processing prize pool payment:", {
          pendingPoolId,
          competitionId,
          prizeAmount,
          poolType,
        });

        // Check for duplicate (idempotency)
        const { data: existingPool } = await supabase
          .from("prize_pools")
          .select("id")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .single();

        if (existingPool) {
          console.log("Duplicate payment, skipping:", paymentIntent.id);
          return new Response(
            JSON.stringify({ received: true }),
            { status: 200 }
          );
        }

        // Get pending pool data
        const { data: pendingData, error: pendingError } = await supabase
          .from("pending_prize_pools")
          .select("*")
          .eq("id", pendingPoolId)
          .single();

        if (pendingError || !pendingData) {
          console.error("Pending pool not found:", pendingPoolId);
          return new Response(
            JSON.stringify({ error: "Pending pool not found" }),
            { status: 400 }
          );
        }

        // CREATE THE ACTIVE PRIZE POOL (payment confirmed!)
        const { data: prizePool, error: poolError } = await supabase
          .from("prize_pools")
          .insert({
            competition_id: competitionId,
            creator_id: userId,
            total_amount: prizeAmount,
            remaining_balance: prizeAmount,
            payout_structure: pendingData.payout_structure,
            allowed_payout_methods: ["VISA_PREPAID_CARD"],
            creator_payment_status: "paid",
            stripe_payment_intent_id: paymentIntent.id,
            stripe_charge_id: paymentIntent.latest_charge as string,
            status: "active",
            activated_at: new Date().toISOString(),
            pool_type: poolType,
            buy_in_amount: buyInAmount,
            participant_count: poolType === "buy_in" ? 1 : 0,
          })
          .select()
          .single();

        if (poolError) {
          console.error("Error creating prize pool:", poolError);
          throw poolError;
        }

        console.log("Created active prize pool:", prizePool.id);

        // Update competition
        const compUpdate: Record<string, any> = {
          has_prize_pool: true,
          prize_pool_id: prizePool.id,
        };
        if (poolType === "buy_in" && buyInAmount) {
          compUpdate.buy_in_amount = buyInAmount;
        }

        const { error: compError } = await supabase
          .from("competitions")
          .update(compUpdate)
          .eq("id", competitionId);

        if (compError) {
          console.error("Error updating competition:", compError);
        }

        // Create buy_in_payments record for creator (if buy-in mode)
        if (poolType === "buy_in" && buyInAmount) {
          const { error: buyInError } = await supabase
            .from("buy_in_payments")
            .insert({
              prize_pool_id: prizePool.id,
              competition_id: competitionId,
              user_id: userId,
              amount: buyInAmount,
              stripe_payment_intent_id: paymentIntent.id,
              stripe_charge_id: paymentIntent.latest_charge as string,
              status: "paid",
              paid_at: new Date().toISOString(),
            });

          if (buyInError) {
            console.error(
              "Error creating creator buy-in payment record:",
              buyInError
            );
          }
        }

        // Mark pending as completed
        await supabase
          .from("pending_prize_pools")
          .update({
            status: "completed",
            prize_pool_id: prizePool.id,
          })
          .eq("id", pendingPoolId);

        // Audit log
        await supabase.from("prize_audit_log").insert({
          prize_pool_id: prizePool.id,
          action: "payment_confirmed",
          actor_id: userId,
          details: {
            stripe_payment_intent_id: paymentIntent.id,
            amount_charged: paymentIntent.amount / 100,
            prize_amount: prizeAmount,
            pool_type: poolType,
            buy_in_amount: buyInAmount,
          },
        });

        console.log("Prize pool activated successfully:", prizePool.id);

        // Send push notifications to all participants (except creator)
        try {
          const { data: competition } = await supabase
            .from("competitions")
            .select("name, status")
            .eq("id", competitionId)
            .single();

          const { data: participants } = await supabase
            .from("competition_participants")
            .select("user_id")
            .eq("competition_id", competitionId)
            .neq("user_id", userId);

          if (participants && participants.length > 0 && competition) {
            const notificationUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification`;
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

            const notificationPromises = participants.map((p) =>
              fetch(notificationUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  type: "prize_pool_added",
                  recipientUserId: p.user_id,
                  data: {
                    competitionId,
                    competitionName: competition.name,
                    prizeAmount,
                    poolType,
                    buyInAmount,
                    deep_link: `/competition-detail?id=${competitionId}`,
                  },
                }),
              }).catch((err) =>
                console.error(
                  "Failed to notify participant:",
                  p.user_id,
                  err
                )
              )
            );

            await Promise.allSettled(notificationPromises);
            console.log(
              `Sent prize pool notifications to ${participants.length} participants`
            );
          }
        } catch (notifyError) {
          console.error(
            "Error sending prize pool notifications:",
            notifyError
          );
        }
      }

      // ── PARTICIPANT BUY-IN PAYMENT ──
      if (metadata.type === "buy_in_join") {
        const {
          competition_id: competitionId,
          user_id: userId,
          prize_pool_id: prizePoolId,
          buy_in_amount: buyInAmountStr,
          invitation_id: invitationId,
          buy_in_payment_id: buyInPaymentId,
        } = metadata;

        const buyInAmount = parseFloat(buyInAmountStr);

        console.log("Processing buy-in join payment:", {
          competitionId,
          userId,
          buyInAmount,
        });

        // Idempotency: check if already processed
        const { data: existingPayment } = await supabase
          .from("buy_in_payments")
          .select("id, status")
          .eq("prize_pool_id", prizePoolId)
          .eq("user_id", userId)
          .eq("status", "paid")
          .single();

        if (existingPayment) {
          console.log("Duplicate buy-in payment, skipping:", paymentIntent.id);
          return new Response(
            JSON.stringify({ received: true }),
            { status: 200 }
          );
        }

        // Update the pending buy_in_payments row to paid
        const { error: buyInUpdateError } = await supabase
          .from("buy_in_payments")
          .update({
            status: "paid",
            stripe_charge_id: paymentIntent.latest_charge as string,
            paid_at: new Date().toISOString(),
          })
          .eq("id", buyInPaymentId);

        if (buyInUpdateError) {
          console.error("Error updating buy-in payment:", buyInUpdateError);
          throw buyInUpdateError;
        }

        // Increment prize pool total and participant count
        const { data: currentPool } = await supabase
          .from("prize_pools")
          .select("total_amount, participant_count, remaining_balance")
          .eq("id", prizePoolId)
          .single();

        if (currentPool) {
          const newTotal =
            parseFloat(currentPool.total_amount) + buyInAmount;
          const newBalance =
            parseFloat(currentPool.remaining_balance) + buyInAmount;
          const newCount = (currentPool.participant_count || 0) + 1;

          await supabase
            .from("prize_pools")
            .update({
              total_amount: newTotal,
              remaining_balance: newBalance,
              participant_count: newCount,
            })
            .eq("id", prizePoolId);
        }

        // Add user to competition_participants (or update if opted-out user paying later)
        const { data: existingParticipant } = await supabase
          .from("competition_participants")
          .select("id, prize_eligible")
          .eq("competition_id", competitionId)
          .eq("user_id", userId)
          .maybeSingle();

        if (existingParticipant) {
          // Opted-out participant paying later — mark as prize eligible
          if (!existingParticipant.prize_eligible) {
            await supabase
              .from("competition_participants")
              .update({ prize_eligible: true })
              .eq("id", existingParticipant.id);
            console.log("Updated existing participant to prize_eligible:", userId);
          }
        } else {
          // New participant joining via buy-in
          const { error: participantError } = await supabase
            .from("competition_participants")
            .insert({
              competition_id: competitionId,
              user_id: userId,
            });

          if (participantError) {
            console.error("Error adding participant:", participantError);
          }
        }

        // If joined via invitation, update invitation status
        if (invitationId) {
          await supabase
            .from("competition_invitations")
            .update({ status: "accepted" })
            .eq("id", invitationId);
        }

        // Audit log
        await supabase.from("prize_audit_log").insert({
          prize_pool_id: prizePoolId,
          action: "buy_in_payment",
          actor_id: userId,
          details: {
            stripe_payment_intent_id: paymentIntent.id,
            amount: buyInAmount,
            new_pool_total: currentPool
              ? parseFloat(currentPool.total_amount) + buyInAmount
              : buyInAmount,
          },
        });

        console.log(
          "Buy-in payment processed successfully for user:",
          userId
        );
      }
    }

    // Handle failed payment
    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metadata = paymentIntent.metadata;

      console.log("Payment failed:", paymentIntent.id);

      if (metadata.type === "prize_pool" && metadata.pending_pool_id) {
        await supabase
          .from("pending_prize_pools")
          .update({
            status: "failed",
            error_message:
              paymentIntent.last_payment_error?.message || "Payment failed",
          })
          .eq("id", metadata.pending_pool_id);
      }

      if (metadata.type === "buy_in_join" && metadata.buy_in_payment_id) {
        await supabase
          .from("buy_in_payments")
          .update({ status: "failed" })
          .eq("id", metadata.buy_in_payment_id);
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500 }
    );
  }
});
