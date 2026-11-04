import { CROSS_DEVICE_SHARING_ENABLED } from '../src/config/features';
import { universalLinkPath } from '../src/services/universal-link';
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (!CROSS_DEVICE_SHARING_ENABLED) return path;
  return universalLinkPath(path, process.env.EXPO_PUBLIC_WEB_URL || 'https://snapscore.autumn8.me');
}
