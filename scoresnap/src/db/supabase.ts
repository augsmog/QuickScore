import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { secureSessionStorage } from "./secure-session-storage";
import { CROSS_DEVICE_SHARING_ENABLED } from "../config/features";
import { Platform } from "react-native";

/** Must match public.client_shows_held_changes() in the score-rules migration. */
export const HELD_CHANGES_HEADER = { "x-snapscore-holds": "1" } as const;

// These will be replaced with real values when you create a Supabase project
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "your-anon-key";

// Custom storage adapter for React Native
const legacyAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // SecureStore has a 2048 byte limit on some platforms
      // Fall back silently
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: CROSS_DEVICE_SHARING_ENABLED ? (Platform.OS === "web" ? {
      getItem: async (key: string) => localStorage.getItem(key),
      setItem: async (key: string, value: string) => { localStorage.setItem(key, value); },
      removeItem: async (key: string) => { localStorage.removeItem(key); },
    } : secureSessionStorage(SecureStore, Crypto.randomUUID)) : legacyAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Tells the server this build can show a score change that is waiting for the group
  // scorekeeper. Without it the server saves the change as older builds expect (AUG-1601,
  // review finding 3). Not sent from a browser: a custom header there needs the backend's
  // cross-origin allow-list, and web guests are held to the rule without it.
  ...(Platform.OS === "web" ? {} : { global: { headers: HELD_CHANGES_HEADER } }),
});
