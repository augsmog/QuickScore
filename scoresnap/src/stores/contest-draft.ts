import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * What someone has typed into New Contest and not yet created. Backing out and coming back,
 * or leaving for sign-in or the paywall, must not throw it away (AUG-1478). Memory only:
 * it is gone when the app is closed, when the round is created, and when the account is wiped.
 */
const draft = new Map<string, unknown>();
export const clearContestDraft = () => draft.clear();
export const contestDraftHas = (key: string) => draft.has(key);

/** useState, except the value survives the screen being closed and reopened. */
export function useDraftField<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => draft.has(key) ? draft.get(key) as T : typeof initial === 'function' ? (initial as () => T)() : initial);
  useEffect(() => { draft.set(key, value); }, [key, value]);
  return [value, setValue];
}
