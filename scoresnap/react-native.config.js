// Simulator-only: EXPO_PUBLIC_SIMULATOR_NO_MLKIT=1 (set only by the eas.json `simulator`
// profile) removes Google ML Kit from iOS autolinking so the simulator app can be arm64.
// Every other build leaves this file a no-op, so production/TestFlight keep on-device OCR.
const noMlKit = process.env.EXPO_PUBLIC_SIMULATOR_NO_MLKIT === "1";

module.exports = {
  dependencies: noMlKit
    ? { "@react-native-ml-kit/text-recognition": { platforms: { ios: null } } }
    : {},
};
