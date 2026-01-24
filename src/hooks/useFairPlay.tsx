// src/hooks/useFairPlay.tsx
//
// Hook for managing fair play acknowledgement before joining competitions
// Shows reminder modal on first competition join, then remembers the choice

import React, { useState, useCallback, useRef } from 'react';
import { FairPlayReminderModal } from '@/components/FairPlayReminderModal';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';

interface UseFairPlayReturn {
  /** Check if fair play is acknowledged. If not, shows modal and returns false. If yes, returns true. */
  checkFairPlay: () => Promise<boolean>;
  /** The modal component to render in your component tree */
  FairPlayModal: React.FC;
  /** Whether fair play has been acknowledged */
  hasAcknowledged: boolean;
  /** Whether the modal is currently visible */
  isModalVisible: boolean;
}

/**
 * Hook for managing fair play acknowledgement
 *
 * @example
 * ```tsx
 * function CompetitionJoinButton({ competitionId }) {
 *   const { checkFairPlay, FairPlayModal } = useFairPlay();
 *
 *   const handleJoin = async () => {
 *     // This will show the modal if user hasn't acknowledged
 *     const canProceed = await checkFairPlay();
 *     if (!canProceed) return;
 *
 *     // Proceed with joining
 *     await joinCompetition(competitionId);
 *   };
 *
 *   return (
 *     <>
 *       <Button onPress={handleJoin} title="Join Competition" />
 *       <FairPlayModal />
 *     </>
 *   );
 * }
 * ```
 */
export function useFairPlay(): UseFairPlayReturn {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const user = useAuthStore((s) => s.user);

  // Check if user has acknowledged fair play
  const checkUserAcknowledgement = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('fair_play_acknowledged')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('[useFairPlay] Error checking acknowledgement:', error);
        return false;
      }

      return profile?.fair_play_acknowledged === true;
    } catch (error) {
      console.error('[useFairPlay] Error:', error);
      return false;
    }
  }, [user?.id]);

  // Acknowledge fair play in database
  const acknowledgeFairPlay = useCallback(async (): Promise<void> => {
    if (!user?.id) throw new Error('User not logged in');

    const { error } = await supabase
      .from('profiles')
      .update({
        fair_play_acknowledged: true,
        fair_play_acknowledged_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      console.error('[useFairPlay] Error acknowledging fair play:', error);
      throw error;
    }

    setHasAcknowledged(true);
  }, [user?.id]);

  // Check fair play - shows modal if needed, returns true if can proceed
  const checkFairPlay = useCallback(async (): Promise<boolean> => {
    // First check if already acknowledged
    const alreadyAcknowledged = await checkUserAcknowledgement();

    if (alreadyAcknowledged) {
      setHasAcknowledged(true);
      return true;
    }

    // Show modal and wait for user response
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setIsModalVisible(true);
    });
  }, [checkUserAcknowledgement]);

  // Handle modal close (user cancelled)
  const handleModalClose = useCallback(() => {
    setIsModalVisible(false);
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  // Handle modal accept (user agreed)
  const handleModalAccept = useCallback(async () => {
    await acknowledgeFairPlay();
    setIsModalVisible(false);
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
  }, [acknowledgeFairPlay]);

  // Modal component
  const FairPlayModal: React.FC = useCallback(() => {
    return (
      <FairPlayReminderModal
        visible={isModalVisible}
        onClose={handleModalClose}
        onAccept={handleModalAccept}
      />
    );
  }, [isModalVisible, handleModalClose, handleModalAccept]);

  return {
    checkFairPlay,
    FairPlayModal,
    hasAcknowledged,
    isModalVisible,
  };
}
