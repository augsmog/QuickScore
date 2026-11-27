/**
 * Privacy hardening for Sentry.
 *
 * @sentry/react-native 8.4.0 already masks replay text and images when
 * mobileReplayIntegration() is called with no options (maskAllText,
 * maskAllImages, and maskAllVectors all default to true). These flags are set
 * explicitly so a later call site or SDK default cannot silently unmask.
 * sendDefaultPii stays off, and user context is reduced to an id.
 */
export const sentrySendDefaultPii = false;

export const sentryReplayMask = {
  maskAllText: true,
  maskAllImages: true,
  maskAllVectors: true,
} as const;

export function assertReplayMask(options: {
  maskAllText: boolean;
  maskAllImages: boolean;
  maskAllVectors: boolean;
}): void {
  if (options.maskAllText !== true || options.maskAllImages !== true || options.maskAllVectors !== true) {
    throw new Error("Sentry replay masks must stay enabled.");
  }
}

export function assertNoDefaultPii(value: boolean): void {
  if (value !== false) throw new Error("Sentry sendDefaultPii must stay off.");
}

assertReplayMask(sentryReplayMask);
assertNoDefaultPii(sentrySendDefaultPii);

type SentryUser = { id?: unknown; email?: unknown; username?: unknown; name?: unknown; ip_address?: unknown };
type SentryEventLike = { user?: SentryUser | null; tags?: Record<string, unknown> | null };

/** Keep an id if one exists. Drop email, name, username, and IP. */
export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  if (!event?.user) return event;
  const id = event.user.id;
  if (typeof id === "string" && id.length > 0) event.user = { id };
  else delete event.user;
  return event;
}

/**
 * What Sentry may capture. With Join by code on, routes, requests, replays and traces can carry
 * join codes, share tokens and sessions (docs/xdevice/plan-rev4.md, "Token privacy gate"), and
 * nothing redacts them reliably. So with it on, Sentry is crash-only: the exception and its stack.
 * With it off, capture is what it has always been.
 */
export function sentryCapture(joinByCodeOn: boolean) {
  const full = !joinByCodeOn;
  return {
    crashOnly: joinByCodeOn,
    tracesSampleRate: full ? 0.2 : 0,
    replaysSessionSampleRate: full ? 0.1 : 0,
    replaysOnErrorSampleRate: full ? 1 : 0,
    enableLogs: full,
    enableAutoPerformanceTracing: full,
    enableAppStartTracking: full,
    enableStallTracking: full,
    replay: full,
    feedback: full,
    navigation: full,
    breadcrumbs: full,
  };
}

const SECRET_SHAPES: RegExp[] = [
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // session tokens (JWT)
  /\b[0-9a-fA-F]{32,}\b/g, // share tokens and other long hex
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, // email addresses
  /\b[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}\b/g, // join codes (and any other 6-character code in that alphabet)
];
const SECRET_PARAMETER = /\b((?:access|refresh|id)_token|token|code|apikey|authorization)=([^&\s"']+)/gi;

/** Replace anything shaped like a join code, a token, a session or an email. Over-redacts on purpose. */
export function redactSecrets<T extends string | undefined | null>(text: T): T {
  if (typeof text !== "string") return text;
  let out = text.replace(SECRET_PARAMETER, (_match, name) => `${name}=[redacted]`);
  for (const shape of SECRET_SHAPES) out = out.replace(shape, "[redacted]");
  return out as T;
}

type CrashFrame = Record<string, unknown>;
type CrashEvent = SentryEventLike & {
  message?: unknown; request?: unknown; breadcrumbs?: unknown; extra?: unknown; transaction?: unknown;
  contexts?: Record<string, unknown> | null;
  exception?: { values?: Array<{ type?: unknown; value?: unknown; stacktrace?: { frames?: CrashFrame[] } }> } | null;
};
const KEPT_CONTEXTS = ["app", "device", "os"];
const KEPT_FRAME_FIELDS = ["filename", "function", "module", "lineno", "colno", "in_app", "platform", "abs_path"];

/** Crash-only: keep the exception and stack; drop or redact everything that could carry a secret. */
export function scrubSentryEventCrashOnly<T extends object>(input: T): T {
  // Sentry's own event type is stricter than what is read here; the fields are checked as they are used.
  const event = input as unknown as CrashEvent;
  scrubSentryEvent(event);
  delete event.request; delete event.breadcrumbs; delete event.extra; delete event.transaction;
  if (event.contexts) event.contexts = Object.fromEntries(Object.entries(event.contexts).filter(([name]) => KEPT_CONTEXTS.includes(name)));
  if (event.tags) event.tags = Object.fromEntries(Object.entries(event.tags).map(([name, value]) => [name, typeof value === "string" ? redactSecrets(value) : value]));
  if (typeof event.message === "string") event.message = redactSecrets(event.message);
  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === "string") value.value = redactSecrets(value.value);
    if (value.stacktrace?.frames) {
      value.stacktrace.frames = value.stacktrace.frames.map((frame) => Object.fromEntries(Object.entries(frame)
        .filter(([name]) => KEPT_FRAME_FIELDS.includes(name))
        .map(([name, field]) => [name, typeof field === "string" ? redactSecrets(field) : field])));
    }
  }
  return input;
}

