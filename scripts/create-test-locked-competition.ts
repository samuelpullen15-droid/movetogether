/**
 * Script to create a test competition in the "locked" state.
 *
 * Run this in your app or via: npx ts-node scripts/create-test-locked-competition.ts
 *
 * Or copy the createTestLockedCompetition function and call it from your app.
 */

import { createClient } from '@supabase/supabase-js';

// Use environment variables or replace with your actual values
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function createTestLockedCompetition(userId: string) {
  console.log('Creating test locked competition for user:', userId);

  // Calculate dates: ended 2 days ago, started 5 days ago
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 5);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 2);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  // Create the competition
  const { data: competition, error: compError } = await supabase
    .from('competitions')
    .insert({
      creator_id: userId,
      name: '🔒 Test Locked Competition',
      description: 'This is a test competition to demonstrate the locked score overlay. Your local midnight has passed!',
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      type: 'weekly',
      status: 'active', // Keep as active so the locked overlay shows
      is_public: false,
      scoring_type: 'rings',
    })
    .select()
    .single();

  if (compError) {
    console.error('Error creating competition:', compError);
    return null;
  }

  console.log('Created competition:', competition.id);

  // Add the user as a participant
  const { error: participantError } = await supabase
    .from('competition_participants')
    .insert({
      competition_id: competition.id,
      user_id: userId,
      points: 847, // Test score
    });

  if (participantError) {
    console.error('Error adding participant:', participantError);
    // Clean up the competition
    await supabase.from('competitions').delete().eq('id', competition.id);
    return null;
  }

  console.log('Added user as participant with 847 points');
  console.log('\n✅ Test locked competition created successfully!');
  console.log('Competition ID:', competition.id);
  console.log('\nOpen the Compete tab in the app to see it, or navigate to:');
  console.log(`/competition-detail?id=${competition.id}`);

  return competition.id;
}

// To clean up:
export async function deleteTestLockedCompetition() {
  const { error } = await supabase
    .from('competitions')
    .delete()
    .eq('name', '🔒 Test Locked Competition');

  if (error) {
    console.error('Error deleting test competition:', error);
  } else {
    console.log('Test competition deleted');
  }
}
