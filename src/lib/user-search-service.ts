import { supabase, isSupabaseConfigured } from './supabase';
import { Friend } from './competition-types';
import { normalizePhoneNumber } from './phone-verification-service';

export interface SearchUserResult {
  id: string;
  name: string;
  avatar: string;
  username: string;
  email?: string | null;
}

/**
 * Search for users by username
 */
export async function searchUsersByUsername(query: string): Promise<SearchUserResult[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    // Remove @ if user included it
    const cleanQuery = query.trim().replace(/^@/, '').toLowerCase();

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, email, phone_number')
      .ilike('username', `%${cleanQuery}%`)
      .limit(20);

    if (error) {
      console.error('Error searching users by username:', error);
      return [];
    }

    return (data || []).map((profile) => ({
      id: profile.id,
      name: profile.full_name || profile.username || 'User',
      avatar: profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
      username: profile.username || '',
      email: profile.email,
    }));
  } catch (error) {
    console.error('Error in searchUsersByUsername:', error);
    return [];
  }
}

/**
 * Find users from a list of emails/phone numbers (from contacts)
 */
export async function findUsersFromContacts(
  emails: string[],
  phoneNumbers: string[]
): Promise<SearchUserResult[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  if (emails.length === 0 && phoneNumbers.length === 0) {
    return [];
  }

  try {
    const results: SearchUserResult[] = [];

    // Search by emails
    if (emails.length > 0) {
      const normalizedEmails = emails.map(e => e.toLowerCase().trim());

      const { data: emailData, error: emailError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, email, phone_number')
        .in('email', normalizedEmails)
        .limit(50);

      if (!emailError && emailData) {
        results.push(...emailData.map((profile) => ({
          id: profile.id,
          name: profile.full_name || profile.username || 'User',
          avatar: profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
          username: profile.username || '',
          email: profile.email,
        })));
      }
    }

    // Search by phone numbers
    if (phoneNumbers.length > 0) {
      // Normalize all phone numbers
      const normalizedPhones = phoneNumbers.map(normalizePhoneNumber);

      const { data: phoneData, error: phoneError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, email, phone_number')
        .in('phone_number', normalizedPhones)
        .limit(50);

      if (!phoneError && phoneData) {
        // Add phone matches, avoiding duplicates
        const existingIds = new Set(results.map(r => r.id));
        phoneData.forEach((profile) => {
          if (!existingIds.has(profile.id)) {
            results.push({
              id: profile.id,
              name: profile.full_name || profile.username || 'User',
              avatar: profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
              username: profile.username || '',
              email: profile.email,
            });
          }
        });
      }
    }

    return results;
  } catch (err) {
    console.error('Error in findUsersFromContacts:', err);
    return [];
  }
}

/**
 * Search users by phone number
 */
export async function searchUsersByPhoneNumber(query: string): Promise<SearchUserResult[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  if (!query || query.trim().length < 3) {
    return [];
  }

  try {
    const normalized = normalizePhoneNumber(query.trim());

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, email, phone_number')
      .ilike('phone_number', `%${normalized}%`)
      .limit(20);

    if (error) {
      console.error('Error searching users by phone:', error);
      return [];
    }

    return (data || []).map((profile) => ({
      id: profile.id,
      name: profile.full_name || profile.username || 'User',
      avatar: profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
      username: profile.username || '',
      email: profile.email,
    }));
  } catch (error) {
    console.error('Error in searchUsersByPhoneNumber:', error);
    return [];
  }
}

/**
 * Convert SearchUserResult to Friend format
 */
export function searchResultToFriend(result: SearchUserResult): Friend {
  return {
    id: result.id,
    name: result.name,
    avatar: result.avatar,
    username: result.username ? `@${result.username}` : '',
  };
}
