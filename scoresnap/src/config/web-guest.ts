// The public website (snapscore.autumn8.me) is for joining a round, keeping a card and
// watching. Creating rounds, paying and settings stay in the app. The site build sets
// this flag; ordinary web builds used for testing the whole app do not.
export const WEB_GUEST_ONLY = process.env.EXPO_PUBLIC_WEB_GUEST_ONLY === "true";

/** First path segment of every page a browser guest may use. */
export const GUEST_ROUTES: readonly string[] = ["join", "p", "r"];

/** True when this page must not open on the guest-only website. Never true in the native app. */
export function guestOnlyBlocks(platform: string, guestOnly: boolean, firstSegment: string | undefined): boolean {
  return platform === "web" && guestOnly && !GUEST_ROUTES.includes(firstSegment ?? "");
}
