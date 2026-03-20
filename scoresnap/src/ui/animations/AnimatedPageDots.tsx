import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  interpolateColor,
  SharedValue,
} from "react-native-reanimated";
import { COLORS } from "../theme";

interface AnimatedPageDotsProps {
  scrollX: SharedValue<number>;
  pageWidth: number;
  count: number;
  colors: string[];
}

export function AnimatedPageDots({
  scrollX,
  pageWidth,
  count,
  colors,
}: AnimatedPageDotsProps) {
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
      {Array.from({ length: count }).map((_, i) => (
        <Dot
          key={i}
          index={i}
          scrollX={scrollX}
          pageWidth={pageWidth}
          colors={colors}
          count={count}
        />
      ))}
    </View>
  );
}

function Dot({
  index,
  scrollX,
  pageWidth,
  colors,
  count,
}: {
  index: number;
  scrollX: SharedValue<number>;
  pageWidth: number;
  colors: string[];
  count: number;
}) {
  const style = useAnimatedStyle(() => {
    const input = Array.from({ length: count }, (_, i) => i * pageWidth);

    const width = interpolate(
      scrollX.value,
      input,
      input.map((_, i) => (i === index ? 28 : 8)),
      "clamp"
    );

    const opacity = interpolate(
      scrollX.value,
      input,
      input.map((_, i) => (i === index ? 1 : 0.35)),
      "clamp"
    );

    const backgroundColor = interpolateColor(scrollX.value, input, colors);

    return { width, opacity, backgroundColor };
  });

  return (
    <Animated.View
      style={[
        {
          height: 8,
          borderRadius: 4,
          backgroundColor: COLORS.border,
        },
        style,
      ]}
    />
  );
}
