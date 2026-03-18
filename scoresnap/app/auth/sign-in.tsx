import { useState } from "react";
import { View, Text, Pressable, Platform, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { COLORS } from "../../src/ui/theme";
import { useAuthStore } from "../../src/stores/auth-store";

export default function SignInScreen() {
  const router = useRouter();
  const { signInWithApple, signInWithGoogle, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const handleAppleSignIn = async () => {
    try {
      setError(null);
      // Generate nonce for security
      const rawNonce = Crypto.getRandomBytes(16)
        .reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "");
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (credential.identityToken) {
        await signInWithApple(credential.identityToken, rawNonce);
        router.replace("/");
      }
    } catch (e: any) {
      if (e.code !== "ERR_REQUEST_CANCELED") {
        setError("Apple Sign-In failed. Please try again.");
        console.error("Apple sign-in error:", e);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      // Google Sign-In requires additional setup with expo-auth-session
      // For now, show a placeholder
      Alert.alert(
        "Google Sign-In",
        "Google Sign-In requires configuring OAuth credentials in your Google Cloud Console and Supabase dashboard. See the setup guide for details."
      );
    } catch (e: any) {
      setError("Google Sign-In failed. Please try again.");
      console.error("Google sign-in error:", e);
    }
  };

  const handleSkip = () => {
    router.replace("/");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
        {/* Logo */}
        <Text style={{ fontSize: 64, marginBottom: 8 }}>⛳</Text>
        <Text style={{ fontSize: 34, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5, marginBottom: 4 }}>
          ScoreSnap
        </Text>
        <Text style={{ color: COLORS.textDim, fontSize: 15, marginBottom: 48, textAlign: "center" }}>
          Scan. Score. Settle.
        </Text>

        {/* Sign-in buttons */}
        <View style={{ width: "100%", gap: 12 }}>
          {/* Apple Sign-In */}
          {Platform.OS === "ios" && (
            <Pressable
              onPress={handleAppleSignIn}
              disabled={isLoading}
              style={{
                backgroundColor: "#fff",
                borderRadius: 14,
                paddingVertical: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 20 }}></Text>
              <Text style={{ color: "#000", fontWeight: "700", fontSize: 16 }}>
                Continue with Apple
              </Text>
            </Pressable>
          )}

          {/* Google Sign-In */}
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={isLoading}
            style={{
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              borderWidth: 1,
              borderRadius: 14,
              paddingVertical: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 18 }}>G</Text>
            <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 16 }}>
              Continue with Google
            </Text>
          </Pressable>

          {/* Loading indicator */}
          {isLoading && (
            <View style={{ alignItems: "center", marginTop: 8 }}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          )}

          {/* Error message */}
          {error && (
            <View
              style={{
                backgroundColor: COLORS.danger + "15",
                borderColor: COLORS.danger + "33",
                borderWidth: 1,
                borderRadius: 10,
                padding: 12,
                marginTop: 4,
              }}
            >
              <Text style={{ color: COLORS.danger, fontSize: 13, textAlign: "center" }}>
                {error}
              </Text>
            </View>
          )}
        </View>

        {/* Skip for now */}
        <Pressable onPress={handleSkip} style={{ marginTop: 32, padding: 8 }}>
          <Text style={{ color: COLORS.textDim, fontSize: 14 }}>
            Skip for now
          </Text>
        </Pressable>

        <Text
          style={{
            color: COLORS.textDim,
            fontSize: 11,
            textAlign: "center",
            marginTop: 24,
            lineHeight: 16,
            paddingHorizontal: 20,
          }}
        >
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}
