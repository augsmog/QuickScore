import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AuthState {
  session: { user: { id: string; email?: string } } | null;
  user: { id: string; email?: string; name?: string } | null;
  isLoading: boolean;
  isInitialized: boolean;
  isAnonymous: boolean;

  initialize: () => Promise<void>;
  signInWithApple: (idToken: string, nonce: string) => Promise<void>;
  signInWithGoogle: (idToken: string, accessToken?: string) => Promise<void>;
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
        // If we already have a session (from persist) or anonymous mode, mark initialized
        const state = get();
        if (state.session || state.isAnonymous) {
          set({ isLoading: false, isInitialized: true });
          return;
        }

        try {
          // Try to initialize Supabase auth if configured
          // For now, gracefully handle unconfigured state
          set({ isLoading: false, isInitialized: true });
        } catch (error) {
          console.error("Auth initialization error:", error);
          set({ isLoading: false, isInitialized: true });
        }
      },

      signInWithApple: async (idToken: string, nonce: string) => {
        set({ isLoading: true });
        try {
          // In production: call supabase.auth.signInWithIdToken
          // For now, create a local session
          const mockUser = {
            id: `apple-${Date.now()}`,
            email: "golfer@apple.com",
            name: "Golfer",
          };
          set({
            session: { user: mockUser },
            user: mockUser,
            isLoading: false,
            isAnonymous: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      signInWithGoogle: async (idToken: string, accessToken?: string) => {
        set({ isLoading: true });
        try {
          const mockUser = {
            id: `google-${Date.now()}`,
            email: "golfer@gmail.com",
            name: "Golfer",
          };
          set({
            session: { user: mockUser },
            user: mockUser,
            isLoading: false,
            isAnonymous: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      skipSignIn: () => {
        const anonUser = {
          id: `anon-${Date.now()}`,
          name: "Golfer",
        };
        set({
          session: { user: anonUser },
          user: anonUser,
          isLoading: false,
          isAnonymous: true,
        });
      },

      signOut: () => {
        set({
          session: null,
          user: null,
          isLoading: false,
          isAnonymous: false,
        });
      },

      setSession: (session) => {
        set({ session, user: session?.user ?? null });
      },
    }),
    {
      name: "scoresnap-auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        session: state.session,
        user: state.user,
        isAnonymous: state.isAnonymous,
        isInitialized: state.isInitialized,
      }),
    }
  )
);
