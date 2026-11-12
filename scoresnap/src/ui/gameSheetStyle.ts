import type { ViewStyle } from "react-native";
import { COLORS } from "./theme";

// Shared by every game mode's info sheet.
export const GAME_SHEET_STYLE = {
  backgroundColor: COLORS.surfaceMid,
  borderTopWidth: 1,
  borderLeftWidth: 1,
  borderRightWidth: 1,
  borderColor: COLORS.sheetBorder,
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  shadowColor: COLORS.text,
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  elevation: 12,
} satisfies ViewStyle;
