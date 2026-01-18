import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // When deep link is triggered, the URL params should contain the session info
        // Supabase should have already captured this via detectSessionInUrl: true
        console.log('Auth callback triggered with params:', params);

        // Wait a moment for Supabase to process the session
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if session was established
        const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } };

        console.log('Session after callback:', session ? 'exists' : 'null');

        if (session?.user) {
          console.log('User authenticated, navigating to app');
          router.replace('/(tabs)');
        } else {
          console.log('No session found, going back to sign-in');
          router.replace('/sign-in');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        router.replace('/sign-in');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <View className="flex-1 items-center justify-center bg-black">
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
}
