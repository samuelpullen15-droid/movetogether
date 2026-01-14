/**
 * RevenueCat Client Module
 */

import { Platform } from "react-native";
import Purchases, { 
  PurchasesOfferings, 
  PurchasesPackage, 
  CustomerInfo,
  PurchasesError,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';

export type RevenueCatGuardReason =
  | "web_not_supported"
  | "not_configured"
  | "sdk_error"
  | "user_cancelled";

export type RevenueCatResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: RevenueCatGuardReason; error?: unknown };

// Re-export types
export type { PurchasesOfferings, PurchasesPackage, CustomerInfo };

const LOG_PREFIX = "[RevenueCat]";

// Get API keys from environment variables
const getApiKey = (): string | null => {
  // Try platform-specific keys first, then fall back to single key
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY 
        || process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY
        || null;
  } else if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || null;
  }
  return null;
};

export const isRevenueCatEnabled = (): boolean => {
  const apiKey = getApiKey();
  return Boolean(apiKey);
};

// Initialize RevenueCat (should be called early in app lifecycle)
let isInitialized = false;
export const initializeRevenueCat = async (userId?: string): Promise<RevenueCatResult<void>> => {
  if (Platform.OS === 'web') {
    return { ok: false, reason: "web_not_supported" };
  }

  if (isInitialized) {
    return { ok: true, data: undefined };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.log(`${LOG_PREFIX} API key not configured, RevenueCat disabled`);
    return { ok: false, reason: "not_configured" };
  }

  try {
    await Purchases.configure({ apiKey });
    
    if (userId) {
      await Purchases.logIn(userId);
    }
    
    isInitialized = true;
    console.log(`${LOG_PREFIX} Initialized successfully`);
    return { ok: true, data: undefined };
  } catch (error) {
    console.error(`${LOG_PREFIX} Initialization error:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};

export const getOfferings = async (): Promise<RevenueCatResult<PurchasesOfferings>> => {
  if (!isRevenueCatEnabled()) {
    return { ok: false, reason: "not_configured" };
  }

  // Ensure RevenueCat is initialized
  const initResult = await initializeRevenueCat();
  if (!initResult.ok) {
    return { ok: false, reason: initResult.reason, error: initResult.error };
  }

  try {
    const offerings = await Purchases.getOfferings();
    return { ok: true, data: offerings };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting offerings:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};

export const purchasePackage = async (
  packageToPurchase: PurchasesPackage,
): Promise<RevenueCatResult<CustomerInfo>> => {
  if (!isRevenueCatEnabled()) {
    return { ok: false, reason: "not_configured" };
  }

  // Ensure RevenueCat is initialized
  const initResult = await initializeRevenueCat();
  if (!initResult.ok) {
    return { ok: false, reason: initResult.reason, error: initResult.error };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
    return { ok: true, data: customerInfo };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Purchase error:`, error);
    
    // Check if user cancelled
    if (error instanceof PurchasesError && error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED) {
      return { ok: false, reason: "user_cancelled", error };
    }
    
    return { ok: false, reason: "sdk_error", error };
  }
};

export const getCustomerInfo = async (): Promise<RevenueCatResult<CustomerInfo>> => {
  if (!isRevenueCatEnabled()) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return { ok: true, data: customerInfo };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting customer info:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};

export const restorePurchases = async (): Promise<RevenueCatResult<CustomerInfo>> => {
  if (!isRevenueCatEnabled()) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    return { ok: true, data: customerInfo };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error restoring purchases:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};

export const setUserId = async (userId: string): Promise<RevenueCatResult<void>> => {
  if (!isRevenueCatEnabled()) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    await Purchases.logIn(userId);
    return { ok: true, data: undefined };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error setting user ID:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};

export const logoutUser = async (): Promise<RevenueCatResult<void>> => {
  if (!isRevenueCatEnabled()) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    await Purchases.logOut();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error logging out:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};

export const hasEntitlement = async (
  entitlementId: string,
): Promise<RevenueCatResult<boolean>> => {
  if (!isRevenueCatEnabled()) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const hasEntitlement = customerInfo.entitlements.active[entitlementId] !== undefined;
    return { ok: true, data: hasEntitlement };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error checking entitlement:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};

export const hasActiveSubscription = async (): Promise<RevenueCatResult<boolean>> => {
  if (!isRevenueCatEnabled()) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const hasActive = Object.keys(customerInfo.entitlements.active).length > 0;
    return { ok: true, data: hasActive };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error checking active subscription:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};

export const getPackage = async (
  packageIdentifier: string,
): Promise<RevenueCatResult<PurchasesPackage | null>> => {
  if (!isRevenueCatEnabled()) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const offerings = await Purchases.getOfferings();
    if (!offerings.current) {
      return { ok: true, data: null };
    }

    const pkg = offerings.current.availablePackages.find(
      (p) => p.identifier === packageIdentifier
    );
    return { ok: true, data: pkg || null };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting package:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};
