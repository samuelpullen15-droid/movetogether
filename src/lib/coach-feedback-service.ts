import { Mixpanel } from 'mixpanel-react-native';

export type FeedbackType = 'thumbs_up' | 'thumbs_down';

// Initialize Mixpanel - replace with your project token
const MIXPANEL_TOKEN = '201594b39e5250531424a93c1c2d1401';

let mixpanel: Mixpanel | null = null;

export async function initMixpanel() {
  if (!MIXPANEL_TOKEN) {
    console.log('[Mixpanel] No token configured, skipping initialization');
    return;
  }

  try {
    mixpanel = new Mixpanel(MIXPANEL_TOKEN, true);
    await mixpanel.init();
    console.log('[Mixpanel] Initialized successfully');
  } catch (err) {
    console.error('[Mixpanel] Failed to initialize:', err);
  }
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!mixpanel) return;

  mixpanel.identify(userId);
  if (properties) {
    mixpanel.getPeople().set(properties);
  }
}

export interface CoachFeedback {
  user_id: string;
  message_content: string;
  user_query: string;
  feedback_type: FeedbackType;
}

/**
 * Track coach feedback to Mixpanel
 */
export async function trackCoachFeedback(feedback: CoachFeedback): Promise<boolean> {
  if (!mixpanel) {
    console.log('[CoachFeedback] Mixpanel not initialized, skipping feedback tracking');
    return false;
  }

  try {
    mixpanel.track('Coach Feedback', {
      feedback_type: feedback.feedback_type,
      message_content: feedback.message_content.substring(0, 500), // Limit length
      user_query: feedback.user_query.substring(0, 500),
      is_positive: feedback.feedback_type === 'thumbs_up',
    });

    console.log('[CoachFeedback] Feedback tracked:', feedback.feedback_type);
    return true;
  } catch (err) {
    console.error('[CoachFeedback] Error tracking feedback:', err);
    return false;
  }
}

/**
 * Track general analytics events
 */
export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  if (!mixpanel) return;
  mixpanel.track(eventName, properties);
}

// AI Coach event tracking
export function trackLaunchAI() {
  if (!mixpanel) return;
  mixpanel.track('Launch AI');
}

export function trackAIPromptSent(promptText: string) {
  if (!mixpanel) return;
  mixpanel.track('AI Prompt Sent', {
    'Prompt Text': promptText.substring(0, 500),
  });
}

export function trackAIResponseSent(responseTimeMs?: number) {
  if (!mixpanel) return;
  mixpanel.track('AI Response Sent', {
    'API Response Time': responseTimeMs,
  });
}
