export const SETTLEMENT_STORAGE_KEY = "snapscore-settlement-marks";
export const AUTH_STORAGE_KEY = "snapscore-auth";
export const CONTEST_STORAGE_KEY = "snapscore-contests";
export const SETTINGS_STORAGE_KEY = "snapscore-settings";
export const SCAN_STORAGE_KEY = "snapscore-scans";
export const ONBOARDING_STORAGE_KEY = "snapscore-onboarding";
export const GUEST_STORAGE_KEY = "snapscore-guest";
export const CHAT_SESSION_KEY = "snapscore.chat.session.v1";
export const CHAT_MODERATION_KEY = "snapscore.chat.moderation.v1";
export const CHAT_NAME_KEY = "snapscore.chat.name.v1";

export const TOURNAMENT_OUTBOX_KEY = "snapscore.tournament.outbox";

/** Every AsyncStorage key this app persists for an account. */
export const PERSISTED_ACCOUNT_KEYS = [
  SETTLEMENT_STORAGE_KEY,
  AUTH_STORAGE_KEY,
  CONTEST_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  SCAN_STORAGE_KEY,
  ONBOARDING_STORAGE_KEY,
  GUEST_STORAGE_KEY,
  CHAT_SESSION_KEY,
  CHAT_NAME_KEY,
  CHAT_MODERATION_KEY,
  TOURNAMENT_OUTBOX_KEY,
] as const;

export const persistGate = {
  /** While true, persist writes are dropped so sign-out cannot recreate removed keys. */
  suppressed: false,
  /**
   * After account deletion, a late SIGNED_OUT auth event must not write the
   * auth key back. Cleared on the next real sign-in.
   */
  suppressSignedOutPersist: false,
};

export interface KeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export function createGatedStorage(backing: KeyValueStorage): KeyValueStorage {
  return {
    getItem: (key) => backing.getItem(key),
    setItem: (key, value) => (persistGate.suppressed ? Promise.resolve() : backing.setItem(key, value)),
    removeItem: (key) => backing.removeItem(key),
  };
}

export async function runSuppressed<T>(fn: () => Promise<T> | T): Promise<T> {
  const previous = persistGate.suppressed;
  persistGate.suppressed = true;
  try {
    return await fn();
  } finally {
    persistGate.suppressed = previous;
  }
}

export function createMemoryStorage(): KeyValueStorage & { snapshot: () => Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => (map.has(key) ? map.get(key)! : null),
    setItem: async (key, value) => {
      map.set(key, value);
    },
    removeItem: async (key) => {
      map.delete(key);
    },
    snapshot: () => Object.fromEntries(map),
  };
}
