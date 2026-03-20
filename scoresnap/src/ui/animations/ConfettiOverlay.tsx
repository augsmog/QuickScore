import { useEffect, useState } from "react";
import { Dimensions, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { COLORS } from "../theme";

const { width: SW, height: SH } = Dimensions.get("window");
const PARTICLE_COUNT = 24;
const PARTICLE_COLORS = [COLORS.accent, COLORS.gold, COLORS.blue, "#fff", COLORS.warn];

interface Particle {
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  isCircle: boolean;
}

function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: (Math.random() - 0.5) * SW * 0.8,
    y: -(Math.random() * SH * 0.5 + 100),
    rotation: (Math.random() - 0.5) * 720,
    color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    size: 4 + Math.random() * 6,
    isCircle: Math.random() > 0.5,
  }));
}

interface ConfettiOverlayProps {
  visible: boolean;
  onDone?: () => void;
}

export function ConfettiOverlay({ visible, onDone }: ConfettiOverlayProps) {
  const [particles] = useState(generateParticles);

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
      }}
    >
      {particles.map((p, i) => (
        <ConfettiParticle key={i} particle={p} index={i} onDone={i === 0 ? onDone : undefined} />
      ))}
    </View>
  );
}

function ConfettiParticle({
  particle,
  index,
  onDone,
}: {
  particle: Particle;
  index: number;
  onDone?: () => void;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0);

  useEffect(() => {
    const delay = index * 30;
    const duration = 1200 + Math.random() * 400;

    scale.value = withDelay(delay, withTiming(1, { duration: 100 }));
    translateX.value = withDelay(
      delay,
      withTiming(particle.x, {
        duration,
        easing: Easing.out(Easing.cubic),
      })
    );
    translateY.value = withDelay(
      delay,
      withSequence(
        withTiming(particle.y, {
          duration: duration * 0.4,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(SH * 0.6, {
          duration: duration * 0.6,
          easing: Easing.in(Easing.quad),
        })
      )
    );
    rotate.value = withDelay(
      delay,
      withTiming(particle.rotation, { duration, easing: Easing.linear })
    );
    opacity.value = withDelay(
      delay + duration - 300,
      withTiming(0, { duration: 300 })
    );

    if (onDone) {
      const timer = setTimeout(() => onDone(), duration + delay + 100);
      return () => clearTimeout(timer);
    }
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: SW / 2,
          top: SH * 0.35,
          width: particle.size,
          height: particle.isCircle ? particle.size : particle.size * 1.5,
          borderRadius: particle.isCircle ? particle.size / 2 : 2,
          backgroundColor: particle.color,
        },
        style,
      ]}
    />
  );
}
