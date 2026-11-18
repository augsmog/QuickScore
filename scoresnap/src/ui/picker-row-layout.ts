/** Layout rules for Settings PickerRow (AUG-1228). Pure so it can be tested without a device. */
export const PICKER_ROW_MIN_TARGET_PX = 44;

export const PICKER_ROW_STYLE = {
  paddingHorizontal: 16,
  paddingVertical: 14,
  // Guarantee the 44px target at first paint: a row must neither shrink nor collapse
  // when the ScrollView lays out before fonts/icons measure.
  minHeight: PICKER_ROW_MIN_TARGET_PX,
  flexShrink: 0,
  marginBottom: 6,
} as const;
