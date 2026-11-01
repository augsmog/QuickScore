import { useEffect, type ReactNode } from "react";
import { Text, View, StyleSheet } from "react-native";
import Animated, { FadeIn, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { COLORS, FONTS } from "../theme";
export type SceneProps = { scrollX: SharedValue<number>; pageIndex: number; pageWidth: number };
export function SceneFrame({ scrollX, pageIndex, pageWidth, label, children, accent }: SceneProps & { label: string; children: ReactNode; accent: string }) {
  const visibility = useAnimatedStyle(() => ({ opacity: interpolate(scrollX.value, [(pageIndex - 1) * pageWidth, pageIndex * pageWidth, (pageIndex + 1) * pageWidth], [0, 1, 0], "clamp") }));
  return <Animated.View accessible accessibilityLabel={label} style={[styles.frame, { borderColor: accent }, visibility]}><View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View></Animated.View>;
}
export function SceneRow({ index, active = false, children }: { index: number; active?: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => { if (active && !reduced) pulse.value = withDelay(400, withSequence(withTiming(1.025, { duration: 180 }), withTiming(1, { duration: 180 }))); }, [active, reduced, pulse]);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return <Animated.View entering={reduced ? undefined : FadeIn.delay(index * 80).duration(200)} style={[styles.row, active && styles.active, motion]}>{children}</Animated.View>;
}
export function SceneText({ children, muted = false }: { children: ReactNode; muted?: boolean }) { return <Text style={muted ? styles.muted : styles.text}>{children}</Text>; }
export const styles = StyleSheet.create({
 frame: { width: 260, borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: COLORS.surface, marginBottom: 20 },
 header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
 title: { fontFamily: FONTS.displaySC, fontSize: 15, letterSpacing: 1, color: COLORS.primary },
 text: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.text },
 muted: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim },
 row: { height: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderColor: COLORS.border },
 active: { backgroundColor: COLORS.secondaryContainer, borderWidth: 1, borderColor: COLORS.primary, borderRadius: 10, marginHorizontal: -4, paddingHorizontal: 8 },
 footer: { borderTopWidth: 1, borderColor: COLORS.border, marginTop: 8, paddingTop: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 },
 chip: { borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.secondaryContainer, paddingHorizontal: 10, paddingVertical: 4 },
});
