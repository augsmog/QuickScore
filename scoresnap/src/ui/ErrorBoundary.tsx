import React from "react";
import { View, Text, Pressable } from "react-native";
import { AlertTriangle, RotateCcw } from "lucide-react-native";
import { COLORS } from "./theme";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: COLORS.bg,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 32,
          }}
        >
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
            <AlertTriangle size={36} color={COLORS.danger} />
          </View>

          <Text
            style={{
              color: COLORS.text,
              fontSize: 22,
              fontWeight: "800",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Something Went Wrong
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
            An unexpected error occurred. Try again, and if the problem persists,
            restart the app.
          </Text>

          {__DEV__ && this.state.error && (
            <View
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 12,
                padding: 12,
                marginBottom: 24,
                width: "100%",
                borderColor: COLORS.danger + "33",
                borderWidth: 1,
              }}
            >
              <Text
                style={{
                  color: COLORS.danger,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
                numberOfLines={4}
              >
                {this.state.error.message}
              </Text>
            </View>
          )}

          <Pressable
            onPress={this.handleReset}
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
        </View>
      );
    }

    return this.props.children;
  }
}
