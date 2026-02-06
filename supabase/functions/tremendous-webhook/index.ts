// supabase/functions/tremendous-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Verify Tremendous webhook signature using HMAC-SHA256.
 * Returns true if the signature is valid, false otherwise.
 */
async function verifyTremendousSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computedHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHex === signatureHeader;
}

serve(async (req) => {
  try {
    // Verify webhook signature before processing
    const WEBHOOK_SECRET = Deno.env.get("TREMENDOUS_WEBHOOK_SECRET");
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("Tremendous-Webhook-Signature");

    if (!WEBHOOK_SECRET) {
      console.error("TREMENDOUS_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500 }
      );
    }

    const isValid = await verifyTremendousSignature(rawBody, signatureHeader, WEBHOOK_SECRET);
    if (!isValid) {
      console.error("Invalid Tremendous webhook signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = JSON.parse(rawBody);

    console.log("Tremendous webhook received:", JSON.stringify(payload, null, 2));

    // Tremendous webhook format: { event: "EVENT_TYPE", ... }
    const eventType = payload.event;
    
    if (!eventType) {
      console.log("No event type in payload");
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    switch (eventType) {
      case "REWARDS.DELIVERY.SUCCEEDED": {
        // Reward email was delivered to winner
        const rewardId = payload.reward?.id || payload.data?.reward?.id;
        
        if (rewardId) {
          const { error } = await supabase
            .from("prize_payouts")
            .update({
              status: "delivered",
              delivered_at: new Date().toISOString()
            })
            .eq("tremendous_reward_id", rewardId);

          if (error) {
            console.error("Error updating payout to delivered:", error);
          } else {
            console.log("Marked payout as delivered:", rewardId);
          }

          // Get payout details for audit log
          const { data: payout } = await supabase
            .from("prize_payouts")
            .select("id, prize_pool_id, winner_id")
            .eq("tremendous_reward_id", rewardId)
            .single();

          if (payout) {
            await supabase.from("prize_audit_log").insert({
              prize_pool_id: payout.prize_pool_id,
              payout_id: payout.id,
              action: "reward_delivered",
              actor_id: payout.winner_id,
              details: { tremendous_reward_id: rewardId }
            });
          }
        }
        break;
      }

      case "REWARDS.REDEEMED": {
        // Winner claimed their reward
        const rewardId = payload.reward?.id || payload.data?.reward?.id;
        
        if (rewardId) {
          const { error } = await supabase
            .from("prize_payouts")
            .update({
              status: "redeemed",
              redeemed_at: new Date().toISOString()
            })
            .eq("tremendous_reward_id", rewardId);

          if (error) {
            console.error("Error updating payout to redeemed:", error);
          } else {
            console.log("Marked payout as redeemed:", rewardId);
          }

          // Get payout details for audit log
          const { data: payout } = await supabase
            .from("prize_payouts")
            .select("id, prize_pool_id, winner_id")
            .eq("tremendous_reward_id", rewardId)
            .single();

          if (payout) {
            await supabase.from("prize_audit_log").insert({
              prize_pool_id: payout.prize_pool_id,
              payout_id: payout.id,
              action: "reward_redeemed",
              actor_id: payout.winner_id,
              details: { tremendous_reward_id: rewardId }
            });
          }
        }
        break;
      }

      case "REWARDS.DELIVERY.FAILED": {
        // Email delivery failed
        const rewardId = payload.reward?.id || payload.data?.reward?.id;
        const errorMessage = payload.error || payload.data?.error || "Delivery failed";
        
        if (rewardId) {
          const { error } = await supabase
            .from("prize_payouts")
            .update({
              status: "failed",
              error_message: `Email delivery failed: ${errorMessage}`
            })
            .eq("tremendous_reward_id", rewardId);

          if (error) {
            console.error("Error updating payout to failed:", error);
          } else {
            console.log("Marked payout as failed:", rewardId);
          }
        }
        break;
      }

      case "ORDERS.CREATED": {
        console.log("Order created:", payload.order?.id || payload.data?.order?.id);
        break;
      }

      case "ORDERS.FAILED": {
        // Order processing failed
        const orderId = payload.order?.id || payload.data?.order?.id;
        const errorMessage = payload.error || payload.data?.error || "Order failed";
        
        if (orderId) {
          const { error } = await supabase
            .from("prize_payouts")
            .update({
              status: "failed",
              error_message: errorMessage
            })
            .eq("tremendous_order_id", orderId);

          if (error) {
            console.error("Error updating payout for failed order:", error);
          } else {
            console.log("Marked payout as failed for order:", orderId);
          }
        }
        break;
      }

      default:
        console.log("Unhandled event type:", eventType);
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
