import { useState, useRef, useCallback } from "react";
import { View, Text, Pressable, Image, Dimensions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, FlashMode } from "expo-camera";
import {
  X,
  Camera,
  Lock,
  RotateCcw,
  Check,
  SwitchCamera,
  ImageIcon,
  Zap,
  ZapOff,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW } from "../../src/ui/theme";
import { useScanStore } from "../../src/stores/scan-store";
import { scanScorecard } from "../../src/services/ocr-service";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const FRAME_WIDTH = SCREEN_WIDTH - 80;
const FRAME_HEIGHT = FRAME_WIDTH * 0.75; // 4:3 aspect
const CORNER_SIZE = 32;
const CORNER_THICKNESS = 3;

type ScanPhase =
  | "ready"
  | "capturing"
  | "preview"
  | "processing"
  | "done"
  | "paywall"
  | "error";

type FlashOption = "off" | "on" | "auto";

export default function ScanScreen() {
  const router = useRouter();
  const { contestId } = useLocalSearchParams<{ contestId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<ScanPhase>("ready");
  const [progress, setProgress] = useState(0);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flashMode, setFlashMode] = useState<FlashOption>("off");
  const [facing, setFacing] = useState<"back" | "front">("back");
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const { hasFreeScan, useScan, getRemainingFreeScans, isPro } =
    useScanStore();

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;

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
        setPhase("preview");
      } else {
        throw new Error("No photo captured");
      }
    } catch (error) {
      console.error("Capture error:", error);
      setErrorMessage("Failed to capture photo. Please try again.");
      setPhase("error");
    }
  }, [hasFreeScan]);

  const handleConfirmPhoto = useCallback(async () => {
    if (!photoUri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase("processing");
    setProgress(0);

    try {
      const result = await scanScorecard(photoUri, (p, msg) => {
        setProgress(p);
      });

      if (result.players.length === 0) {
        throw new Error("No players detected in this scorecard.");
      }

      const consumed = useScan();
      if (!consumed) {
        setPhase("paywall");
        return;
      }

      setProgress(100);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        router.push({
          pathname: "/scan/review",
          params: {
            contestId: contestId || "",
            photoUri: photoUri || "",
            scanData: JSON.stringify(result.players),
          },
        });
      }, 500);
    } catch (error: any) {
      console.error("OCR error:", error);
      setErrorMessage(
        error.message || "Failed to read scorecard. Please try again."
      );
      setPhase("error");
    }
  }, [contestId, router, photoUri, useScan]);

  const handleRetake = useCallback(() => {
    setPhotoUri(null);
    setPhase("ready");
    setErrorMessage(null);
  }, []);

  const toggleFlash = useCallback(() => {
    const modes: FlashOption[] = ["off", "on", "auto"];
    const idx = modes.indexOf(flashMode);
    setFlashMode(modes[(idx + 1) % modes.length]);
  }, [flashMode]);

  const toggleFacing = useCallback(() => {
    setFacing((f) => (f === "back" ? "front" : "back"));
  }, []);

  if (!permission) return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;

  if (!permission.granted) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: COLORS.bg,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        <Camera size={48} color={COLORS.primary} />
        <Text
          style={{
            ...TYPOGRAPHY.title,
            color: COLORS.text,
            marginTop: 16,
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          Camera Access Required
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontFamily: FONTS.regular,
            color: COLORS.textDim,
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          SnapScore needs camera access to scan golf scorecards.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={{
            backgroundColor: COLORS.primary,
            borderRadius: RADII.lg,
            paddingHorizontal: 24,
            paddingVertical: 14,
            ...GLOW.primary,
          }}
        >
          <Text
            style={{
              fontFamily: FONTS.bold,
              fontSize: 15,
              color: COLORS.onPrimary,
            }}
          >
            Grant Camera Access
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={{ marginTop: 16, padding: 8 }}
        >
          <Text
            style={{
              fontSize: 14,
              fontFamily: FONTS.medium,
              color: COLORS.textDim,
            }}
          >
            Go Back
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Camera — Ready State */}
      {phase === "ready" && (
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing={facing}
          flash={flashMode as FlashMode}
        >
          {/* Header: Cancel + Flash */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              paddingTop: insets.top + 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 8,
              }}
            >
              {/* Cancel button */}
              <Pressable
                onPress={() => router.back()}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  borderRadius: RADII.md,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <X size={16} color={COLORS.text} />
                <Text
                  style={{
                    ...TYPOGRAPHY.labelSm,
                    color: COLORS.text,
                  }}
                >
                  CANCEL
                </Text>
              </Pressable>

              {/* Flash segmented control */}
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: "rgba(0,0,0,0.5)",
                  borderRadius: RADII.md,
                  overflow: "hidden",
                }}
              >
                {(["off", "on", "auto"] as FlashOption[]).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setFlashMode(mode)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor:
                        flashMode === mode
                          ? COLORS.surfaceHigh
                          : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        ...TYPOGRAPHY.labelSm,
                        color:
                          flashMode === mode
                            ? COLORS.primary
                            : COLORS.textDim,
                      }}
                    >
                      {mode.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Centered Camera Content */}
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {/* Viewfinder Frame */}
            <View
              style={{
                width: FRAME_WIDTH,
                height: FRAME_HEIGHT,
                position: "relative",
              }}
            >
              {/* Green corner brackets */}
              {/* Top-left */}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: CORNER_SIZE,
                  height: CORNER_SIZE,
                  borderTopWidth: CORNER_THICKNESS,
                  borderLeftWidth: CORNER_THICKNESS,
                  borderColor: COLORS.primary,
                  borderTopLeftRadius: 8,
                }}
              />
              {/* Top-right */}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: CORNER_SIZE,
                  height: CORNER_SIZE,
                  borderTopWidth: CORNER_THICKNESS,
                  borderRightWidth: CORNER_THICKNESS,
                  borderColor: COLORS.primary,
                  borderTopRightRadius: 8,
                }}
              />
              {/* Bottom-left */}
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: CORNER_SIZE,
                  height: CORNER_SIZE,
                  borderBottomWidth: CORNER_THICKNESS,
                  borderLeftWidth: CORNER_THICKNESS,
                  borderColor: COLORS.primary,
                  borderBottomLeftRadius: 8,
                }}
              />
              {/* Bottom-right */}
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: CORNER_SIZE,
                  height: CORNER_SIZE,
                  borderBottomWidth: CORNER_THICKNESS,
                  borderRightWidth: CORNER_THICKNESS,
                  borderColor: COLORS.primary,
                  borderBottomRightRadius: 8,
                }}
              />

              {/* Crosshair center */}
              <View
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  marginLeft: -8,
                  marginTop: -8,
                  width: 16,
                  height: 16,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* Horizontal line */}
                <View
                  style={{
                    position: "absolute",
                    width: 16,
                    height: 1.5,
                    backgroundColor: COLORS.primary,
                    opacity: 0.6,
                  }}
                />
                {/* Vertical line */}
                <View
                  style={{
                    position: "absolute",
                    width: 1.5,
                    height: 16,
                    backgroundColor: COLORS.primary,
                    opacity: 0.6,
                  }}
                />
              </View>
            </View>

            {/* Text below frame */}
            <Text
              style={{
                fontSize: 18,
                fontFamily: FONTS.headline,
                color: COLORS.text,
                textAlign: "center",
                marginTop: 24,
              }}
            >
              Align your scorecard within the frame
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: FONTS.regular,
                color: COLORS.textDim,
                textAlign: "center",
                marginTop: 6,
                paddingHorizontal: 40,
                lineHeight: 18,
              }}
            >
              Ensure scores are legible for high-accuracy processing. Avoid
              harsh glare.
            </Text>

            {/* Free scan badge */}
            {!isPro && (
              <View
                style={{
                  backgroundColor:
                    getRemainingFreeScans() > 0
                      ? COLORS.primary + "22"
                      : COLORS.warn + "22",
                  borderRadius: RADII.full,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  marginTop: 12,
                }}
              >
                <Text
                  style={{
                    color:
                      getRemainingFreeScans() > 0
                        ? COLORS.primary
                        : COLORS.warn,
                    fontSize: 12,
                    fontFamily: FONTS.bold,
                  }}
                >
                  {getRemainingFreeScans() > 0
                    ? `${getRemainingFreeScans()} free scan remaining`
                    : "No free scans left"}
                </Text>
              </View>
            )}
          </View>

          {/* Bottom Controls */}
          <SafeAreaView
            edges={["bottom"]}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 40,
                paddingBottom: 16,
                paddingTop: 12,
              }}
            >
              {/* Gallery thumbnail */}
              <Pressable
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: RADII.md,
                  backgroundColor: COLORS.surfaceHigh,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <ImageIcon size={20} color={COLORS.textDim} />
              </Pressable>

              {/* Capture button: white circle with green ring */}
              <Pressable
                onPress={handleCapture}
                style={({ pressed }) => ({
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  borderWidth: 4,
                  borderColor: COLORS.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 29,
                    backgroundColor: COLORS.text,
                  }}
                />
              </Pressable>

              {/* Camera flip */}
              <Pressable
                onPress={toggleFacing}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: RADII.md,
                  backgroundColor: COLORS.surfaceHigh,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SwitchCamera size={20} color={COLORS.textDim} />
              </Pressable>
            </View>
          </SafeAreaView>
        </CameraView>
      )}

      {/* Capturing State */}
      {phase === "capturing" && (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.bg,
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: COLORS.primary + "22",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
              ...GLOW.primary,
            }}
          >
            <Camera size={36} color={COLORS.primary} />
          </View>
          <Text
            style={{
              fontSize: 18,
              fontFamily: FONTS.headline,
              color: COLORS.text,
            }}
          >
            Capturing...
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontFamily: FONTS.regular,
              color: COLORS.textDim,
              marginTop: 4,
            }}
          >
            Hold steady
          </Text>
        </View>
      )}

      {/* Photo Preview */}
      {phase === "preview" && photoUri && (
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
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
                  fontSize: 18,
                  fontFamily: FONTS.headline,
                  color: COLORS.text,
                }}
              >
                Does this look right?
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: FONTS.regular,
                  color: COLORS.textDim,
                  marginTop: 2,
                }}
              >
                Make sure all scores are visible and in focus
              </Text>
            </View>
          </SafeAreaView>

          <View
            style={{
              flex: 1,
              marginHorizontal: 20,
              borderRadius: RADII.lg,
              overflow: "hidden",
            }}
          >
            <Image
              source={{ uri: photoUri }}
              style={{ flex: 1 }}
              resizeMode="contain"
            />
          </View>

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
                  backgroundColor: COLORS.surfaceMid,
                  borderRadius: RADII.lg,
                  paddingVertical: 14,
                  paddingHorizontal: 20,
                }}
              >
                <RotateCcw size={18} color={COLORS.textDim} />
                <Text
                  style={{
                    color: COLORS.textDim,
                    fontFamily: FONTS.semibold,
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
                  backgroundColor: COLORS.primary,
                  borderRadius: RADII.lg,
                  paddingVertical: 14,
                  ...GLOW.primary,
                }}
              >
                <Check size={18} color={COLORS.onPrimary} />
                <Text
                  style={{
                    color: COLORS.onPrimary,
                    fontFamily: FONTS.bold,
                    fontSize: 15,
                  }}
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
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 48,
            backgroundColor: COLORS.bg,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontFamily: FONTS.headline,
              color: COLORS.text,
              marginBottom: 20,
            }}
          >
            Processing Scorecard
          </Text>
          <View
            style={{
              width: "100%",
              height: 6,
              borderRadius: 3,
              backgroundColor: COLORS.surfaceHighest,
              overflow: "hidden",
              marginBottom: 12,
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${progress}%`,
                borderRadius: 3,
                backgroundColor: COLORS.primary,
              }}
            />
          </View>
          <Text
            style={{
              fontSize: 13,
              fontFamily: FONTS.regular,
              color: COLORS.textDim,
            }}
          >
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

      {/* Error State */}
      {phase === "error" && (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
            backgroundColor: COLORS.bg,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: RADII.xl,
              backgroundColor: COLORS.error + "18",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <X size={32} color={COLORS.error} />
          </View>
          <Text
            style={{
              fontSize: 20,
              fontFamily: FONTS.headline,
              color: COLORS.text,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Scan Failed
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontFamily: FONTS.regular,
              color: COLORS.textDim,
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
              backgroundColor: COLORS.primary,
              borderRadius: RADII.lg,
              paddingVertical: 14,
              paddingHorizontal: 24,
              ...GLOW.primary,
            }}
          >
            <RotateCcw size={18} color={COLORS.onPrimary} />
            <Text
              style={{
                color: COLORS.onPrimary,
                fontFamily: FONTS.bold,
                fontSize: 15,
              }}
            >
              Try Again
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 16, padding: 8 }}
          >
            <Text
              style={{
                color: COLORS.textDim,
                fontSize: 14,
                fontFamily: FONTS.medium,
              }}
            >
              Enter scores manually instead
            </Text>
          </Pressable>
        </View>
      )}

      {/* Paywall State */}
      {phase === "paywall" && (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
            backgroundColor: COLORS.bg,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: RADII.xl,
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
              fontSize: 22,
              fontFamily: FONTS.headline,
              color: COLORS.text,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Unlock Unlimited Scans
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontFamily: FONTS.regular,
              color: COLORS.textDim,
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 28,
              paddingHorizontal: 12,
            }}
          >
            You've used your free scorecard scan. Upgrade to SnapScore Pro for
            unlimited AI-powered scanning plus all game modes.
          </Text>

          <Pressable
            onPress={() => {
              router.back();
              setTimeout(() => router.push("/paywall"), 100);
            }}
            style={{
              backgroundColor: COLORS.gold,
              borderRadius: RADII.lg,
              paddingVertical: 16,
              paddingHorizontal: 32,
              width: "100%",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: COLORS.onPrimary,
                fontFamily: FONTS.bold,
                fontSize: 16,
              }}
            >
              Upgrade to Pro
            </Text>
            <Text
              style={{
                color: COLORS.onPrimary + "88",
                fontSize: 12,
                fontFamily: FONTS.medium,
                marginTop: 2,
              }}
            >
              $2.99/mo or $19.99/yr
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={{ padding: 12 }}
          >
            <Text
              style={{
                color: COLORS.textDim,
                fontSize: 14,
                fontFamily: FONTS.medium,
              }}
            >
              Enter scores manually instead
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
