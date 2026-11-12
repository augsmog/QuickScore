import { setProEnabled } from "../services/entitlements";

/**
 * Build-time source for the reversible SnapScore Pro membership switch (AUG-817).
 *
 * Expo inlines EXPO_PUBLIC_PRO_ENABLED here at build. Default false: Pro is dormant, every former
 * Pro feature is free, and no Pro paywall appears. Set it true ONLY together with re-adding the Pro
 * products in App Store Connect (the flag alone is not enough if those products are gone).
 * Tournament Director IAP is unaffected either way.
 *
 * This module is the only place that reads the EXPO_PUBLIC env for the flag, so the pure policy
 * module (src/services/entitlements.ts, imported by the engine graph) stays env-free. Import it once
 * at app startup; a future remote source can likewise call setProEnabled() to override at runtime.
 */
export const PRO_ENABLED =
  String(process.env.EXPO_PUBLIC_PRO_ENABLED ?? "false").toLowerCase() === "true";

setProEnabled(PRO_ENABLED);
