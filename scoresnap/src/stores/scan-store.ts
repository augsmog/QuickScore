import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

const FREE_SCAN_LIMIT = 1;

interface ScanState {
  scansUsed: number;
  isPro: boolean;

  hasFreeScan: () => boolean;
  useScan: () => boolean;
  getRemainingFreeScans: () => number;
  setPro: (value: boolean) => void;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set, get) => ({
      scansUsed: 0,
      isPro: false,

      hasFreeScan: () => {
        const { scansUsed, isPro } = get();
        return isPro || scansUsed < FREE_SCAN_LIMIT;
      },

      useScan: () => {
        const { scansUsed, isPro } = get();
        if (isPro) return true;
        if (scansUsed < FREE_SCAN_LIMIT) {
          set({ scansUsed: scansUsed + 1 });
          return true;
        }
        return false;
      },

      getRemainingFreeScans: () => {
        const { scansUsed, isPro } = get();
        if (isPro) return Infinity;
        return Math.max(0, FREE_SCAN_LIMIT - scansUsed);
      },

      setPro: (value: boolean) => set({ isPro: value }),
    }),
    {
      name: "scoresnap-scans",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist scansUsed and isPro, not the methods
      partialize: (state) => ({
        scansUsed: state.scansUsed,
        isPro: state.isPro,
      }),
    }
  )
);
