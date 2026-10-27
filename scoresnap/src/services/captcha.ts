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
  const run = async () => {
    const token = await new Promise<string | undefined>((resolve) => {
      if (!host || !TURNSTILE_SITE_KEY) { resolve(undefined); return; }
      const id = `captcha-${++sequence}`;
      const timer = setTimeout(() => completeCaptcha(id), CAPTCHA_TIMEOUT_MS);
      pending = { id, finish: (value) => {
        clearTimeout(timer);
        pending = undefined;
        resolve(value);
        host?.(null);
      } };
      try { host({ id, action }); } catch { completeCaptcha(id); }
    });
    if (!token && CAPTCHA_MODE === "required") throw new Error(CAPTCHA_ERROR_MESSAGE);
    return token;
  };
  const result = queue.then(run);
  queue = result.catch(() => undefined);
  return result;
}

export async function anonymousSignInOptions(): Promise<{ options?: { captchaToken: string } }> {
  const captchaToken = await getCaptchaToken("anonymous");
  return captchaToken === undefined ? {} : { options: { captchaToken } };
}
