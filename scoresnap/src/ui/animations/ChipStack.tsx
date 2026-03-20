import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from "react-native-reanimated";
import { COLORS } from "../theme";
import { ScoreCounter } from "./ScoreCounter";

interface ChipStackProps {
  amount: number;
  playerName: string;
}

const CHIP_COLORS = [
  COLORS.gold,
  COLORS.accent,
  COLORS.gold,
  COLORS.accent,
  COLORS.gold,
  COLORS.accent,
];

export function ChipStack({ amount, playerName }: ChipStackProps) {
  const chipCount = Math.min(Math.max(Math.ceil(Math.abs(amount) / 10), 3), 6);

  return (
    <View style={{ alignItems: "center", paddingVertical: 16 }}>
      {/* Chip stack */}
      <View style={{ height: chipCount * 8 + 20, justifyContent: "flex-end", marginBottom: 12 }}>
        {Array.from({ length: chipCount }).map((_, i) => (
          <Chip key={i} index={i} color={CHIP_COLORS[i % CHIP_COLORS.length]} total={chipCount} />
        ))}
      </View>

      {/* Amount counter */}
      <ScoreCounter
        target={amount}
        prefix="$"
        duration={1000}
        delay={chipCount * 100 + 200}
        style={{
          color: amount >= 0 ? COLORS.accent : COLORS.danger,
          fontSize: 28,
          fontWeight: "800",
        }}
      />

      {/* Player name */}
      <Text
        style={{
          color: COLORS.text,
          fontSize: 14,
          fontWeight: "600",
          marginTop: 4,
        }}
      >
        {playerName}
      </Text>
    </View>
  );
}

function Chip({
  index,
  color,
  total,
}: {
  index: number;
  color: string;
  total: number;
}) {
  const translateY = useSharedValue(-100);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    const delay = (total - index - 1) * 100;
    translateY.value = withDelay(delay, withSpring(0, { damping: 10, stiffness: 180 }));
    scale.value = withDelay(delay, withSpring(1, { damping: 12 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 60,
          height: 12,
          borderRadius: 6,
          backgroundColor: color,
          marginBottom: -4,
          borderWidth: 1.5,
          borderColor: color + "88",
          shadowColor: color,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
        },
        style,
      ]}
    />
  );
}
