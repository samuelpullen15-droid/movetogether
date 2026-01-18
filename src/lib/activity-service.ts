// activity-service.ts - Service for fetching and creating activity feed items

import { supabase } from './supabase';

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
  // Fetch activity feed items
  const { data: feedData, error: feedError } = await supabase
    .from('activity_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (feedError) throw feedError;
  if (!feedData || feedData.length === 0) return [];

  // Fetch user profiles separately (no foreign key relationship)
  const userIds = [...new Set(feedData.map(item => item.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .in('id', userIds);
  
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  
  // Fetch reactions separately
  const activityIds = feedData.map(item => item.id);
  const { data: reactions } = await supabase
    .from('activity_reactions')
    .select('id, activity_id, user_id, reaction_type, comment, created_at')
    .in('activity_id', activityIds);
  
  const reactionsMap = new Map<string, any[]>();
  (reactions || []).forEach(r => {
    if (!reactionsMap.has(r.activity_id)) {
      reactionsMap.set(r.activity_id, []);
    }
    reactionsMap.get(r.activity_id)!.push(r);
  });
  
  // Process reaction counts and check user's reaction
  const { data: { user } } = await supabase.auth.getUser();
  
  return feedData.map((item: any) => {
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

  const { error } = await supabase
    .from('activity_reactions')
    .upsert({
      activity_id: activityId,
      user_id: user.id,
      reaction_type: reactionType,
    }, {
      onConflict: 'activity_id,user_id,reaction_type',
    });

  if (error) throw error;

  // Send notification to the activity owner
  try {
    // Get the activity to find the owner
    const { data: activity } = await supabase
      .from('activity_feed')
      .select('user_id')
      .eq('id', activityId)
      .single();
    
    // Don't notify if reacting to own post
    if (activity && activity.user_id !== user.id) {
      // Get reactor's name
      const { data: reactorProfile } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', user.id)
        .single();
      
      const reactorName = reactorProfile?.full_name || reactorProfile?.username || 'Someone';
      
      await sendNotification('activity_reaction', activity.user_id, {
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
export async function removeReaction(activityId: string, reactionType: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('activity_reactions')
    .delete()
    .eq('activity_id', activityId)
    .eq('user_id', user.id)
    .eq('reaction_type', reactionType);

  if (error) throw error;
}

// Add a comment to an activity
export async function addComment(activityId: string, comment: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('activity_reactions')
    .insert({
      activity_id: activityId,
      user_id: user.id,
      comment,
    });

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