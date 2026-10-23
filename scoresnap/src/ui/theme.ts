// Sunday Ledger Design System
// Cream paper, forest accents, and Marcellus display type

export const COLORS = {
  // Tonal Foundation
  bg: "#FAF4E8",
  surface: "#FFFFFF",
  surfaceLowest: "#FFFFFF",
  surfaceLow: "#FAF4E8",
  surfaceMid: "#F3ECDD",
  surfaceHigh: "#F3ECDD",
  surfaceHighest: "#E7EEE6",

  // Primary (Forest)
  primary: "#175C3A",
  primaryContainer: "#175C3A",
  onPrimary: "#FFFFFF",
  primaryFixed: "#175C3A",
  primaryDim: "#175C3A",

  // Text
  text: "#17251E",
  textDim: "#5E6257",
  onSurfaceVariant: "#5E6257",

  // Semantic
  error: "#A3261B",
  errorContainer: "#A3261B",
  warn: "#9A4A12",
  warnContainer: "#FFF0CC",
  gold: "#8A6A00",
  silver: "#62665F",
  bronze: "#88552A",

  // Secondary
  secondary: "#5E6257",
  secondaryContainer: "#E7EEE6",

  // Tertiary
  tertiary: "#9A4A12",
  tertiaryContainer: "#F3ECDD",

  // Paper rules and borders
  outline: "#E3D9C6",
  outlineVariant: "#E3D9C6",

  // Legacy aliases (for gradual migration)
  accent: "#175C3A",
  accentDim: "#175C3A",
  accentGlow: "rgba(23,92,58,0.10)",
  card: "#FFFFFF",
  cardHover: "#FAF4E8",
  border: "#E3D9C6",
  inputBg: "#FFFFFF",
  danger: "#A3261B",
  purple: "#70408D",
  blue: "#245C98",
} as const;

export function scoreColor(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -2) return COLORS.gold;
  if (diff === -1) return COLORS.primary;
  if (diff === 0) return COLORS.text;
  if (diff === 1) return COLORS.warn;
  return COLORS.error;
}

export function scoreName(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -3) return "albatross";
  if (diff === -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "double";
  return "triple+";
}

export const RANK_COLORS = [COLORS.gold, COLORS.silver, COLORS.bronze] as const;

// No small radii — minimum 12px per design system
export const RADII = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const FONTS = {
  // Display headings and branding
  headline: "Marcellus_400Regular",
  headlineMedium: "Marcellus_400Regular",
  headlineBlack: "Marcellus_400Regular",
  display: "Marcellus_400Regular",
  displaySC: "MarcellusSC_400Regular",
  score: "SourceSans3_600SemiBold",
  // Operational text and data
  regular: "SourceSans3_400Regular",
  medium: "SourceSans3_500Medium",
  semibold: "SourceSans3_600SemiBold",
  bold: "SourceSans3_700Bold",
  extrabold: "SourceSans3_800ExtraBold",
} as const;

export const TYPOGRAPHY = {
  displayLg: { fontSize: 56, fontFamily: FONTS.headline, letterSpacing: -1.5 },
  display: { fontSize: 32, fontFamily: FONTS.headline, letterSpacing: -0.5 },
  headline: { fontSize: 24, fontFamily: FONTS.headline, letterSpacing: -0.3 },
  headlineSm: { fontSize: 20, fontFamily: FONTS.headlineMedium },
  title: { fontSize: 18, fontFamily: FONTS.bold },
  body: { fontSize: 15, fontFamily: FONTS.regular },
  caption: { fontSize: 14, fontFamily: FONTS.medium },
  label: {
    fontSize: 11,
    fontFamily: FONTS.displaySC,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  labelSm: {
    fontSize: 10,
    fontFamily: FONTS.displaySC,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
  },
} as const;

// Primary elements have no glow
export const GLOW = {
  primary: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 20,
  },
  primaryStrong: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 30,
  },
} as const;
