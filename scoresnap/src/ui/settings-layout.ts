/** Layout rules for the Settings screen. Pure so device profiles can be tested (AUG-1163). */
export const SETTINGS_MIN_TARGET_PX = 44;
// Native iOS Switch is ~51x31; the touchable wrapper must be at least 44 tall and wide.
export const SETTINGS_SWITCH_SIZE = { width: 51, height: 31 };

export const SETTINGS_SWITCH_TARGET = {
  minWidth: Math.max(SETTINGS_MIN_TARGET_PX, SETTINGS_SWITCH_SIZE.width),
  minHeight: Math.max(SETTINGS_MIN_TARGET_PX, SETTINGS_SWITCH_SIZE.height),
};

export function settingsLayout(insets: { top: number; bottom: number; left?: number; right?: number }) {
  const left = insets.left ?? 0;
  const right = insets.right ?? 0;
  return {
    // Header + scroll content clear the side bands (landscape notch) via the container.
    edges: ['top', 'left', 'right'] as const,
    scrollPaddingLeft: 16,
    scrollPaddingRight: 16,
    // Last row (Sign Out) must scroll clear of the home-indicator band.
    scrollPaddingBottom: 60 + insets.bottom,
    sideInset: { left, right },
    rowMinHeight: SETTINGS_MIN_TARGET_PX,
    switchTarget: SETTINGS_SWITCH_TARGET,
  };
}
