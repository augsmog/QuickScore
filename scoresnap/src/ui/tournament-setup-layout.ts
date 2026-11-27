/** Touch-target rules for the multi-day tournament setup controls (AUG-1165). Pure so it can be tested.
 *
 * AUG-1165 established a 44pt baseline (iOS/web). AUG-1376's device-layout gate adds the Android
 * contract: Android Material tap targets must be >=48dp. So the minimum is platform-aware —
 * 48dp on Android, 44pt otherwise — expressed via `setupTargets(Platform.OS)` so this module stays
 * React-Native-free (it is imported by node:test suites that cannot resolve `react-native`).
 */
export const SETUP_MIN_TARGET_PX = 44; // iOS / web baseline (pt)
export const SETUP_MIN_TARGET_ANDROID_PX = 48; // Android (dp) — device-layout gate rule 5

/** Platform-aware minimum tap-target edge: 48dp on Android, else 44pt. */
export function setupMinTargetPx(platformOS?: string): number {
  return platformOS === 'android' ? SETUP_MIN_TARGET_ANDROID_PX : SETUP_MIN_TARGET_PX;
}

const square = (px: number) => ({
  minWidth: px,
  minHeight: px,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});

/**
 * All setup-control tap-target styles built for a platform. Android widens every target to 48dp;
 * other platforms keep the 44pt baseline. `new.tsx` builds these once from `Platform.OS`.
 *
 * `switchTapSlot` is the tap slot for a native `Switch` (AUG-1367 / AUG-1376). A native switch has a
 * fixed intrinsic size (iOS ~51x31pt, Android ~47x27dp) that `style={{width,height}}` cannot shrink,
 * and plain wrapper Views are flattened out of the native view tree — so the gate measured the bare
 * 47x27 switch. The slot therefore carries the control's testID (which also prevents RN view
 * flattening), guaranteeing a measured >=48dp tap target that centers the switch so it never
 * overflows its adjacent label.
 */
export function setupTargets(platformOS?: string) {
  const px = setupMinTargetPx(platformOS);
  return {
    minTarget: px,
    roundCountPillStyle: { ...square(px), paddingHorizontal: 16 },
    groupChipStyle: { ...square(px), paddingHorizontal: 8 },
    teamChipStyle: { ...square(px), paddingHorizontal: 6 },
    switchTapSlot: square(px),
    nameInputMinHeight: px,
    handicapInputBox: { minHeight: px, width: 60 },
  };
}

// Back-compatible 44pt baseline styles (existing imports / AUG-1165 tests). The screen uses the
// platform-aware `setupTargets()` variants above; these remain the documented baseline contract.
const baseline = setupTargets();
export const roundCountPillStyle = baseline.roundCountPillStyle;
export const groupChipStyle = baseline.groupChipStyle;
export const switchTapSlot = baseline.switchTapSlot;
export const nameInputMinHeight = baseline.nameInputMinHeight;
export const handicapInputBox = baseline.handicapInputBox;

/**
 * Safe-area edges for a screen presented as a modal (`presentation: "modal"`), such as New Contest.
 *
 * On iPhone that presentation is a sheet whose top already sits below the status bar. Applying the
 * status-bar inset again inside it leaves dead space above the header: 59pt on an iPhone 16 Pro,
 * which with the header's own 8pt is 67pt against the 32pt the layout gate allows (rule 4). So on
 * iPhone the sheet applies the bottom inset only. Android and web show the same route full screen
 * and still need the top inset. tests/new-contest-sheet-header.test.cjs pins this.
 */
export function modalSheetSafeEdges(platformOS?: string): readonly ('top' | 'bottom')[] {
  return platformOS === 'ios' ? ['bottom'] : ['top', 'bottom'];
}

/** Empty space at the end of the New Contest list, so the last card scrolls clear of the pinned footer. */
export const WIZARD_END_SPACE_PX = 96;
