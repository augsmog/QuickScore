import React from "react";
import { COLORS } from "./theme";
import { Modal, View, StyleSheet, type ModalProps, type ViewProps } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets, useSafeAreaFrame, type Edge } from "react-native-safe-area-context";

/** Shared page boundary. Insets are applied in JS, including in a Modal's new native root. */
export function SafeScreen({ edges = ["top", "right", "bottom", "left"], style, ...props }: ViewProps & { edges?: readonly Edge[] }) {
  const insets = useSafeAreaInsets();
  const s = StyleSheet.flatten(style) || {};
  const padding = (edge: Edge, value: unknown) => (typeof value === "number" ? value : 0) + (edges.includes(edge) ? insets[edge] : 0);
  return <View {...props} style={[style, {
    paddingTop: padding("top", s.paddingTop ?? s.paddingVertical ?? s.padding),
    paddingRight: padding("right", s.paddingRight ?? s.paddingHorizontal ?? s.padding),
    paddingBottom: padding("bottom", s.paddingBottom ?? s.paddingVertical ?? s.padding),
    paddingLeft: padding("left", s.paddingLeft ?? s.paddingHorizontal ?? s.padding),
  }]} />;
}

/** Every RN Modal owns a provider: its native window is separate from the router's root.
 * Seed with current parent metrics to avoid an unsafe first frame; the local provider
 * then measures this window (and updates on rotation). Never use cached launch metrics.
 * Pages inside the boundary must not add a second safe-area boundary.
 */
export function FullScreenSheet({ children, ...props }: ModalProps) {
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  return <Modal {...props}>
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <SafeScreen testID="safe-modal-content" style={{ flex: 1, backgroundColor: props.transparent ? "transparent" : COLORS.bg }}>{children}</SafeScreen>
    </SafeAreaProvider>
  </Modal>;
}
