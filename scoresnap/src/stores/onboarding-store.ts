import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  hasSeenDemo: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  markDemoSeen: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      hasSeenDemo: false,
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false }),
      markDemoSeen: () => set({ hasSeenDemo: true }),
    }),
    {
      name: "snapscore-onboarding",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
