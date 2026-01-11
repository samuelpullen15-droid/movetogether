/**
 * Generate an avatar URL with initials from a name
 * Uses UI Avatars service to generate avatars with initials
 */
export function getAvatarUrl(avatarUrl: string | null | undefined, name: string, username?: string | null): string {
  // If user has a custom avatar, use it
  if (avatarUrl && avatarUrl.trim() && avatarUrl !== 'null') {
    return avatarUrl.trim();
  }

  // Generate initials-based avatar using UI Avatars service
  // Use firstName or first part of name for better initials
  const displayName = name || username || 'User';
  const initials = getInitials(displayName);
  
  // Use UI Avatars API to generate a colored avatar with initials
  // Format: https://ui-avatars.com/api/?name=Samuel&background=random&color=fff&size=200
  const encodedName = encodeURIComponent(displayName);
  return `https://ui-avatars.com/api/?name=${encodedName}&background=random&color=fff&size=200&bold=true&font-size=0.5`;
}

/**
 * Extract initials from a name
 */
function getInitials(name: string): string {
  if (!name || !name.trim()) {
    return 'U';
  }

  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    // Single name - use first 2 letters
    return parts[0].substring(0, 2).toUpperCase();
  } else {
    // Multiple names - use first letter of first and last name
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}
