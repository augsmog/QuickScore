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

// How a Settings switch looks. iPhone: the stock switch; the brand colour is the ON track only.
// Nothing is set for the off state and nothing is ever painted behind the switch (27 Nov:
// ios_backgroundColor showed as a crescent past the iOS 26 switch; trackColor.false left the off
// track the colour of the row). The off state is made visible by the row being white instead.
// Android and web: as before.
export function settingsSwitchProps(platformOS: string | undefined, value: boolean, colors: { primary: string; textDim: string; surfaceHigh: string }) {
  if (platformOS === 'ios') return { trackColor: { true: colors.primary } };
  return {
    style: SETTINGS_SWITCH_TARGET,
    trackColor: { false: colors.surfaceHigh, true: colors.primary + '55' },
    thumbColor: value ? colors.primary : colors.textDim,
  };
}

// The wrapper around a Settings switch in a pressable row. It centres itself in the row and its
// switch within it. Alignment only: no size, no background, so nothing can be painted or clipped.
export const SETTINGS_SWITCH_CENTRE = { alignSelf: 'center' as const, alignItems: 'center' as const, justifyContent: 'center' as const };

// Every Settings row and card: white with a hairline edge on the cream page, the standard iOS
// grouped-list look, so stock controls read as they do in any iOS list.
export function settingsRowSurface(colors: { border: string }) {
  return { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border };
}

// The value on the right of a row ("White", "Tournament Director", "5"). It may take at most half
// the row, gives way before the label does, and wraps right-aligned, so at large text sizes on a
// narrow phone the row grows taller instead of the value running off it.
export const SETTINGS_VALUE_COLUMN = { flexShrink: 1, maxWidth: '50%' as const, textAlign: 'right' as const };

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
