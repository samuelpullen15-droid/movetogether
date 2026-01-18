import { supabase, isSupabaseConfigured } from './supabase';

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
  userId: string, 
  phoneNumber: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    const { error } = await supabase
      .from('profiles')
      .update({ 
        phone_number: normalized,
        phone_verified: true,
        phone_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Error saving verified phone number:', error);
      return { success: false, error: error.message };
    }

    console.log('[Phone Verification] Phone verified and saved for user:', userId);
    return { success: true };
  } catch (error) {
    console.error('Error in saveVerifiedPhoneToProfile:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save phone number' };
  }
}

/**
 * Save phone number to profile WITHOUT marking as verified
 * Use this only for storing the number before verification
 * @deprecated Use saveVerifiedPhoneToProfile after verification instead
 */
export async function savePhoneNumberToProfile(
  userId: string, 
  phoneNumber: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    
    const { error } = await supabase
      .from('profiles')
      .update({ 
        phone_number: normalized,
        // NOTE: Not setting phone_verified here - phone is NOT verified yet
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

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
 * Check if user's phone is verified (server-side check)
 * Use this before allowing access to contacts feature
 */
export async function isPhoneVerified(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('phone_verified')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.phone_verified === true;
  } catch (error) {
    console.error('Error checking phone verification status:', error);
    return false;
  }
}

/**
 * Revoke phone verification (e.g., when user changes their number)
 */
export async function revokePhoneVerification(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ 
        phone_number: null,
        phone_verified: false,
        phone_verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

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
