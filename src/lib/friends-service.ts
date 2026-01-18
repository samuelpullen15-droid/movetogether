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

/**
 * Get all friends for a user (accepted friendships only)
 */
export async function getUserFriends(userId: string): Promise<FriendWithProfile[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    // OPTIMIZED: Run two simpler queries in parallel (better index usage than .or())
    // Each query uses a specific index (user_id or friend_id) which is faster than .or()
    const [result1, result2] = await Promise.all([
      // Query 1: Friendships where user is user_id (uses idx_friendships_user_id)
      supabase
        .from('friendships')
        .select('id, friend_id, status')
        .eq('user_id', userId)
        .eq('status', 'accepted'),
      // Query 2: Friendships where user is friend_id (uses idx_friendships_friend_id)
      supabase
        .from('friendships')
        .select('id, user_id, status')
        .eq('friend_id', userId)
        .eq('status', 'accepted')
    ]);
    
    const { data: friendshipsAsUser, error: error1 } = result1;
    const { data: friendshipsAsFriend, error: error2 } = result2;

    if (error1 || error2) {
      console.error('Error fetching friends:', error1 || error2);
      return [];
    }

    if ((!friendshipsAsUser || friendshipsAsUser.length === 0) && (!friendshipsAsFriend || friendshipsAsFriend.length === 0)) {
      return [];
    }

    // Extract friend IDs from both queries
    const friendIds: string[] = [];
    const friendshipMap = new Map<string, { id: string; status: string }>();
    
    if (friendshipsAsUser) {
      for (const f of friendshipsAsUser) {
        friendIds.push(f.friend_id);
        friendshipMap.set(f.friend_id, { id: f.id, status: f.status });
      }
    }
    
    if (friendshipsAsFriend) {
      for (const f of friendshipsAsFriend) {
        friendIds.push(f.user_id);
        friendshipMap.set(f.user_id, { id: f.id, status: f.status });
      }
    }

    // Fetch friend profiles in parallel
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', friendIds);

    if (profilesError || !profiles) {
      console.error('Error fetching friend profiles:', profilesError);
      return [];
    }

    // Map to Friend format
    const mappedFriends = profiles.map((profile) => {
      const friendship = friendshipMap.get(profile.id);
      const displayName = profile.full_name || profile.username || 'User';
      return {
        id: profile.id,
        name: displayName,
        avatar: getAvatarUrl(profile.avatar_url, displayName, profile.username || ''),
        username: profile.username ? `@${profile.username}` : '',
        status: (friendship?.status || 'accepted') as 'accepted',
        friendshipId: friendship?.id,
      };
    });
    
    return mappedFriends;
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
    const { data, error } = await supabase.rpc('create_friendship', {
      user_id_param: userId,
      friend_id_param: friendId,
    });

    if (error) {
      console.error('Error sending friend request:', error);
      return { success: false, error: error.message };
    }

    // Send notification to the recipient
    try {
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', userId)
        .single();
      
      const senderName = senderProfile?.full_name || senderProfile?.username || 'Someone';
      
      await sendNotification('friend_request_received', friendId, {
        senderId: userId,
        senderName,
      });
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
    const { data, error } = await supabase.rpc('accept_friendship', {
      user_id_param: userId,
      friend_id_param: friendId,
    });

    if (error) {
      console.error('Error accepting friend request:', error);
      return { success: false, error: error.message };
    }

    // Send notification to the original requester (friendId sent the request to userId)
    try {
      const { data: accepterProfile } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', userId)
        .single();
      
      const friendName = accepterProfile?.full_name || accepterProfile?.username || 'Someone';
      
      await sendNotification('friend_request_accepted', friendId, {
        friendId: userId,
        friendName,
      });
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
