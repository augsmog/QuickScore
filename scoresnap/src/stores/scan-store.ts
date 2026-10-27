import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SCAN_STORAGE_KEY, createGatedStorage } from "./persisted-keys";

/**
 * Scan store — manages subscription status and scan access.
 *
 * Model: 7-day free trial on annual plan ($19.99/yr).
 * - During trial: full access (isPro = true via RevenueCat)
 * - After trial expires without payment: scanning locked, contest creation still works
 * - Manual score entry always free, scanning requires active subscription
 *
 * The first scan is always free (no account needed) to demonstrate value.
 * After that, subscription required.
 */

const FIRST_SCAN_FREE = 1;

interface ScanState {
  scansUsed: number;
  isPro: boolean; // Set by RevenueCat based on active subscription/trial

  // Can the user scan right now?
  canScan: () => boolean;
  // Use a scan (returns false if not allowed)
  useScan: () => boolean;
  // How many free scans remain (0 or 1)
  getRemainingFreeScans: () => number;
  // Set pro status (called by RevenueCat listener)
  setPro: (value: boolean) => void;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set, get) => ({
      scansUsed: 0,
      isPro: false,

      canScan: () => {
        const { scansUsed, isPro } = get();
        // Pro users (active subscription or trial) can always scan
        if (isPro) return true;
        // Everyone gets 1 free scan to see the value
        return scansUsed < FIRST_SCAN_FREE;
      },

      useScan: () => {
        const { scansUsed, isPro } = get();
        if (isPro) return true;
        if (scansUsed < FIRST_SCAN_FREE) {
          set({ scansUsed: scansUsed + 1 });
          return true;
        }
        return false;
      },

      getRemainingFreeScans: () => {
        const { scansUsed, isPro } = get();
        if (isPro) return Infinity;
        return Math.max(0, FIRST_SCAN_FREE - scansUsed);
      },

      setPro: (value: boolean) => set({ isPro: value }),
    }),
    {
      name: SCAN_STORAGE_KEY,
      storage: createJSONStorage(() => createGatedStorage(AsyncStorage)),
      partialize: (state) => ({
        scansUsed: state.scansUsed,
        isPro: state.isPro,
      }),
    }
  )
);
