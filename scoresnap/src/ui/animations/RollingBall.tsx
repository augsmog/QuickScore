import { useEffect } from "react";
import { View, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, Ellipse } from "react-native-svg";
import { COLORS } from "../theme";

const BALL_SIZE = 28;

interface RollingBallProps {
  width?: number;
}

export function RollingBall({ width: containerWidth }: RollingBallProps) {
  const w = containerWidth || Dimensions.get("window").width - 80;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const ballStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [-w / 2 + BALL_SIZE, w / 2 - BALL_SIZE]);
    const rotate = interpolate(progress.value, [0, 1], [0, 720]);
    return {
      transform: [{ translateX }, { rotate: `${rotate}deg` }],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [-w / 2 + BALL_SIZE, w / 2 - BALL_SIZE]);
    const scaleX = interpolate(progress.value, [0, 0.5, 1], [0.8, 1.1, 0.8]);
    return {
      transform: [{ translateX }, { scaleX }],
      opacity: interpolate(progress.value, [0, 0.5, 1], [0.2, 0.35, 0.2]),
    };
  });

  return (
    <View style={{ alignItems: "center", justifyContent: "center", height: 60, width: w }}>
      {/* Shadow */}
      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: 4,
            width: BALL_SIZE,
            height: 8,
            borderRadius: BALL_SIZE / 2,
            backgroundColor: COLORS.accent,
          },
          shadowStyle,
        ]}
      />

      {/* Ball */}
      <Animated.View style={[{ position: "absolute" }, ballStyle]}>
        <Svg width={BALL_SIZE} height={BALL_SIZE} viewBox="0 0 28 28">
          <Circle cx={14} cy={14} r={13} fill="#f0f0f0" />
          <Circle cx={14} cy={14} r={13} fill="none" stroke="#e0e0e0" strokeWidth={1} />
          <Circle cx={10} cy={10} r={1.5} fill="#ddd" />
          <Circle cx={14} cy={8} r={1.5} fill="#ddd" />
          <Circle cx={18} cy={10} r={1.5} fill="#ddd" />
          <Circle cx={10} cy={14} r={1.5} fill="#ddd" />
          <Circle cx={18} cy={14} r={1.5} fill="#ddd" />
          <Circle cx={14} cy={18} r={1.5} fill="#ddd" />
          <Circle cx={10} cy={11} r={5} fill="#fff" opacity={0.3} />
        </Svg>
      </Animated.View>

      {/* Ground line */}
      <View
        style={{
          position: "absolute",
          bottom: 6,
          width: w,
          height: 1,
          backgroundColor: COLORS.border,
        }}
      />
    </View>
  );
}
