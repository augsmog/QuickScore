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

/**
 * Where the New Contest list meets the pinned Continue footer (layout gate rule 2).
 *
 * The footer sits below the list, so the list ends at a hard edge and the card at that edge when
 * the screen is at rest looked sliced by the footer. The list now fades into the background over
 * its last `WIZARD_FOOTER_FADE_PX`, and ends with `WIZARD_END_SPACE_PX` of empty space so that,
 * scrolled to the end, the last card is fully above the fade. tests/new-contest-footer-fade.test.cjs.
 */
export const WIZARD_FOOTER_FADE_PX = 24;
export const WIZARD_END_SPACE_PX = 96;

/** Gradient stops for the fade: the background colour from fully clear to fully solid. */
export function wizardFooterFadeColors(background: string): readonly [string, string] {
  if (!/^#[0-9A-Fa-f]{6}$/.test(background)) throw new Error('wizardFooterFadeColors needs a #RRGGBB colour');
  return [`${background}00`, background];
}

// Test ids of a player row's own controls (remove, handicap, group chip, team chip).
// - By name where a test addresses a row by the player it typed: web always; Android when the row
//   has a name; iPhone for player one.
// - By position (1-based) where a name cannot identify the row: iPhone for every later player
//   (the layout gate's same-state proof), and Android for a blank row. Blank rows all share the
//   empty name, so their name-built ids collide and the gate cannot follow one control through a
//   scroll.
export type PlayerControlKind = 'remove' | 'handicap' | 'group' | 'team';
export function playerControlTestId(
  kind: PlayerControlKind,
  row: { platformOS?: string; index: number; name: string; teamId?: string },
): string {
  if (kind === 'team' && !row.teamId) throw new Error('playerControlTestId: a team chip needs its team id');
  const byPosition = (row.platformOS === 'ios' && row.index > 0) || (row.platformOS === 'android' && row.name.trim() === '');
  const n = row.index + 1;
  switch (kind) {
    case 'remove': return byPosition ? `wizard-remove-player-${n}` : `remove-player-${row.name}`;
    case 'handicap': return byPosition ? `wizard-player-handicap-${n}` : `player-handicap-${row.name}`;
    case 'group': return byPosition ? `wizard-player-group-${n}` : `player-group-${row.name}`;
    case 'team': return byPosition ? `wizard-player-team-${n}-${row.teamId}` : `player-team-${row.name}-${row.teamId}`;
    default: throw new Error(`playerControlTestId: unknown kind ${String(kind)}`);
  }
}
