import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  interpolate,
  Easing,
  SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Line, Rect, G } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { COLORS } from "../theme";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

interface GolfBallSceneProps {
  scrollX: SharedValue<number>;
  pageIndex: number;
  pageWidth: number;
}

export function GolfBallScene({ scrollX, pageIndex, pageWidth }: GolfBallSceneProps) {
  const ballY = useSharedValue(-80);
  const ballScale = useSharedValue(0);
  const floatY = useSharedValue(0);
  const squishX = useSharedValue(1);
  const squishY = useSharedValue(1);
  const scanLineY = useSharedValue(0);
  const dimpleRotation = useSharedValue(0);

  useEffect(() => {
    // Ball bounces in
    ballY.value = withDelay(200, withSpring(0, { damping: 12, stiffness: 150 }));
    ballScale.value = withDelay(200, withSpring(1, { damping: 14, stiffness: 180 }));

    // Gentle floating
    floatY.value = withDelay(
      800,
      withRepeat(
        withTiming(8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );

    // Scan line sweep
    scanLineY.value = withDelay(
      1000,
      withRepeat(
        withSequence(
          withTiming(60, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      )
    );

    // Dimple rotation
    dimpleRotation.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    squishX.value = withSequence(
      withTiming(1.18, { duration: 80 }),
      withSpring(1, { damping: 8, stiffness: 300 })
    );
    squishY.value = withSequence(
      withTiming(0.82, { duration: 80 }),
      withSpring(1, { damping: 8, stiffness: 300 })
    );
  };

  const containerStyle = useAnimatedStyle(() => {
    const vis = interpolate(
      scrollX.value,
      [(pageIndex - 1) * pageWidth, pageIndex * pageWidth, (pageIndex + 1) * pageWidth],
      [0, 1, 0],
      "clamp"
    );
    return { opacity: vis };
  });

  const ballStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: ballY.value + floatY.value },
      { scaleX: squishX.value * ballScale.value },
      { scaleY: squishY.value * ballScale.value },
    ],
  }));

  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value }],
    opacity: 0.7,
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: interpolate(floatY.value, [0, 8], [1, 0.85]) },
      { scaleY: interpolate(floatY.value, [0, 8], [1, 0.7]) },
    ],
    opacity: interpolate(floatY.value, [0, 8], [0.3, 0.15]),
  }));

  return (
    <Animated.View
      style={[
        { alignItems: "center", justifyContent: "center", height: 220, width: 200 },
        containerStyle,
      ]}
    >
      {/* Shadow */}
      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: 20,
            width: 80,
            height: 16,
            borderRadius: 40,
            backgroundColor: COLORS.accent,
          },
          shadowStyle,
        ]}
      />

      {/* Golf Ball */}
      <Pressable onPress={handleTap}>
        <Animated.View style={[{ alignItems: "center" }, ballStyle]}>
          <Svg width={100} height={100} viewBox="0 0 100 100">
            {/* Main ball */}
            <Circle cx={50} cy={50} r={42} fill="#f0f0f0" />
            <Circle cx={50} cy={50} r={42} fill="none" stroke="#e0e0e0" strokeWidth={1.5} />

            {/* Dimple pattern */}
            <Circle cx={35} cy={35} r={3} fill="#ddd" />
            <Circle cx={50} cy={28} r={3} fill="#ddd" />
            <Circle cx={65} cy={35} r={3} fill="#ddd" />
            <Circle cx={30} cy={50} r={3} fill="#ddd" />
            <Circle cx={50} cy={50} r={3} fill="#ddd" />
            <Circle cx={70} cy={50} r={3} fill="#ddd" />
            <Circle cx={35} cy={65} r={3} fill="#ddd" />
            <Circle cx={50} cy={72} r={3} fill="#ddd" />
            <Circle cx={65} cy={65} r={3} fill="#ddd" />

            {/* Highlight */}
            <Circle cx={38} cy={38} r={12} fill="#fff" opacity={0.4} />
          </Svg>
        </Animated.View>
      </Pressable>

      {/* Scan line */}
      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: 30,
            width: 140,
            height: 2,
            backgroundColor: COLORS.accent,
            borderRadius: 1,
            shadowColor: COLORS.accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 8,
          },
          scanStyle,
        ]}
      />

      {/* Viewfinder corners */}
      <View style={{ position: "absolute", top: 0, left: 10, width: 20, height: 20, borderTopWidth: 2, borderLeftWidth: 2, borderColor: COLORS.accent, borderTopLeftRadius: 4 }} />
      <View style={{ position: "absolute", top: 0, right: 10, width: 20, height: 20, borderTopWidth: 2, borderRightWidth: 2, borderColor: COLORS.accent, borderTopRightRadius: 4 }} />
      <View style={{ position: "absolute", bottom: 10, left: 10, width: 20, height: 20, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: COLORS.accent, borderBottomLeftRadius: 4 }} />
      <View style={{ position: "absolute", bottom: 10, right: 10, width: 20, height: 20, borderBottomWidth: 2, borderRightWidth: 2, borderColor: COLORS.accent, borderBottomRightRadius: 4 }} />
    </Animated.View>
  );
}
