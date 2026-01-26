// Per security rules: Uses Edge Functions instead of direct RPC calls
import { supabase, isSupabaseConfigured } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import type { Competition } from './fitness-store';
import { invitationApi } from './edge-functions';

// Helper to send notifications
async function sendNotification(
  type: string,
  recipientUserId: string,
  data: Record<string, any>
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase.functions.invoke('send-notification', {
      body: { type, recipientUserId, data },
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
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
      console.error('Error fetching invitations:', error);
      return [];
    }

    if (!invitations || invitations.length === 0) {
      return [];
    }

    // Transform to CompetitionInvitation format (RPC returns flat structure)
    return invitations.map((inv: any) => {
      const firstName = inv.inviter_full_name?.split(' ')[0] || inv.inviter_username || 'User';

      return {
        id: inv.invitation_id,
        competitionId: inv.competition_id,
        competition: {
          id: inv.competition_id,
          name: inv.competition_name,
          description: inv.competition_description || '',
          startDate: inv.competition_start_date,
          endDate: inv.competition_end_date,
          type: inv.competition_type,
          status: inv.competition_status,
          scoringType: inv.competition_scoring_type || 'ring_close',
          participants: [], // Will be populated if needed
          creatorId: '', // Not returned by RPC
        },
        inviterId: inv.inviter_id,
        inviterName: firstName,
        inviterAvatar: getAvatarUrl(inv.inviter_avatar_url, firstName, inv.inviter_username),
        status: inv.status as 'pending' | 'accepted' | 'declined',
        invitedAt: inv.invited_at,
        respondedAt: undefined,
      };
    });
  } catch (error) {
    console.error('Error in fetchPendingInvitations:', error);
    return [];
  }
}

/**
 * Accept a competition invitation
 */
export async function acceptInvitation(invitationId: string): Promise<{ success: boolean; error?: string; competitionId?: string }> {
  try {
    // Per security rules: Use Edge Function instead of direct RPC
    const { data: competitionIdData } = await invitationApi.getInvitationCompetitionId(invitationId);

    if (!competitionIdData) {
      return { success: false, error: 'Invitation not found' };
    }

    const { data, error } = await invitationApi.acceptCompetitionInvitation(invitationId);

    if (error) {
      console.error('Error accepting invitation:', error);
      return { success: false, error: error.message };
    }

    // Check if the Edge Function actually succeeded
    if ((data as any)?.success === false) {
      return { success: false, error: 'Failed to accept invitation' };
    }

    return {
      success: true,
      competitionId: (data as any)?.competition_id || competitionIdData,
    };
  } catch (error: any) {
    console.error('Error in acceptInvitation:', error);
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
            })
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
