# Competition Join/Leave Security

This document describes the server-side security implementation for competition join and leave operations.

## Overview

All competition join/leave operations are now secured with:
- **RLS Policies**: Database-level access control
- **Server-side Validation**: Edge Functions and database functions verify all rules
- **Subscription Checks**: Free tier users must pay to leave competitions

## Join Rules

### Database Function: `accept_competition_invitation`
- Users can only accept invitations that are:
  - Status = 'pending'
  - Invitee ID matches current user
- Validations:
  - Cannot join competitions that are 'completed'
  - Cannot join if already a participant (will just mark invitation as accepted)
  - Competition must exist

### Database Function: `join_public_competition`
- Users can only join public competitions
- Validations:
  - Competition must be public (`is_public = true`)
  - Competition status must be 'upcoming' or 'active' (not 'completed')
  - User must not already be a participant

### RLS Policy: `Users can join competitions with invitation or public`
- Allows INSERT to `competition_participants` if:
  1. User is inserting their own record (`auth.uid() = user_id`)
  2. Competition is public OR user has a pending invitation
  3. Competition status is 'upcoming' or 'active' (not 'completed')
  4. User is not already a participant

## Leave Rules

### Edge Function: `leave-competition`
Server-side validation and subscription checks:

1. **Verify user is a participant**
   - Returns 404 if user is not in the competition

2. **Check if user is creator**
   - Returns 403 if user is the competition creator
   - Creators must delete the competition instead

3. **Check subscription tier** (from `profiles` table)
   - **Starter tier**: Requires payment ($2.99)
     - Returns 402 with `requiresPayment: true` if no payment provided
     - Verifies payment before allowing leave
   - **Mover/Crusher tier**: Can leave freely

4. **Remove from competition**
   - Deletes participant record if all validations pass

### RLS Policy: `Users can leave competitions they joined`
- Allows DELETE from `competition_participants` if:
  - User is deleting their own participation (`auth.uid() = user_id`)
- Additional validation (subscription, creator check) happens in Edge Function

## Client-Side Implementation

### Joining Competitions
- **Via Invitation**: Uses `acceptInvitation()` which calls `accept_competition_invitation` RPC
- **Public Competition**: Uses `joinPublicCompetition()` which calls `join_public_competition` RPC

### Leaving Competitions
- **Client Flow**:
  1. Call `leaveCompetition()` which invokes `leave-competition` Edge Function
  2. If `requiresPayment: true`:
     - Show payment UI
     - Process payment via RevenueCat
     - Call `leaveCompetition()` again with `paymentIntentId`
  3. If successful, navigate back

## Payment Integration

### RevenueCat Integration (TODO)
The Edge Function currently accepts a `paymentIntentId` parameter but does not verify it with RevenueCat. 

**To complete the implementation:**
1. Add RevenueCat webhook verification
2. Verify payment transaction ID matches the user
3. Only allow leave if payment is confirmed

**Current behavior**: Edge Function accepts payment if `paymentIntentId` is provided (placeholder for production verification)

## Error Messages

### Join Errors
- "Cannot join this competition. It may not be public, already started, or you may already be a participant."
- "Invitation not found"
- "Failed to accept invitation"

### Leave Errors
- "You are not a participant in this competition" (404)
- "Competition creators cannot leave. Please delete the competition instead." (403)
- "Free users must pay $2.99 to leave a competition. Upgrade to Mover or Crusher for free withdrawals." (402)
- "Profile not found" (404)
- "Failed to leave competition" (500)

## Migration

Run the migration to create the functions and policies:

```bash
supabase migration up
```

Or apply manually via Supabase Dashboard SQL Editor.

## Testing

1. **Test Join Public Competition**:
   - As authenticated user: Should succeed for public upcoming/active competitions
   - As authenticated user: Should fail for private competitions
   - As authenticated user: Should fail for completed competitions
   - As authenticated user: Should fail if already a participant

2. **Test Accept Invitation**:
   - With valid pending invitation: Should succeed
   - With invalid invitation ID: Should fail
   - With invitation for another user: Should fail
   - For completed competition: Should fail

3. **Test Leave Competition**:
   - As starter tier: Should require payment (402)
   - As mover/crusher tier: Should allow immediate leave
   - As competition creator: Should return 403 error
   - As non-participant: Should return 404 error

4. **Test RLS Policies**:
   - Try to insert participant record for another user: Should fail
   - Try to delete another user's participation: Should fail
