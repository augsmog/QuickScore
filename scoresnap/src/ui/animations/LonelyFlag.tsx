import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  interpolate,
  Easing,
} from "react-native-reanimated";
import Svg, { Line, Polygon, Ellipse, Circle } from "react-native-svg";
import { COLORS } from "../theme";

interface LonelyFlagProps {
  message?: string;
}

export function LonelyFlag({ message = "No rounds yet" }: LonelyFlagProps) {
  const flagWave = useSharedValue(0);
  const poleSway = useSharedValue(0);
  const cloud1X = useSharedValue(-60);
  const cloud2X = useSharedValue(-100);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    // Flag wave
    flagWave.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Pole sway
    poleSway.value = withRepeat(
      withSequence(
        withTiming(2, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-2, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Clouds drift
    cloud1X.value = withRepeat(
      withTiming(260, { duration: 10000, easing: Easing.linear }),
      -1,
      false
    );
    cloud2X.value = withDelay(
      3000,
      withRepeat(
        withTiming(260, { duration: 12000, easing: Easing.linear }),
        -1,
        false
      )
    );

    // Text fade in
    textOpacity.value = withDelay(600, withTiming(1, { duration: 500 }));
  }, []);

  const poleStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${poleSway.value}deg` }],
  }));

  const flagStyle = useAnimatedStyle(() => ({
    transform: [
      { skewX: `${interpolate(flagWave.value, [0, 1], [-3, 5])}deg` },
      { scaleX: interpolate(flagWave.value, [0, 1], [0.95, 1.05]) },
    ],
  }));

  const cloud1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: cloud1X.value }],
    opacity: 0.15,
  }));

  const cloud2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: cloud2X.value }],
    opacity: 0.1,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View style={{ alignItems: "center", paddingVertical: 40 }}>
      {/* Clouds */}
      <Animated.View style={[{ position: "absolute", top: 10 }, cloud1Style]}>
        <View style={{ flexDirection: "row", gap: -6 }}>
          <View style={{ width: 24, height: 12, borderRadius: 6, backgroundColor: COLORS.text }} />
          <View style={{ width: 18, height: 10, borderRadius: 5, backgroundColor: COLORS.text, marginTop: 2 }} />
        </View>
      </Animated.View>
      <Animated.View style={[{ position: "absolute", top: 30 }, cloud2Style]}>
        <View style={{ flexDirection: "row", gap: -4 }}>
          <View style={{ width: 20, height: 10, borderRadius: 5, backgroundColor: COLORS.text }} />
          <View style={{ width: 14, height: 8, borderRadius: 4, backgroundColor: COLORS.text, marginTop: 2 }} />
        </View>
      </Animated.View>

      {/* Flag assembly */}
      <Animated.View style={[{ alignItems: "center" }, poleStyle]}>
        {/* Flag */}
        <Animated.View style={[{ position: "absolute", top: 0, left: 4 }, flagStyle]}>
          <View
            style={{
              width: 28,
              height: 18,
              backgroundColor: COLORS.danger,
              borderTopRightRadius: 2,
              borderBottomRightRadius: 2,
            }}
          />
        </Animated.View>

        {/* Pole */}
        <View
          style={{
            width: 3,
            height: 80,
            backgroundColor: COLORS.text,
            borderRadius: 1.5,
            opacity: 0.7,
          }}
        />

        {/* Ball at base */}
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: "#f0f0f0",
            marginTop: -2,
          }}
        />
      </Animated.View>

      {/* Green island */}
      <View
        style={{
          width: 100,
          height: 14,
          borderRadius: 50,
          backgroundColor: COLORS.accent + "22",
          marginTop: -6,
        }}
      />

      {/* Grass tufts */}
      <View style={{ flexDirection: "row", gap: 24, marginTop: -8 }}>
        <View style={{ width: 2, height: 8, backgroundColor: COLORS.accent + "33", borderRadius: 1, transform: [{ rotateZ: "-15deg" }] }} />
        <View style={{ width: 2, height: 6, backgroundColor: COLORS.accent + "33", borderRadius: 1, transform: [{ rotateZ: "10deg" }] }} />
        <View style={{ width: 2, height: 7, backgroundColor: COLORS.accent + "33", borderRadius: 1, transform: [{ rotateZ: "-8deg" }] }} />
      </View>

      {/* Message */}
      <Animated.Text
        style={[
          {
            color: COLORS.textDim,
            fontSize: 14,
            fontWeight: "500",
            marginTop: 16,
          },
          textStyle,
        ]}
      >
        {message}
      </Animated.Text>
    </View>
  );
}
