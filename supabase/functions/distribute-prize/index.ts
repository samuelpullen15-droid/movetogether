// supabase/functions/distribute-prize/index.ts
// This function creates payout records when a competition ends.
// It does NOT send rewards immediately - winners claim their prize in-app
// and the claim-prize function handles the actual Tremendous API call.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Claim expiration period (7 days)
const CLAIM_EXPIRATION_DAYS = 7;

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
    // Get authorization header to verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service role client for admin operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // User client to verify identity
    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Verify the user is authenticated
    const { data: { user }, error: userError } = await userSupabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { competitionId, placements, isTeamCompetition } = await req.json();
    // placements = [{ userId: "...", placement: 1, teamId?: "..." }, ...]

    if (!competitionId || !placements || !Array.isArray(placements)) {
      return new Response(
        JSON.stringify({ error: "Missing competitionId or placements" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the user is a participant in this competition
    const { data: participant } = await supabase
      .from("competition_participants")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return new Response(
        JSON.stringify({ error: "Not a participant in this competition" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the competition is completed
    const { data: competition } = await supabase
      .from("competitions")
      .select("status")
      .eq("id", competitionId)
      .single();

    if (!competition || competition.status !== "completed") {
      return new Response(
        JSON.stringify({ error: "Competition is not completed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Creating prize payouts for competition:", competitionId, "triggered by user:", user.id);

    // Get prize pool
    const { data: prizePool, error: poolError } = await supabase
      .from("prize_pools")
      .select("*")
      .eq("competition_id", competitionId)
      .eq("status", "active")
      .single();

    if (poolError || !prizePool) {
      return new Response(
        JSON.stringify({ error: "No active prize pool found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update prize pool status to distributing
    await supabase
      .from("prize_pools")
      .update({ status: "distributing" })
      .eq("id", prizePool.id);

    const results = [];
    const claimExpiresAt = new Date();
    claimExpiresAt.setDate(claimExpiresAt.getDate() + CLAIM_EXPIRATION_DAYS);

    // For team competitions, count how many members share each placement tier
    const placementMemberCounts: Record<number, number> = {};
    if (isTeamCompetition) {
      for (const { placement } of placements) {
        placementMemberCounts[placement] = (placementMemberCounts[placement] || 0) + 1;
      }
    }

    for (const { userId, placement, teamId } of placements) {
      // Calculate payout amount based on structure
      const percentageKey = getPlacementKey(placement);
      const percentage = prizePool.payout_structure[percentageKey] || 0;

      if (percentage === 0) {
        console.log(`No payout for placement ${placement}`);
        continue;
      }

      // For team competitions, split the placement tier's payout among team members
      const tierAmount = (prizePool.total_amount * percentage) / 100;
      const payoutAmount = isTeamCompetition && placementMemberCounts[placement] > 1
        ? Math.floor(tierAmount * 100 / placementMemberCounts[placement]) / 100 // Round down to cents
        : tierAmount;

      console.log(`Creating payout record for placement ${placement}: $${payoutAmount}`);

      // Get winner details
      const { data: { user: winner }, error: userError } = await supabase.auth.admin.getUserById(userId);

      if (userError || !winner?.email) {
        console.error("Winner not found or no email:", userId);
        results.push({ userId, placement, error: "Winner email not found" });
        continue;
      }

      // Create payout record with pending/unclaimed status
      // The winner will claim this in-app and choose their reward type
      const { data: payout, error: payoutError } = await supabase
        .from("prize_payouts")
        .insert({
          prize_pool_id: prizePool.id,
          competition_id: competitionId,
          winner_id: userId,
          placement,
          payout_amount: payoutAmount,
          payout_method: "PENDING_SELECTION", // Will be set when winner claims
          recipient_email: winner.email,
          recipient_name: winner.user_metadata?.full_name || winner.user_metadata?.name || winner.email,
          status: "pending",
          claim_status: "unclaimed",
          claim_expires_at: claimExpiresAt.toISOString(),
          seen_by_winner: false
        })
        .select()
        .single();

      if (payoutError) {
        console.error("Error creating payout record:", payoutError);
        results.push({ userId, placement, error: payoutError.message });
        continue;
      }

      // Log audit entry
      await supabase.from("prize_audit_log").insert({
        prize_pool_id: prizePool.id,
        payout_id: payout.id,
        action: "payout_created",
        details: {
          placement,
          amount: payoutAmount,
          recipient_email: winner.email,
          claim_expires_at: claimExpiresAt.toISOString(),
          ...(isTeamCompetition && teamId ? { team_id: teamId, team_split_count: placementMemberCounts[placement] } : {}),
        }
      });

      results.push({
        userId,
        placement,
        success: true,
        amount: payoutAmount,
        payoutId: payout.id,
        claimExpiresAt: claimExpiresAt.toISOString()
      });

      console.log(`Payout record created for ${winner.email}, expires ${claimExpiresAt.toISOString()}`);
    }

    // All payout records created - pool stays in "distributing" until all are claimed
    console.log(`Created ${results.filter(r => r.success).length} payout records for prize pool:`, prizePool.id);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error creating prize payouts:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getPlacementKey(placement: number): string {
  const keys: Record<number, string> = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth"
  };
  return keys[placement] || `place_${placement}`;
}
