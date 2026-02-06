// lib/use-prize-pool-payment.ts
import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useStripe, usePlatformPay, PlatformPay } from '@stripe/stripe-react-native';
import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

interface PaymentResult {
  success: boolean;
  cancelled?: boolean;
  error?: string;
}

interface PrizePoolPaymentParams {
  competitionId: string;
  prizeAmount: number;
  payoutStructure?: Record<string, number>;
  poolType?: 'creator_funded' | 'buy_in';
  buyInAmount?: number;
}

interface BuyInJoinParams {
  competitionId: string;
  invitationId?: string;
}

export const usePrizePoolPayment = () => {
  const [loading, setLoading] = useState(false);
  const { confirmPlatformPayPayment } = usePlatformPay();
  const { confirmPayment } = useStripe();

  const payWithApplePay = useCallback(async ({
    competitionId,
    prizeAmount,
    payoutStructure = { first: 100 },
    poolType = 'creator_funded',
    buyInAmount,
  }: PrizePoolPaymentParams): Promise<PaymentResult> => {
    setLoading(true);

    try {
      // Step 1: Create PaymentIntent on backend
      // Use refreshSession to ensure we have a valid token
      const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();

      if (sessionError || !sessionData?.session?.access_token) {
        console.error('Auth error:', sessionError);
        throw new Error('Please sign in again to continue');
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/create-prize-payment`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            competitionId,
            prizeAmount,
            payoutStructure,
            poolType,
            buyInAmount,
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok || responseData.error) {
        const errorMsg = responseData.error || 'Failed to create payment';
        const errorDetails = responseData.details ? ` (${responseData.details})` : '';
        console.error('Payment API error:', responseData);
        throw new Error(errorMsg + errorDetails);
      }

      const { clientSecret, amount } = responseData;

      // Step 2: Present Apple Pay / Google Pay sheet
      const { error: platformPayError } = await confirmPlatformPayPayment(clientSecret, {
        applePay: {
          cartItems: [
            {
              label: poolType === 'buy_in' ? 'Competition Buy-In' : 'Competition Prize Pool',
              amount: amount.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
          ],
          merchantCountryCode: 'US',
          currencyCode: 'USD',
        },
        googlePay: {
          merchantCountryCode: 'US',
          currencyCode: 'USD',
          testEnv: __DEV__,
        },
      });

      if (platformPayError) {
        // User cancelled or payment failed
        if (platformPayError.code === 'Canceled') {
          return { success: false, cancelled: true };
        }
        throw new Error(platformPayError.message);
      }

      // Step 3: Payment successful!
      // Webhook will activate the prize pool automatically
      return { success: true };

    } catch (error: any) {
      console.error('Payment error:', error);
      Alert.alert('Payment Failed', error.message || 'Something went wrong');
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [confirmPlatformPayPayment]);

  // Fallback for devices without Apple Pay
  const payWithCard = useCallback(async ({
    competitionId,
    prizeAmount,
    payoutStructure = { first: 100 },
    poolType = 'creator_funded',
    buyInAmount,
  }: PrizePoolPaymentParams): Promise<PaymentResult> => {
    setLoading(true);

    try {
      // Create PaymentIntent
      // Use refreshSession to ensure we have a valid token
      const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();

      if (sessionError || !sessionData?.session?.access_token) {
        console.error('Auth error:', sessionError);
        throw new Error('Please sign in again to continue');
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/create-prize-payment`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            competitionId,
            prizeAmount,
            payoutStructure,
            poolType,
            buyInAmount,
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok || responseData.error) {
        const errorMsg = responseData.error || 'Failed to create payment';
        const errorDetails = responseData.details ? ` (${responseData.details})` : '';
        console.error('Payment API error:', responseData);
        throw new Error(errorMsg + errorDetails);
      }

      const { clientSecret } = responseData;

      // Use Stripe's card payment sheet
      const { error: paymentError } = await confirmPayment(clientSecret, {
        paymentMethodType: 'Card',
      });

      if (paymentError) {
        if (paymentError.code === 'Canceled') {
          return { success: false, cancelled: true };
        }
        throw new Error(paymentError.message);
      }

      return { success: true };

    } catch (error: any) {
      console.error('Payment error:', error);
      Alert.alert('Payment Failed', error.message || 'Something went wrong');
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [confirmPayment]);

  // Pay buy-in to join a competition (for participants, not the creator)
  const payBuyIn = useCallback(async ({
    competitionId,
    invitationId,
  }: BuyInJoinParams): Promise<PaymentResult> => {
    setLoading(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();

      if (sessionError || !sessionData?.session?.access_token) {
        console.error('Auth error:', sessionError);
        throw new Error('Please sign in again to continue');
      }

      // Step 1: Create PaymentIntent via buy-in endpoint
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/create-buy-in-payment`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            competitionId,
            invitationId,
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok || responseData.error) {
        const errorMsg = responseData.error || 'Failed to create payment';
        const errorDetails = responseData.details ? ` (${responseData.details})` : '';
        console.error('Buy-in payment API error:', responseData);
        throw new Error(errorMsg + errorDetails);
      }

      const { clientSecret, amount } = responseData;

      // Step 2: Try platform pay first, fall back to card
      const { error: platformPayError } = await confirmPlatformPayPayment(clientSecret, {
        applePay: {
          cartItems: [
            {
              label: 'Competition Buy-In',
              amount: amount.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
          ],
          merchantCountryCode: 'US',
          currencyCode: 'USD',
        },
        googlePay: {
          merchantCountryCode: 'US',
          currencyCode: 'USD',
          testEnv: __DEV__,
        },
      });

      if (platformPayError) {
        if (platformPayError.code === 'Canceled') {
          return { success: false, cancelled: true };
        }

        // Fall back to card payment
        const { error: cardError } = await confirmPayment(clientSecret, {
          paymentMethodType: 'Card',
        });

        if (cardError) {
          if (cardError.code === 'Canceled') {
            return { success: false, cancelled: true };
          }
          throw new Error(cardError.message);
        }
      }

      return { success: true };

    } catch (error: any) {
      console.error('Buy-in payment error:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [confirmPlatformPayPayment, confirmPayment]);

  return {
    payWithApplePay,
    payWithCard,
    payBuyIn,
    loading
  };
};
