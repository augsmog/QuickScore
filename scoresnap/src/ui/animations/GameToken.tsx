import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { COLORS } from "../theme";

interface GameTokenProps {
  icon: string;
  name: string;
  isSelected: boolean;
  accentColor: string;
  onPress: () => void;
  playerCount?: string;
}

export function GameToken({
  icon,
  name,
  isSelected,
  accentColor,
  onPress,
  playerCount,
}: GameTokenProps) {
  const rotateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const borderOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (isSelected) {
      // Flip animation on selection
      rotateY.value = withSequence(
        withSpring(180, { damping: 12, stiffness: 100 }),
        withSpring(360, { damping: 14, stiffness: 100 })
      );
      scale.value = withSequence(
        withSpring(1.08, { damping: 10 }),
        withSpring(1, { damping: 14 })
      );
      borderOpacity.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0.15, { duration: 400 });
    } else {
      borderOpacity.value = withTiming(0, { duration: 200 });
      glowOpacity.value = withTiming(0, { duration: 200 });

      // Gentle idle wobble
      rotateY.value = withRepeat(
        withSequence(
          withTiming(4, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(-4, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }
  }, [isSelected]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${rotateY.value}deg` },
      { scale: scale.value },
    ],
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: accentColor,
    borderWidth: interpolate(borderOpacity.value, [0, 1], [1, 2]),
    opacity: interpolate(borderOpacity.value, [0, 1], [0.3, 1]),
  }));

  const glowStyle = useAnimatedStyle(() => ({
    backgroundColor: accentColor,
    opacity: glowOpacity.value,
  }));

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        style={[
          {
            borderRadius: 14,
            padding: 14,
            backgroundColor: COLORS.card,
            position: "relative",
            overflow: "hidden",
          },
          containerStyle,
        ]}
      >
        {/* Glow background */}
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 14,
            },
            glowStyle,
          ]}
        />

        {/* Animated border */}
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 14,
            },
            borderStyle,
          ]}
        />

        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 24 }}>{icon}</Text>
          <Text
            style={{
              color: isSelected ? accentColor : COLORS.text,
              fontSize: 11,
              fontWeight: "700",
              textAlign: "center",
            }}
            numberOfLines={1}
          >
            {name}
          </Text>
          {playerCount && (
            <Text
              style={{
                color: COLORS.textDim,
                fontSize: 9,
                fontWeight: "500",
              }}
            >
              {playerCount}
            </Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}
