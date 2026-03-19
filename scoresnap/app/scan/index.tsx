import { useState, useRef, useCallback } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { X, Camera, Lock, RotateCcw, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS } from "../../src/ui/theme";
import { useScanStore } from "../../src/stores/scan-store";

type ScanPhase =
  | "ready"
  | "capturing"
  | "preview"
  | "processing"
  | "done"
  | "paywall"
  | "error";

export default function ScanScreen() {
  const router = useRouter();
  const { contestId } = useLocalSearchParams<{ contestId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<ScanPhase>("ready");
  const [progress, setProgress] = useState(0);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const { hasFreeScan, useScan, getRemainingFreeScans, isPro } =
    useScanStore();

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;

    // Check scan allowance BEFORE capturing
    if (!hasFreeScan()) {
      setPhase("paywall");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase("capturing");

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setPhase("preview"); // Show preview BEFORE processing
      } else {
        throw new Error("No photo captured");
      }
    } catch (error) {
      console.error("Capture error:", error);
      setErrorMessage("Failed to capture photo. Please try again.");
      setPhase("error");
    }
  }, []);

  const handleConfirmPhoto = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase("processing");
    setProgress(0);

    // Simulate OCR processing
    // In production: send photo to ML Kit on-device, then cloud fallback
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 15 + 5;
      if (p >= 100) {
        clearInterval(interval);
        setProgress(100);

        // Only consume the scan AFTER successful processing
        const consumed = useScan();
        if (!consumed) {
          setPhase("paywall");
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => {
          router.push({
            pathname: "/scan/review",
            params: {
              contestId: contestId || "",
              photoUri: photoUri || "",
            },
          });
        }, 500);
      }
      setProgress(Math.min(p, 100));
    }, 200);
  }, [contestId, router, photoUri, useScan]);

  const handleRetake = useCallback(() => {
    setPhotoUri(null);
    setPhase("ready");
    setErrorMessage(null);
  }, []);

  if (!permission) return <View className="flex-1 bg-bg" />;

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-bg items-center justify-center px-8">
        <Camera size={48} color={COLORS.accent} />
        <Text
          className="text-lg font-bold mt-4 mb-2 text-center"
          style={{ color: COLORS.text }}
        >
          Camera Access Required
        </Text>
        <Text
          className="text-sm text-center mb-6"
          style={{ color: COLORS.textDim }}
        >
          ScoreSnap needs camera access to scan golf scorecards.
        </Text>
        <Pressable
          onPress={requestPermission}
          className="rounded-xl px-6 py-3"
          style={{ backgroundColor: COLORS.accent }}
        >
          <Text className="font-bold text-base" style={{ color: "#000" }}>
            Grant Camera Access
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="mt-4 p-2">
          <Text className="text-sm" style={{ color: COLORS.textDim }}>
            Go Back
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* Camera — Ready State */}
      {phase === "ready" && (
        <CameraView ref={cameraRef} className="flex-1" facing="back">
          {/* Close Button */}
          <SafeAreaView edges={["top"]}>
            <Pressable
              onPress={() => router.back()}
              className="m-4 w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            >
              <X size={20} color="#fff" />
            </Pressable>
          </SafeAreaView>

          {/* Alignment Guide */}
          <View className="flex-1 items-center justify-center px-8">
            <View
              className="w-full aspect-[4/3] rounded-2xl"
              style={{
                borderColor: COLORS.accent,
                borderWidth: 3,
                borderStyle: "dashed",
              }}
            >
              {/* Corner guides */}
              {[
                { top: -2, left: -2 },
                { top: -2, right: -2 },
                { bottom: -2, left: -2 },
                { bottom: -2, right: -2 },
              ].map((pos, i) => (
                <View
                  key={i}
                  style={{
                    position: "absolute",
                    ...pos,
                    width: 28,
                    height: 28,
                    borderColor: COLORS.accent,
                    borderTopWidth: pos.top !== undefined ? 3 : 0,
                    borderBottomWidth: pos.bottom !== undefined ? 3 : 0,
                    borderLeftWidth: pos.left !== undefined ? 3 : 0,
                    borderRightWidth: pos.right !== undefined ? 3 : 0,
                    borderTopLeftRadius:
                      pos.top !== undefined && pos.left !== undefined ? 8 : 0,
                    borderTopRightRadius:
                      pos.top !== undefined && pos.right !== undefined ? 8 : 0,
                    borderBottomLeftRadius:
                      pos.bottom !== undefined && pos.left !== undefined
                        ? 8
                        : 0,
                    borderBottomRightRadius:
                      pos.bottom !== undefined && pos.right !== undefined
                        ? 8
                        : 0,
                  }}
                />
              ))}

              <View className="flex-1 items-center justify-center">
                <Text className="text-white text-base font-semibold text-center">
                  Position scorecard{"\n"}within the frame
                </Text>
              </View>
            </View>
          </View>

          {/* Capture Button */}
          <SafeAreaView edges={["bottom"]} className="items-center pb-4">
            {!isPro && (
              <View
                style={{
                  backgroundColor:
                    getRemainingFreeScans() > 0
                      ? COLORS.accent + "22"
                      : COLORS.warn + "22",
                  borderColor:
                    getRemainingFreeScans() > 0
                      ? COLORS.accent + "44"
                      : COLORS.warn + "44",
                  borderWidth: 1,
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    color:
                      getRemainingFreeScans() > 0
                        ? COLORS.accent
                        : COLORS.warn,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {getRemainingFreeScans() > 0
                    ? `${getRemainingFreeScans()} free scan remaining`
                    : "No free scans left"}
                </Text>
              </View>
            )}
            <Pressable
              onPress={handleCapture}
              className="w-20 h-20 rounded-full items-center justify-center"
              style={{
                backgroundColor: COLORS.accent,
                shadowColor: COLORS.accent,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
              }}
            >
              <Camera size={32} color="#000" />
            </Pressable>
            <Text className="text-white text-xs mt-2 opacity-70">
              AI-powered OCR reads handwritten & printed scores
            </Text>
          </SafeAreaView>
        </CameraView>
      )}

      {/* Capturing State */}
      {phase === "capturing" && (
        <View className="flex-1 items-center justify-center">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-5"
            style={{ backgroundColor: COLORS.accentGlow }}
          >
            <Camera size={36} color={COLORS.accent} />
          </View>
          <Text className="text-white text-lg font-semibold">
            Capturing...
          </Text>
          <Text className="text-white opacity-50 text-sm mt-1">
            Hold steady
          </Text>
        </View>
      )}

      {/* Photo Preview — NEW: confirm before consuming scan */}
      {phase === "preview" && photoUri && (
        <View className="flex-1">
          <SafeAreaView edges={["top"]}>
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: 12,
              }}
            >
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: 18,
                  fontWeight: "800",
                }}
              >
                Does this look right?
              </Text>
              <Text
                style={{
                  color: COLORS.textDim,
                  fontSize: 13,
                  marginTop: 2,
                }}
              >
                Make sure all scores are visible and in focus
              </Text>
            </View>
          </SafeAreaView>

          {/* Photo preview */}
          <View
            style={{
              flex: 1,
              marginHorizontal: 20,
              borderRadius: 16,
              overflow: "hidden",
              borderColor: COLORS.border,
              borderWidth: 1,
            }}
          >
            <Image
              source={{ uri: photoUri }}
              style={{ flex: 1 }}
              resizeMode="contain"
            />
          </View>

          {/* Actions */}
          <SafeAreaView edges={["bottom"]}>
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 12,
              }}
            >
              <Pressable
                onPress={handleRetake}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: COLORS.card,
                  borderColor: COLORS.border,
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingVertical: 14,
                  paddingHorizontal: 20,
                }}
              >
                <RotateCcw size={18} color={COLORS.textDim} />
                <Text
                  style={{
                    color: COLORS.textDim,
                    fontWeight: "600",
                    fontSize: 15,
                  }}
                >
                  Retake
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmPhoto}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: COLORS.accent,
                  borderRadius: 14,
                  paddingVertical: 14,
                }}
              >
                <Check size={18} color="#000" />
                <Text
                  style={{ color: "#000", fontWeight: "700", fontSize: 15 }}
                >
                  Process Scores
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      )}

      {/* Processing State */}
      {phase === "processing" && (
        <View className="flex-1 items-center justify-center px-12">
          <Text className="text-white text-lg font-semibold mb-5">
            Processing Scorecard
          </Text>
          <View
            className="w-full h-1.5 rounded-full overflow-hidden mb-3"
            style={{ backgroundColor: COLORS.border }}
          >
            <View
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                backgroundColor: COLORS.accent,
              }}
            />
          </View>
          <Text className="text-white opacity-50 text-sm">
            {progress < 30
              ? "Detecting scorecard layout..."
              : progress < 60
              ? "Reading scores with AI..."
              : progress < 90
              ? "Validating data..."
              : "Almost done..."}
          </Text>
        </View>
      )}

      {/* Error State — NEW */}
      {phase === "error" && (
        <View className="flex-1 items-center justify-center px-8">
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              backgroundColor: COLORS.danger + "18",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <X size={32} color={COLORS.danger} />
          </View>
          <Text
            style={{
              color: COLORS.text,
              fontWeight: "800",
              fontSize: 20,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Scan Failed
          </Text>
          <Text
            style={{
              color: COLORS.textDim,
              fontSize: 14,
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 24,
            }}
          >
            {errorMessage || "Something went wrong. Please try again."}
          </Text>

          <Pressable
            onPress={handleRetake}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: COLORS.accent,
              borderRadius: 14,
              paddingVertical: 14,
              paddingHorizontal: 24,
            }}
          >
            <RotateCcw size={18} color="#000" />
            <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
              Try Again
            </Text>
          </Pressable>

          <Pressable onPress={() => router.back()} style={{ marginTop: 16, padding: 8 }}>
            <Text style={{ color: COLORS.textDim, fontSize: 14 }}>
              Enter scores manually instead
            </Text>
          </Pressable>
        </View>
      )}

      {/* Paywall State */}
      {phase === "paywall" && (
        <View className="flex-1 items-center justify-center px-8">
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              backgroundColor: COLORS.gold + "22",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Lock size={32} color={COLORS.gold} />
          </View>
          <Text
            style={{
              color: COLORS.text,
              fontWeight: "800",
              fontSize: 22,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Unlock Unlimited Scans
          </Text>
          <Text
            style={{
              color: COLORS.textDim,
              fontSize: 14,
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 28,
              paddingHorizontal: 12,
            }}
          >
            You've used your free scorecard scan. Upgrade to ScoreSnap Pro for
            unlimited AI-powered scanning plus all 25+ game modes.
          </Text>

          <Pressable
            onPress={() => {
              router.back();
              setTimeout(() => router.push("/paywall"), 100);
            }}
            style={{
              backgroundColor: COLORS.gold,
              borderRadius: 14,
              paddingVertical: 16,
              paddingHorizontal: 32,
              width: "100%",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text style={{ color: "#000", fontWeight: "700", fontSize: 16 }}>
              Upgrade to Pro
            </Text>
            <Text
              style={{ color: "#00000088", fontSize: 12, marginTop: 2 }}
            >
              $4.99/mo or $29.99/yr
            </Text>
          </Pressable>

          <Pressable onPress={() => router.back()} style={{ padding: 12 }}>
            <Text style={{ color: COLORS.textDim, fontSize: 14 }}>
              Enter scores manually instead
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
