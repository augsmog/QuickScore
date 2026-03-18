import { create } from "zustand";
import { supabase } from "../db/supabase";
import type { Session, User } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  signInWithApple: (idToken: string, nonce: string) => Promise<void>;
  signInWithGoogle: (idToken: string, accessToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isLoading: true,
  isInitialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({
        session,
        user: session?.user ?? null,
        isLoading: false,
        isInitialized: true,
      });

      // Listen for auth state changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null });
      });
    } catch (error) {
      console.error("Auth initialization error:", error);
      set({ isLoading: false, isInitialized: true });
    }
  },

  signInWithApple: async (idToken: string, nonce: string) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: idToken,
        nonce,
      });
      if (error) throw error;
      set({
        session: data.session,
        user: data.user,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  signInWithGoogle: async (idToken: string, accessToken?: string) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
        access_token: accessToken,
      });
      if (error) throw error;
      set({
        session: data.session,
        user: data.user,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      set({ session: null, user: null, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
  },
}));
