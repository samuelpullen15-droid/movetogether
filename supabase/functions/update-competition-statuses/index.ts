// supabase/functions/update-competition-statuses/index.ts
// This function should be called daily (via cron) to update competition statuses
// Competitions are marked complete using a per-competition dynamic buffer based on
// the westernmost participant timezone. After the deadline, any unlocked participants
// are force-locked so inactive users don't block completion.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use service role for admin operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("[update-competition-statuses] Starting status update...");

    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];

    // Update competitions to 'active' if they should have started
    // (start_date <= today AND status is 'upcoming')
    const { error: activateError, count: activatedCount } = await supabase
      .from("competitions")
      .update({ status: "active" })
      .eq("status", "upcoming")
      .lte("start_date", todayDate);

    if (activateError) {
      console.error("[update-competition-statuses] Error activating competitions:", activateError);
    } else {
      console.log("[update-competition-statuses] Activated competitions:", activatedCount || 0);
    }

    // Find active competitions where the end_date has passed (in UTC terms)
    // We'll apply per-competition timezone-based deadlines below
    const { data: candidateCompetitions, error: fetchError } = await supabase
      .from("competitions")
      .select("id, end_date, is_seasonal_event, event_reward, has_prize_pool, is_team_competition")
      .eq("status", "active")
      .lt("end_date", todayDate);

    if (fetchError) {
      console.error("[update-competition-statuses] Error fetching candidate competitions:", fetchError);
    }

    let completedCount = 0;
    let totalForceLocked = 0;
    // Give participants enough time after midnight to open the app and sync.
    // With 1h, a Hawaii user would need to sync by 1 AM — too early.
    // 12h means they have until ~noon the day after the competition ends.
    const SAFETY_BUFFER_HOURS = 12;

    if (candidateCompetitions && candidateCompetitions.length > 0) {
      for (const competition of candidateCompetitions) {
        // Get the westernmost (latest) timezone offset among participants
        // Returns e.g. -5 for Eastern, -10 for Hawaii, defaults to -10 if unknown
        const { data: offsetData, error: offsetError } = await supabase.rpc(
          'get_competition_latest_timezone_offset',
          { comp_id: competition.id }
        );

        const westOffset = (offsetError || offsetData === null || offsetData === undefined)
          ? -10
          : offsetData;

        // Calculate when the westernmost participant's midnight passes
        // end_date is the last active day. Competition ends at local midnight going into end_date + 1.
        // For UTC offset X (negative for west): that midnight = (end_date + 1 day) 00:00 UTC + abs(X) hours
        const endParts = competition.end_date.split('-');
        const endMidnightUtc = Date.UTC(
          parseInt(endParts[0]),
          parseInt(endParts[1]) - 1,
          parseInt(endParts[2])
        );

        const deadlineUtc = new Date(
          endMidnightUtc
          + 24 * 60 * 60 * 1000                          // + 1 day (to midnight after end_date)
          + Math.abs(westOffset) * 60 * 60 * 1000         // + timezone offset hours
          + SAFETY_BUFFER_HOURS * 60 * 60 * 1000           // + safety buffer
        );

        if (now <= deadlineUtc) {
          console.log(`[update-competition-statuses] Competition ${competition.id} not yet past deadline (offset=${westOffset}, deadline=${deadlineUtc.toISOString()})`);
          continue;
        }

        // Deadline has passed — force-lock any participants who never synced
        const { error: lockError, count: lockedCount } = await supabase
          .from("competition_participants")
          .update({ score_locked_at: now.toISOString() })
          .eq("competition_id", competition.id)
          .is("score_locked_at", null);

        if (lockError) {
          console.error(`[update-competition-statuses] Error force-locking participants for ${competition.id}:`, lockError);
        } else if (lockedCount && lockedCount > 0) {
          console.log(`[update-competition-statuses] Force-locked ${lockedCount} participant(s) for ${competition.id}`);
          totalForceLocked += lockedCount;
        }

        // Mark competition as completed
        const { error: updateError } = await supabase
          .from("competitions")
          .update({ status: "completed" })
          .eq("id", competition.id);

        if (updateError) {
          console.error(`[update-competition-statuses] Error completing competition ${competition.id}:`, updateError);
        } else {
          console.log(`[update-competition-statuses] Completed competition: ${competition.id} (offset=${westOffset}, deadline=${deadlineUtc.toISOString()})`);
          completedCount++;

          // Distribute seasonal event rewards
          if (competition.is_seasonal_event && competition.event_reward) {
            try {
              const reward = competition.event_reward;
              const minDays = reward.min_days_completed || 0;

              // Count distinct active days per participant (days with points > 0)
              const { data: dailyData, error: dailyError } = await supabase
                .from("competition_daily_data")
                .select("user_id, date")
                .eq("competition_id", competition.id)
                .gt("points", 0);

              if (dailyError) {
                console.error(`[update-competition-statuses] Error fetching daily data for seasonal event ${competition.id}:`, dailyError);
              } else if (dailyData) {
                // Group by user_id and count distinct dates
                const userDayCounts: Record<string, number> = {};
                for (const row of dailyData) {
                  if (!userDayCounts[row.user_id]) {
                    userDayCounts[row.user_id] = 0;
                  }
                  userDayCounts[row.user_id]++;
                }

                const qualifiedUsers = Object.entries(userDayCounts)
                  .filter(([_, days]) => days >= minDays)
                  .map(([userId]) => userId);

                console.log(`[update-competition-statuses] Seasonal event ${competition.id}: ${qualifiedUsers.length} user(s) qualified for reward (min ${minDays} days)`);

                // Get the competition name for notifications
                const { data: compData } = await supabase
                  .from("competitions")
                  .select("name, event_theme")
                  .eq("id", competition.id)
                  .single();

                for (const userId of qualifiedUsers) {
                  // Upsert trial reward
                  if (reward.type === "trial_mover" && reward.trial_hours) {
                    const expiresAt = new Date(Date.now() + reward.trial_hours * 60 * 60 * 1000).toISOString();
                    const { error: trialError } = await supabase
                      .from("user_trials")
                      .upsert({
                        user_id: userId,
                        trial_type: "mover",
                        source: reward.source || "seasonal_event",
                        granted_at: new Date().toISOString(),
                        expires_at: expiresAt,
                      }, { onConflict: "user_id, trial_type, source" });

                    if (trialError) {
                      console.error(`[update-competition-statuses] Error granting trial to ${userId}:`, trialError);
                    } else {
                      console.log(`[update-competition-statuses] Granted ${reward.trial_hours}h Mover trial to ${userId}`);
                    }
                  }

                  // Send reward notification
                  const rewardDescription = compData?.event_theme?.rewardDescription || "a special reward";
                  try {
                    await fetch(
                      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                        },
                        body: JSON.stringify({
                          type: "seasonal_event_reward",
                          recipientUserId: userId,
                          data: {
                            eventName: compData?.name || "Seasonal Event",
                            rewardDescription,
                          },
                        }),
                      }
                    );
                  } catch (notifErr) {
                    console.error(`[update-competition-statuses] Error sending reward notification to ${userId}:`, notifErr);
                  }
                }
              }
            } catch (rewardErr) {
              console.error(`[update-competition-statuses] Error distributing seasonal event rewards for ${competition.id}:`, rewardErr);
            }
          }

          // Distribute prize pool payouts
          if (competition.has_prize_pool) {
            try {
              // Get active prize pool
              const { data: prizePool } = await supabase
                .from("prize_pools")
                .select("id, total_amount, payout_structure, status")
                .eq("competition_id", competition.id)
                .eq("status", "active")
                .maybeSingle();

              if (prizePool) {
                // Idempotency check: skip if payouts already exist
                const { data: existingPayouts } = await supabase
                  .from("prize_payouts")
                  .select("id")
                  .eq("competition_id", competition.id)
                  .limit(1);

                if (!existingPayouts || existingPayouts.length === 0) {
                  // Fetch participants sorted by points
                  const { data: prizeParticipants } = await supabase
                    .from("competition_participants")
                    .select("user_id, total_points, team_id")
                    .eq("competition_id", competition.id)
                    .order("total_points", { ascending: false });

                  if (prizeParticipants && prizeParticipants.length > 0) {
                    // Build placements (top 5)
                    let placements: { userId: string; placement: number }[] = [];

                    if (competition.is_team_competition) {
                      // Group by team, compute averages, rank teams
                      const teamMap = new Map<string, { total: number; count: number; members: string[] }>();
                      for (const pp of prizeParticipants) {
                        if (!pp.team_id) continue;
                        const team = teamMap.get(pp.team_id) || { total: 0, count: 0, members: [] };
                        team.total += Number(pp.total_points) || 0;
                        team.count++;
                        team.members.push(pp.user_id);
                        teamMap.set(pp.team_id, team);
                      }
                      const rankedTeams = [...teamMap.entries()]
                        .map(([_teamId, t]) => ({ avg: t.count > 0 ? t.total / t.count : 0, members: t.members }))
                        .sort((a, b) => b.avg - a.avg);

                      rankedTeams.slice(0, 5).forEach((team, idx) => {
                        for (const uid of team.members) {
                          placements.push({ userId: uid, placement: idx + 1 });
                        }
                      });
                    } else {
                      placements = prizeParticipants.slice(0, 5).map((pp, i) => ({
                        userId: pp.user_id,
                        placement: i + 1,
                      }));
                    }

                    // Count members per placement tier (for team splitting)
                    const placementMemberCounts: Record<number, number> = {};
                    for (const pl of placements) {
                      placementMemberCounts[pl.placement] = (placementMemberCounts[pl.placement] || 0) + 1;
                    }

                    // Create payout records
                    const claimExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                    const structure = prizePool.payout_structure || { first: 100 };
                    const placementKeys = ["first", "second", "third", "fourth", "fifth"];

                    for (const pl of placements) {
                      const key = placementKeys[pl.placement - 1];
                      const percentage = structure[key] || 0;
                      if (percentage <= 0) continue;

                      const tierAmount = (prizePool.total_amount * percentage) / 100;
                      const memberCount = placementMemberCounts[pl.placement] || 1;
                      const payoutAmount = Math.floor((tierAmount / memberCount) * 100) / 100;

                      // Get winner email
                      const { data: userData } = await supabase.auth.admin.getUserById(pl.userId);

                      await supabase.from("prize_payouts").insert({
                        prize_pool_id: prizePool.id,
                        competition_id: competition.id,
                        winner_id: pl.userId,
                        placement: pl.placement,
                        payout_amount: payoutAmount,
                        status: "pending",
                        claim_status: "unclaimed",
                        claim_expires_at: claimExpiresAt,
                        recipient_email: userData?.user?.email || null,
                        recipient_name: userData?.user?.user_metadata?.full_name || null,
                        seen_by_winner: false,
                      });

                      await supabase.from("prize_audit_log").insert({
                        prize_pool_id: prizePool.id,
                        payout_id: null,
                        action: "payout_created",
                        actor_id: null,
                        details: { placement: pl.placement, amount: payoutAmount, winner_id: pl.userId, source: "cron" },
                      });
                    }

                    // Update prize pool status
                    await supabase
                      .from("prize_pools")
                      .update({ status: "distributing" })
                      .eq("id", prizePool.id);

                    console.log(`[update-competition-statuses] Distributed prizes for ${competition.id}: ${placements.length} payouts`);
                  }
                } else {
                  console.log(`[update-competition-statuses] Prize payouts already exist for ${competition.id}`);
                }
              }
            } catch (prizeErr) {
              console.error(`[update-competition-statuses] Prize distribution error for ${competition.id}:`, prizeErr);
              // Don't block completion — prizes can be distributed later via client-side fallback
            }
          }

          // Award coin rewards for competition completion
          try {
            await awardCompetitionCoins(supabase, competition.id);
          } catch (coinErr) {
            console.error(`[update-competition-statuses] Coin reward error for ${competition.id}:`, coinErr);
            // Non-critical — don't block completion
          }
        }
      }
    }

    console.log("[update-competition-statuses] Completed competitions:", completedCount);

    // Get counts for logging
    const { data: statusCounts, error: countError } = await supabase
      .from("competitions")
      .select("status")
      .then(result => {
        if (result.error) return { data: null, error: result.error };

        const counts = { active: 0, upcoming: 0, completed: 0 };
        (result.data || []).forEach((c: any) => {
          if (c.status in counts) {
            counts[c.status as keyof typeof counts]++;
          }
        });
        return { data: counts, error: null };
      });

    if (countError) {
      console.error("[update-competition-statuses] Error getting status counts:", countError);
    }

    console.log("[update-competition-statuses] Status update complete:", statusCounts);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Competition statuses updated successfully",
        counts: statusCounts,
        activated: activatedCount || 0,
        completed: completedCount,
        forceLocked: totalForceLocked,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[update-competition-statuses] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Award coins for competition completion (placement + participation bonuses)
