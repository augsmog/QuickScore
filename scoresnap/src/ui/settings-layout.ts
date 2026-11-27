/** Layout rules for the Settings screen. Pure so device profiles can be tested (AUG-1163). */
export const SETTINGS_MIN_TARGET_PX = 44;
// Native iOS Switch is ~51x31; the named switch itself must be at least 44 tall and wide.
export const SETTINGS_SWITCH_SIZE = { width: 51, height: 31 };
// Default section-header top margin (AUG-1177). The Scoring section header uses a reduced
// margin so the Default Unit Amount / Distance Unit rows that follow it don't land partially
// below the first-paint viewport edge on SE/ProMax (J-delete-account settings-two-taps capture).
export const SETTINGS_SECTION_HEADER_MARGIN_TOP = 28;
export const SETTINGS_SCORING_HEADER_MARGIN_TOP = 16;

export const SETTINGS_SWITCH_TARGET = {
  minWidth: Math.max(SETTINGS_MIN_TARGET_PX, SETTINGS_SWITCH_SIZE.width),
  minHeight: Math.max(SETTINGS_MIN_TARGET_PX, SETTINGS_SWITCH_SIZE.height),
};

// The slot that carries the 44pt touch target around a switch. Never give the size or a
// background to the Switch itself on iPhone: iOS paints the background on the whole box, and a
// 44pt-tall box shows as a rounded rectangle sticking out below the 31pt switch (build 33).
export const SETTINGS_SWITCH_SLOT = { ...SETTINGS_SWITCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const };

// Off track on iPhone. The stock off track (#E9E9EA) is 1.11:1 against the cream row and all but
// vanishes; this is 3.14:1 against the row (#FAF4E8) and 3.44:1 against the white knob.
export const SETTINGS_SWITCH_OFF_TRACK = '#878C82';

// How a Settings switch looks. iPhone: the stock switch, brand colour on the "on" track and a
// visible off track. No size on it: React Native then paints the off colour on the stock 51x31
// box only. Android and web: as before.
export function settingsSwitchProps(platformOS: string | undefined, value: boolean, colors: { primary: string; textDim: string; surfaceHigh: string }) {
  if (platformOS === 'ios') return { trackColor: { true: colors.primary }, ios_backgroundColor: SETTINGS_SWITCH_OFF_TRACK };
  return {
    style: SETTINGS_SWITCH_TARGET,
    trackColor: { false: colors.surfaceHigh, true: colors.primary + '55' },
    thumbColor: value ? colors.primary : colors.textDim,
  };
}

export function settingsLayout(insets: { top: number; bottom: number; left?: number; right?: number }) {
  const left = insets.left ?? 0;
  const right = insets.right ?? 0;
  return {
    // The scroll viewport itself clears every band, including during intermediate scrolls.
    edges: ['top', 'bottom', 'left', 'right'] as const,
    scrollPaddingLeft: 16,
    scrollPaddingRight: 16,
    // Last row (Sign Out) must scroll clear of the home-indicator band.
    scrollPaddingBottom: 60 + insets.bottom,
    sideInset: { left, right },
    rowMinHeight: SETTINGS_MIN_TARGET_PX,
    switchTarget: SETTINGS_SWITCH_TARGET,
  };
}
