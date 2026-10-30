/**
 * RevenueCat Purchases Service
 *
 * Manages in-app subscriptions via Apple StoreKit 2 and Google Play Billing.
 * Connected to Stripe for web signups via RevenueCat dashboard.
 *
 * Products: snapscore.pro.annual ($24.99/yr), snapscore.pro.monthly ($3.99/mo),
 * snapscore.td.annual ($79.99/yr), snapscore.td.monthly ($12.99/mo).
 * Entitlements: "SnapScore Pro" and "SnapScore TD" (TD grants both).
 * One SnapScore subscription group: TD level 1, Pro level 2.
 * Annual plans offer an eligible 7-day trial, once per Apple ID per group.
 */

import { Platform, NativeModules } from "react-native";
import * as Sentry from "@sentry/react-native";
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  PurchasesOffering,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
} from "react-native-purchases";
import { useScanStore } from "../stores/scan-store";

// Entitlement ID configured in RevenueCat dashboard
import { tierFromCustomerInfo } from "./entitlements";

let isConfigured = false;

/**
 * Check if RevenueCat native module is available.
 * Returns false in Expo Go (no native modules) and in environments
 * where the native SDK isn't linked.
 */
function isNativeModuleAvailable(): boolean {
  try {
    // RevenueCat registers as "RNPurchases" in the native module bridge
    return !!(
      NativeModules.RNPurchases ||
      NativeModules.PurchasesHybridCommon
    );
  } catch {
    return false;
  }
}

/**
 * Initialize RevenueCat SDK. Call once on app start.
 * Gracefully skips in environments where the native module isn't available
 * (Expo Go, simulators without StoreKit config, etc.).
 */
export async function initPurchases(userId?: string): Promise<void> {
  if (isConfigured) return;

  // Guard: skip entirely if native module isn't linked (Expo Go)
  if (!isNativeModuleAvailable()) {
    console.warn("RevenueCat native module not available (Expo Go?). Skipping purchase init.");
    return;
  }

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
  useScanStore.getState().setTier(tierFromCustomerInfo(info));
}

/**
 * Get current subscription offerings (pricing, packages).
 * Returns the "default" offering configured in RevenueCat.
 */
export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (!isConfigured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (e) {
    console.error("Failed to get offerings:", e);
    Sentry.captureException(e, { tags: { service: "purchases", action: "offerings" } });
    return null;
  }
}

/**
 * Get specific packages from the current offering.
 */
export async function getPackages() {
  const offering = await getOfferings();
  const find = (id: string) => offering?.availablePackages.find(p => p.identifier === id) ?? null;
  return { annual: find("$rc_annual"), monthly: find("$rc_monthly"),
    td_annual: find("td_annual"), td_monthly: find("td_monthly") };
}

export async function syncProStatus(): Promise<void> {
  const info = await getCustomerInfo();
  if (info) handleCustomerInfoUpdate(info);
}

/**
 * Purchase a package (triggers native App Store / Play Store payment sheet).
 * Returns true if the "SnapScore Pro" entitlement is now active.
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<boolean> {
  if (!isConfigured) {
    console.warn("Purchases not configured — cannot purchase");
    return false;
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    handleCustomerInfoUpdate(customerInfo);
    return tierFromCustomerInfo(customerInfo) !== "free";
  } catch (e: any) {
    if (e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return false;
    }
    console.error("Purchase failed:", e);
    Sentry.captureException(e, { tags: { service: "purchases", action: "purchase" } });
    throw e;
  }
}

/**
 * Restore previous purchases (e.g., after reinstall or new device).
 * Returns true if Pro entitlement was restored.
 */
export async function restorePurchases(): Promise<boolean> {
  if (!isConfigured) {
    console.warn("Purchases not configured — cannot restore");
    return false;
  }
  try {
    const info = await Purchases.restorePurchases();
    handleCustomerInfoUpdate(info);
    return tierFromCustomerInfo(info) !== "free";
  } catch (e) {
    console.error("Restore failed:", e);
    Sentry.captureException(e, { tags: { service: "purchases", action: "restore" } });
    throw e;
  }
}

/**
 * Check if user currently has the Pro entitlement.
 */
export async function checkProStatus(): Promise<boolean> {
  if (!isConfigured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    handleCustomerInfoUpdate(info);
    return tierFromCustomerInfo(info) !== "free";
  } catch {
    return false;
  }
}

/**
 * Get full customer info (for Customer Center and diagnostics).
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isConfigured) return null;
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
  if (!isConfigured) return;
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
  if (!isConfigured) return;
  try {
    const info = await Purchases.logOut();
    handleCustomerInfoUpdate(info);
  } catch (e) {
    console.warn("Failed to log out purchases:", e);
  }
}
