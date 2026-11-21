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
export const groupChipStyle = {
  minWidth: SETUP_MIN_TARGET_PX,
  minHeight: SETUP_MIN_TARGET_PX,
  paddingHorizontal: 8,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

/** Android uses a 48dp target; retain the established 44pt iOS/web baseline. */
export function setupTargets(platform?: string) {
  const minTarget = platform === 'android' ? 48 : SETUP_MIN_TARGET_PX;
  return { minTarget,
    roundCountPillStyle: { ...roundCountPillStyle, minWidth: minTarget, minHeight: minTarget },
    groupChipStyle: { ...groupChipStyle, minWidth: minTarget, minHeight: minTarget },
    nameInputMinHeight: minTarget,
    handicapInputBox: { ...handicapInputBox, minHeight: minTarget },
  };
}
