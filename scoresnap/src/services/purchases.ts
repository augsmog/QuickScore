/**
 * RevenueCat Purchases Service
 *
 * Handles in-app subscriptions via Apple StoreKit 2 and Google Play Billing.
 * RevenueCat also connects to Stripe for web signups.
 *
 * Products:
 * - scoresnap_monthly: $4.99/month
 * - scoresnap_annual: $29.99/year (with 7-day free trial)
 */

import { Platform } from "react-native";
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  PurchasesOffering,
  LOG_LEVEL,
} from "react-native-purchases";
import { useScanStore } from "../stores/scan-store";

const ENTITLEMENT_ID = "pro";

/**
 * Initialize RevenueCat SDK. Call once on app start.
 */
export async function initPurchases(userId?: string): Promise<void> {
  const appleKey = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY;
  const googleKey = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY;
  const apiKey = Platform.OS === "ios" ? appleKey : googleKey;

  if (!apiKey) {
    console.warn(
      "RevenueCat API key not configured. Purchases will be disabled."
    );
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  await Purchases.configure({
    apiKey,
    appUserID: userId || undefined,
  });

  // Listen for subscription changes
  Purchases.addCustomerInfoUpdateListener(handleCustomerInfoUpdate);

  // Check current status
  try {
    const info = await Purchases.getCustomerInfo();
    handleCustomerInfoUpdate(info);
  } catch (e) {
    console.warn("Failed to get initial customer info:", e);
  }
}

/**
 * Update Pro status based on RevenueCat entitlements.
 */
function handleCustomerInfoUpdate(info: CustomerInfo): void {
  const isPro =
    info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  useScanStore.getState().setPro(isPro);
}

/**
 * Get current subscription offerings (pricing, packages).
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
 * Purchase a package (triggers native payment sheet).
 * Returns true if purchase succeeded.
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPro =
      customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    useScanStore.getState().setPro(isPro);
    return isPro;
  } catch (e: any) {
    if (e.userCancelled) {
      // User cancelled — not an error
      return false;
    }
    console.error("Purchase failed:", e);
    throw e;
  }
}

/**
 * Restore previous purchases (e.g. after reinstall).
 * Returns true if Pro entitlement was restored.
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    const info = await Purchases.restorePurchases();
    const isPro =
      info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    useScanStore.getState().setPro(isPro);
    return isPro;
  } catch (e) {
    console.error("Restore failed:", e);
    throw e;
  }
}

/**
 * Check if user currently has Pro subscription.
 */
export async function checkSubscriptionStatus(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Identify user for cross-device subscription sync.
 */
export async function identifyUser(userId: string): Promise<void> {
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn("Failed to identify user:", e);
  }
}
