/** New Contest layout rules (AUG-1367). Pure so it can be tested without a device. */
// Native iOS UISwitch intrinsic size. Never force a smaller/larger box onto the Switch itself:
// the forced 44x44 overflowed into the label margin. Pad a wrapper to reach the 44pt tap target.
export const SWITCH_INTRINSIC = {width: 51, height: 31};
export const SWITCH_TAP_TARGET = {minWidth: 51, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const};
export const SWITCH_LABEL_GAP = 12;
export const ROUNDS_BLOCK_PADDING_LEFT = 0;
export const SCROLL_END_SPACER = 120;
