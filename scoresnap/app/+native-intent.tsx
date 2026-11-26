import { NATIVE_LINKS_ENABLED } from '../src/config/features';
import { universalLinkPath } from '../src/services/universal-link';

// System intents only. Normal app navigation into /join/enter and the public
// browser routes are intentionally unaffected while tap-to-open is deferred.
function isShareRoute(path: string): boolean {
  const route = path.replace(/\\/g, '/').replace(/^\/+/,'').replace(/^--\/+/,'');
  if (/^(?:join|r)(?:\/|$)/i.test(route)) return true;
  try {
    const decoded = decodeURIComponent(route);
    return /^(?:join|r)(?:\/|$)/i.test(decoded.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^--\/+/, ''));
  } catch {
    return false;
  }
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (!NATIVE_LINKS_ENABLED) {
    try {
      // The fallback origin is for URL parsing only; never depends on deployment config.
      const url = new URL(path, 'https://native-intent.invalid/');
      const relative = path.split(/[?#]/, 1)[0];
      const custom = !['http:', 'https:'].includes(url.protocol);
      if (isShareRoute(relative) || isShareRoute(url.pathname) ||
          (custom && !!url.hostname && isShareRoute(`${url.hostname}${url.pathname}`))) return '/';
      return path; // e.g. OAuth callback, non-share links, query strings and fragments.
    } catch {
      return '/';
    }
  }
  return universalLinkPath(path, process.env.EXPO_PUBLIC_WEB_URL || 'https://snapscore.autumn8.me');
}
