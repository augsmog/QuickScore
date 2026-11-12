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
