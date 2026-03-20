/**
 * RevenueCat Purchases Service
 *
 * Manages in-app subscriptions via Apple StoreKit 2 and Google Play Billing.
 * Connected to Stripe for web signups via RevenueCat dashboard.
 *
 * Products (configure in RevenueCat dashboard):
 * - monthly:  $4.99/month
 * - yearly:   $29.99/year (7-day free trial)
 * - lifetime: $49.99 one-time
 *
 * Entitlement: "SnapScore Pro" (identifier: "pro")
 */

import { Platform } from "react-native";
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  PurchasesOffering,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
} from "react-native-purchases";
import { useScanStore } from "../stores/scan-store";

// Entitlement ID configured in RevenueCat dashboard
const ENTITLEMENT_ID = "SnapScore Pro";

let isConfigured = false;

/**
 * Initialize RevenueCat SDK. Call once on app start.
 */
export async function initPurchases(userId?: string): Promise<void> {
  if (isConfigured) return;

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  const appleKey = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY;
  const googleKey = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY;
  const apiKey = Platform.OS === "ios" ? appleKey : googleKey;

  if (!apiKey) {
    console.warn("RevenueCat API key not configured. Set EXPO_PUBLIC_REVENUECAT_APPLE_KEY or EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY in .env");
    return;
  }

  try {
    Purchases.configure({
      apiKey,
      appUserID: userId || undefined,
    });

    isConfigured = true;

    // Listen for subscription changes in real-time
    Purchases.addCustomerInfoUpdateListener(handleCustomerInfoUpdate);

    // Check current entitlement status
    const info = await Purchases.getCustomerInfo();
    handleCustomerInfoUpdate(info);
  } catch (e) {
    console.warn("RevenueCat init failed:", e);
  }
}

/**
 * Sync Pro status whenever customer info changes.
 */
function handleCustomerInfoUpdate(info: CustomerInfo): void {
  const isPro = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  useScanStore.getState().setPro(isPro);
}

/**
 * Get current subscription offerings (pricing, packages).
 * Returns the "default" offering configured in RevenueCat.
 */
export async function getOfferings(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (e) {
    console.error("Failed to get offerings:", e);
    return null;
  }
}

/**
 * Get specific packages from the current offering.
 */
export async function getPackages(): Promise<{
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
  lifetime: PurchasesPackage | null;
}> {
  const offering = await getOfferings();
  if (!offering) {
    return { monthly: null, annual: null, lifetime: null };
  }

  return {
    monthly: offering.monthly || null,
    annual: offering.annual || null,
    lifetime: offering.lifetime || null,
  };
}

/**
 * Purchase a package (triggers native App Store / Play Store payment sheet).
 * Returns true if the "SnapScore Pro" entitlement is now active.
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPro = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    useScanStore.getState().setPro(isPro);
    return isPro;
  } catch (e: any) {
    if (e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return false;
    }
    console.error("Purchase failed:", e);
    throw e;
  }
}

/**
 * Restore previous purchases (e.g., after reinstall or new device).
 * Returns true if Pro entitlement was restored.
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    const info = await Purchases.restorePurchases();
    const isPro = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    useScanStore.getState().setPro(isPro);
    return isPro;
  } catch (e) {
    console.error("Restore failed:", e);
    throw e;
  }
}

/**
 * Check if user currently has the Pro entitlement.
 */
export async function checkProStatus(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Get full customer info (for Customer Center and diagnostics).
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/**
 * Identify user for cross-device subscription sync.
 * Call after sign-in with a stable user ID.
 */
export async function identifyUser(userId: string): Promise<void> {
  try {
    await Purchases.logIn(userId);
    const info = await Purchases.getCustomerInfo();
    handleCustomerInfoUpdate(info);
  } catch (e) {
    console.warn("Failed to identify user:", e);
  }
}

/**
 * Log out user (resets to anonymous). Call on sign-out.
 */
export async function logOutPurchases(): Promise<void> {
  try {
    await Purchases.logOut();
  } catch (e) {
    console.warn("Failed to log out purchases:", e);
  }
}