async function awardCompetitionCoins(supabase: any, competitionId: string) {
  // Check if we already awarded coins for this competition (idempotency)
  const { data: existingRewards } = await supabase
    .from("coin_transactions")
    .select("id")
    .eq("reference_type", "competition")
    .eq("reference_id", competitionId)
    .eq("transaction_type", "earn_competition_win")
    .limit(1);

  if (existingRewards && existingRewards.length > 0) {
    console.log(`[update-competition-statuses] Coin rewards already distributed for competition ${competitionId}`);
    return;
  }

  // Get competition name for logging
  const { data: compData } = await supabase
    .from("competitions")
    .select("name")
    .eq("id", competitionId)
    .single();

  // Get all participants sorted by total_points
  const { data: participants, error: participantsError } = await supabase
    .from("competition_participants")
    .select("user_id, total_points")
    .eq("competition_id", competitionId)
    .order("total_points", { ascending: false });

  if (participantsError || !participants || participants.length === 0) {
    console.log(`[update-competition-statuses] No participants for competition ${competitionId}`);
    return;
  }

  // Get reward amounts from config (with defaults)
  const { data: rewardConfigs } = await supabase
    .from("coin_reward_config")
    .select("event_type, earned_coins")
    .in("event_type", [
      "competition_win_1st",
      "competition_win_2nd",
      "competition_win_3rd",
      "competition_complete",
    ])
    .eq("is_active", true);

  const configMap = new Map<string, number>();
  for (const cfg of rewardConfigs || []) {
    configMap.set(cfg.event_type, cfg.earned_coins);
  }

  const rewards = {
    first: configMap.get("competition_win_1st") ?? 100,
    second: configMap.get("competition_win_2nd") ?? 50,
    third: configMap.get("competition_win_3rd") ?? 25,
    participation: configMap.get("competition_complete") ?? 10,
  };

  // Only award placement rewards if there are at least 2 participants
  // (winning alone doesn't count as a real win)
  const hasRealCompetition = participants.length >= 2;

  let totalCoinsAwarded = 0;
  let usersRewarded = 0;

  for (let i = 0; i < participants.length; i++) {
    const participant = participants[i];
    const placement = i + 1;
    let coinsToAward = rewards.participation; // Everyone gets participation bonus
    let transactionType = "earn_competition_complete";

    // Add placement bonus for top 3 (only in real competitions)
    if (hasRealCompetition) {
      if (placement === 1) {
        coinsToAward += rewards.first;
        transactionType = "earn_competition_win";
      } else if (placement === 2) {
        coinsToAward += rewards.second;
        transactionType = "earn_competition_win";
      } else if (placement === 3) {
        coinsToAward += rewards.third;
        transactionType = "earn_competition_win";
      }
    }

    // Award coins
    const { error: creditError } = await supabase.rpc("credit_coins", {
      p_user_id: participant.user_id,
      p_earned_amount: coinsToAward,
      p_premium_amount: 0,
      p_transaction_type: transactionType,
      p_reference_type: "competition",
      p_reference_id: competitionId,
      p_metadata: {
        competition_name: compData?.name || "Competition",
        placement,
        total_points: participant.total_points,
        placement_bonus: hasRealCompetition && placement <= 3 ? coinsToAward - rewards.participation : 0,
        participation_bonus: rewards.participation,
      },
    });

    if (creditError) {
      console.error(`[update-competition-statuses] Failed to credit coins to ${participant.user_id}:`, creditError);
    } else {
      totalCoinsAwarded += coinsToAward;
      usersRewarded++;
    }
  }

  console.log(
    `[update-competition-statuses] Awarded ${totalCoinsAwarded} coins to ${usersRewarded} users for competition ${competitionId} (${compData?.name || "Unknown"})`
  );
}
