import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { COLORS, FONTS, RADII } from "../../src/ui/theme";
import { useAuthStore } from "../../src/stores/auth-store";
import { AnimatedPressable } from "../../src/ui/AnimatedPressable";

WebBrowser.maybeCompleteAuthSession();

// Google OAuth config — replace with your own client ID
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";
const googleDiscovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

type AuthMode = "options" | "signup" | "signin";

export default function SignInScreen() {
  const router = useRouter();
  const {
    signInWithApple,
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    skipSignIn,
    isLoading,
  } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>("options");
  const [error, setError] = useState<string | null>(null);

  // Email/password form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ─── Apple Sign-In ───
  const handleAppleSignIn = async () => {
    try {
      setError(null);
      const rawNonce = Crypto.getRandomBytes(16).reduce(
        (acc, byte) => acc + byte.toString(16).padStart(2, "0"),
        ""
      );
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
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      if (e.code === "ERR_REQUEST_CANCELED") return;
      if (
        e.message?.includes("unknown reason") ||
        e.code === "ERR_CANCELED"
      ) {
        setError(
          "Apple Sign-In requires a production build. Tap 'Skip for now' to continue."
        );
      } else {
        setError("Apple Sign-In failed. Please try again.");
      }
      console.warn("Apple sign-in error:", e);
    }
  };

  // ─── Google Sign-In ───
  const handleGoogleSignIn = async () => {
    try {
      setError(null);

      if (!GOOGLE_CLIENT_ID) {
        Alert.alert(
          "Google Sign-In",
          "Google Sign-In is not yet configured. Please use Apple Sign-In or create an account with email."
        );
        return;
      }

      const redirectUri = AuthSession.makeRedirectUri({ scheme: "com.scoresnap.app" });

      const authRequest = new AuthSession.AuthRequest({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ["openid", "profile", "email"],
        redirectUri,
      });

      const result = await authRequest.promptAsync(googleDiscovery);

      if (result.type === "success" && result.authentication?.accessToken) {
        await signInWithGoogle(
          result.authentication.idToken || "",
          result.authentication.accessToken
        );
        router.replace("/(tabs)");
      } else if (result.type !== "dismiss") {
        setError("Google Sign-In was cancelled.");
      }
    } catch (e: any) {
      setError("Google Sign-In failed. Please try again.");
      console.error("Google sign-in error:", e);
    }
  };

  // ─── Email/Password ───
  const handleEmailSignUp = async () => {
    setError(null);
    if (!firstName.trim()) {
      setError("Please enter your first name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      await signUpWithEmail(
        email.trim(),
        password,
        firstName.trim(),
        lastName.trim()
      );
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Sign up failed. Please try again.");
    }
  };

  const handleEmailSignIn = async () => {
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    try {
      await signInWithEmail(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Sign in failed. Please try again.");
    }
  };

  const handleSkip = () => {
    skipSignIn();
    router.replace("/(tabs)");
  };

  // ─── Render ───
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={{ alignItems: "center", marginBottom: 40 }}>
            <Text
              style={{
                fontFamily: FONTS.headline,
                fontSize: 14,
                color: COLORS.text,
                textTransform: "uppercase",
                letterSpacing: 3,
                marginBottom: 8,
              }}
            >
              SCORESNAP
            </Text>
            <Text
              style={{
                fontFamily: FONTS.regular,
                color: COLORS.textDim,
                fontSize: 15,
                textAlign: "center",
              }}
            >
              Scan. Score. Settle.
            </Text>
          </View>

          {/* ═══ Options Mode ═══ */}
          {mode === "options" && (
            <View style={{ gap: 12 }}>
              {/* Apple Sign-In */}
              {Platform.OS === "ios" && (
                <AnimatedPressable
                  onPress={handleAppleSignIn}
                  disabled={isLoading}
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: RADII.lg,
                    paddingVertical: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    opacity: isLoading ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontSize: 20 }}></Text>
                  <Text
                    style={{
                      color: "#000",
                      fontFamily: FONTS.bold,
                      fontSize: 16,
                    }}
                  >
                    Continue with Apple
                  </Text>
                </AnimatedPressable>
              )}

              {/* Google Sign-In */}
              <AnimatedPressable
                onPress={handleGoogleSignIn}
                disabled={isLoading}
                style={{
                  backgroundColor: COLORS.surfaceMid,
                  borderColor: COLORS.border,
                  borderWidth: 1,
                  borderRadius: RADII.lg,
                  paddingVertical: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 18, fontFamily: FONTS.bold, color: COLORS.text }}>
                  G
                </Text>
                <Text
                  style={{
                    color: COLORS.text,
                    fontFamily: FONTS.bold,
                    fontSize: 16,
                  }}
                >
                  Continue with Google
                </Text>
              </AnimatedPressable>

              {/* Divider */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  marginVertical: 4,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    height: 1,
                    backgroundColor: COLORS.border,
                  }}
                />
                <Text
                  style={{
                    fontFamily: FONTS.medium,
                    fontSize: 12,
                    color: COLORS.textDim,
                  }}
                >
                  or
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 1,
                    backgroundColor: COLORS.border,
                  }}
                />
              </View>

              {/* Create Account with Email */}
              <AnimatedPressable
                onPress={() => setMode("signup")}
                style={{
                  backgroundColor: COLORS.primary,
                  borderRadius: RADII.lg,
                  paddingVertical: 16,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: COLORS.onPrimary,
                    fontFamily: FONTS.bold,
                    fontSize: 16,
                  }}
                >
                  Create Account
                </Text>
              </AnimatedPressable>

              {/* Sign in link */}
              <Pressable
                onPress={() => setMode("signin")}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.medium,
                    fontSize: 14,
                    color: COLORS.primary,
                  }}
                >
                  Already have an account? Sign in
                </Text>
              </Pressable>
            </View>
          )}

          {/* ═══ Sign Up Form ═══ */}
          {mode === "signup" && (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor={COLORS.textDim}
                  autoCapitalize="words"
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.surfaceLow,
                    borderRadius: RADII.md,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    fontSize: 15,
                    fontFamily: FONTS.regular,
                    color: COLORS.text,
                  }}
                />
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  placeholderTextColor={COLORS.textDim}
                  autoCapitalize="words"
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.surfaceLow,
                    borderRadius: RADII.md,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    fontSize: 15,
                    fontFamily: FONTS.regular,
                    color: COLORS.text,
                  }}
                />
              </View>

              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor={COLORS.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={{
                  backgroundColor: COLORS.surfaceLow,
                  borderRadius: RADII.md,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 15,
                  fontFamily: FONTS.regular,
                  color: COLORS.text,
                }}
              />

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password (6+ characters)"
                placeholderTextColor={COLORS.textDim}
                secureTextEntry
                textContentType="newPassword"
                style={{
                  backgroundColor: COLORS.surfaceLow,
                  borderRadius: RADII.md,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 15,
                  fontFamily: FONTS.regular,
                  color: COLORS.text,
                }}
              />

              <AnimatedPressable
                onPress={handleEmailSignUp}
                disabled={isLoading}
                style={{
                  backgroundColor: COLORS.primary,
                  borderRadius: RADII.lg,
                  paddingVertical: 16,
                  alignItems: "center",
                  opacity: isLoading ? 0.6 : 1,
                  marginTop: 4,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.onPrimary} />
                ) : (
                  <Text
                    style={{
                      color: COLORS.onPrimary,
                      fontFamily: FONTS.bold,
                      fontSize: 16,
                    }}
                  >
                    Create Account
                  </Text>
                )}
              </AnimatedPressable>

              <Pressable
                onPress={() => {
                  setMode("options");
                  setError(null);
                }}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.medium,
                    fontSize: 14,
                    color: COLORS.textDim,
                  }}
                >
                  Back to sign-in options
                </Text>
              </Pressable>
            </View>
          )}

          {/* ═══ Sign In Form ═══ */}
          {mode === "signin" && (
            <View style={{ gap: 12 }}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor={COLORS.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={{
                  backgroundColor: COLORS.surfaceLow,
                  borderRadius: RADII.md,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 15,
                  fontFamily: FONTS.regular,
                  color: COLORS.text,
                }}
              />

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={COLORS.textDim}
                secureTextEntry
                textContentType="password"
                style={{
                  backgroundColor: COLORS.surfaceLow,
                  borderRadius: RADII.md,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 15,
                  fontFamily: FONTS.regular,
                  color: COLORS.text,
                }}
              />

              <AnimatedPressable
                onPress={handleEmailSignIn}
                disabled={isLoading}
                style={{
                  backgroundColor: COLORS.primary,
                  borderRadius: RADII.lg,
                  paddingVertical: 16,
                  alignItems: "center",
                  opacity: isLoading ? 0.6 : 1,
                  marginTop: 4,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.onPrimary} />
                ) : (
                  <Text
                    style={{
                      color: COLORS.onPrimary,
                      fontFamily: FONTS.bold,
                      fontSize: 16,
                    }}
                  >
                    Sign In
                  </Text>
                )}
              </AnimatedPressable>

              <Pressable
                onPress={() => {
                  setMode("options");
                  setError(null);
                }}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.medium,
                    fontSize: 14,
                    color: COLORS.textDim,
                  }}
                >
                  Back to sign-in options
                </Text>
              </Pressable>
            </View>
          )}

          {/* Loading */}
          {isLoading && mode === "options" && (
            <View style={{ alignItems: "center", marginTop: 12 }}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          )}

          {/* Error */}
          {error && (
            <View
              style={{
                backgroundColor: COLORS.error + "15",
                borderColor: COLORS.error + "33",
                borderWidth: 1,
                borderRadius: RADII.md,
                padding: 12,
                marginTop: 12,
              }}
            >
              <Text
                style={{
                  color: COLORS.error,
                  fontSize: 13,
                  fontFamily: FONTS.regular,
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            </View>
          )}

          {/* Skip */}
          <Pressable
            onPress={handleSkip}
            style={{ alignItems: "center", marginTop: 28, padding: 8 }}
          >
            <Text
              style={{
                fontFamily: FONTS.regular,
                color: COLORS.textDim,
                fontSize: 14,
              }}
            >
              Skip for now
            </Text>
          </Pressable>

          {/* Legal */}
          <Text
            style={{
              color: COLORS.textDim,
              fontSize: 11,
              fontFamily: FONTS.regular,
              textAlign: "center",
              marginTop: 20,
              lineHeight: 16,
              paddingHorizontal: 20,
            }}
          >
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
