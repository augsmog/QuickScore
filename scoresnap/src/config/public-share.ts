import { Platform } from "react-native";

// Native defines window = global, but does not provide a browser location.
// Spectator (/r/) and player (/p/) links both carry their token in the address.
export const isPublicShare =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  /^\/(r|p)\//.test(window.location?.pathname ?? "");
