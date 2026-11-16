/** Layout rules for the guest account-handoff panel. Pure so device profiles can be tested (AUG-1160). */
export const HANDOFF_MIN_TARGET_PX = 44;

export function accountHandoffLayout(
  viewport: { width: number; height: number },
  insets: { top: number; left?: number; right?: number },
) {
  const compact = viewport.width <= 400 || viewport.height < 700;
  const pad = compact ? 4 : 16;
  return {
    compact,
    // Panel is the first child of the root view, so it must clear the top inset itself.
    paddingTop: insets.top + pad,
    paddingBottom: pad,
    paddingLeft: (insets.left ?? 0) + pad,
    paddingRight: (insets.right ?? 0) + pad,
    actionMinHeight: HANDOFF_MIN_TARGET_PX,
  };
}
