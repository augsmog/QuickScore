import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSpring,
  withSequence,
  interpolate,
  Easing,
  SharedValue,
} from "react-native-reanimated";
import { Zap } from "lucide-react-native";
import { COLORS } from "../theme";

interface ScanBeamSceneProps {
  scrollX: SharedValue<number>;
  pageIndex: number;
  pageWidth: number;
}

const SCORES = [
  { value: "4", x: 20, y: 45, delay: 400 },
  { value: "5", x: 55, y: 45, delay: 600 },
  { value: "3", x: 90, y: 45, delay: 800 },
  { value: "4", x: 125, y: 45, delay: 1000 },
  { value: "6", x: 20, y: 70, delay: 1200 },
  { value: "3", x: 55, y: 70, delay: 1400 },
  { value: "5", x: 90, y: 70, delay: 1600 },
  { value: "4", x: 125, y: 70, delay: 1800 },
];

export function ScanBeamScene({ scrollX, pageIndex, pageWidth }: ScanBeamSceneProps) {
  const beamY = useSharedValue(0);
  const phoneScale = useSharedValue(0);
  const boltPulse = useSharedValue(1);

  useEffect(() => {
    phoneScale.value = withDelay(200, withSpring(1, { damping: 14, stiffness: 160 }));

    beamY.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(80, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      )
    );

    boltPulse.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1.15, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
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

  const phoneStyle = useAnimatedStyle(() => ({
    transform: [{ scale: phoneScale.value }],
  }));

  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: beamY.value }],
  }));

  const boltStyle = useAnimatedStyle(() => ({
    transform: [{ scale: boltPulse.value }],
  }));

  return (
    <Animated.View
      style={[
        { alignItems: "center", justifyContent: "center", height: 220, width: 200 },
        containerStyle,
      ]}
    >
      {/* Lightning bolt */}
      <Animated.View
        style={[
          {
            marginBottom: 12,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: COLORS.gold + "22",
            alignItems: "center",
            justifyContent: "center",
          },
          boltStyle,
        ]}
      >
        <Zap size={22} color={COLORS.gold} fill={COLORS.gold} />
      </Animated.View>

      {/* Phone frame */}
      <Animated.View
        style={[
          {
            width: 160,
            height: 120,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: COLORS.accent + "66",
            backgroundColor: COLORS.card,
            overflow: "hidden",
            position: "relative",
          },
          phoneStyle,
        ]}
      >
        {/* Header row */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 8,
            paddingTop: 8,
            paddingBottom: 4,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border + "44",
            gap: 4,
          }}
        >
          <View style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: COLORS.textDim + "33" }} />
          {[1, 2, 3, 4].map((h) => (
            <View
              key={h}
              style={{
                width: 18,
                height: 6,
                borderRadius: 3,
                backgroundColor: COLORS.textDim + "22",
                alignItems: "center",
              }}
            />
          ))}
        </View>

        {/* Score numbers that appear */}
        {SCORES.map((score, i) => (
          <ScoreNumber key={i} {...score} pageIndex={pageIndex} pageWidth={pageWidth} scrollX={scrollX} />
        ))}

        {/* Scan beam */}
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              top: 25,
              height: 2,
              backgroundColor: COLORS.accent,
              shadowColor: COLORS.accent,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.9,
              shadowRadius: 6,
            },
            beamStyle,
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

function ScoreNumber({
  value,
  x,
  y,
  delay,
  scrollX,
  pageIndex,
  pageWidth,
}: {
  value: string;
  x: number;
  y: number;
  delay: number;
  scrollX: SharedValue<number>;
  pageIndex: number;
  pageWidth: number;
}) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    scale.value = withDelay(delay, withSpring(1, { damping: 12 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const isGood = parseInt(value) <= 4;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: x,
          top: y,
          width: 22,
          height: 18,
          borderRadius: 4,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isGood ? COLORS.accent + "15" : "transparent",
        },
        style,
      ]}
    >
      <Animated.Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: isGood ? COLORS.accent : COLORS.text,
        }}
      >
        {value}
      </Animated.Text>
    </Animated.View>
  );
}
