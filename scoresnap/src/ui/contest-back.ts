// AUG-1129: Back from a round's nested screens (edit, tournament-rounds) must return to the tab the
// user came from, even after a web reload wipes the in-memory navigation history. The originating tab
// travels in the URL (?from=<tab>), which survives reload, instead of relying on router.back().
export const CONTEST_TABS = ["scorecard", "leaderboard", "games", "settlement"] as const;
export type ContestTab = (typeof CONTEST_TABS)[number];

export function contestTabFromPathname(pathname: string): ContestTab {
  const route = pathname.replace(/\/$/, "").split("/").slice(3).join("/");
  return CONTEST_TABS.find((t) => t === route) ?? "scorecard";
}

export function contestChildHref(id: string, child: "edit" | "tournament-rounds", from: ContestTab): string {
  return `/contest/${id}/${child}?from=${from}`;
}

export function contestBackHref(id: string, from?: string | string[]): string {
  const raw = Array.isArray(from) ? from[0] : from;
  const tab = CONTEST_TABS.find((t) => t === raw) ?? "scorecard";
  return `/contest/${id}/${tab}`;
}
