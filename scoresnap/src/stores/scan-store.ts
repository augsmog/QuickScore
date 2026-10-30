import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { scanAllowance, type Tier } from "../services/entitlements";

interface ScanState {
  scansUsed: number;
  scanMonth: string;
  tier: Tier;
  isTD: boolean;
  setTier: (tier: Tier) => void;
  isPro: boolean; // Set by RevenueCat based on active subscription/trial

  // Can the user scan right now?
  canScan: () => boolean;
  // Use a scan (returns false if not allowed)
  useScan: () => boolean;
  // Remaining scans this calendar month
  getRemainingFreeScans: () => number;
  // Set pro status (called by RevenueCat listener)
  setPro: (value: boolean) => void;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set, get) => ({
      scansUsed: 0,
      scanMonth: "",
      tier: "free",
      isPro: false,
      isTD: false,
      canScan: () => get().getRemainingFreeScans() > 0,
      useScan: () => {
        const {limit, monthKey} = scanAllowance(get().tier, new Date());
        if (limit === Infinity) return true;
        const used = get().scanMonth === monthKey ? get().scansUsed : 0;
        if (used >= limit) return false;
        set({scanMonth: monthKey, scansUsed: used + 1});
        return true;
      },
      getRemainingFreeScans: () => {
        const {limit, monthKey} = scanAllowance(get().tier, new Date());
        return Math.max(0, limit - (get().scanMonth === monthKey ? get().scansUsed : 0));
      },
      setTier: (tier) => set({tier, isPro: tier !== "free", isTD: tier === "td"}),
      setPro: (value: boolean) => get().setTier(value ? "pro" : "free"),
    }),
    {
      name: "snapscore-scans",
      version: 1,
      migrate: (old: any) => ({scansUsed: old?.scansUsed ?? 0, scanMonth: old?.scanMonth ?? ""}) as ScanState,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        scansUsed: state.scansUsed,
        scanMonth: state.scanMonth,
      }),
    }
  )
);
