import { createElement, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { CAPTCHA_MODE, TURNSTILE_BASE_URL, TURNSTILE_SITE_KEY } from "../config/captcha";
import { CaptchaRequest, completeCaptcha, receiveCaptchaMessage, registerCaptchaHost } from "../services/captcha";
import { buildTurnstileHtml, TURNSTILE_SCRIPT_URL } from "../services/turnstile-html";
import { COLORS, FONTS, RADII } from "../ui/theme";

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
let scriptPromise: Promise<Turnstile> | undefined;
function loadTurnstile(): Promise<Turnstile> {
  if (!scriptPromise) {
    scriptPromise = new Promise<Turnstile>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        const api = (window as Window & { turnstile?: Turnstile }).turnstile;
        if (api) resolve(api); else reject(new Error("Captcha unavailable"));
      };
      script.onerror = () => {
        script.remove();
        scriptPromise = undefined;
        reject(new Error("Captcha unavailable"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

function WebChallenge({ request }: { request: CaptchaRequest }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let widget: string | undefined;
    let api: Turnstile | undefined;
    loadTurnstile().then((loaded) => {
      if (disposed || !container.current) return;
      api = loaded;
      widget = api.render(container.current, {
        sitekey: TURNSTILE_SITE_KEY, action: request.action,
        callback: (token: string) => { if (!disposed) completeCaptcha(request.id, token); },
        "error-callback": () => completeCaptcha(request.id),
        "expired-callback": () => completeCaptcha(request.id),
        "timeout-callback": () => completeCaptcha(request.id),
      });
    }).catch(() => { if (!disposed) completeCaptcha(request.id); });
    return () => { disposed = true; if (widget !== undefined) api?.remove(widget); };
  }, [request.id, request.action]);
  return createElement("div", { ref: container });
}

export function allowsCaptchaNavigation(url: string, isTopFrame = true): boolean {
  try {
    const origin = new URL(url).origin;
    if (isTopFrame) return origin === new URL(TURNSTILE_BASE_URL).origin || url === "about:blank";
    return origin === new URL(TURNSTILE_BASE_URL).origin || origin === "https://challenges.cloudflare.com";
  } catch { return false; }
}

function NativeChallenge({ request }: { request: CaptchaRequest }) {
  // Keep the native module out of web execution and service tests.
  const WebView = require("react-native-webview").WebView as typeof import("react-native-webview").WebView;
  return <WebView
    source={{ html: buildTurnstileHtml(request), baseUrl: TURNSTILE_BASE_URL }}
    originWhitelist={[new URL(TURNSTILE_BASE_URL).origin, "https://challenges.cloudflare.com"]}
    javaScriptEnabled
    allowFileAccess={false}
    allowFileAccessFromFileURLs={false}
    allowUniversalAccessFromFileURLs={false}
    mixedContentMode="never"
    setSupportMultipleWindows={false}
    onShouldStartLoadWithRequest={(navigation) => allowsCaptchaNavigation(navigation.url, navigation.isTopFrame !== false)}
    onMessage={(event) => receiveCaptchaMessage(event.nativeEvent.data)}
    onError={() => completeCaptcha(request.id)}
    onHttpError={() => completeCaptcha(request.id)}
    style={{ height: 160, backgroundColor: COLORS.surfaceLow }}
  />;
}

export function TurnstileHost() {
  const [request, setRequest] = useState<CaptchaRequest | null>(null);
  useEffect(() => {
    if (CAPTCHA_MODE === "off") return;
    return registerCaptchaHost(setRequest);
  }, []);
  if (CAPTCHA_MODE === "off" || !request) return null;
  const cancel = () => completeCaptcha(request.id);
  return <Modal transparent visible animationType="fade" onRequestClose={cancel}>
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#0008" }}>
      <View style={{ padding: 20, borderRadius: RADII.lg, backgroundColor: COLORS.surfaceLow, gap: 16 }}>
        <Text style={{ color: COLORS.text, fontFamily: FONTS.bold, fontSize: 18 }}>Verify you're human</Text>
        {Platform.OS === "web" ? <WebChallenge key={request.id} request={request} /> : <NativeChallenge key={request.id} request={request} />}
        <Pressable accessibilityRole="button" onPress={cancel} style={{ padding: 12, alignItems: "center" }}>
          <Text style={{ color: COLORS.primary, fontFamily: FONTS.medium }}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}
