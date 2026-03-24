// Midnight Fairway Design System
// "The Digital Caddie" — atmospheric depth with luminescent accents

export const COLORS = {
  // Tonal Foundation
  bg: "#0c1322",
  surface: "#0c1322",
  surfaceLowest: "#070e1d",
  surfaceLow: "#151b2b",
  surfaceMid: "#191f2f",
  surfaceHigh: "#232a3a",
  surfaceHighest: "#2e3545",

  // Primary (Fairway Green)
  primary: "#5bf393",
  primaryContainer: "#37d67a",
  onPrimary: "#00391a",
  primaryFixed: "#67fe9d",
  primaryDim: "#46e183",

  // Text
  text: "#dce2f8",
  textDim: "#bbcbbb",
  onSurfaceVariant: "#bbcbbb",

  // Semantic
  error: "#ffb4ab",
  errorContainer: "#93000a",
  warn: "#ffa777",
  gold: "#ffd700",
  silver: "#c0c0c0",
  bronze: "#cd7f32",

  // Secondary
  secondary: "#bcc7de",
  secondaryContainer: "#3e495d",

  // Tertiary
  tertiary: "#ffcdb5",
  tertiaryContainer: "#ffa777",

  // Outline (ghost borders only, at 15% opacity)
  outline: "#869586",
  outlineVariant: "#3c4a3e",

  // Legacy aliases (for gradual migration)
  accent: "#5bf393",
  accentDim: "#37d67a",
  accentGlow: "rgba(91,243,147,0.15)",
  card: "#191f2f",
  cardHover: "#232a3a",
  border: "#2e3545",
  inputBg: "#151b2b",
  danger: "#ffb4ab",
  purple: "#a855f7",
  blue: "#3b82f6",
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
  // Headlines, scores, branding
  headline: "SpaceGrotesk_700Bold",
  headlineMedium: "SpaceGrotesk_500Medium",
  headlineBlack: "SpaceGrotesk_700Bold",
  // Body, labels, data
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
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
    fontFamily: FONTS.bold,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  labelSm: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
} as const;

// Glow shadows for primary elements
export const GLOW = {
  primary: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  primaryStrong: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
  },
} as const;
