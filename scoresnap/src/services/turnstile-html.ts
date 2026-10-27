import { TURNSTILE_SITE_KEY } from "../config/captcha";
import type { CaptchaRequest } from "./captcha";
export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const safeJSON = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

export function buildTurnstileHtml(request: CaptchaRequest): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<div id="captcha"></div><script>
const id = ${safeJSON(request.id)};
function send(type, token) { window.ReactNativeWebView.postMessage(JSON.stringify({id, type, token})); }
function renderCaptcha() {
  try { turnstile.render('#captcha', {
    sitekey: ${safeJSON(TURNSTILE_SITE_KEY)}, action: ${safeJSON(request.action)},
    callback: token => send('token', token),
    'error-callback': () => send('error'),
    'expired-callback': () => send('error'),
    'timeout-callback': () => send('error')
  }); } catch (_) { send('error'); }
}
</script><script src="${TURNSTILE_SCRIPT_URL}&onload=renderCaptcha" async defer onerror="send('error')"></script>
</body></html>`;
}
