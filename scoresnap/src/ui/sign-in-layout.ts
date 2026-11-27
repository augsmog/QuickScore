/** Layout rule for the Sign in screen. Pure so phone sizes can be tested. */
// Space above the wordmark, inside the safe area. The column is anchored from the top by this
// share of the window (never centred: a centred column sat low on iPhone 17 Pro, 27 Nov), and
// gives the space back on a short phone where the form needs it.
export function signInTopSpace(windowHeight: number): number {
  if (!Number.isFinite(windowHeight) || windowHeight < 700) return 24;
  return Math.round(windowHeight * 0.12);
}
