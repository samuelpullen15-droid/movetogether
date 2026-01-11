import { supabase } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import type { Competition } from './fitness-store';

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
export async function fetchPendingInvitations(userId: string): Promise<CompetitionInvitation[]> {
  try {
    const { data: invitations, error } = await supabase
      .from('competition_invitations')
      .select(`
        *,
        competition:competition_id (
          id,
          name,
          description,
          start_date,
          end_date,
          type,
          status,
          scoring_type,
          creator_id
        ),
        inviter:inviter_id (
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('invitee_id', userId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false });

    if (error) {
      console.error('Error fetching invitations:', error);
      return [];
    }

    if (!invitations || invitations.length === 0) {
      return [];
    }

    // Transform to CompetitionInvitation format
    return invitations.map((inv: any) => {
      const inviter = inv.inviter || {};
      const firstName = inviter.full_name?.split(' ')[0] || inviter.username || 'User';
      
      return {
        id: inv.id,
        competitionId: inv.competition_id,
        competition: inv.competition ? {
          id: inv.competition.id,
          name: inv.competition.name,
          description: inv.competition.description || '',
          startDate: inv.competition.start_date,
          endDate: inv.competition.end_date,
          type: inv.competition.type,
          status: inv.competition.status,
          scoringType: inv.competition.scoring_type || 'ring_close',
          participants: [], // Will be populated if needed
          creatorId: inv.competition.creator_id,
        } : null,
        inviterId: inv.inviter_id,
        inviterName: firstName,
        inviterAvatar: getAvatarUrl(inviter.avatar_url, firstName, inviter.username),
        status: inv.status as 'pending' | 'accepted' | 'declined',
        invitedAt: inv.invited_at,
        respondedAt: inv.responded_at,
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
    // First, fetch the competition_id before accepting (in case the RPC doesn't return it)
    const { data: invitationData } = await supabase
      .from('competition_invitations')
      .select('competition_id')
      .eq('id', invitationId)
      .single();

    if (!invitationData) {
      return { success: false, error: 'Invitation not found' };
    }

    const { data, error } = await supabase.rpc('accept_competition_invitation', {
      p_invitation_id: invitationId,
    });

    if (error) {
      console.error('Error accepting invitation:', error);
      return { success: false, error: error.message };
    }

    // Check if the RPC actually succeeded (it returns BOOLEAN)
    if (data === false) {
      return { success: false, error: 'Failed to accept invitation' };
    }

    return { 
      success: true, 
      competitionId: invitationData.competition_id 
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
    const { data, error } = await supabase.rpc('decline_competition_invitation', {
      p_invitation_id: invitationId,
    });

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

    // Filter out creator and create invitation records
    const invitationRecords = inviteeIds
      .filter(id => id !== inviterId)
      .map(inviteeId => ({
        competition_id: competitionId,
        inviter_id: inviterId,
        invitee_id: inviteeId,
        status: 'pending',
      }));

    if (invitationRecords.length === 0) {
      return { success: true };
    }

    const { error } = await supabase
      .from('competition_invitations')
      .insert(invitationRecords);

    if (error) {
      console.error('Error creating invitations:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in createCompetitionInvitations:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
