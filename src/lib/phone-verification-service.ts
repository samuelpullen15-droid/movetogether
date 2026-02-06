import { supabase, isSupabaseConfigured } from './supabase';
import { profileApi } from './edge-functions';

// Whitelisted test phone numbers (always bypass Supabase auth, use test code "123456")
const WHITELISTED_PHONE_NUMBERS = [
  '+14197440931',
];

const TEST_VERIFICATION_CODE = '123456';

/**
 * Check if a phone number is whitelisted for testing
 */
function isWhitelistedNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  return WHITELISTED_PHONE_NUMBERS.includes(normalized);
}

/**
 * Normalize phone number to E.164 format (removes all non-digits, adds + if needed)
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // If it starts with 1 and has 11 digits, it's US/Canada - keep as is
  // If it has 10 digits, assume US/Canada and add 1
  // Otherwise, assume it already has country code
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  } else if (digits.length > 0) {
    return `+${digits}`;
  }
  
  return phone;
}

/**
 * Send verification code to phone number using Supabase phone auth
 * Note: This uses signInWithOtp which is designed for phone-based login.
 * For existing authenticated users, we verify then link the phone to their profile.
 */
export async function sendPhoneVerificationCode(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const normalized = normalizePhoneNumber(phoneNumber);

    // Whitelisted numbers bypass Supabase auth - always succeed
    if (isWhitelistedNumber(normalized)) {
      console.log('[Phone Verification] Whitelisted number detected, bypassing Supabase auth');
      return { success: true };
    }

    // Check if user is already authenticated
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      // User is already authenticated - use updateUser to add phone
      // This will send a verification code
      const { error } = await supabase.auth.updateUser({
        phone: normalized,
      });

      if (error) {
        console.error('Error sending verification code:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } else {
      // No existing session - use signInWithOtp (for new users)
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalized,
      });

      if (error) {
        console.error('Error sending verification code:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    }
  } catch (error) {
    console.error('Error in sendPhoneVerificationCode:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send code' };
  }
}

/**
 * Verify phone number with code
 * Handles both new phone auth sessions and linking phone to existing user
 * IMPORTANT: Also updates profile with verified status
 */
export async function verifyPhoneCode(
  phoneNumber: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const normalized = normalizePhoneNumber(phoneNumber);

    // Whitelisted numbers use test code and bypass Supabase verification
    if (isWhitelistedNumber(normalized)) {
      if (code === TEST_VERIFICATION_CODE) {
        console.log('[Phone Verification] Whitelisted number verified with test code');

        // Still save to profile if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const saveResult = await saveVerifiedPhoneToProfile(session.user.id, normalized);
          if (!saveResult.success) {
            console.error('Warning: Phone verified but failed to update profile:', saveResult.error);
          }
        }

        return { success: true };
      } else {
        return { success: false, error: 'Invalid verification code' };
      }
    }

    // Check if user is already authenticated
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      // User is already authenticated - verify the phone update
      const { error } = await supabase.auth.verifyOtp({
        phone: normalized,
        token: code,
        type: 'phone_change', // Use phone_change for existing users
      });

      if (error) {
        // Try with 'sms' type as fallback
        const { error: fallbackError } = await supabase.auth.verifyOtp({
          phone: normalized,
          token: code,
          type: 'sms',
        });

        if (fallbackError) {
          console.error('Error verifying code:', fallbackError);
          return { success: false, error: fallbackError.message };
        }
      }

      // IMPORTANT: Save verified phone to profile with verification timestamp
      const saveResult = await saveVerifiedPhoneToProfile(session.user.id, normalized);
      if (!saveResult.success) {
        console.error('Warning: Phone verified but failed to update profile:', saveResult.error);
        // Still return success since verification worked
      }

      return { success: true };
    } else {
      // No existing session - verify as new phone login
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalized,
        token: code,
        type: 'sms',
      });

      if (error) {
        console.error('Error verifying code:', error);
        return { success: false, error: error.message };
      }

      // If we got a new session, update the profile
      if (data?.user) {
        const saveResult = await saveVerifiedPhoneToProfile(data.user.id, normalized);
        if (!saveResult.success) {
          console.error('Warning: Phone verified but failed to update profile:', saveResult.error);
        }
      }

      return { success: true };
    }
  } catch (error) {
    console.error('Error in verifyPhoneCode:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to verify code' };
  }
}

/**
 * Save verified phone number to user profile with verification timestamp
 * This marks the phone as VERIFIED (not just saved)
 */
export async function saveVerifiedPhoneToProfile(
  _userId: string,
  phoneNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    const { error } = await profileApi.updatePhoneVerified(normalized);

    if (error) {
      console.error('Error saving verified phone number:', error);
      return { success: false, error: error.message };
    }

    console.log('[Phone Verification] Phone verified and saved via edge function');
    return { success: true };
  } catch (error) {
    console.error('Error in saveVerifiedPhoneToProfile:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save phone number' };
  }
}

/**
 * Save phone number to profile WITHOUT marking as verified
 * @deprecated Use saveVerifiedPhoneToProfile after verification instead
 */
export async function savePhoneNumberToProfile(
  _userId: string,
  phoneNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    const { error } = await profileApi.savePhoneNumber(normalized);

    if (error) {
      console.error('Error saving phone number:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in savePhoneNumberToProfile:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save phone number' };
  }
}

/**
 * Check if user's phone is verified
 */
export async function isPhoneVerified(_userId: string): Promise<boolean> {
  try {
    const { data, error } = await profileApi.getPhoneStatus();
    if (error || !data) return false;
    return data.phone_verified === true;
  } catch (error) {
    console.error('Error checking phone verification status:', error);
    return false;
  }
}

/**
 * Revoke phone verification (e.g., when user changes their number)
 */
export async function revokePhoneVerification(_userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await profileApi.revokePhone();

    if (error) {
      console.error('Error revoking phone verification:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in revokePhoneVerification:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to revoke verification' };
  }
}
