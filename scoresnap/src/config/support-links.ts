import { Linking } from "react-native";
import { SUPPORT_URL } from "./support";

export function openSupport() {
  return Linking.openURL(SUPPORT_URL);
}
