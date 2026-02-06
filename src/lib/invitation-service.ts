// Per security rules: Uses Edge Functions instead of direct RPC calls
import { supabase, isSupabaseConfigured } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import type { Competition } from './fitness-store';
import { invitationApi, notificationApi, challengesApi } from './edge-functions';

// Helper to send notifications
async function sendNotification(
  type: string,
  recipientUserId: string,
  data: Record<string, any>,
  senderUserId?: string
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  await notificationApi.send(type, recipientUserId, data, senderUserId);
}

export interface CompetitionInvitation {
  id: string;
  competitionId: string;
  competition: Competition | null;
  inviterId: string;
  inviterName: string;
  inviterAvatar: string;
  status: 'pending' | 'accepted' | 'declined';
  invitedAt: string;
  respondedAt?: string;
}

/**
 * Fetch all pending invitations for the current user
 */
export async function fetchPendingInvitations(_userId: string): Promise<CompetitionInvitation[]> {
  try {
    // Per security rules: Use Edge Function instead of direct RPC
    const { data: invitations, error } = await invitationApi.getMyInvitations();

    if (error) {
      console.error('[fetchPendingInvitations] Error fetching invitations:', error);
      return [];
    }

    if (!invitations || invitations.length === 0) {
      console.log('[fetchPendingInvitations] No pending invitations found');
      return [];
    }

    console.log('[fetchPendingInvitations] Raw invitations from Edge Function:', JSON.stringify(invitations, null, 2));

    // Transform to CompetitionInvitation format
    // Edge Function returns nested objects: inviter (profile) and competitions (competition data)
    const result = invitations.map((inv: any) => {
      // Access nested inviter object
      const inviterProfile = inv.inviter || {};
      const firstName = inviterProfile.full_name?.split(' ')[0] || inviterProfile.username || 'User';

      // Access nested competitions object (note: Edge Function uses plural key name)
      const competition = inv.competitions || {};

      console.log('[fetchPendingInvitations] Mapping invitation:', {
        invId: inv.id,
        competitionId: inv.competition_id,
        inviterName: firstName,
        competitionName: competition.name,
      });

      return {
        id: inv.id,
        competitionId: inv.competition_id,
        competition: {
          id: inv.competition_id,
          name: competition.name || 'Unnamed Competition',
          description: competition.description || '',
          startDate: competition.start_date,
          endDate: competition.end_date,
          type: competition.type,
          status: competition.status,
          scoringType: competition.scoring_type || 'ring_close',
          participants: [], // Will be populated if needed
          creatorId: '', // Not returned by Edge Function
        },
        inviterId: inv.inviter_id,
        inviterName: firstName,
        inviterAvatar: getAvatarUrl(inviterProfile.avatar_url, firstName, inviterProfile.username),
        status: inv.status as 'pending' | 'accepted' | 'declined',
        invitedAt: inv.invited_at,
        respondedAt: undefined,
      };
    });

    console.log('[fetchPendingInvitations] Returning', result.length, 'invitations with IDs:', result.map((i: any) => i.id));
    return result;
  } catch (error) {
    console.error('[fetchPendingInvitations] Error:', error);
    return [];
  }
}

/**
 * Accept a competition invitation
 */
