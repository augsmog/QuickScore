import { REAL_AUTH_CONFIGURED } from "./auth";
import { OFFLINE_MODE } from "./offline";

export type CaptchaMode = "off" | "optional" | "required";
export const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAAFnthkbq7bh9N5bW";
export const TURNSTILE_BASE_URL = process.env.EXPO_PUBLIC_TURNSTILE_BASE_URL || "https://snapscore-web.augie-os.workers.dev";
const configuredMode = process.env.EXPO_PUBLIC_CAPTCHA_MODE;
export const CAPTCHA_MODE: CaptchaMode = OFFLINE_MODE || !REAL_AUTH_CONFIGURED
  ? "off"
  : configuredMode === "optional" || configuredMode === "required" ? configuredMode : "off";
