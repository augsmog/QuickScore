/** Keep the account handoff banner out of full-screen score and contest routes. */
export function shouldShowAccountHandoff(segments: readonly string[]): boolean {
  if (segments[0] === "settings") return true;
  return segments[0] === "(tabs)" && (segments.length === 1 || segments[1] === "index");
}
