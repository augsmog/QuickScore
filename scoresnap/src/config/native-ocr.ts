// Simulator-only OCR switch. Set EXPO_PUBLIC_SIMULATOR_NO_MLKIT=1 only in the eas.json
// `simulator` profile. That build drops @react-native-ml-kit/text-recognition from iOS
// autolinking (see react-native.config.js) because Google ML Kit ships no arm64-simulator
// slice, which forces an x86_64-only app that iOS 26 simulators on Apple Silicon reject.
// Store, TestFlight and preview builds never set it, so on-device OCR is unchanged there.
export const NATIVE_OCR_DISABLED = process.env.EXPO_PUBLIC_SIMULATOR_NO_MLKIT === "1";

export const NATIVE_OCR_DISABLED_MESSAGE =
  "Scanning is unavailable in simulator builds. Enter the scorecard as text instead.";
