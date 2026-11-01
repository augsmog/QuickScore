import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Contest } from "../stores/contest-store";
import { OnlineSyncPanel } from "./OnlineSyncPanel";
import { LiveShare } from "./LiveShare";
import { ContestJoinCode } from "./ContestJoinCode";
import { COLORS, FONTS, RADII } from "./theme";

export function RoundStatusSheet({ contest, visible, onClose }: {
  contest: Contest;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: COLORS.sheetScrim }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close round status"
          onPress={onClose} style={{ flex: 1 }} />
        <View testID="round-status-sheet" accessibilityViewIsModal
          style={{ backgroundColor: COLORS.surface, borderTopLeftRadius: RADII.xl,
            borderTopRightRadius: RADII.xl, padding: 20, paddingBottom: Math.max(20, insets.bottom), maxHeight: "85%" }}>
          <Text accessibilityRole="header" style={{ fontFamily: FONTS.headline, fontSize: 24, color: COLORS.text, marginBottom: 16 }}>
            Round status
          </Text>
          <ScrollView>
            {visible && <>
              <OnlineSyncPanel contest={contest} />
              <LiveShare contest={contest} />
              <ContestJoinCode contest={contest} />
            </>}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose}
            style={{ minHeight: 52, width: "100%", backgroundColor: COLORS.primary,
              borderRadius: RADII.md, alignItems: "center", justifyContent: "center", marginTop: 16 }}>
            <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.onPrimary }}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
