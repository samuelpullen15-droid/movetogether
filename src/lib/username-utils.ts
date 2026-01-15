import { Filter } from 'bad-words';

// Initialize the filter
const filter = new Filter();

/**
 * Check if a username contains profanity or inappropriate content
 * Checks the entire string and also checks substrings to catch embedded profanity
 * @param username - The username to check
 * @returns true if the username is clean, false if it contains profanity
 */
export function isUsernameClean(username: string): boolean {
  if (!username || username.trim().length === 0) {
    return true; // Empty usernames are handled by length validation
  }
  
  const lowerUsername = username.toLowerCase();
  
  // Check the entire string first
  if (filter.isProfane(lowerUsername)) {
    return false;
  }
  
  // Also check substrings to catch embedded profanity (e.g., "samsterbadword")
  // Check all possible substrings of length 3 or more
  for (let i = 0; i < lowerUsername.length; i++) {
    for (let j = i + 3; j <= lowerUsername.length; j++) {
      const substring = lowerUsername.substring(i, j);
      if (filter.isProfane(substring)) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Get a user-friendly error message if username contains profanity
 * @param username - The username to check
 * @returns Error message if profanity is found, null otherwise
 */
export function getUsernameProfanityError(username: string): string | null {
  if (!username || username.trim().length === 0) {
    return null;
  }
  
  if (!isUsernameClean(username)) {
    return 'Username contains inappropriate content. Please choose a different username.';
  }
  
  return null;
}