export async function acceptInvitation(invitationId: string): Promise<{
  success: boolean;
  error?: string;
  competitionId?: string;
  requiresBuyIn?: boolean;
  buyInAmount?: number;
  invitationId?: string;
}> {
  try {
    console.log('[acceptInvitation] Starting for invitationId:', invitationId);

    // Per security rules: Use Edge Function instead of direct RPC
    const { data: competitionIdData, error: lookupError } = await invitationApi.getInvitationCompetitionId(invitationId);

    if (lookupError) {
      console.error('[acceptInvitation] Error looking up invitation:', lookupError);
      return { success: false, error: `Failed to find invitation: ${lookupError.message}` };
    }

    if (!competitionIdData) {
      console.error('[acceptInvitation] No competition ID found for invitation:', invitationId);
      return { success: false, error: 'Invitation not found or may have expired' };
    }

    console.log('[acceptInvitation] Found competition ID:', competitionIdData);

    const { data, error } = await invitationApi.acceptCompetitionInvitation(invitationId);

    if (error) {
      console.error('[acceptInvitation] Error accepting invitation:', error);
      return { success: false, error: error.message };
    }

    // Check if competition requires buy-in payment
    if ((data as any)?.requires_buy_in) {
      return {
        success: false,
        requiresBuyIn: true,
        buyInAmount: (data as any).buy_in_amount,
        competitionId: (data as any).competition_id,
        invitationId,
      };
    }

    // Check if the Edge Function actually succeeded
    if ((data as any)?.success === false) {
      const errorMessage = (data as any)?.error || 'Failed to accept invitation';
      console.error('[acceptInvitation] Edge function returned failure:', errorMessage);
      return { success: false, error: errorMessage };
    }

    console.log('[acceptInvitation] Success! Competition ID:', (data as any)?.competition_id || competitionIdData);

    // Track competition_participation challenge progress
    try {
      const { data: challengeResult } = await challengesApi.updateProgress('competition_participation', 1);
      if (challengeResult?.some(c => c.just_completed)) {
        console.log('[acceptInvitation] Challenge completed: competition_participation');
      }
    } catch (e) {
      console.error('[acceptInvitation] Failed to update competition_participation challenge:', e);
    }

    return {
      success: true,
      competitionId: (data as any)?.competition_id || competitionIdData,
    };
  } catch (error: any) {
    console.error('[acceptInvitation] Unexpected error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Accept a competition invitation without paying the buy-in (not prize eligible)
 */
export async function acceptInvitationWithoutBuyIn(invitationId: string): Promise<{
  success: boolean;
  error?: string;
  competitionId?: string;
}> {
  try {
    console.log('[acceptInvitationWithoutBuyIn] Starting for invitationId:', invitationId);

    const { data, error } = await invitationApi.acceptCompetitionInvitation(invitationId, true);

    if (error) {
      console.error('[acceptInvitationWithoutBuyIn] Error:', error);
      return { success: false, error: error.message };
    }

    if ((data as any)?.success === false) {
      return { success: false, error: (data as any)?.error || 'Failed to accept invitation' };
    }

    // Track competition_participation challenge progress
    try {
      const { data: challengeResult } = await challengesApi.updateProgress('competition_participation', 1);
      if (challengeResult?.some(c => c.just_completed)) {
        console.log('[acceptInvitationWithoutBuyIn] Challenge completed: competition_participation');
      }
    } catch (e) {
      console.error('[acceptInvitationWithoutBuyIn] Failed to update competition_participation challenge:', e);
    }

    return {
      success: true,
      competitionId: (data as any)?.competition_id,
    };
  } catch (error: any) {
    console.error('[acceptInvitationWithoutBuyIn] Unexpected error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Decline a competition invitation
 */
export async function declineInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Per security rules: Use Edge Function instead of direct RPC
    const { error } = await invitationApi.declineCompetitionInvitation(invitationId);

    if (error) {
      console.error('Error declining invitation:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in declineInvitation:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Create invitations for a competition (replaces direct participant addition)
 */
export async function createCompetitionInvitations(
  competitionId: string,
  inviterId: string,
  inviteeIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!inviteeIds || inviteeIds.length === 0) {
      return { success: true };
    }

    // Per security rules: Use Edge Function instead of direct table access
    // The Edge Function handles filtering out self, checking existing invitations, and creating new ones
    const { data, error } = await invitationApi.createInvitations(competitionId, inviteeIds);

    if (error) {
      console.error('Error creating invitations:', error);
      return { success: false, error: error.message };
    }

    // Send notifications to new invitees if any were created
    if (data && data.created > 0 && data.invitee_ids) {
      try {
        // Per security rules: Use Edge Functions instead of direct table access
        const [competitionNameResult, inviterResult] = await Promise.all([
          invitationApi.getCompetitionName(competitionId),
          invitationApi.getInviterInfo(inviterId),
        ]);

        const competitionName = competitionNameResult.data || 'a competition';
        const inviterData = inviterResult.data as any;
        const inviterName = inviterData?.full_name?.split(' ')[0] || inviterData?.username || 'Someone';

        // Send notification to each new invitee
        await Promise.all(
          data.invitee_ids.map(inviteeId =>
            sendNotification('competition_invite', inviteeId, {
              competitionId,
              competitionName,
              inviterId,
              inviterName,
            }, inviterId)
          )
        );
      } catch (notificationError) {
        // Don't fail the invitation creation if notifications fail
        console.error('Failed to send competition invite notifications:', notificationError);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in createCompetitionInvitations:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
