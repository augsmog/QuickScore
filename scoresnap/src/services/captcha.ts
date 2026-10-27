import { CAPTCHA_MODE, TURNSTILE_SITE_KEY } from "../config/captcha";

export type CaptchaAction = "signup" | "signin" | "anonymous";
export const CAPTCHA_ERROR_MESSAGE = "Couldn't verify you're human. Check your connection and try again.";
export const CAPTCHA_TIMEOUT_MS = 20_000;
export interface CaptchaRequest { id: string; action: CaptchaAction }
type Host = (request: CaptchaRequest | null) => void;
let host: Host | undefined;
let pending: { id: string; finish: (token?: string) => void } | undefined;
let sequence = 0;
let queue: Promise<unknown> = Promise.resolve();

export function registerCaptchaHost(listener: Host): () => void {
  host = listener;
  return () => {
    if (host === listener) {
      host = undefined;
      pending?.finish();
    }
  };
}

// Ignore stale widgets and malformed/unrecognized messages. Never log bridge data.
export function completeCaptcha(id: string, token?: string): void {
  if (pending?.id === id) pending.finish(token);
}
export function receiveCaptchaMessage(raw: string): void {
  try {
    const message = JSON.parse(raw);
    if (message.type === "token" && typeof message.token === "string" && message.token.trim()) {
      completeCaptcha(message.id, message.token);
    } else if (message.type === "error") completeCaptcha(message.id);
  } catch { /* Ignore unrelated bridge messages. */ }
}

export function getCaptchaToken(action: CaptchaAction): Promise<string | undefined> {
  if (CAPTCHA_MODE === "off") return Promise.resolve(undefined);
  const deadline = Date.now() + CAPTCHA_TIMEOUT_MS;
  let settled = false;
  let finish!: (token?: string) => void;
  const tokenPromise: Promise<string | undefined> = new Promise<string | undefined>((resolve) => {
    let activeId: string | undefined;
    const timer = setTimeout(() => finish(), CAPTCHA_TIMEOUT_MS);
    finish = (token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (activeId && pending?.id === activeId) {
        pending = undefined;
        resolve(token);
        host?.(null);
      } else resolve(token);
    };
    const run = () => {
      // Queue time counts against the deadline; expired callers never open a widget.
      if (settled) return;
      if (Date.now() >= deadline || !host || !TURNSTILE_SITE_KEY) { finish(); return; }
      activeId = `captcha-${++sequence}`;
      pending = { id: activeId, finish };
      try { host({ id: activeId, action }); } catch { finish(); }
      return tokenPromise;
    };
    // Run in a microtask, after tokenPromise has been initialized.
    queue = queue.then(run).catch(() => undefined);
  });
  const result = tokenPromise.then((token) => {
    if (!token && CAPTCHA_MODE === "required") throw new Error(CAPTCHA_ERROR_MESSAGE);
    return token;
  });
  return result;
}

export async function anonymousSignInOptions(): Promise<{ options?: { captchaToken: string } }> {
  const captchaToken = await getCaptchaToken("anonymous");
  return captchaToken === undefined ? {} : { options: { captchaToken } };
}
