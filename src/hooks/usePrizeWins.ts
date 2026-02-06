// hooks/usePrizeWins.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { prizeApi } from '@/lib/edge-functions';

export interface PrizeWin {
  id: string;
  competitionId: string;
  competitionName: string;
  placement: number;
  payoutAmount: number;
  status: 'pending' | 'processing' | 'executed' | 'delivered' | 'failed';
  claimStatus: 'unclaimed' | 'claimed' | 'expired';
  claimExpiresAt?: string;
  recipientEmail: string;
  createdAt: string;
}

interface UsePrizeWinsResult {
  unseenWins: PrizeWin[];
  allWins: PrizeWin[];
  unclaimedWins: PrizeWin[];
  loading: boolean;
  error: string | null;
  currentWin: PrizeWin | null;
  claiming: boolean;
  claimPrize: (payoutId: string) => Promise<boolean>;
  markAsSeen: (payoutId: string) => Promise<void>;
  dismissCurrentWin: () => void;
  refresh: () => Promise<void>;
}

export const usePrizeWins = (): UsePrizeWinsResult => {
  const [unseenWins, setUnseenWins] = useState<PrizeWin[]>([]);
  const [allWins, setAllWins] = useState<PrizeWin[]>([]);
  const [unclaimedWins, setUnclaimedWins] = useState<PrizeWin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentWin, setCurrentWin] = useState<PrizeWin | null>(null);
  const [claiming, setClaiming] = useState(false);

  const { user } = useAuthStore();

  const fetchPrizeWins = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch all prize payouts via edge function
      const { data, error: fetchError } = await prizeApi.getMyPrizePayouts();

      if (fetchError) {
        throw fetchError;
      }

      const mapPayout = (payout: any): PrizeWin => ({
        id: payout.id,
        competitionId: payout.competition_id,
        competitionName: payout.competitions?.name || 'Competition',
        placement: payout.placement,
        payoutAmount: payout.payout_amount,
        status: payout.status,
        claimStatus: payout.claim_status || 'unclaimed',
        claimExpiresAt: payout.claim_expires_at,
        recipientEmail: payout.recipient_email,
        createdAt: payout.created_at,
      });

      const wins: PrizeWin[] = (data || []).map(mapPayout);
      setAllWins(wins);

      // Filter unseen wins (for showing celebration modal)
      const unseen = (data || [])
        .filter((p: any) => !p.seen_by_winner)
        .map(mapPayout);
      setUnseenWins(unseen);

      // Filter unclaimed wins (pending claim action)
      const unclaimed = (data || [])
        .filter((p: any) => p.claim_status === 'unclaimed' && p.status !== 'failed')
        .map(mapPayout);
      setUnclaimedWins(unclaimed);

      // Set the first unseen unclaimed win as current (to show in modal)
      // Prioritize unclaimed wins so user can claim their prize
      const unseenUnclaimed = unseen.filter(w => w.claimStatus === 'unclaimed');
      if (unseenUnclaimed.length > 0 && !currentWin) {
        setCurrentWin(unseenUnclaimed[0]);
      } else if (unseen.length > 0 && !currentWin) {
        setCurrentWin(unseen[0]);
      }

    } catch (err: any) {
      console.error('Error fetching prize wins:', err);
      setError(err.message || 'Failed to fetch prize wins');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const claimPrize = useCallback(async (payoutId: string): Promise<boolean> => {
    if (!user?.id) {
      return false;
    }

    try {
      setClaiming(true);
      setError(null);

      // Refresh the session to ensure we have a valid token
      const { data: refreshData } = await supabase.auth.refreshSession();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = refreshData?.session?.access_token || sessionData?.session?.access_token;

      if (!accessToken) {
        setError('Not authenticated');
        return false;
      }

      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/claim-prize`;

      const response = await fetch(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ payoutId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to claim prize');
        return false;
      }

      // Update local state to reflect the claim
      setUnclaimedWins(prev => prev.filter(w => w.id !== payoutId));
      setAllWins(prev => prev.map(w =>
        w.id === payoutId
          ? { ...w, claimStatus: 'claimed' as const, status: 'processing' as const }
          : w
      ));

      // Update currentWin to show claimed state (don't clear it - let user dismiss)
      if (currentWin?.id === payoutId) {
        setCurrentWin(prev => prev ? { ...prev, claimStatus: 'claimed' as const, status: 'processing' as const } : null);
      }

      return true;

    } catch (err: any) {
      setError(err.message || 'Failed to claim prize');
      return false;
    } finally {
      setClaiming(false);
    }
  }, [user?.id, currentWin, unclaimedWins]);

  const markAsSeen = useCallback(async (payoutId: string) => {
    if (!user?.id) return;

    try {
      const { error: updateError } = await prizeApi.markPrizeSeen(payoutId);

      if (updateError) {
        console.error('Error marking prize as seen:', updateError);
        return;
      }

      // Update local state
      setUnseenWins(prev => prev.filter(w => w.id !== payoutId));

      // If this was the current win, move to next unseen or clear
      if (currentWin?.id === payoutId) {
        const remaining = unseenWins.filter(w => w.id !== payoutId);
        setCurrentWin(remaining.length > 0 ? remaining[0] : null);
      }

    } catch (err) {
      console.error('Error marking prize as seen:', err);
    }
  }, [user?.id, currentWin, unseenWins]);

  const dismissCurrentWin = useCallback(() => {
    if (currentWin) {
      markAsSeen(currentWin.id);
    }
  }, [currentWin, markAsSeen]);

  const refresh = useCallback(async () => {
    await fetchPrizeWins();
  }, [fetchPrizeWins]);

  // Initial fetch
  useEffect(() => {
    fetchPrizeWins();
  }, [fetchPrizeWins]);

  // Subscribe to realtime updates for new prize payouts
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('prize-payouts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prize_payouts',
          filter: `winner_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Prize payout change:', payload);
          // Refresh when there's any change to the user's payouts
          fetchPrizeWins();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchPrizeWins]);

  return {
    unseenWins,
    allWins,
    unclaimedWins,
    loading,
    error,
    currentWin,
    claiming,
    claimPrize,
    markAsSeen,
    dismissCurrentWin,
    refresh,
  };
};

export default usePrizeWins;
