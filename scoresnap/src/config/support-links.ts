import { Linking } from "react-native";
import { PRIVACY_URL, SUPPORT_URL } from "./support";

export function openSupport() {
  return Linking.openURL(SUPPORT_URL);
}

export function openPrivacyPolicy() {
  return Linking.openURL(PRIVACY_URL);
}
