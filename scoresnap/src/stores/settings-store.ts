import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ScoreFormat = "to_par" | "gross" | "both";
export type DistanceUnit = "yards" | "meters";
export type HandicapSystem = "whs" | "usga" | "manual";
export type DefaultTee = "tips" | "blue" | "white" | "red" | "forward";

export interface SettingsState {
  // Scoring Preferences
  scoreFormat: ScoreFormat;
  showNetScores: boolean;
  defaultBetUnit: number;
  autoComplete18: boolean; // auto-finalize round at hole 18

  // Course & Play
  distanceUnit: DistanceUnit;
  handicapSystem: HandicapSystem;
  defaultTee: DefaultTee;
  defaultHandicap: number;
  useGimmes: boolean;
  gimmeDistance: number; // feet, 0 = off

  // Display
  hapticFeedback: boolean;
  showHoleHandicap: boolean;
  showYardage: boolean;
  compactLeaderboard: boolean;
  darkScorecard: boolean; // alternate scorecard theme

  // OCR / Scan
  autoClaude: boolean; // auto-use Claude Vision when ML Kit fails
  confirmBeforeImport: boolean;

  // Notifications
  roundReminders: boolean;
  settlementReminders: boolean;

  // Privacy
  shareStatistics: boolean;
  showInLeaderboards: boolean;

  // Actions
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS = {
  scoreFormat: "to_par" as ScoreFormat,
  showNetScores: true,
  defaultBetUnit: 5,
  autoComplete18: true,
  distanceUnit: "yards" as DistanceUnit,
  handicapSystem: "whs" as HandicapSystem,
  defaultTee: "white" as DefaultTee,
  defaultHandicap: 15,
  useGimmes: false,
  gimmeDistance: 3,
  hapticFeedback: true,
  showHoleHandicap: true,
  showYardage: true,
  compactLeaderboard: false,
  darkScorecard: true,
  autoClaude: true,
  confirmBeforeImport: true,
  roundReminders: true,
  settlementReminders: true,
  shareStatistics: false,
  showInLeaderboards: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      updateSetting: (key, value) => set({ [key]: value } as any),

      resetToDefaults: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "snapscore-settings",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        // Exclude functions from persistence
        const { updateSetting, resetToDefaults, ...data } = state;
        return data;
      },
    }
  )
);
