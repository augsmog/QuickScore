/** Only exact app routes on the configured public origin may enter the app.
 * Opening a live link is read-only; it never claims a roster slot or signs in.
 */
export function universalLinkPath(input: string, webOrigin: string): string {
  try {
    if (/%2f|%5c|\\/i.test(input)) return '/';
    const base = new URL(webOrigin);
    const url = new URL(input, base);
    const custom = url.protocol === 'snapscore:';
    if (!custom && (url.protocol !== 'https:' || url.origin !== base.origin)) return '/';
    if (url.username || url.password) return '/';
    const path = custom ? (url.hostname ? `/${url.hostname}${url.pathname}` : url.pathname) : url.pathname;
    // Never propagate query strings or fragments (could contain credentials).
    if (/^\/r\/[a-f0-9]{64}\/?$/.test(path)) return path.replace(/\/$/, '');
    const join = /^\/join\/([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6})\/?$/i.exec(path);
    if (join) return `/join/${join[1].toUpperCase()}`;
    return '/';
  } catch { return '/'; }
}
