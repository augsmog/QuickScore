export type AnalyticsEvent =
  | "app_opened"
  | "screen_viewed"
  | "score_snap_started"
  | "score_snap_completed"
  | "share_tapped"
  | "error_shown";

export type AnalyticsProperties = {
  screen_name?: string;
  duration_ms?: number;
  success?: boolean;
  code?: string;
};

type WebPostHog = {
  init: (key: string, options: Record<string, unknown>) => void;
  register: (properties: Record<string, string>) => void;
  capture: (event: AnalyticsEvent, properties: Record<string, string | number | boolean>) => void;
};

type PostHogEvent = { event: string; properties?: Record<string, unknown> };

type AnalyticsOptions = {
  platform: string;
  enabled: boolean;
  projectKey: string;
  load?: () => Promise<WebPostHog>;
};

const PROPERTY_KEYS: Record<AnalyticsEvent, readonly string[]> = {
  app_opened: [],
  screen_viewed: ["screen_name"],
  score_snap_started: [],
  score_snap_completed: ["duration_ms", "success"],
  share_tapped: [],
  error_shown: ["code"],
};

const SCREEN_NAMES = new Set([
  "home", "contests", "profile", "leagues", "onboarding", "sign_in",
  "scan", "scan_review", "scan_game_details", "contest", "contest_scorecard",
  "contest_settlement", "contest_games", "contest_edit", "contest_tournament_rounds",
  "statistics", "settings", "join", "public_share", "other",
]);

function safeProperties(event: AnalyticsEvent, properties: AnalyticsProperties) {
  const safe: Record<string, string | number | boolean> = { app: "snapscore" };
  for (const key of PROPERTY_KEYS[event]) {
    const value = properties[key as keyof AnalyticsProperties];
    if (key === "screen_name" && typeof value === "string" && SCREEN_NAMES.has(value)) safe[key] = value;
    if (key === "duration_ms" && typeof value === "number" && Number.isFinite(value) && value >= 0) safe[key] = Math.round(value);
    if (key === "success" && typeof value === "boolean") safe[key] = value;
    if (key === "code" && typeof value === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(value)) safe[key] = value;
  }
  return safe;
}

function sanitizePostHogEvent(event: PostHogEvent | null): PostHogEvent | null {
  if (!event || !Object.hasOwn(PROPERTY_KEYS, event.event)) return null;
  const eventName = event.event as AnalyticsEvent;
  const enriched = event.properties ?? {};
  // The browser SDK carries these transport fields inside properties; ingestion
  // and anonymous personless capture depend on them surviving before_send.
  const safe = safeProperties(eventName, enriched as AnalyticsProperties);
  for (const key of ["token", "distinct_id"] as const) {
    if (typeof enriched[key] === "string") safe[key] = enriched[key] as string;
  }
  if (enriched.$process_person_profile === false) safe.$process_person_profile = false;

  // Rebuild after enrichment so URL/referrer data and unapproved app properties
  // are dropped while the minimal SDK delivery metadata remains intact.
  event.properties = safe;
  return event;
}

export function createWebAnalytics(options: AnalyticsOptions) {
  const enabled = options.platform === "web" && options.enabled && options.projectKey.trim().length > 0;
  let clientPromise: Promise<WebPostHog | null> | null = null;

  const getClient = () => {
    if (!enabled) return Promise.resolve(null);
    if (!clientPromise) {
      const load = options.load ?? (async () => {
        // The dependency is supplied by the lockfile in CI and production web builds.
        // @ts-ignore posthog-js is not present in the shared local dependency tree yet.
        const module = await import("posthog-js");
        return module.default as WebPostHog;
      });
      clientPromise = load().then((client) => {
        client.init(options.projectKey, {
          api_host: "https://us.i.posthog.com",
          defaults: "2026-08-30",
          person_profiles: "identified_only",
          ip: false,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          session_recording: { maskAllInputs: true },
          before_send: (event: PostHogEvent | null) => sanitizePostHogEvent(event),
        });
        client.register({ app: "snapscore", platform: "web" });
        return client;
      }).catch(() => null);
    }
    return clientPromise;
  };

  return {
    capture(event: AnalyticsEvent, properties: AnalyticsProperties = {}): Promise<void> {
      return getClient().then((client) => {
        if (!client) return;
        try { client.capture(event, safeProperties(event, properties)); } catch { /* Analytics never blocks the app. */ }
      }).catch(() => undefined);
    },
  };
}
