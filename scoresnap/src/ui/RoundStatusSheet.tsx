import { useEffect } from "react";
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Contest } from "../stores/contest-store";
import { OnlineSyncPanel } from "./OnlineSyncPanel";
import { LiveShare } from "./LiveShare";
import { ContestJoinCode } from "./ContestJoinCode";
import { COLORS, FONTS, RADII } from "./theme";

// The sheet stays mounted while hidden so an open Online sync session keeps
// pulling guest scores and the join code stays ready, as when these panels
// sat inline above the scorecard. Hidden means display: none, so it is out of
// layout, touch and the accessibility tree.
export function RoundStatusSheet({ contest, visible, onClose }: {
  contest: Contest;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);
  return (
    <View pointerEvents={visible ? "auto" : "none"}
      style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50, justifyContent: "flex-end",
        backgroundColor: COLORS.sheetScrim, display: visible ? "flex" : "none" }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close round status"
        onPress={onClose} style={{ flex: 1 }} />
      <View testID="round-status-sheet" accessibilityViewIsModal
        style={{ backgroundColor: COLORS.surface, borderTopLeftRadius: RADII.xl,
          borderTopRightRadius: RADII.xl, padding: 20, paddingBottom: Math.max(20, insets.bottom), maxHeight: "85%" }}>
        <Text accessibilityRole="header" style={{ fontFamily: FONTS.headline, fontSize: 24, color: COLORS.text, marginBottom: 16 }}>
          Round status
        </Text>
        <ScrollView>
          <OnlineSyncPanel contest={contest} />
          <LiveShare contest={contest} publish={false} />
          <ContestJoinCode contest={contest} />
        </ScrollView>
        <Pressable testID="round-status-done" accessibilityRole="button" onPress={onClose}
          style={{ minHeight: 52, width: "100%", backgroundColor: COLORS.primary,
            borderRadius: RADII.md, alignItems: "center", justifyContent: "center", marginTop: 16 }}>
          <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.onPrimary }}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}
