import { View, Text } from "react-native";
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { COLORS } from "../theme";

type SceneProps = { scrollX: SharedValue<number>; pageIndex: number; pageWidth: number };

function ScoringScene({ scrollX, pageIndex, pageWidth, manual = false }: SceneProps & { manual?: boolean }) {
  const visibility = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [(pageIndex - 1) * pageWidth, pageIndex * pageWidth, (pageIndex + 1) * pageWidth], [0, 1, 0], "clamp"),
  }));
  const accent = manual ? COLORS.accent : COLORS.gold;
  return (
    <Animated.View accessibilityLabel={manual ? "Manual scorecard illustration" : "Settle-up ledger illustration"}
      style={[{ height: 220, width: 260, justifyContent: "center", marginBottom: 20 }, visibility]}>
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: accent, padding: 18, backgroundColor: COLORS.surface }}>
        <Text style={{ color: accent, fontSize: 15, fontWeight: "800", marginBottom: 16 }}>
          {manual ? "HOLE 7 · PAR 4" : "SETTLE UP"}
        </Text>
        {(manual ? [["Amy", "−   4   +"], ["Ben", "−   5   +"], ["Sam", "−   4   +"]] : [["Ben → Amy", "$12"], ["Sam → Amy", "$8"], ["Sam → Ben", "$4"]]).map(([name, value]) => (
          <View key={name} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            <Text style={{ color: COLORS.text, fontSize: 15 }}>{name}</Text>
            <Text style={{ color: accent, fontSize: 16, fontWeight: "700" }}>{value}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

export function SettlementScene(props: SceneProps) { return <ScoringScene {...props} />; }
export function ManualScoreScene(props: SceneProps) { return <ScoringScene {...props} manual />; }
