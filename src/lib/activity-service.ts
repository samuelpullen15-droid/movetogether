// activity-service.ts - Service for fetching and creating activity feed items
// Per security rules: Uses Edge Functions instead of direct RPC calls

import { supabase } from './supabase';
import { activityApi, profileApi } from './edge-functions';

async function sendNotification(
  type: string,
  recipientUserId: string,
  data: Record<string, any>
): Promise<void> {
  try {
    await supabase.functions.invoke('send-notification', {
      body: { type, recipientUserId, data },
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

export type ActivityType = 
  | 'rings_closed'
  | 'workout_completed'
  | 'streak_milestone'
  | 'achievement_unlocked'
  | 'competition_won'
  | 'competition_joined'
  | 'personal_record';

export interface ActivityFeedItem {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  title: string;
  subtitle: string | null;
  metadata: Record<string, any>;
  created_at: string;
  // Joined data
  user?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
  };
  reactions?: ActivityReaction[];
  reaction_counts?: Record<string, number>;
  user_reaction?: string | null;
}

export interface ActivityReaction {
  id: string;
  activity_id: string;
  user_id: string;
  reaction_type: string | null;
  comment: string | null;
  created_at: string;
  user?: {
    username: string;
    avatar_url: string;
  };
}

export const REACTION_TYPES = ['🔥', '👏', '❤️', '💪', '🎉'] as const;

// Fetch activity feed for current user's friends
export async function fetchActivityFeed(limit = 50): Promise<ActivityFeedItem[]> {
  // Per security rules: Use Edge Function instead of direct table access
  const { data: feedData, error: feedError } = await activityApi.getActivityFeed(limit);

  if (feedError) throw feedError;
  if (!feedData || (feedData as any[]).length === 0) return [];

  // Only show specific activity types: workouts, rings closed, competition wins
  const allowedActivityTypes = ['workout_completed', 'rings_closed', 'competition_won'];
  const filteredFeedData = (feedData as any[]).filter((item: any) => {
    return allowedActivityTypes.includes(item.activity_type);
  });

  if (filteredFeedData.length === 0) return [];

  // Per security rules: Use Edge Function for profiles
  const userIds = [...new Set(filteredFeedData.map((item: any) => item.user_id))];
  const { data: profiles } = await activityApi.getActivityFeedProfiles(userIds as string[]);

  const profileMap = new Map((profiles as any[] || []).map((p: any) => [p.id, p]));

  // Per security rules: Use Edge Function for reactions
  const activityIds = filteredFeedData.map((item: any) => item.id);
  const { data: reactions } = await activityApi.getActivityFeedReactions(activityIds as string[]);
  
  const reactionsMap = new Map<string, any[]>();
  (reactions || []).forEach(r => {
    if (!reactionsMap.has(r.activity_id)) {
      reactionsMap.set(r.activity_id, []);
    }
    reactionsMap.get(r.activity_id)!.push(r);
  });
  
  // Process reaction counts and check user's reaction
  const { data: { user } } = await supabase.auth.getUser();
  
  return filteredFeedData.map((item: any) => {
    const itemReactions = reactionsMap.get(item.id) || [];
    const reactionCounts: Record<string, number> = {};
    let userReaction: string | null = null;

    itemReactions.forEach((r: ActivityReaction) => {
      if (r.reaction_type) {
        reactionCounts[r.reaction_type] = (reactionCounts[r.reaction_type] || 0) + 1;
        if (r.user_id === user?.id) {
          userReaction = r.reaction_type;
        }
      }
    });

    return {
      ...item,
      user: profileMap.get(item.user_id),
      reactions: itemReactions,
      reaction_counts: reactionCounts,
      user_reaction: userReaction,
    };
  });
}

// Add a reaction to an activity
export async function addReaction(activityId: string, reactionType: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Per security rules: Use Edge Function instead of direct RPC
  const { error } = await activityApi.addReaction(activityId, reactionType);

  if (error) throw error;

  // Send notification to the activity owner
  try {
    // Per security rules: Use Edge Function instead of direct table access
    const { data: activityOwnerId } = await activityApi.getActivityOwner(activityId);

    // Don't notify if reacting to own post
    if (activityOwnerId && activityOwnerId !== user.id) {
      // Per security rules: Use Edge Function for profile fetch
      const { data: reactorProfileData } = await profileApi.getUserProfile(user.id);
      const reactorProfile = Array.isArray(reactorProfileData) ? reactorProfileData[0] : reactorProfileData;

      const reactorName = reactorProfile?.full_name || reactorProfile?.username || 'Someone';

      await sendNotification('activity_reaction', activityOwnerId, {
        activityId,
        reactorId: user.id,
        reactorName,
        reaction: reactionType,
      });
    }
  } catch (e) {
    console.error('Failed to send reaction notification:', e);
  }
}

// Remove a reaction from an activity
export async function removeReaction(activityId: string, _reactionType: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Per security rules: Use Edge Function instead of direct RPC
  const { error } = await activityApi.removeReaction(activityId);

  if (error) throw error;
}

// Add a comment to an activity
export async function addComment(activityId: string, comment: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Per security rules: Use Edge Function instead of direct RPC
  const { error } = await activityApi.addComment(activityId, comment);

  if (error) throw error;
}

// Trigger activity creation (call from app when events happen)
export async function createActivity(
  userId: string,
  activityType: ActivityType,
  metadata?: Record<string, any>
): Promise<void> {
  const { error } = await supabase.functions.invoke('create-activity', {
    body: { userId, activityType, metadata },
  });

  if (error) throw error;
}