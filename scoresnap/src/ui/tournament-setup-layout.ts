/** Touch-target rules for the multi-day tournament setup controls (AUG-1165). Pure so it can be tested. */
export const SETUP_MIN_TARGET_PX = 44;

export const roundCountPillStyle = {
  minWidth: SETUP_MIN_TARGET_PX,
  minHeight: SETUP_MIN_TARGET_PX,
  paddingHorizontal: 16,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

/** Native Switch renders at its own intrinsic size (~51x31pt on iOS) regardless of an explicit
 * style box (AUG-1367: forcing a 44x44 style clipped/overlapped the control and its label).
 * hitSlop pads the real height up to the 44pt minimum touch target without resizing it. */
export const SWITCH_HIT_SLOP = {top: 7, bottom: 7, left: 0, right: 0};

export const nameInputMinHeight = SETUP_MIN_TARGET_PX;
export const handicapInputBox = {minHeight: SETUP_MIN_TARGET_PX, width: 60};
export const groupChipStyle = {
  minWidth: SETUP_MIN_TARGET_PX,
  minHeight: SETUP_MIN_TARGET_PX,
  paddingHorizontal: 8,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
