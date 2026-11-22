import { NATIVE_LINKS_ENABLED } from '../src/config/features';
import { universalLinkPath } from '../src/services/universal-link';
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (!NATIVE_LINKS_ENABLED) {
    // Block share/join intents while leaving unrelated auth callbacks intact.
    try {
      const url = new URL(path, process.env.EXPO_PUBLIC_WEB_URL || 'https://snapscore.autumn8.me');
      const route = url.protocol === 'snapscore:' ? `/${url.hostname}${url.pathname}` : url.pathname;
      if (/^\/(?:join|r)(?:\/|$)/i.test(decodeURIComponent(route))) return '/';
      return path;
    } catch { return '/'; }
  }
  return universalLinkPath(path, process.env.EXPO_PUBLIC_WEB_URL || 'https://snapscore.autumn8.me');
}
