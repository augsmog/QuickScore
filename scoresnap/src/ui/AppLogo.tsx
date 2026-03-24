import Svg, {
  Rect,
  Circle,
  Ellipse,
  Path,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { COLORS } from "./theme";

interface AppLogoProps {
  size?: number;
}

export function AppLogo({ size = 48 }: AppLogoProps) {
  const scale = size / 512;

  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="flagG" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#00d47e" />
          <Stop offset="100%" stopColor="#00b86b" />
        </LinearGradient>
        <LinearGradient id="bgG" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#0d1f3c" />
          <Stop offset="100%" stopColor="#0a1628" />
        </LinearGradient>
      </Defs>

      {/* Background */}
      <Rect width={512} height={512} fill="url(#bgG)" rx={96} />

      {/* Viewfinder circle */}
      <Circle cx={256} cy={250} r={130} fill="none" stroke="#ffffff" strokeWidth={4} opacity={0.15} />

      {/* Corner brackets */}
      <Path d="M 150 150 L 150 115 L 185 115" fill="none" stroke={COLORS.accent} strokeWidth={5} strokeLinecap="round" />
      <Path d="M 362 150 L 362 115 L 327 115" fill="none" stroke={COLORS.accent} strokeWidth={5} strokeLinecap="round" />
      <Path d="M 150 350 L 150 385 L 185 385" fill="none" stroke={COLORS.accent} strokeWidth={5} strokeLinecap="round" />
      <Path d="M 362 350 L 362 385 L 327 385" fill="none" stroke={COLORS.accent} strokeWidth={5} strokeLinecap="round" />

      {/* Crosshairs */}
      <Line x1={256} y1={130} x2={256} y2={175} stroke={COLORS.accent} strokeWidth={2} opacity={0.4} />
      <Line x1={256} y1={325} x2={256} y2={370} stroke={COLORS.accent} strokeWidth={2} opacity={0.4} />
      <Line x1={136} y1={250} x2={181} y2={250} stroke={COLORS.accent} strokeWidth={2} opacity={0.4} />
      <Line x1={331} y1={250} x2={376} y2={250} stroke={COLORS.accent} strokeWidth={2} opacity={0.4} />

      {/* Flag pin */}
      <Line x1={256} y1={155} x2={256} y2={365} stroke="#ffffff" strokeWidth={4.5} opacity={0.9} />
      {/* Flag */}
      <Path d="M 260 155 L 316 180 L 260 206 Z" fill="url(#flagG)" />
      {/* Ball */}
      <Circle cx={256} cy={365} r={10} fill="#ffffff" opacity={0.8} />
      {/* Hole */}
      <Ellipse cx={256} cy={380} rx={26} ry={7} fill="none" stroke="#ffffff" strokeWidth={2} opacity={0.25} />

      {/* Center dot */}
      <Circle cx={256} cy={250} r={5} fill={COLORS.accent} opacity={0.5} />
    </Svg>
  );
}
