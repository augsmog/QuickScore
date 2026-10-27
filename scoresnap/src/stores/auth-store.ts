import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { REAL_AUTH_CONFIGURED } from "../config/auth";
import { supabase } from "../db/supabase";
import { getCaptchaToken } from "../services/captcha";
import { AUTH_STORAGE_KEY, createGatedStorage, persistGate } from "./persisted-keys";

interface UserProfile {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  provider?: "apple" | "google" | "email" | "anonymous";
}

interface AuthState {
  session: { user: UserProfile } | null;
  user: UserProfile | null;
  isLoading: boolean;
  isInitialized: boolean;
  isAnonymous: boolean;

  initialize: () => Promise<void>;
  signInWithApple: (idToken: string, nonce: string) => Promise<void>;
  signInWithGoogle: (idToken: string, accessToken?: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  skipSignIn: () => void;
  signOut: () => void;
  setSession: (session: AuthState["session"]) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      user: null,
      isLoading: false,
      isInitialized: false,
      isAnonymous: false,

      initialize: async () => {
        const state = get();
        if (REAL_AUTH_CONFIGURED) {
          const apply = (session: any) => {
            const user = session ? { id: session.user.id, email: session.user.email, provider: "email" as const, name: session.user.user_metadata?.full_name } : null;
            set({ session: user ? { user } : null, user, isAnonymous: false, isInitialized: true, isLoading: false });
          };
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          apply(data.session);
          supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT" && persistGate.suppressSignedOutPersist) {
              const previous = persistGate.suppressed;
              persistGate.suppressed = true;
              try { apply(session); }
              finally { persistGate.suppressed = previous; }
              return;
            }
            apply(session);
          });
          return;
        }
        if (state.session || state.isAnonymous) {
          set({ isLoading: false, isInitialized: true });
          return;
        }

        try {
          // TODO: Initialize Supabase auth when configured
          set({ isLoading: false, isInitialized: true });
        } catch (error) {
          console.error("Auth initialization error:", error);
          set({ isLoading: false, isInitialized: true });
        }
      },

      signInWithApple: async (idToken: string, nonce: string) => {
        persistGate.suppressSignedOutPersist = false;
        set({ isLoading: true });
        try {
          if (REAL_AUTH_CONFIGURED) {
            const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: idToken, nonce });
            if (error) throw error;
            if (!data.session) throw new Error("Check your email to confirm your account, then sign in.");
            const user: UserProfile = { id: data.session.user.id, email: data.session.user.email, provider: "email" };
            set({ session: { user }, user, isLoading: false, isAnonymous: false });
            return;
          }
          // TODO: In production, call supabase.auth.signInWithIdToken({ provider: 'apple', token: idToken, nonce })
          const user: UserProfile = {
            id: `apple-${Date.now()}`,
            email: "golfer@apple.com",
            name: "Golfer",
            provider: "apple",
          };
          set({
            session: { user },
            user,
            isLoading: false,
            isAnonymous: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      signInWithGoogle: async (idToken: string, accessToken?: string) => {
        persistGate.suppressSignedOutPersist = false;
        set({ isLoading: true });
        try {
          if (REAL_AUTH_CONFIGURED) {
            const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, access_token: accessToken });
            if (error) throw error;
            if (!data.session) throw new Error("Check your email to confirm your account, then sign in.");
            const user: UserProfile = { id: data.session.user.id, email: data.session.user.email, provider: "email" };
            set({ session: { user }, user, isLoading: false, isAnonymous: false });
            return;
          }
          // TODO: In production, call supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
          const user: UserProfile = {
            id: `google-${Date.now()}`,
            email: "golfer@gmail.com",
            name: "Golfer",
            provider: "google",
          };
          set({
            session: { user },
            user,
            isLoading: false,
            isAnonymous: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      signUpWithEmail: async (
        email: string,
        password: string,
        firstName: string,
        lastName: string
      ) => {
        persistGate.suppressSignedOutPersist = false;
        set({ isLoading: true });
        try {
          if (REAL_AUTH_CONFIGURED) {
            const captchaToken = await getCaptchaToken("signup");
            const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: `${firstName} ${lastName}`.trim() }, ...(captchaToken === undefined ? {} : { captchaToken }) } });
            if (error) throw error;
            if (!data.session) throw new Error("Check your email to confirm your account, then sign in.");
            const user: UserProfile = { id: data.session.user.id, email: data.session.user.email, provider: "email" };
            set({ session: { user }, user, isLoading: false, isAnonymous: false });
            return;
          }
          // TODO: In production, call supabase.auth.signUp({ email, password, options: { data: { first_name, last_name } } })
          // For v1, create a local session
          const user: UserProfile = {
            id: `email-${Date.now()}`,
            email,
            firstName,
            lastName,
            name: `${firstName} ${lastName}`.trim(),
            provider: "email",
          };
          set({
            session: { user },
            user,
            isLoading: false,
            isAnonymous: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      signInWithEmail: async (email: string, password: string) => {
        persistGate.suppressSignedOutPersist = false;
        set({ isLoading: true });
        try {
          if (REAL_AUTH_CONFIGURED) {
            const captchaToken = await getCaptchaToken("signin");
            const { data, error } = await supabase.auth.signInWithPassword({ email, password, ...(captchaToken === undefined ? {} : { options: { captchaToken } }) });
            if (error) throw error;
            if (!data.session) throw new Error("Check your email to confirm your account, then sign in.");
            const user: UserProfile = { id: data.session.user.id, email: data.session.user.email, provider: "email" };
            set({ session: { user }, user, isLoading: false, isAnonymous: false });
            return;
          }
          // TODO: In production, call supabase.auth.signInWithPassword({ email, password })
          const user: UserProfile = {
            id: `email-${Date.now()}`,
            email,
            name: email.split("@")[0],
            provider: "email",
          };
          set({
            session: { user },
            user,
            isLoading: false,
            isAnonymous: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      skipSignIn: () => {
        persistGate.suppressSignedOutPersist = false;
        const user: UserProfile = {
          id: `anon-${Date.now()}`,
          name: "Golfer",
          provider: "anonymous",
        };
        set({
          session: { user },
          user,
          isLoading: false,
          isAnonymous: true,
        });
      },

      signOut: () => {
        persistGate.suppressSignedOutPersist = false;
        if (REAL_AUTH_CONFIGURED) void supabase.auth.signOut();
        // Clear auth state
        set({
          session: null,
          user: null,
          isLoading: false,
          isAnonymous: false,
        });
        // Clear user-scoped data so next account starts fresh
        // Import stores lazily to avoid circular dependency
        const { useContestStore } = require("./contest-store");
        useContestStore.getState().resetAll();
      },

      setSession: (session) => {
        set({ session, user: session?.user ?? null });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => createGatedStorage(AsyncStorage)),
      partialize: (state) => ({
        session: state.session,
        user: state.user,
        isAnonymous: state.isAnonymous,
        isInitialized: state.isInitialized,
      }),
    }
  )
);