/**
 * Where Sentry sends. Always the real project, except in a dev build that was given a listener on
 * this machine for the telemetry privacy proof (scripts/sentry-proof-listener.cjs). A release
 * build ignores the override, so no shipped app can be pointed anywhere else.
 */
export function sentryDsn(real: string, proofOverride: string | undefined, isDevBuild: boolean): string {
  if (!isDevBuild || !proofOverride) return real;
  return LOCAL_PROOF_DSN.test(proofOverride) ? proofOverride : real;
}

/**
 * Has the telemetry privacy proof (M6, scripts/sentry-proof-listener.cjs) been run and passed for
 * crash-only capture? Until it has, a build with Join by code on sends nothing to Sentry, exactly
 * as build 33. Turn this on only with the proof's PASS line recorded on the release ticket.
 */
export const SENTRY_TELEMETRY_PROOF_PASSED = false;

const LOCAL_PROOF_DSN = /^http:\/\/[^@/\s]+@(127\.0\.0\.1|localhost)(:\d+)?\/\d+$/;

/** Whether Sentry runs at all. */
export function sentryEnabled(
  build: { isPublicShare: boolean; joinByCodeOn: boolean; isDevBuild: boolean; proofDsn: string | undefined },
  proofPassed: boolean = SENTRY_TELEMETRY_PROOF_PASSED,
): boolean {
  if (build.isPublicShare) return false;
  if (!build.joinByCodeOn || proofPassed) return true;
  // Join by code on, proof not passed: only the proof run itself, on this machine.
  return build.isDevBuild && !!build.proofDsn && LOCAL_PROOF_DSN.test(build.proofDsn);
}

/**
 * Everything Sentry.init needs to decide whether anything starts. Off is not "enabled: false" with
 * a DSN: the Android native start reads the DSN and ignores "enabled". Off is no DSN and no
 * native SDK, which stops both the JavaScript and the native side on iPhone and Android alike.
 */
export function sentryStart(
  real: string,
  build: { isPublicShare: boolean; joinByCodeOn: boolean; isDevBuild: boolean; proofDsn: string | undefined },
  proofPassed: boolean = SENTRY_TELEMETRY_PROOF_PASSED,
): { enabled: boolean; dsn: string | undefined; enableNative: boolean; autoInitializeNativeSdk: boolean } {
  const enabled = sentryEnabled(build, proofPassed);
  if (!enabled) return { enabled: false, dsn: undefined, enableNative: false, autoInitializeNativeSdk: false };
  return { enabled: true, dsn: sentryDsn(real, build.proofDsn, build.isDevBuild), enableNative: true, autoInitializeNativeSdk: true };
}
