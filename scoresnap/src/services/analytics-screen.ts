const SCREEN_NAMES = new Set([
  "home", "contests", "profile", "leagues", "onboarding", "sign_in",
  "scan", "scan_review", "scan_game_details", "contest", "contest_scorecard",
  "contest_settlement", "contest_games", "contest_edit", "contest_tournament_rounds",
  "statistics", "settings", "join", "public_share", "other",
]);

export function screenNameFromSegments(segments: readonly string[]): string {
  const parts = segments.filter((part) => part && !part.startsWith("("));
  if (parts.length === 0 || parts.join("/") === "index") return "home";
  const joined = parts.join("/");
  const names: Record<string, string> = {
    "onboarding": "onboarding",
    "auth/sign-in": "sign_in",
    "scan": "scan",
    "scan/review": "scan_review",
    "scan/game-details": "scan_game_details",
    "settings": "settings",
    "statistics": "statistics",
    "contest/new": "contest",
    "contest/[id]": "contest",
    "contest/[id]/scorecard": "contest_scorecard",
    "contest/[id]/settlement": "contest_settlement",
    "contest/[id]/games": "contest_games",
    "contest/[id]/edit": "contest_edit",
    "contest/[id]/tournament-rounds": "contest_tournament_rounds",
    "join/[code]": "join",
    "r/[token]": "public_share",
  };
  if (names[joined]) return names[joined];
  if (parts.length === 1 && ["contests", "profile", "leagues"].includes(parts[0])) return parts[0];
  return SCREEN_NAMES.has(joined) ? joined : "other";
}
