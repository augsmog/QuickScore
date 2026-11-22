/** Touch-target rules for the multi-day tournament setup controls (AUG-1165). Pure so it can be tested. */
export const SETUP_MIN_TARGET_PX = 44;

export const roundCountPillStyle = {
  minWidth: SETUP_MIN_TARGET_PX,
  minHeight: SETUP_MIN_TARGET_PX,
  paddingHorizontal: 16,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

export const nameInputMinHeight = SETUP_MIN_TARGET_PX;
export const handicapInputBox = {minHeight: SETUP_MIN_TARGET_PX, width: 60};

/**
 * Tap slot for a native `Switch` (AUG-1367). A native iOS UISwitch has a fixed
 * intrinsic size (~51x31pt); forcing it into `style={{ width: 44, height: 44 }}`
 * does not shrink it — the switch overflows the 44pt box and draws on top of its
 * adjacent label (the Multi-Day toggle/label overlap in the owner smoke test).
 * Instead we wrap the switch in a centered slot that guarantees a >=44pt tap
 * target while letting the switch keep its intrinsic size, so it never overflows
 * into neighbouring content.
 */
export const switchTapSlot = {
  minWidth: SETUP_MIN_TARGET_PX,
  minHeight: SETUP_MIN_TARGET_PX,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
export const groupChipStyle = {
  minWidth: SETUP_MIN_TARGET_PX,
  minHeight: SETUP_MIN_TARGET_PX,
  paddingHorizontal: 8,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
