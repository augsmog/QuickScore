// AUG-253j (AUG-746): fixture/debug source for the pinned-"You" leaderboard row.
//
// There is NO real user↔player link yet — that is AUG-254 (Backlog, explicitly out of
// scope here). Until it lands, the leaderboard can only pin a KNOWN player id supplied by
// a test fixture or a debug hook, never one derived from the signed-in account. This keeps
// the "You" chrome shippable and testable without inventing the product link.
//
// In production this returns `undefined`, so the leaderboard is byte-for-byte unchanged
// (no row is pinned, no chip renders). A capture harness or manual QA sets the global
// `__SNAPSCORE_FIXTURE_YOU__` to a player id to exercise the pinned state (e.g. the
// 390×844 web screenshots on the 16-player fixture, AUG-253j AC-3).

/** Loosely-typed view of the one global this hook reads; absent in production. */
type FixtureGlobal = { __SNAPSCORE_FIXTURE_YOU__?: unknown };

/**
 * The fixture/debug "you" player id, or `undefined` when none is set (the production
 * default). Only a non-empty string is honored.
 */
export function getFixtureYouPlayerId(): string | undefined {
  const g = globalThis as unknown as FixtureGlobal;
  const value = g.__SNAPSCORE_FIXTURE_YOU__;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
