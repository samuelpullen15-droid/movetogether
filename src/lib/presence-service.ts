/**
 * Presence Service
 *
 * Manages real-time online status by sending heartbeats to update last_seen_at.
 * Provides utilities to determine if a user is online and format presence text.
 */

import { AppState, AppStateStatus } from 'react-native';
import { profileApi } from '@/lib/edge-functions';

// Configuration
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const ONLINE_THRESHOLD = 2 * 60 * 1000; // 2 minutes - users active within this window are "online"

// State
let heartbeatInterval: NodeJS.Timeout | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null =
  null;

/**
 * Send a heartbeat to update the user's last_seen_at timestamp
 */
function sendHeartbeat(): void {
  profileApi.updateLastSeen().catch((error) => {
    // Silently fail - we don't want to interrupt the user experience
    console.log('[Presence] Heartbeat failed:', error);
  });
}

/**
 * Handle app state changes (active, background, inactive)
 */
function handleAppState(state: AppStateStatus): void {
  if (state === 'active') {
    // App came to foreground - send immediate heartbeat and restart interval
    sendHeartbeat();
    if (!heartbeatInterval) {
      heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    }
  } else {
    // App went to background/inactive - stop heartbeat
    // The last_seen_at will naturally become stale, showing user as offline
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }
}

/**
 * Start the presence heartbeat system.
 * Call this when the user logs in.
 */
export function startPresence(): void {
  // Prevent duplicate subscriptions
  if (heartbeatInterval) {
    console.log('[Presence] Already running, skipping start');
    return;
  }

  console.log('[Presence] Starting heartbeat system');

  // Send initial heartbeat immediately
  sendHeartbeat();

  // Start periodic heartbeat
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

  // Listen for app state changes to pause/resume heartbeat
  appStateSubscription = AppState.addEventListener('change', handleAppState);
}

/**
 * Stop the presence heartbeat system.
 * Call this when the user logs out.
 */
export function stopPresence(): void {
  console.log('[Presence] Stopping heartbeat system');

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

/**
 * Check if a user is currently online based on their last_seen_at timestamp
 * @param lastSeenAt - ISO timestamp string or undefined
 * @returns true if user was active within ONLINE_THRESHOLD (2 minutes)
 */
export function isOnline(lastSeenAt: string | undefined | null): boolean {
  if (!lastSeenAt) return false;
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  return diffMs < ONLINE_THRESHOLD;
}

/**
 * Presence display info returned by formatPresenceTime
 */
export interface PresenceInfo {
  /** Whether the user is currently online */
  isOnline: boolean;
  /** Human-readable status text: "Online", "5m ago", "2h ago", "Yesterday", "3d ago" */
  text: string;
  /** Color for the status dot: green (#22C55E) for online, gray (#6B7280) for offline */
  dotColor: '#22C55E' | '#6B7280';
}

/**
 * Format a last_seen_at timestamp into human-readable presence info
 * @param lastSeenAt - ISO timestamp string or undefined
 * @returns PresenceInfo with isOnline, text, and dotColor
 */
export function formatPresenceTime(
  lastSeenAt: string | undefined | null
): PresenceInfo {
  // No data - show as offline
  if (!lastSeenAt) {
    return { isOnline: false, text: 'Offline', dotColor: '#6B7280' };
  }

  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  // Online: active within last 2 minutes
  if (diffMins < 2) {
    return { isOnline: true, text: 'Online', dotColor: '#22C55E' };
  }

  // Minutes ago (2-59 minutes)
  if (diffMins < 60) {
    return { isOnline: false, text: `${diffMins}m ago`, dotColor: '#6B7280' };
  }

  // Hours ago (1-23 hours)
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return { isOnline: false, text: `${diffHours}h ago`, dotColor: '#6B7280' };
  }

  // Days ago
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return { isOnline: false, text: 'Yesterday', dotColor: '#6B7280' };
  }

  return { isOnline: false, text: `${diffDays}d ago`, dotColor: '#6B7280' };
}
