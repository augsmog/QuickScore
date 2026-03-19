import { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Dimensions,
  FlatList,
  ViewToken,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, Trophy, Zap } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS } from "../src/ui/theme";
import { useOnboardingStore } from "../src/stores/onboarding-store";

const { width } = Dimensions.get("window");

interface OnboardingSlide {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;
}

const slides: OnboardingSlide[] = [
  {
    id: "scan",
    icon: <Camera size={48} color="#000" />,
    title: "Snap Your Scorecard",
    subtitle:
      "Point your camera at any handwritten or printed golf scorecard. AI reads every score in seconds.",
    accent: COLORS.accent,
  },
  {
    id: "settle",
    icon: <Zap size={48} color="#000" />,
    title: "Settle Bets Instantly",
    subtitle:
      "Skins, Nassau, Wolf, and 25+ game modes calculated automatically. No more bar napkin math.",
    accent: COLORS.gold,
  },
  {
    id: "compete",
    icon: <Trophy size={48} color="#000" />,
    title: "Track Every Round",
    subtitle:
      "Leaderboards, settlement history, and shareable scorecards. Know who owes who — always.",
    accent: COLORS.blue,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeOnboarding();
    router.replace("/auth/sign-in");
  };

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View
      style={{
        width,
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 40,
      }}
    >
      {/* Icon circle */}
      <View
        style={{
          width: 100,
          height: 100,
          borderRadius: 28,
          backgroundColor: item.accent,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
          shadowColor: item.accent,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.35,
          shadowRadius: 20,
        }}
      >
        {item.icon}
      </View>

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
        {item.title}
      </Text>

      <Text
        style={{
          color: COLORS.textDim,
          fontSize: 16,
          textAlign: "center",
          lineHeight: 24,
        }}
      >
        {item.subtitle}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Skip button */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: 20,
          paddingTop: 8,
        }}
      >
        <Pressable onPress={handleFinish} style={{ padding: 8 }}>
          <Text style={{ color: COLORS.textDim, fontSize: 15 }}>Skip</Text>
        </Pressable>
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        style={{ flex: 1 }}
      />

      {/* Dots + Button */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: 20,
          alignItems: "center",
        }}
      >
        {/* Page indicators */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginBottom: 24,
          }}
        >
          {slides.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === currentIndex ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor:
                  i === currentIndex
                    ? slides[currentIndex].accent
                    : COLORS.border,
              }}
            />
          ))}
        </View>

        {/* CTA */}
        <Pressable
          onPress={handleNext}
          style={{
            width: "100%",
            backgroundColor: slides[currentIndex].accent,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: "center",
            shadowColor: slides[currentIndex].accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
          }}
        >
          <Text style={{ color: "#000", fontWeight: "700", fontSize: 17 }}>
            {currentIndex === slides.length - 1 ? "Get Started" : "Next"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
