import { useEffect } from "react";
import { TextInput, TextStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface ScoreCounterProps {
  target: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  style?: TextStyle;
  delay?: number;
}

export function ScoreCounter({
  target,
  duration = 1200,
  prefix = "",
  suffix = "",
  style = {},
  delay = 0,
}: ScoreCounterProps) {
  const value = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      value.value = withTiming(target, {
        duration,
        easing: Easing.out(Easing.cubic),
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [target]);

  const animatedProps = useAnimatedProps(() => ({
    text: `${prefix}${Math.round(value.value)}${suffix}`,
    defaultValue: `${prefix}0${suffix}`,
  }));

  return (
    <AnimatedTextInput
      animatedProps={animatedProps}
      editable={false}
      style={[
        {
          color: "#fff",
          fontSize: 32,
          fontWeight: "800",
          textAlign: "center",
        },
        style,
      ]}
    />
  );
}
