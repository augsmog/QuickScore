/** Add an explicit TD entitlement to the organizer's disposable browser fixture. */
export function withTdFixtureEntitlement(serialized) {
  const parsed = serialized ? JSON.parse(serialized) : { state: {}, version: 0 };
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Invalid persisted scan fixture');
  }
  const state = parsed.state && typeof parsed.state === 'object' && !Array.isArray(parsed.state)
    ? parsed.state
    : {};
  return JSON.stringify({
    ...parsed,
    state: { ...state, tier: 'td', isPro: true, isTD: true },
  });
}
