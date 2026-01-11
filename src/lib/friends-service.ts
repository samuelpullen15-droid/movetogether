import { supabase, isSupabaseConfigured } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import { Friend } from './competition-types';

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

/**
 * Get all friends for a user (accepted friendships only)
 */
export async function getUserFriends(userId: string): Promise<FriendWithProfile[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    // Get all accepted friendships where user is either user_id or friend_id
    const { data: friendships, error } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id, status')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (error) {
      console.error('Error fetching friends:', error);
      return [];
    }

    if (!friendships || friendships.length === 0) {
      return [];
    }

    // Extract friend IDs (opposite of current user)
    const friendIds = friendships.map((f) =>
      f.user_id === userId ? f.friend_id : f.user_id
    );

    // Fetch friend profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', friendIds);

    if (profilesError || !profiles) {
      console.error('Error fetching friend profiles:', profilesError);
      return [];
    }

    // Map to Friend format
    return profiles.map((profile) => {
      const friendship = friendships.find(
        (f) => (f.user_id === userId ? f.friend_id : f.user_id) === profile.id
      );
      const displayName = profile.full_name || profile.username || 'User';
      return {
        id: profile.id,
        name: displayName,
        avatar: getAvatarUrl(profile.avatar_url, displayName, profile.username || ''),
        username: profile.username ? `@${profile.username}` : '',
        status: friendship?.status as 'accepted',
        friendshipId: friendship?.id,
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

  try {
    const { data, error } = await supabase.rpc('create_friendship', {
      user_id_param: userId,
      friend_id_param: friendId,
    });

    if (error) {
      console.error('Error sending friend request:', error);
      return { success: false, error: error.message };
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
    const { data, error } = await supabase.rpc('accept_friendship', {
      user_id_param: userId,
      friend_id_param: friendId,
    });

    if (error) {
      console.error('Error accepting friend request:', error);
      return { success: false, error: error.message };
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
    const { data, error } = await supabase.rpc('remove_friendship', {
      user_id_param: userId,
      friend_id_param: friendId,
    });

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
 * Get pending friend requests (requests sent TO the current user)
 */
export async function getPendingFriendRequests(userId: string): Promise<FriendWithProfile[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    // Get pending friendships where current user is the friend_id (recipient)
    const { data: friendships, error } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id, status')
      .eq('friend_id', userId)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching pending requests:', error);
      return [];
    }

    if (!friendships || friendships.length === 0) {
      return [];
    }

    // Extract requester IDs (user_id is the one who sent the request)
    const requesterIds = friendships.map((f) => f.user_id);

    // Fetch requester profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', requesterIds);

    if (profilesError || !profiles) {
      console.error('Error fetching requester profiles:', profilesError);
      return [];
    }

    // Map to Friend format
    return profiles.map((profile) => {
      const friendship = friendships.find((f) => f.user_id === profile.id);
      const displayName = profile.full_name || profile.username || 'User';
      return {
        id: profile.id,
        name: displayName,
        avatar: getAvatarUrl(profile.avatar_url, displayName, profile.username || ''),
        username: profile.username ? `@${profile.username}` : '',
        status: 'pending' as const,
        friendshipId: friendship?.id,
      };
    });
  } catch (error) {
    console.error('Error in getPendingFriendRequests:', error);
    return [];
  }
}

/**
 * Get sent friend requests (requests sent BY the current user)
 */
export async function getSentFriendRequests(userId: string): Promise<FriendWithProfile[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    // Get pending friendships where current user is the user_id (sender)
    const { data: friendships, error } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id, status')
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching sent requests:', error);
      return [];
    }

    if (!friendships || friendships.length === 0) {
      return [];
    }

    // Extract recipient IDs (friend_id is the one who received the request)
    const recipientIds = friendships.map((f) => f.friend_id);

    // Fetch recipient profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', recipientIds);

    if (profilesError || !profiles) {
      console.error('Error fetching recipient profiles:', profilesError);
      return [];
    }

    // Map to Friend format
    return profiles.map((profile) => {
      const friendship = friendships.find((f) => f.friend_id === profile.id);
      const displayName = profile.full_name || profile.username || 'User';
      return {
        id: profile.id,
        name: displayName,
        avatar: getAvatarUrl(profile.avatar_url, displayName, profile.username || ''),
        username: profile.username ? `@${profile.username}` : '',
        status: 'pending' as const,
        friendshipId: friendship?.id,
      };
    });
  } catch (error) {
    console.error('Error in getSentFriendRequests:', error);
    return [];
  }
}

/**
 * Check if two users are friends
 */
export async function areFriends(userId: string, friendId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase || userId === friendId) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('friendships')
      .select('id')
      .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)
      .eq('status', 'accepted')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error checking friendship:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error in areFriends:', error);
    return false;
  }
}
