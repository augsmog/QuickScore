/** Layout rules for the guest (local-join) limitation banner. Pure so profiles can be tested. */
export const MIN_TARGET_PX = 44;
export const BANNER_TOP_GAP = 16;

export function localJoinBannerLayout(windowHeight: number, insets: { top: number; bottom: number }) {
  const compact = windowHeight < 700;
  return {
    compact,
    // Banner is placed below the top inset (SafeScreen padding) plus a gap.
    topOffset: insets.top + BANNER_TOP_GAP,
    actionMinHeight: MIN_TARGET_PX,
    // Remaining body room after both safe bands.
    usableHeight: windowHeight - insets.top - insets.bottom,
  };
}
