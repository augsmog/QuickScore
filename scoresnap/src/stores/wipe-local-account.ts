import AsyncStorage from "@react-native-async-storage/async-storage";
import { REAL_AUTH_CONFIGURED } from "../config/auth";
import { supabase } from "../db/supabase";
import { resetTournamentOutbox } from "../services/tournament-sync";
import { resetChatSessionCache } from "../services/live-chat";
import { useAuthStore } from "./auth-store";
import { useContestStore } from "./contest-store";
import { useGuestStore } from "./guest-store";
import { useOnboardingStore } from "./onboarding-store";
import { PERSISTED_ACCOUNT_KEYS, persistGate, runSuppressed } from "./persisted-keys";
import { useScanStore } from "./scan-store";
import { useSettingsStore } from "./settings-store";

/**
 * Remove every persisted account key, then reset in-memory stores.
 * Persist writes are suppressed for the whole reset, including supabase sign-out,
 * so those writes cannot recreate the keys. A later SIGNED_OUT event stays suppressed
 * until the next sign-in.
 */
export async function wipeLocalAccount(): Promise<void> {
  persistGate.suppressSignedOutPersist = true;
  resetChatSessionCache();
  await runSuppressed(async () => {
    await resetTournamentOutbox();
    await AsyncStorage.multiRemove([...PERSISTED_ACCOUNT_KEYS]);
    useAuthStore.setState({
      session: null,
      user: null,
      isLoading: false,
      isAnonymous: false,
      isInitialized: true,
    });
    useContestStore.getState().resetAll();
    useSettingsStore.getState().resetToDefaults();
    useOnboardingStore.setState({ hasCompletedOnboarding: false, hasSeenDemo: false });
    // #52 scan-usage + tier fields; ocrConsent resets via settings resetToDefaults (null = ask again).
    useScanStore.setState({ scansUsed: 0, scanMonth: "", tier: "free", isPro: false, isTD: false });
    useGuestStore.setState({ guestId: null, bindings: [] });
    if (REAL_AUTH_CONFIGURED) await supabase.auth.signOut();
  });
}
