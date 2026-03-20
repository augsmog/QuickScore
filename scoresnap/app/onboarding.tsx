import { useRef } from "react";
import { View, Text, Pressable, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  interpolateColor,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { COLORS } from "../src/ui/theme";
import { useOnboardingStore } from "../src/stores/onboarding-store";
import { GolfBallScene } from "../src/ui/animations/GolfBallScene";
import { ScanBeamScene } from "../src/ui/animations/ScanBeamScene";
import { LeaderboardScene } from "../src/ui/animations/LeaderboardScene";
import { AnimatedPageDots } from "../src/ui/animations/AnimatedPageDots";
import { StaggeredText } from "../src/ui/animations/StaggeredText";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SlideData {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
}

const slides: SlideData[] = [
  {
    id: "scan",
    title: "Snap Your Scorecard",
    subtitle:
      "Point your camera at any handwritten or printed golf scorecard. AI reads every score in seconds.",
    accent: COLORS.accent,
  },
  {
    id: "settle",
    title: "Settle Bets Instantly",
    subtitle:
      "Skins, Nassau, Wolf, and 25+ game modes calculated automatically. No more bar napkin math.",
    accent: COLORS.gold,
  },
  {
    id: "compete",
    title: "Track Every Round",
    subtitle:
      "Leaderboards, settlement history, and shareable scorecards. Know who owes who — always.",
    accent: COLORS.blue,
  },
];

const ACCENT_COLORS = slides.map((s) => s.accent);

export default function OnboardingScreen() {
  const router = useRouter();
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentIndex = Math.round(scrollX.value / SCREEN_WIDTH);
    if (currentIndex < slides.length - 1) {
      goToSlide(currentIndex + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeOnboarding();
    router.replace("/");
  };

  // Skip button fades out on last slide
  const skipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [SCREEN_WIDTH * 1, SCREEN_WIDTH * 2],
      [1, 0],
      "clamp"
    ),
  }));

  // CTA button color transitions between accent colors
  const ctaStyle = useAnimatedStyle(() => {
    const inputRange = slides.map((_, i) => i * SCREEN_WIDTH);
    const backgroundColor = interpolateColor(scrollX.value, inputRange, ACCENT_COLORS);
    return { backgroundColor };
  });

  // CTA text changes on last slide
  const nextTextStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [SCREEN_WIDTH * 1.5, SCREEN_WIDTH * 2],
      [1, 0],
      "clamp"
    ),
  }));

  const getStartedTextStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [SCREEN_WIDTH * 1.5, SCREEN_WIDTH * 2],
      [0, 1],
      "clamp"
    ),
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Skip button */}
      <Animated.View
        style={[
          {
            flexDirection: "row",
            justifyContent: "flex-end",
            paddingHorizontal: 20,
            paddingTop: 8,
          },
          skipStyle,
        ]}
      >
        <Pressable onPress={handleFinish} style={{ padding: 8 }}>
          <Text style={{ color: COLORS.textDim, fontSize: 15 }}>Skip</Text>
        </Pressable>
      </Animated.View>

      {/* Slides */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {slides.map((slide, i) => (
          <View
            key={slide.id}
            style={{
              width: SCREEN_WIDTH,
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 40,
            }}
          >
            {/* Animated illustration */}
            <SlideIllustration
              index={i}
              scrollX={scrollX}
              pageWidth={SCREEN_WIDTH}
            />

            {/* Title with parallax */}
            <ParallaxText
              scrollX={scrollX}
              pageIndex={i}
              pageWidth={SCREEN_WIDTH}
              speedMultiplier={1.0}
            >
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: 28,
                  fontWeight: "800",
                  textAlign: "center",
                  marginBottom: 12,
                  letterSpacing: -0.5,
                }}
              >
                {slide.title}
              </Text>
            </ParallaxText>

            {/* Subtitle with staggered word reveal */}
            <StaggeredText
              text={slide.subtitle}
              scrollX={scrollX}
              pageIndex={i}
              pageWidth={SCREEN_WIDTH}
              style={{
                color: COLORS.textDim,
                fontSize: 16,
                lineHeight: 24,
                textAlign: "center",
              }}
            />
          </View>
        ))}
      </Animated.ScrollView>

      {/* Bottom: Dots + CTA */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 20, alignItems: "center" }}>
        {/* Animated page dots */}
        <View style={{ marginBottom: 24 }}>
          <AnimatedPageDots
            scrollX={scrollX}
            pageWidth={SCREEN_WIDTH}
            count={slides.length}
            colors={ACCENT_COLORS}
          />
        </View>

        {/* CTA Button */}
        <Pressable onPress={handleNext} style={{ width: "100%" }}>
          <Animated.View
            style={[
              {
                width: "100%",
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: COLORS.accent,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
              },
              ctaStyle,
            ]}
          >
            {/* Layered text for crossfade */}
            <View style={{ position: "relative" }}>
              <Animated.Text
                style={[
                  { color: "#000", fontWeight: "700", fontSize: 17 },
                  nextTextStyle,
                ]}
              >
                Next
              </Animated.Text>
              <Animated.Text
                style={[
                  {
                    color: "#000",
                    fontWeight: "700",
                    fontSize: 17,
                    position: "absolute",
                    left: 0,
                    right: 0,
                    textAlign: "center",
                  },
                  getStartedTextStyle,
                ]}
              >
                Get Started
              </Animated.Text>
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** Renders the correct animated scene for each slide index */
function SlideIllustration({
  index,
  scrollX,
  pageWidth,
}: {
  index: number;
  scrollX: Animated.SharedValue<number>;
  pageWidth: number;
}) {
  const scenes = [GolfBallScene, ScanBeamScene, LeaderboardScene];
  const Scene = scenes[index];
  return <Scene scrollX={scrollX} pageIndex={index} pageWidth={pageWidth} />;
}

/** Applies parallax translateX based on scroll position */
function ParallaxText({
  scrollX,
  pageIndex,
  pageWidth,
  speedMultiplier,
  children,
}: {
  scrollX: Animated.SharedValue<number>;
  pageIndex: number;
  pageWidth: number;
  speedMultiplier: number;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const offset = scrollX.value - pageIndex * pageWidth;
    return {
      transform: [{ translateX: -offset * (1 - speedMultiplier) }],
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
}
