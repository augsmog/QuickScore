import { useSyncExternalStore } from "react";

type Listener = () => void;
const urls = new Map<string, string>();
const listeners = new Map<string, Set<Listener>>();

export function liveShareScope(actorId: string | null | undefined, contestId: string): string {
  return JSON.stringify([actorId ?? "local", contestId]);
}

export function getLiveShareUrl(scope: string): string | undefined {
  return urls.get(scope);
}

export function setLiveShareUrl(scope: string, url: string): void {
  urls.set(scope, url);
  listeners.get(scope)?.forEach((listener) => listener());
}

export function clearLiveShareUrl(scope: string): void {
  if (!urls.delete(scope)) return;
  listeners.get(scope)?.forEach((listener) => listener());
}

export function subscribeLiveShareUrl(scope: string, listener: Listener): () => void {
  const subscribers = listeners.get(scope) ?? new Set<Listener>();
  subscribers.add(listener);
  listeners.set(scope, subscribers);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(scope);
  };
}

export function useLiveShareUrl(scope: string): string | undefined {
  return useSyncExternalStore(
    (listener) => subscribeLiveShareUrl(scope, listener),
    () => getLiveShareUrl(scope),
    () => undefined,
  );
}
