import { Platform } from "react-native";

// Native defines window = global, but does not provide a browser location.
export const isPublicShare =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  !!window.location?.pathname?.startsWith("/r/");
