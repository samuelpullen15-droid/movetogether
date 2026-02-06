import { supabase, isSupabaseConfigured } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import { Friend } from './competition-types';
import { friendsApi, profileApi, notificationApi } from './edge-functions';

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: string;
  updatedAt: string;
}

export interface FriendWithProfile extends Friend {
  status?: 'pending' | 'accepted';
  friendshipId?: string;
}

async function sendNotification(
  type: string,
  recipientUserId: string,
  data: Record<string, any>,
  senderUserId?: string
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  await notificationApi.send(type, recipientUserId, data, senderUserId);
}

/**
 * Get all friends for a user (accepted friendships only)
 * Per security rules: Uses RPC function instead of direct table access
 */
export async function getUserFriends(userId: string): Promise<FriendWithProfile[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    // Use Edge Function instead of direct RPC
    const { data: friends, error } = await friendsApi.getMyFriends();

    if (error) {
      console.error('Error fetching friends:', error);
      return [];
    }

    if (!friends || friends.length === 0) {
      return [];
    }

    // Map to Friend format (Edge Function returns different field names)
    return friends.map((f: any) => {
      const displayName = f.full_name || 'User';
      return {
        id: f.friend_id,
        name: displayName,
        avatar: getAvatarUrl(f.avatar_url, displayName, f.username || ''),
        username: f.username ? `@${f.username}` : '',
        subscriptionTier: f.subscription_tier as 'starter' | 'mover' | 'crusher' | null,
        status: 'accepted' as const,
        friendshipId: f.friendship_id,
        lastActiveDate: f.last_seen_at || undefined, // Full ISO timestamp for active status
      };
    });
  } catch (error) {
    console.error('Error in getUserFriends:', error);
    return [];
  }
}

/**
 * Send a friend request
 */
export async function sendFriendRequest(userId: string, friendId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Database not configured' };
  }

  if (userId === friendId) {
    return { success: false, error: 'Cannot add yourself as a friend' };
  }

  // Check rate limit: 30 friend requests per day
  const { checkRateLimit, RATE_LIMITS } = await import('./rate-limit-service');
  const rateLimit = await checkRateLimit(
    userId,
    'send-friend-request',
    RATE_LIMITS.FRIEND_REQUEST.limit,
    RATE_LIMITS.FRIEND_REQUEST.windowMinutes
  );

  if (!rateLimit.allowed) {
    return { 
      success: false, 
      error: rateLimit.error || 'Rate limit exceeded. Please try again later.' 
    };
  }

  try {
    // Use Edge Function instead of direct RPC
    const { data, error } = await friendsApi.createFriendship(friendId);

    if (error) {
      console.error('Error sending friend request:', error);
      return { success: false, error: error.message };
    }

    // Send notification to the recipient
    // Per security rules: Use Edge Function for profile access
    try {
      const { data: senderProfile } = await profileApi.getMyProfile();

      const senderName = senderProfile?.full_name || senderProfile?.username || 'Someone';

      await sendNotification('friend_request_received', friendId, {
        senderId: userId,
        senderName,
      }, userId);
    } catch (e) {
      console.error('Failed to send friend request notification:', e);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in sendFriendRequest:', error);
    return { success: false, error: error.message || 'Failed to send friend request' };
  }
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(userId: string, friendId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Use Edge Function instead of direct RPC
    const { data, error } = await friendsApi.acceptFriendship({ friendId });

    if (error) {
      console.error('Error accepting friend request:', error);
      return { success: false, error: error.message };
    }

    // Send notification to the original requester (friendId sent the request to userId)
    // Per security rules: Use Edge Function for profile access
    try {
      const { data: accepterProfile } = await profileApi.getMyProfile();

      const friendName = accepterProfile?.full_name || accepterProfile?.username || 'Someone';

      await sendNotification('friend_request_accepted', friendId, {
        friendId: userId,
        friendName,
      }, userId);
    } catch (e) {
      console.error('Failed to send friend accepted notification:', e);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in acceptFriendRequest:', error);
    return { success: false, error: error.message || 'Failed to accept friend request' };
  }
}

/**
 * Remove a friendship (unfriend)
 */
export async function removeFriend(userId: string, friendId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Use Edge Function instead of direct RPC
    const { data, error } = await friendsApi.removeFriendship({ friendId });

    if (error) {
      console.error('Error removing friend:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in removeFriend:', error);
    return { success: false, error: error.message || 'Failed to remove friend' };
  }
}

/**
 * Block a user. Removes any existing friendship and creates a block record.
 * Per security rules: Uses Edge Function instead of direct table access
 */
export async function blockUser(userId: string, blockedUserId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data, error } = await friendsApi.blockUser(blockedUserId);

    if (error) {
      console.error('Error blocking user:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in blockUser:', error);
    return { success: false, error: error.message || 'Failed to block user' };
  }
}

/**
 * Get pending friend requests (requests sent TO the current user)
 * Per security rules: Uses Edge Function instead of direct table access
 */
export async function getPendingFriendRequests(userId: string): Promise<FriendWithProfile[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    // Use Edge Function instead of direct RPC
    const { data: requests, error } = await friendsApi.getPendingFriendRequests();

    if (error) {
      console.error('Error fetching pending requests:', error);
      return [];
    }

    if (!requests || requests.length === 0) {
      return [];
    }

    // Map to Friend format (Edge Function returns different field names)
    return requests.map((r: any) => {
      const displayName = r.full_name || 'User';
      return {
        id: r.sender_id,
        name: displayName,
        avatar: getAvatarUrl(r.avatar_url, displayName, r.username || ''),
        username: r.username ? `@${r.username}` : '',
        status: 'pending' as const,
        friendshipId: r.request_id,
      };
    });
  } catch (error) {
    console.error('Error in getPendingFriendRequests:', error);
    return [];
  }
}

/**
 * Get sent friend requests (requests sent BY the current user)
 * Per security rules: Uses Edge Function instead of direct table access
 */
export async function getSentFriendRequests(userId: string): Promise<FriendWithProfile[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    // Use Edge Function instead of direct RPC
    const { data: requests, error } = await friendsApi.getSentFriendRequests();

    if (error) {
      console.error('Error fetching sent requests:', error);
      return [];
    }

    if (!requests || requests.length === 0) {
      return [];
    }

    // Map to Friend format (Edge Function returns different field names)
    return requests.map((r: any) => {
      const displayName = r.full_name || 'User';
      return {
        id: r.recipient_id,
        name: displayName,
        avatar: getAvatarUrl(r.avatar_url, displayName, r.username || ''),
        username: r.username ? `@${r.username}` : '',
        status: 'pending' as const,
        friendshipId: r.request_id,
      };
    });
  } catch (error) {
    console.error('Error in getSentFriendRequests:', error);
    return [];
  }
}

/**
 * Check if two users are friends
 * Per security rules: Uses Edge Function instead of direct table access
 */
export async function areFriends(userId: string, friendId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase || userId === friendId) {
    return false;
  }

  try {
    // Use Edge Function instead of direct RPC
    const { data, error } = await friendsApi.checkAreFriends(friendId);

    if (error) {
      console.error('Error checking friendship:', error);
      return false;
    }

    return data?.are_friends ?? false;
  } catch (error) {
    console.error('Error in areFriends:', error);
    return false;
  }
}
