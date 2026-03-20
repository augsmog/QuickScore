import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  interpolate,
  Easing,
  SharedValue,
} from "react-native-reanimated";
import { COLORS } from "../theme";

interface LeaderboardSceneProps {
  scrollX: SharedValue<number>;
  pageIndex: number;
  pageWidth: number;
}

const PODIUM = [
  { label: "1st", width: 120, color: COLORS.gold, delay: 300 },
  { label: "2nd", width: 95, color: "#c0c0c0", delay: 450 },
  { label: "3rd", width: 70, color: "#cd7f32", delay: 600 },
];

const SPARKLES = [
  { x: -40, y: -15, delay: 800, size: 4 },
  { x: 35, y: -20, delay: 1100, size: 3 },
  { x: -30, y: 15, delay: 1400, size: 3.5 },
  { x: 45, y: 5, delay: 1000, size: 3 },
  { x: 0, y: -30, delay: 1300, size: 4.5 },
];

export function LeaderboardScene({ scrollX, pageIndex, pageWidth }: LeaderboardSceneProps) {
  const trophyScale = useSharedValue(0);
  const wobble = useSharedValue(0);

  useEffect(() => {
    trophyScale.value = withDelay(200, withSpring(1, { damping: 10, stiffness: 140 }));

    wobble.value = withDelay(
      800,
      withRepeat(
        withSequence(
          withTiming(3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(-3, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => {
    const vis = interpolate(
      scrollX.value,
      [(pageIndex - 1) * pageWidth, pageIndex * pageWidth, (pageIndex + 1) * pageWidth],
      [0, 1, 0],
      "clamp"
    );
    return { opacity: vis };
  });

  const trophyStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: trophyScale.value },
      { rotateZ: `${wobble.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        { alignItems: "center", justifyContent: "center", height: 220, width: 200 },
        containerStyle,
      ]}
    >
      {/* Trophy */}
      <Animated.View
        style={[{ alignItems: "center", marginBottom: 20, position: "relative" }, trophyStyle]}
      >
        {/* Trophy cup */}
        <View
          style={{
            width: 50,
            height: 40,
            borderBottomLeftRadius: 25,
            borderBottomRightRadius: 25,
            backgroundColor: COLORS.gold,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: COLORS.gold,
              borderWidth: 2,
              borderColor: "#b8960c",
            }}
          />
        </View>
        {/* Handles */}
        <View
          style={{
            position: "absolute",
            left: -8,
            top: 5,
            width: 12,
            height: 20,
            borderWidth: 3,
            borderColor: COLORS.gold,
            borderRadius: 6,
            backgroundColor: "transparent",
            borderRightWidth: 0,
          }}
        />
        <View
          style={{
            position: "absolute",
            right: -8,
            top: 5,
            width: 12,
            height: 20,
            borderWidth: 3,
            borderColor: COLORS.gold,
            borderRadius: 6,
            backgroundColor: "transparent",
            borderLeftWidth: 0,
          }}
        />
        {/* Stem */}
        <View style={{ width: 8, height: 10, backgroundColor: COLORS.gold }} />
        {/* Base */}
        <View
          style={{
            width: 36,
            height: 6,
            borderRadius: 3,
            backgroundColor: COLORS.gold,
          }}
        />

        {/* Sparkles */}
        {SPARKLES.map((s, i) => (
          <Sparkle key={i} {...s} />
        ))}
      </Animated.View>

      {/* Podium bars */}
      {PODIUM.map((item, i) => (
        <PodiumBar key={i} {...item} index={i} />
      ))}
    </Animated.View>
  );
}

function PodiumBar({
  label,
  width: targetWidth,
  color,
  delay,
  index,
}: {
  label: string;
  width: number;
  color: string;
  delay: number;
  index: number;
}) {
  const barWidth = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    barWidth.value = withDelay(delay, withSpring(targetWidth, { damping: 14, stiffness: 120 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    width: barWidth.value,
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          height: 24,
          borderRadius: 6,
          backgroundColor: color + "22",
          borderWidth: 1,
          borderColor: color + "44",
          marginBottom: 6,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.Text
        style={{
          fontSize: 10,
          fontWeight: "800",
          color,
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Animated.Text>
    </Animated.View>
  );
}

function Sparkle({ x, y, delay, size }: { x: number; y: number; delay: number; size: number }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 600, easing: Easing.in(Easing.ease) }),
          withTiming(0, { duration: 800 })
        ),
        -1,
        false
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 25 + x,
          top: 20 + y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: COLORS.gold,
          shadowColor: COLORS.gold,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: 4,
        },
        style,
      ]}
    />
  );
}
