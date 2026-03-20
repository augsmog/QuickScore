import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  SharedValue,
  interpolate,
} from "react-native-reanimated";

interface StaggeredTextProps {
  text: string;
  scrollX: SharedValue<number>;
  pageIndex: number;
  pageWidth: number;
  style?: object;
  staggerDelay?: number;
}

export function StaggeredText({
  text,
  scrollX,
  pageIndex,
  pageWidth,
  style = {},
  staggerDelay = 60,
}: StaggeredTextProps) {
  const words = text.split(" ");

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
      {words.map((word, i) => (
        <WordItem
          key={`${word}-${i}`}
          word={word}
          index={i}
          scrollX={scrollX}
          pageIndex={pageIndex}
          pageWidth={pageWidth}
          staggerDelay={staggerDelay}
          style={style}
        />
      ))}
    </View>
  );
}

function WordItem({
  word,
  index,
  scrollX,
  pageIndex,
  pageWidth,
  staggerDelay,
  style,
}: {
  word: string;
  index: number;
  scrollX: SharedValue<number>;
  pageIndex: number;
  pageWidth: number;
  staggerDelay: number;
  style: object;
}) {
  const animStyle = useAnimatedStyle(() => {
    const pageStart = (pageIndex - 0.5) * pageWidth;
    const pageMid = pageIndex * pageWidth;
    const pageEnd = (pageIndex + 0.5) * pageWidth;

    const progress = interpolate(
      scrollX.value,
      [pageStart, pageMid, pageEnd],
      [0, 1, 0],
      "clamp"
    );

    // Each word is delayed based on its index
    const wordProgress = interpolate(
      progress,
      [0.3 + index * 0.04, 0.5 + index * 0.04],
      [0, 1],
      "clamp"
    );

    return {
      opacity: wordProgress,
      transform: [{ translateY: interpolate(wordProgress, [0, 1], [12, 0]) }],
    };
  });

  return (
    <Animated.Text style={[style, animStyle, { marginRight: 5 }]}>
      {word}
    </Animated.Text>
  );
}
