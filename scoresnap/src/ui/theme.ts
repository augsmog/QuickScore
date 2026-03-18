export const COLORS = {
  bg: "#0a1628",
  card: "#111d33",
  cardHover: "#162545",
  accent: "#00d47e",
  accentDim: "#00b86b",
  accentGlow: "rgba(0,212,126,0.15)",
  warn: "#ff6b35",
  danger: "#ff4757",
  gold: "#ffd700",
  silver: "#c0c0c0",
  bronze: "#cd7f32",
  text: "#e8edf5",
  textDim: "#7a8ba8",
  border: "#1e3050",
  inputBg: "#0d1f38",
  purple: "#a855f7",
  blue: "#3b82f6",
} as const;

export function scoreColor(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -2) return COLORS.gold;
  if (diff === -1) return COLORS.accent;
  if (diff === 0) return COLORS.text;
  if (diff === 1) return COLORS.warn;
  return COLORS.danger;
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
