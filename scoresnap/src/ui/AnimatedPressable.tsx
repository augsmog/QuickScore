import { PropsWithChildren } from "react";
import { Pressable, PressableProps, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface Props extends PressableProps {
  style?: StyleProp<ViewStyle>;
  scaleValue?: number;
}

export function AnimatedPressable({
  children,
  style,
  scaleValue = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: PropsWithChildren<Props>) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressableBase
      onPressIn={(e) => {
        scale.value = withSpring(scaleValue, { damping: 15, stiffness: 300 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        onPressOut?.(e);
      }}
      style={[animatedStyle, style]}
      {...rest}
    >
      {children}
    </AnimatedPressableBase>
  );
}
