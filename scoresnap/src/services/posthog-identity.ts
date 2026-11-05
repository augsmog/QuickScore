type AnonymousPostHogClient = {
  get_distinct_id(): string;
  identify(distinctId: string): void;
};

/** Re-identify with the SDK's current anonymous ID without attaching account data. */
export function identifyAnonymousOnly(client: AnonymousPostHogClient): string {
  const anonymousDistinctId = client.get_distinct_id();
  client.identify(anonymousDistinctId);
  return anonymousDistinctId;
}
