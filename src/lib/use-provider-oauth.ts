import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';
import { useAuthStore } from './auth-store';
import { useHealthStore } from './health-service';
import { getProviderOAuthConfig } from './provider-oauth-config';
import { supabase } from './supabase';

// Required for iOS to properly handle OAuth redirects
WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'fitbit' | 'whoop' | 'garmin' | 'oura' | 'strava';

interface UseProviderOAuthResult {
  isConnecting: boolean;
  error: string | null;
  startOAuthFlow: () => Promise<void>;
}

/**
 * Hook for handling OAuth authentication with fitness providers
 * 
 * @example
 * const { startOAuthFlow, isConnecting, error } = useProviderOAuth('fitbit');
 * 
 * <Button onPress={startOAuthFlow} disabled={isConnecting}>
 *   Connect Fitbit
 * </Button>
 */
export function useProviderOAuth(providerId: OAuthProvider): UseProviderOAuthResult {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const setProviderConnected = useHealthStore((s) => s.setProviderConnected);

  const config = getProviderOAuthConfig(providerId);

  useEffect(() => {
    // Listen for deep link redirects (OAuth callback)
    const subscription = Linking.addEventListener('url', handleDeepLink);
    
    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = async (event: { url: string }) => {
    const { path, queryParams } = Linking.parse(event.url);
    
    // Check if this is an OAuth callback
    if (path === 'oauth-callback' && queryParams?.code) {
      const authCode = queryParams.code as string;
      
      // Verify state matches what we sent (security check)
      // In production, you'd store the state value before OAuth and verify it here
      
      await exchangeCodeForToken(authCode);
    } else if (queryParams?.error) {
      setError(queryParams.error as string);
      setIsConnecting(false);
    }
  };

  const generateState = () => {
    // Random state for CSRF protection
    return Math.random().toString(36).substring(2, 15);
  };

  const startOAuthFlow = async () => {
    if (!config) {
      setError(`OAuth not configured for ${providerId}`);
      Alert.alert('Configuration Error', `${providerId} OAuth is not set up yet`);
      return;
    }

    if (!user?.id) {
      setError('User not authenticated');
      Alert.alert('Error', 'Please sign in first');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const state = generateState();
      
      // Build authorization URL (no PKCE - not required for mobile OAuth)
      const params = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(' '),
        state,
        ...config.extraAuthParams,
      });

      const authUrl = `${config.authUrl}?${params.toString()}`;
      console.log('[OAuth] Auth URL:', authUrl);

      console.log(`[OAuth] Opening ${providerId} authorization URL`);

      // Open OAuth page in in-app browser
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        config.redirectUri
      );
      
      console.log('[OAuth] Result:', result);
      
      if (result.type === 'cancel') {
        console.log('[OAuth] User cancelled');
        setIsConnecting(false);
      } else if (result.type === 'success') {
        console.log('[OAuth] Success! URL:', result.url);
        // Parse the URL to get the code
        const url = result.url;
        const codeMatch = url.match(/code=([^&]+)/);
        const code = codeMatch ? codeMatch[1] : null;
        
        if (code) {
          await exchangeCodeForToken(code);
        } else {
          setError('No authorization code received');
          setIsConnecting(false);
        }
      }
      // If success, handleDeepLink will be called automatically
    } catch (e) {
      console.error('[OAuth] Error starting flow:', e);
      setError(e instanceof Error ? e.message : 'Failed to start OAuth flow');
      setIsConnecting(false);
      Alert.alert('Connection Error', 'Failed to open authorization page');
    }
  };

  const exchangeCodeForToken = async (authCode: string) => {
    console.log('[OAuth] Exchanging auth code for token...');
    
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // Get session for authorization
      const { data: sessionData } = await supabase!.auth.getSession();

      // Call Supabase Edge Function to exchange code for token
      // This keeps the client secret secure on the server
      const { data, error: functionError } = await supabase!.functions.invoke(
        'exchange-oauth-token',
        {
          body: {
            provider: providerId,
            code: authCode,
            userId: user.id,
          },
          headers: {
            Authorization: `Bearer ${sessionData.session?.access_token}`,
          },
        }
      );

      if (functionError) {
        throw functionError;
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'Token exchange failed');
      }

      console.log('[OAuth] Token exchange successful');

      // Mark provider as connected in the health store
      if (setProviderConnected) {
        setProviderConnected(providerId, true);
      }

      // Sync data from the provider
      const syncHealthData = useHealthStore.getState().syncHealthData;
      if (syncHealthData && user?.id) {
        await syncHealthData(user.id);
      }

      setIsConnecting(false);
      Alert.alert('Success', `${providerId} connected successfully!`);
    } catch (e) {
      console.error('[OAuth] Token exchange error:', e);
      setError(e instanceof Error ? e.message : 'Failed to complete authorization');
      setIsConnecting(false);
      Alert.alert(
        'Connection Failed',
        `Failed to connect ${providerId}. Please try again.`
      );
    }
  };

  return {
    isConnecting,
    error,
    startOAuthFlow,
  };
}

/**
 * Helper function to disconnect a provider
 */
export async function disconnectProvider(providerId: OAuthProvider, userId: string) {
  try {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    // Call Edge Function to revoke token and remove from database
    const { error } = await supabase.functions.invoke('disconnect-oauth-provider', {
      body: {
        provider: providerId,
        userId,
      },
    });

    if (error) {
      throw error;
    }

    // Update local state
    const setProviderConnected = useHealthStore.getState().setProviderConnected;
    if (setProviderConnected) {
      setProviderConnected(providerId, false);
    }

    return { success: true };
  } catch (e) {
    console.error('[OAuth] Disconnect error:', e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to disconnect provider',
    };
  }
}
